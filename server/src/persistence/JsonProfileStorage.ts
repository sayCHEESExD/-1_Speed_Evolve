import { join } from 'node:path';
import { logger } from '../util/logger.js';
import { AtomicJsonFile } from './AtomicJsonFile.js';
import {
  STALE_CLAIM_MS,
  type GrantRecord,
  type ProfileStorage,
} from './ProfileStorage.js';
import { applyUpdate, readProfile, type ProfileUpdate, type StoredProfile } from './StoredProfile.js';

const SCOPE = 'persistence';

interface GrantEntry {
  account: string;
  sku: string;
  wins: number;
  state: 'pending' | 'claimed' | 'applied';
  recordedAt: number;
  claimedAt?: number;
  claimant?: string;
}

/**
 * The DEV store: two JSON files in the data directory, used when there is no
 * `MONGODB_URI`.
 *
 * One process owns the files, so the files ARE the storage and the in-memory
 * copy is simply them, loaded once - there is no second writer for it to go
 * stale against. Every record is kept whole, including fields this build does
 * not know about; a save sets its own fields and removes only the clearable
 * ones, exactly as the Mongo store does.
 */
export class JsonProfileStorage implements ProfileStorage {
  readonly kind = 'json';

  private records = new Map<string, Record<string, unknown>>();
  private grants = new Map<string, GrantEntry>();
  private readonly profileFile: AtomicJsonFile<Record<string, unknown>>;
  private readonly grantFile: AtomicJsonFile<Record<string, unknown>>;

  constructor(private readonly directory: string) {
    this.profileFile = new AtomicJsonFile(join(directory, 'profiles.json'), () =>
      Object.fromEntries(this.records),
    );
    this.grantFile = new AtomicJsonFile(join(directory, 'grants.json'), () =>
      Object.fromEntries(this.grants),
    );
  }

  async open(): Promise<void> {
    const profiles = this.profileFile.load();
    if (profiles) {
      for (const [key, value] of Object.entries(profiles as Record<string, unknown>)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          this.records.set(key, value as Record<string, unknown>);
        }
      }
    }
    const grants = this.grantFile.load();
    if (grants) {
      for (const [id, value] of Object.entries(grants as Record<string, unknown>)) {
        const entry = value as Partial<GrantEntry>;
        if (typeof entry?.account === 'string' && typeof entry.sku === 'string') {
          this.grants.set(id, {
            account: entry.account,
            sku: entry.sku,
            wins: typeof entry.wins === 'number' ? entry.wins : 0,
            state: entry.state === 'applied' || entry.state === 'claimed' ? entry.state : 'pending',
            recordedAt: typeof entry.recordedAt === 'number' ? entry.recordedAt : Date.now(),
            ...(typeof entry.claimedAt === 'number' ? { claimedAt: entry.claimedAt } : {}),
            ...(typeof entry.claimant === 'string' ? { claimant: entry.claimant } : {}),
          });
        }
      }
    }
    logger.info(
      SCOPE,
      `JSON store at ${this.directory}: ${this.records.size} profile(s), ${this.grants.size} purchase(s)`,
    );
  }

  async get(key: string): Promise<StoredProfile | null> {
    const record = this.records.get(key);
    return record ? readProfile(record) : null;
  }

  put(key: string, update: ProfileUpdate): Promise<void> {
    this.records.set(key, applyUpdate(this.records.get(key) ?? {}, update));
    return this.profileFile.save();
  }

  async insertIfAbsent(key: string, profile: StoredProfile): Promise<boolean> {
    if (this.records.has(key)) return false;
    this.records.set(key, { ...profile });
    try {
      await this.profileFile.saveNow();
    } catch (error) {
      this.records.delete(key);
      throw error;
    }
    return true;
  }

  async loadAll(): Promise<Map<string, StoredProfile>> {
    const out = new Map<string, StoredProfile>();
    for (const [key, record] of this.records) {
      const profile = readProfile(record);
      if (profile) out.set(key, profile);
    }
    return out;
  }

  async flush(timeoutMs: number): Promise<boolean> {
    const [a, b] = await Promise.all([
      this.profileFile.flush(timeoutMs),
      this.grantFile.flush(timeoutMs),
    ]);
    return a && b;
  }

  async close(): Promise<void> {
    /* nothing held open between writes */
  }

  async recordGrant(grant: GrantRecord): Promise<'recorded' | 'duplicate'> {
    if (this.grants.has(grant.transactionId)) return 'duplicate';
    this.grants.set(grant.transactionId, {
      account: grant.account,
      sku: grant.sku,
      wins: grant.wins,
      state: 'pending',
      recordedAt: Date.now(),
    });
    try {
      // Durable BEFORE the webhook answers: a 2xx is a promise to pay.
      await this.grantFile.saveNow();
    } catch (error) {
      this.grants.delete(grant.transactionId);
      throw error;
    }
    return 'recorded';
  }

  async claimGrants(account: string, claimant: string): Promise<GrantRecord[]> {
    const now = Date.now();
    const claimed: GrantRecord[] = [];
    for (const [id, entry] of this.grants) {
      if (entry.account !== account) continue;
      const stale = entry.state === 'claimed' && (entry.claimedAt ?? 0) < now - STALE_CLAIM_MS;
      if (entry.state !== 'pending' && !stale) continue;
      entry.state = 'claimed';
      entry.claimedAt = now;
      entry.claimant = claimant;
      claimed.push({ transactionId: id, account, sku: entry.sku, wins: entry.wins });
    }
    if (claimed.length > 0) await this.grantFile.saveNow();
    return claimed;
  }

  async completeGrants(transactionIds: readonly string[]): Promise<void> {
    let changed = false;
    for (const id of transactionIds) {
      const entry = this.grants.get(id);
      if (entry && entry.state !== 'applied') {
        entry.state = 'applied';
        changed = true;
      }
    }
    if (changed) await this.grantFile.save();
  }
}
