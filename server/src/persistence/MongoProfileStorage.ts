import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MongoClient,
  MongoServerError,
  type Collection,
  type MongoClientOptions,
} from 'mongodb';
import { isGuestKey } from '../auth/profileKeys.js';
import { logger } from '../util/logger.js';
import {
  STALE_CLAIM_MS,
  StorageUnavailableError,
  type GrantRecord,
  type ProfileStorage,
} from './ProfileStorage.js';
import {
  applyUpdate,
  readProfile,
  type ProfileUpdate,
  type StoredProfile,
} from './StoredProfile.js';
import { WriteQueue } from './WriteQueue.js';

const SCOPE = 'persistence';

/**
 * How long an operation waits for a reachable server before failing.
 *
 * Short on purpose: a join blocked on a dead database should be REFUSED
 * quickly, so the client's own retry brings the player in once it is back,
 * rather than hanging the handshake.
 */
const SELECTION_TIMEOUT_MS = 3000;

/** Milliseconds between attempts at the indexes and the legacy import while Mongo is down. */
const IMPORT_RETRY_MS = 15_000;

/** Most grants claimed in one go. A player does not buy fifty things a second. */
const CLAIM_BATCH = 50;

interface ProfileDoc {
  _id: string;
  [field: string]: unknown;
}

interface GrantDoc {
  _id: string;
  account: string;
  sku: string;
  wins: number;
  state: 'pending' | 'claimed' | 'applied';
  recordedAt: Date;
  claimedAt?: Date;
  claimant?: string;
  appliedAt?: Date;
}

/**
 * Progress in the managed MongoDB Legion injects as `MONGODB_URI`.
 *
 * An isolated database per game and channel, named in the URI, so this uses
 * `client.db()` with no name of its own. One document per player in
 * `profiles`, one per purchase in `grants`. Every profile write is an
 * idempotent `updateOne` with `$set` and upsert - never a replace - so fields
 * this build does not know about survive it.
 */
export class MongoProfileStorage implements ProfileStorage {
  readonly kind = 'mongo';

  /**
   * The connected client, or null until a connect SUCCEEDS.
   *
   * Made lazily and thrown away if its first connect fails. That is not
   * belt-and-braces: a MongoClient whose initial connect fails closes its
   * topology but keeps it, and every later operation - auto-connect included -
   * is handed that closed topology and fails for ever. A server that booted
   * while the database was down would then refuse every join long after the
   * database came back. Once a connect has succeeded, the driver rides out
   * later outages on its own.
   */
  private client: MongoClient | null = null;
  private connecting: Promise<MongoClient> | null = null;
  private readonly options: MongoClientOptions = {
    serverSelectionTimeoutMS: SELECTION_TIMEOUT_MS,
    connectTimeoutMS: SELECTION_TIMEOUT_MS,
    retryWrites: true,
    // An absent optional field stays ABSENT rather than becoming null.
    ignoreUndefined: true,
    appName: 'speed-evolve',
  };
  private readonly queue: WriteQueue;
  private importTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly uri: string,
    private readonly legacyDir: string,
  ) {
    this.queue = new WriteQueue('mongo profiles', (key, update) => this.writeProfile(key, update));
  }

  /** The two collections, connecting first if need be. THROWS if Mongo cannot be reached. */
  private async collections(): Promise<{
    profiles: Collection<ProfileDoc>;
    grants: Collection<GrantDoc>;
  }> {
    const client = this.client ?? (await this.connect());
    // The database named in the URI: Legion's scoped user can reach no other.
    const db = client.db();
    return {
      profiles: db.collection<ProfileDoc>('profiles'),
      grants: db.collection<GrantDoc>('grants'),
    };
  }

  private connect(): Promise<MongoClient> {
    this.connecting ??= (async () => {
      const client = new MongoClient(this.uri, this.options);
      try {
        await client.connect();
        this.client = client;
        logger.info(SCOPE, `connected to MongoDB database "${client.db().databaseName}"`);
        return client;
      } catch (error) {
        await client.close().catch(() => {});
        throw new StorageUnavailableError(`MongoDB unreachable: ${describe(error)}`, { cause: error });
      } finally {
        this.connecting = null;
      }
    })();
    return this.connecting;
  }

  async open(): Promise<void> {
    // A database that is down at boot must not stop the server listening.
    // Every operation connects on demand, and fails quickly and loudly until
    // it is back.
    try {
      await this.connect();
    } catch (error) {
      logger.error(
        SCOPE,
        'MONGODB IS UNREACHABLE AT BOOT - the server is up, but joins will be refused ' +
          'until it is back. Nobody is let in on an empty profile.',
        error,
      );
    }
    void this.prepare();
  }

  /** Indexes and the legacy import, retried until they succeed. */
  private async prepare(): Promise<void> {
    try {
      const { grants } = await this.collections();
      await grants.createIndex({ account: 1, state: 1 });
      await this.importLegacy();
    } catch (error) {
      logger.warn(SCOPE, `mongo preparation deferred (${describe(error)}); retrying`);
      this.importTimer = setTimeout(() => {
        this.importTimer = null;
        void this.prepare();
      }, IMPORT_RETRY_MS);
      this.importTimer.unref?.();
    }
  }

  /**
   * Bring an existing `profiles.json` into Mongo. INSERT-ONLY.
   *
   * `$setOnInsert` with upsert: a key already in the database is never
   * touched, so this is safe to run on every boot and can never overwrite a
   * newer copy with an older one. Account-prefixed keys are skipped - the
   * build that wrote the old file had no accounts, so one there is a guest who
   * named themselves into somebody's account.
   */
  private async importLegacy(): Promise<void> {
    const path = join(this.legacyDir, 'profiles.json');
    if (!existsSync(path)) return;
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    } catch (error) {
      logger.error(SCOPE, `legacy import: ${path} is unreadable, skipped`, error);
      return;
    }
    const operations = [];
    let skipped = 0;
    for (const [key, value] of Object.entries(raw)) {
      const profile = readProfile(value);
      if (!profile || !isGuestKey(key)) {
        skipped += 1;
        continue;
      }
      operations.push({
        updateOne: {
          filter: { _id: key },
          update: { $setOnInsert: profile as Record<string, unknown> },
          upsert: true,
        },
      });
    }
    if (operations.length === 0) return;
    const { profiles } = await this.collections();
    const result = await profiles.bulkWrite(operations, { ordered: false });
    logger.info(
      SCOPE,
      `legacy import from ${path}: ${result.upsertedCount} added, ` +
        `${operations.length - result.upsertedCount} already present (untouched), ${skipped} skipped`,
    );
  }

  async get(key: string): Promise<StoredProfile | null> {
    let doc: ProfileDoc | null;
    try {
      const { profiles } = await this.collections();
      doc = await profiles.findOne({ _id: key });
    } catch (error) {
      throw new StorageUnavailableError(`profile read failed: ${describe(error)}`, { cause: error });
    }
    // Our own queued writes are newer than anything the database has.
    const queued = this.queue.peek(key);
    if (!doc && !queued) return null;
    const merged = queued ? applyUpdate(doc ?? {}, queued) : doc;
    return readProfile(merged);
  }

  put(key: string, update: ProfileUpdate): Promise<void> {
    return this.queue.enqueue(key, update);
  }

  private async writeProfile(key: string, update: ProfileUpdate): Promise<void> {
    const operation: Record<string, unknown> = {};
    if (Object.keys(update.set).length > 0) operation['$set'] = update.set;
    if (update.unset.length > 0) {
      operation['$unset'] = Object.fromEntries(update.unset.map((field) => [field, '']));
    }
    if (Object.keys(operation).length === 0) return;
    const { profiles } = await this.collections();
    await profiles.updateOne({ _id: key }, operation, { upsert: true });
  }

  async insertIfAbsent(key: string, profile: StoredProfile): Promise<boolean> {
    if (this.queue.peek(key)) return false;
    try {
      const { profiles } = await this.collections();
      const result = await profiles.updateOne(
        { _id: key },
        { $setOnInsert: profile as unknown as Record<string, unknown> },
        { upsert: true },
      );
      return result.upsertedCount === 1;
    } catch (error) {
      // Two pods inserting the same key at once: one upsert wins, the other
      // sees a duplicate key - which means the profile exists.
      if (error instanceof MongoServerError && error.code === 11000) return false;
      throw new StorageUnavailableError(`profile insert failed: ${describe(error)}`, { cause: error });
    }
  }

  async loadAll(): Promise<Map<string, StoredProfile>> {
    const out = new Map<string, StoredProfile>();
    try {
      const { profiles } = await this.collections();
      for await (const doc of profiles.find({})) {
        const profile = readProfile(doc);
        if (profile) out.set(doc._id, profile);
      }
    } catch (error) {
      throw new StorageUnavailableError(`profile scan failed: ${describe(error)}`, { cause: error });
    }
    for (const key of this.queue.keys()) {
      const queued = this.queue.peek(key);
      if (!queued) continue;
      const base = (out.get(key) as Record<string, unknown> | undefined) ?? {};
      const profile = readProfile(applyUpdate(base, queued));
      if (profile) out.set(key, profile);
    }
    return out;
  }

  flush(timeoutMs: number): Promise<boolean> {
    return this.queue.flush(timeoutMs);
  }

  async close(): Promise<void> {
    if (this.importTimer) clearTimeout(this.importTimer);
    await this.client?.close();
  }

  async recordGrant(grant: GrantRecord): Promise<'recorded' | 'duplicate'> {
    try {
      const { grants } = await this.collections();
      await grants.insertOne({
        _id: grant.transactionId,
        account: grant.account,
        sku: grant.sku,
        wins: grant.wins,
        state: 'pending',
        recordedAt: new Date(),
      });
      return 'recorded';
    } catch (error) {
      // The transaction id IS the key, so a retried webhook collides here and
      // nowhere else - across every pod and every restart.
      if (error instanceof MongoServerError && error.code === 11000) return 'duplicate';
      throw new StorageUnavailableError(`grant record failed: ${describe(error)}`, { cause: error });
    }
  }

  async claimGrants(account: string, claimant: string): Promise<GrantRecord[]> {
    const claimed: GrantRecord[] = [];
    const { grants } = await this.collections();
    for (let i = 0; i < CLAIM_BATCH; i += 1) {
      const now = new Date();
      const doc = await grants.findOneAndUpdate(
        {
          account,
          $or: [
            { state: 'pending' },
            { state: 'claimed', claimedAt: { $lt: new Date(now.getTime() - STALE_CLAIM_MS) } },
          ],
        },
        { $set: { state: 'claimed', claimant, claimedAt: now } },
        { returnDocument: 'after' },
      );
      if (!doc) break;
      claimed.push({ transactionId: doc._id, account: doc.account, sku: doc.sku, wins: doc.wins });
    }
    return claimed;
  }

  async completeGrants(transactionIds: readonly string[]): Promise<void> {
    if (transactionIds.length === 0) return;
    const { grants } = await this.collections();
    await grants.updateMany(
      { _id: { $in: [...transactionIds] } },
      { $set: { state: 'applied', appliedAt: new Date() } },
    );
  }
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
