import { logger } from '../util/logger.js';
import { mergeUpdates, type ProfileUpdate } from './StoredProfile.js';

const SCOPE = 'persistence';

/** Backoff after a failed write, doubling from the first to the last. */
const RETRY_FIRST_MS = 500;
const RETRY_MAX_MS = 30_000;

/** Writes in flight at once. A room's autosave is fifteen keys; this is plenty. */
const CONCURRENCY = 16;

interface Waiter {
  readonly version: number;
  readonly resolve: () => void;
}

interface Entry {
  /** Update not yet sent, already merged down to ONE per key. */
  pending: ProfileUpdate | null;
  /** Version of the newest update folded into `pending`. */
  pendingVersion: number;
  /** Update being written right now, if any. */
  inflight: ProfileUpdate | null;
  inflightVersion: number;
  waiters: Waiter[];
}

/**
 * Per-key write queue: the latest update per key, written with retry, never
 * dropped.
 *
 * A write that fails is folded back UNDER anything newer that arrived while it
 * was in flight and tried again after a backoff, for as long as it takes - an
 * outage delays saves, it does not lose them. `peek` is how the store reads
 * its own writes back before they land.
 */
export class WriteQueue {
  private readonly entries = new Map<string, Entry>();
  private version = 0;
  private inflight = 0;
  private backoff = 0;
  private retryTimer: NodeJS.Timeout | null = null;
  private failing = false;
  private readonly idle = new Set<() => void>();

  constructor(
    private readonly label: string,
    private readonly write: (key: string, update: ProfileUpdate) => Promise<void>,
  ) {}

  /** Queue an update. Settles once it, or a later one for the key, is durable. */
  enqueue(key: string, update: ProfileUpdate): Promise<void> {
    this.version += 1;
    const version = this.version;
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { pending: null, pendingVersion: 0, inflight: null, inflightVersion: 0, waiters: [] };
      this.entries.set(key, entry);
    }
    entry.pending = entry.pending ? mergeUpdates(entry.pending, update) : update;
    entry.pendingVersion = version;
    const landed = new Promise<void>((resolve) => {
      (entry as Entry).waiters.push({ version, resolve });
    });
    this.pump();
    return landed;
  }

  /** Everything queued or in flight for a key, as one update, or undefined. */
  peek(key: string): ProfileUpdate | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.inflight && entry.pending) return mergeUpdates(entry.inflight, entry.pending);
    return entry.inflight ?? entry.pending ?? undefined;
  }

  /** Keys with a write not yet durable. */
  keys(): IterableIterator<string> {
    return this.entries.keys();
  }

  get size(): number {
    return this.entries.size;
  }

  /** Wait until nothing is queued, up to `timeoutMs`. True if it drained. */
  async flush(timeoutMs: number): Promise<boolean> {
    if (this.entries.size === 0) return true;
    // Retry now rather than at the end of a long backoff.
    this.kick();
    return new Promise<boolean>((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        this.idle.delete(done);
        resolve(true);
      };
      const timer = setTimeout(() => {
        this.idle.delete(done);
        resolve(this.entries.size === 0);
      }, timeoutMs);
      this.idle.add(done);
    });
  }

  /** Skip any backoff and try again now. */
  kick(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.pump();
  }

  private pump(): void {
    if (this.retryTimer) return;
    for (const [key, entry] of this.entries) {
      if (this.inflight >= CONCURRENCY) return;
      if (entry.inflight || !entry.pending) continue;
      entry.inflight = entry.pending;
      entry.inflightVersion = entry.pendingVersion;
      entry.pending = null;
      this.inflight += 1;
      void this.send(key, entry);
    }
  }

  private async send(key: string, entry: Entry): Promise<void> {
    const update = entry.inflight as ProfileUpdate;
    try {
      await this.write(key, update);
      this.inflight -= 1;
      entry.inflight = null;
      const landed = entry.inflightVersion;
      entry.waiters = entry.waiters.filter((waiter) => {
        if (waiter.version > landed) return true;
        waiter.resolve();
        return false;
      });
      if (!entry.pending && entry.waiters.length === 0) this.entries.delete(key);
      if (this.failing) {
        this.failing = false;
        logger.info(SCOPE, `${this.label}: writes are landing again (${this.entries.size} still queued)`);
      }
      this.backoff = 0;
      if (this.entries.size === 0) for (const done of [...this.idle]) done();
      this.pump();
    } catch (error) {
      this.inflight -= 1;
      // Back UNDER anything newer: the newer update wins every field it sets.
      entry.pending = entry.pending ? mergeUpdates(update, entry.pending) : update;
      if (entry.pendingVersion < entry.inflightVersion) entry.pendingVersion = entry.inflightVersion;
      entry.inflight = null;
      this.backoff = this.backoff === 0 ? RETRY_FIRST_MS : Math.min(RETRY_MAX_MS, this.backoff * 2);
      if (!this.failing) {
        this.failing = true;
        logger.error(
          SCOPE,
          `${this.label}: WRITE FAILED for ${key} - queued, retrying with backoff. ` +
            'Nothing is dropped; saves land once storage is back.',
          error,
        );
      }
      if (!this.retryTimer) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this.pump();
        }, this.backoff);
        this.retryTimer.unref?.();
      }
    }
  }
}
