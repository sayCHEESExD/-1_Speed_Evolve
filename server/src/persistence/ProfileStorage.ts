import type { ProfileUpdate, StoredProfile } from './StoredProfile.js';

/**
 * Where progress lives: one document per player, read and written PER KEY.
 *
 * Several pods share one database, so nothing here ever writes a whole map
 * back, and a player's profile is read from storage when they JOIN rather
 * than from anything filled at boot. The only boot-time snapshot is the
 * leaderboard's, and it is refreshed.
 *
 * FAILURES ARE LOUD. A read that fails is not "no profile": `get` throws, and
 * the room refuses the join, because letting a player in on an empty profile
 * would have the next autosave write that emptiness over their real one.
 */
export interface ProfileStorage {
  /** 'mongo' or 'json', for the boot log. */
  readonly kind: string;

  /**
   * Connect and run any one-off import. NEVER throws and never blocks boot on
   * a database that is down: the server must keep answering `/health`, or the
   * host restart-loops the pod. Joins fail cleanly until storage is back.
   */
  open(): Promise<void>;

  /**
   * One profile, or null if there is none. THROWS if storage cannot be read.
   *
   * Includes this process's own writes that are still queued, so a player who
   * leaves and rejoins on the same pod never reads their own stale copy.
   */
  get(key: string): Promise<StoredProfile | null>;

  /**
   * Queue a write. Never drops it: a failure is retried with backoff until it
   * lands, and only the latest update per key is kept. The promise settles
   * when this update - or a later one for the same key - is durable.
   */
  put(key: string, update: ProfileUpdate): Promise<void>;

  /**
   * Create a profile only if the key has none. Resolves true if it was
   * created, false if one already existed (including one of this process's
   * own queued writes). THROWS if storage cannot be reached.
   */
  insertIfAbsent(key: string, profile: StoredProfile): Promise<boolean>;

  /** Every profile, for the leaderboard. THROWS if storage cannot be read. */
  loadAll(): Promise<Map<string, StoredProfile>>;

  /** Wait for every queued write, up to `timeoutMs`. Resolves true if all landed. */
  flush(timeoutMs: number): Promise<boolean>;

  close(): Promise<void>;

  // --------------------------------------------------------------- purchases

  /**
   * Durably record a paid purchase, keyed by its transaction id.
   *
   * 'duplicate' if that transaction is already recorded - a retried webhook
   * pays out once, across pods and restarts. THROWS if the record could not be
   * made durable; the webhook must then NOT answer 2xx.
   */
  recordGrant(grant: GrantRecord): Promise<'recorded' | 'duplicate'>;

  /**
   * Atomically claim everything waiting for an account, so two pods can never
   * both apply the same grant. A claim that was never completed - its pod died
   * - becomes claimable again after a while; the profile's own
   * `appliedGrants` stops that from paying twice.
   */
  claimGrants(account: string, claimant: string): Promise<GrantRecord[]>;

  /** Mark grants applied, once the profile that holds them is durable. */
  completeGrants(transactionIds: readonly string[]): Promise<void>;
}

/** One paid purchase. */
export interface GrantRecord {
  readonly transactionId: string;
  /** The profile key it is owed to: always `bloxity:<accountId>`. */
  readonly account: string;
  readonly sku: string;
  readonly wins: number;
}

/** Thrown when storage cannot answer. The message is safe to log. */
export class StorageUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageUnavailableError';
  }
}

/** How long a claimed-but-unfinished grant stays claimed before it is retried. */
export const STALE_CLAIM_MS = 5 * 60 * 1000;
