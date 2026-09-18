import { INITIAL_UNLOCKED_MOUNTS, STARTER_UPGRADE_SLOT } from '@evolve/shared';
import { freshGuestKey } from '../auth/profileKeys.js';
import { createPersistence, type GrantRecord, type ProfileStorage, type StoredProfile } from '../persistence/index.js';
import { APPLIED_GRANTS_KEPT, hasProgress, saveUpdate } from '../persistence/StoredProfile.js';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import { logger } from '../util/logger.js';

const SCOPE = 'profiles';

/** Seconds between leaderboard refreshes from storage. */
const BOARD_REFRESH_MS = 60_000;
/** Seconds between attempts while storage is down at boot. */
const BOARD_RETRY_MS = 10_000;

/** What a join or a switch resolved to. */
export interface ResolvedProfile {
  /** The key to save under, or null for an unsaved guest. */
  readonly key: string | null;
  /** The stored progress to restore, or null for a fresh start. */
  readonly profile: StoredProfile | null;
  /**
   * True when this browser's guest id had already been migrated into an
   * account, so the guest got a FRESH id: the old one holds a recovery copy
   * that a guest session must neither restore nor save over.
   */
  readonly rotated: boolean;
  /** True when this call created the account profile from the guest's. */
  readonly migrated: boolean;
}

/**
 * Progression that outlives a session, over a per-key store.
 *
 * Profiles are read from storage when a player JOINS - never from a cache
 * filled at boot, because several pods share one database and a boot cache is
 * stale the moment another pod saves. The one snapshot kept here is the
 * LEADERBOARD's, which may lag a little and is refreshed on a timer; the newer
 * `updatedAt` wins every merge.
 */
class ProfileStore {
  private storage: ProfileStorage = createPersistence();
  private readonly board = new Map<string, StoredProfile>();
  private boardTimer: NodeJS.Timeout | null = null;

  get kind(): string {
    return this.storage.kind;
  }

  /** Connect and start the leaderboard refresh. Never throws. */
  async open(): Promise<void> {
    await this.storage.open();
    await this.refreshBoard();
  }

  private async refreshBoard(): Promise<void> {
    let delay = BOARD_REFRESH_MS;
    try {
      const all = await this.storage.loadAll();
      for (const [key, profile] of all) this.boardMerge(key, profile);
    } catch (error) {
      delay = BOARD_RETRY_MS;
      logger.warn(SCOPE, `leaderboard refresh failed (${(error as Error).message}); retrying`);
    }
    this.boardTimer = setTimeout(() => void this.refreshBoard(), delay);
    this.boardTimer.unref?.();
  }

  private boardMerge(key: string, profile: StoredProfile): void {
    const held = this.board.get(key);
    if (!held || profile.updatedAt >= held.updatedAt) this.board.set(key, profile);
  }

  /** Profiles for the leaderboard. A migrated guest copy is never one of them. */
  *entries(): IterableIterator<[string, StoredProfile]> {
    for (const entry of this.board) {
      if (!entry[1].migratedTo) yield entry;
    }
  }

  get size(): number {
    return this.board.size;
  }

  /**
   * A guest's profile, by browser id. THROWS if storage cannot be read.
   *
   * A guest id whose profile was migrated into an account is not restored:
   * that copy is kept for recovery, and a guest who plays on in this browser
   * starts fresh under a NEW id, so the recovery copy is never saved over.
   */
  async resolveGuest(guestKey: string): Promise<ResolvedProfile> {
    const stored = await this.storage.get(guestKey);
    if (stored?.migratedTo) {
      return { key: freshGuestKey(), profile: null, rotated: true, migrated: false };
    }
    return { key: guestKey, profile: stored, rotated: false, migrated: false };
  }

  /**
   * An account's profile, migrating a guest's into it on first login.
   * THROWS if storage cannot be reached.
   *
   *  - The account has a profile: it ALWAYS wins, and browser data never
   *    touches it.
   *  - It has none, and this browser's guest has real progress that was never
   *    migrated anywhere: that progress is inserted as the account's - only if
   *    the account still has none - and only once that insert is durable is
   *    the guest copy marked `migratedTo`. A crash between the two duplicates
   *    progress; it never loses it.
   *  - Losing an insert race to another pod loads the winner.
   *
   * `live` is the session's own state for a sign-in mid-session, which is
   * newer than anything stored.
   */
  async resolveAccount(
    accountKey: string,
    guestKey: string | null,
    live: StoredProfile | null,
  ): Promise<ResolvedProfile> {
    const existing = await this.storage.get(accountKey);
    if (existing) return { key: accountKey, profile: existing, rotated: false, migrated: false };
    if (!guestKey) return { key: accountKey, profile: null, rotated: false, migrated: false };

    const stored = await this.storage.get(guestKey);
    // Already migrated - into this account or any other - is never migrated again.
    if (stored?.migratedTo) return { key: accountKey, profile: null, rotated: false, migrated: false };
    const guest = live ?? stored;
    if (!guest || !hasProgress(guest)) {
      return { key: accountKey, profile: null, rotated: false, migrated: false };
    }

    const seeded: StoredProfile = { ...guest, migratedFrom: guestKey, updatedAt: Date.now() };
    delete seeded.migratedTo;
    const inserted = await this.storage.insertIfAbsent(accountKey, seeded);
    if (!inserted) {
      const winner = await this.storage.get(accountKey);
      return { key: accountKey, profile: winner, rotated: false, migrated: false };
    }
    // AFTER the insert: the guest copy stays as a recovery copy, marked so it
    // can seed nothing else. Queued, and never dropped.
    void this.storage.put(guestKey, { set: { migratedTo: accountKey }, unset: [] });
    this.board.delete(guestKey);
    logger.info(SCOPE, `migrated guest ${guestKey} -> ${accountKey}`);
    return { key: accountKey, profile: seeded, rotated: false, migrated: true };
  }

  /**
   * Apply a stored profile onto fresh player state.
   *
   * Only the DERIVING facts are restored. Level, movement speed, jump
   * velocity, the gain figures and the equipped mount are all recomputed by
   * their own services from these, so returning players get the current tuning
   * rather than a snapshot of whatever it was when they left.
   */
  restore(profile: StoredProfile, player: PlayerState): void {
    player.totalSpeed = profile.totalSpeed;
    player.wins = profile.wins;
    // A profile saved before the roster existed owns nothing; the starter is
    // free, so it is always granted rather than leaving the player unmounted.
    player.unlockedMounts = profile.unlockedMounts | INITIAL_UNLOCKED_MOUNTS;
    player.rebirths = profile.rebirths;
    player.ownedTrails = profile.ownedTrails;
    player.trailSlot = profile.trailSlot;
    player.ownedAuras = profile.ownedAuras;
    player.auraSlot = profile.auraSlot;
    player.ownedItems = profile.ownedItems;
    player.itemSlot = profile.itemSlot;
    // Zero means "no pad recorded" - a profile from before pads existed - and
    // the free starter is the only reading of that. `UpgradeService` clamps it
    // to what the restored Wins actually reach.
    player.upgradeSlot = profile.upgradeSlot || STARTER_UPGRADE_SLOT;
    player.bestStage = profile.bestStage;
  }

  /** The player's progression as a stored profile. */
  snapshot(player: PlayerState, appliedGrants: readonly string[]): StoredProfile {
    return {
      totalSpeed: player.totalSpeed,
      wins: player.wins,
      unlockedMounts: player.unlockedMounts,
      rebirths: player.rebirths,
      ownedTrails: player.ownedTrails,
      trailSlot: player.trailSlot,
      ownedAuras: player.ownedAuras,
      auraSlot: player.auraSlot,
      ownedItems: player.ownedItems,
      itemSlot: player.itemSlot,
      upgradeSlot: player.upgradeSlot,
      bestStage: player.bestStage,
      displayName: player.accountName,
      updatedAt: Date.now(),
      appliedGrants: appliedGrants.slice(-APPLIED_GRANTS_KEPT),
    };
  }

  /**
   * Queue the player's progression for writing. Settles once it is durable.
   * Only this build's own fields are written; anything else on the document
   * is left exactly as it is.
   */
  save(key: string, player: PlayerState, appliedGrants: readonly string[]): Promise<void> {
    const profile = this.snapshot(player, appliedGrants);
    this.boardMerge(key, profile);
    return this.storage.put(key, saveUpdate(profile));
  }

  recordGrant(grant: GrantRecord): Promise<'recorded' | 'duplicate'> {
    return this.storage.recordGrant(grant);
  }

  claimGrants(account: string, claimant: string): Promise<GrantRecord[]> {
    return this.storage.claimGrants(account, claimant);
  }

  completeGrants(transactionIds: readonly string[]): Promise<void> {
    return this.storage.completeGrants(transactionIds);
  }

  /** Wait for queued writes, up to `timeoutMs`. Called on shutdown. */
  flush(timeoutMs: number): Promise<boolean> {
    return this.storage.flush(timeoutMs);
  }

  async close(): Promise<void> {
    if (this.boardTimer) clearTimeout(this.boardTimer);
    await this.storage.close();
  }
}

/**
 * Process-wide singleton.
 *
 * A room dies with its last client, so per-room storage would lose a player's
 * progression the moment they were briefly alone and disconnected.
 */
export const profileStore = new ProfileStore();
