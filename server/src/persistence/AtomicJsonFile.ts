import { existsSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import { mkdir, open, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { logger } from '../util/logger.js';

const SCOPE = 'persistence';

/** Backoff after a failed write, doubling to the ceiling. */
const RETRY_FIRST_MS = 500;
const RETRY_MAX_MS = 30_000;

/**
 * One JSON file, written ATOMICALLY and never lost.
 *
 * Atomic: to `<file>.tmp`, fsynced, then renamed over the real one, so a crash
 * leaves the old file or the new one and never half of either.
 *
 * On load, three things a crash or a bad edit can leave behind are handled
 * rather than papered over:
 *   - a `.tmp` that parses is a write that was fsynced but never renamed - it
 *     is NEWER than the file, and it is what is used;
 *   - a `.tmp` that does not parse is a write cut off halfway, and is dropped;
 *   - a file that cannot be parsed is MOVED ASIDE, data intact, rather than
 *     overwritten by the next save. Somebody can read it; nothing else will.
 */
export class AtomicJsonFile<T> {
  private readonly tempPath: string;
  private version = 0;
  private written = 0;
  private writing = false;
  private backoff = 0;
  private retryTimer: NodeJS.Timeout | null = null;
  private failing = false;
  private waiters: { version: number; resolve: () => void }[] = [];

  constructor(
    private readonly path: string,
    private readonly snapshot: () => T,
  ) {
    this.tempPath = `${path}.tmp`;
  }

  /** Read the file, recovering from a crash or a corrupt copy. Null if there is none. */
  load(): unknown {
    const main = this.tryRead(this.path);
    const temp = this.tryRead(this.tempPath);

    if (main.state === 'corrupt') this.moveAside(this.path);
    if (temp.state === 'ok') {
      logger.warn(SCOPE, `recovered ${this.tempPath}: a save that was written but never renamed`);
      try {
        renameSync(this.tempPath, this.path);
      } catch (error) {
        logger.error(SCOPE, `could not promote ${this.tempPath}`, error);
      }
      return temp.value;
    }
    if (temp.state === 'corrupt') {
      logger.warn(SCOPE, `dropping ${this.tempPath}: a save cut off part-way`);
      try {
        unlinkSync(this.tempPath);
      } catch {
        /* it is only ever a partial write */
      }
    }
    return main.state === 'ok' ? main.value : null;
  }

  /** Schedule a write of the current snapshot. Settles once one that includes it lands. */
  save(): Promise<void> {
    this.version += 1;
    const version = this.version;
    const landed = new Promise<void>((resolve) => this.waiters.push({ version, resolve }));
    void this.pump();
    return landed;
  }

  /** Write now and wait for it; THROWS if it could not be made durable. */
  async saveNow(): Promise<void> {
    this.version += 1;
    const version = this.version;
    while (this.writing) await new Promise((resolve) => setTimeout(resolve, 5));
    await this.writeFile(version);
  }

  /** Wait for everything scheduled, up to `timeoutMs`. */
  async flush(timeoutMs: number): Promise<boolean> {
    if (this.written >= this.version) return true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
      void this.pump();
    }
    const target = this.version;
    return Promise.race([
      new Promise<boolean>((resolve) => this.waiters.push({ version: target, resolve: () => resolve(true) })),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(this.written >= target), timeoutMs)),
    ]);
  }

  private async pump(): Promise<void> {
    if (this.writing || this.retryTimer) return;
    while (this.written < this.version) {
      const version = this.version;
      try {
        await this.writeFile(version);
      } catch (error) {
        this.backoff = this.backoff === 0 ? RETRY_FIRST_MS : Math.min(RETRY_MAX_MS, this.backoff * 2);
        if (!this.failing) {
          this.failing = true;
          logger.error(SCOPE, `WRITE FAILED for ${this.path} - retrying with backoff`, error);
        }
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          void this.pump();
        }, this.backoff);
        this.retryTimer.unref?.();
        return;
      }
    }
  }

  private async writeFile(version: number): Promise<void> {
    this.writing = true;
    try {
      const payload = JSON.stringify(this.snapshot());
      await mkdir(dirname(this.path), { recursive: true });
      const handle = await open(this.tempPath, 'w');
      try {
        await handle.writeFile(payload);
        // The durability guarantee: on the disk before the rename makes it live.
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(this.tempPath, this.path);
      if (version > this.written) this.written = version;
      if (this.failing) {
        this.failing = false;
        logger.info(SCOPE, `writes to ${this.path} are landing again`);
      }
      this.backoff = 0;
      this.waiters = this.waiters.filter((waiter) => {
        if (waiter.version > this.written) return true;
        waiter.resolve();
        return false;
      });
    } finally {
      this.writing = false;
    }
  }

  private tryRead(path: string): { state: 'missing' } | { state: 'corrupt' } | { state: 'ok'; value: unknown } {
    if (!existsSync(path)) return { state: 'missing' };
    try {
      const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) return { state: 'corrupt' };
      return { state: 'ok', value };
    } catch {
      return { state: 'corrupt' };
    }
  }

  private moveAside(path: string): void {
    const aside = `${path}.corrupt-${Date.now()}`;
    try {
      renameSync(path, aside);
      logger.error(
        SCOPE,
        `${path} COULD NOT BE PARSED - moved aside to ${aside} with its data intact. ` +
          'Starting from what could be recovered; nothing overwrote it.',
      );
    } catch (error) {
      logger.error(SCOPE, `${path} could not be parsed AND could not be moved aside`, error);
      // Refuse to carry on and overwrite the only copy.
      throw error;
    }
  }
}
