import { INITIAL_UNLOCKED_MOUNTS, STARTER_UPGRADE_SLOT } from '@evolve/shared';
import { createPersistence, type PersistenceAdapter, type StoredProfile } from '../persistence/index.js';
import type { PlayerState } from '../rooms/state/PlayerState.js';

/**
 * Progression that outlives a session.
 *
 * A CACHE in front of a durable adapter, not the only copy: a room dies with
 * its last client, so the store is process-wide, and the adapter is what makes
 * a server RESTART survivable rather than just a reconnect.
 *
 * Keyed by a browser-stored player id. Two tabs in one browser therefore share
 * a profile, which is the correct behaviour - they are one player.
 */
class ProfileStore {
  private readonly profiles = new Map<string, StoredProfile>();
  private readonly adapter: PersistenceAdapter = createPersistence();
  private opened = false;

  /** Read everything into memory. Call once, before the server listens. */
  open(): void {
    if (this.opened) return;
    this.opened = true;
    for (const [id, profile] of this.adapter.load()) this.profiles.set(id, profile);
  }

  get size(): number {
    return this.profiles.size;
  }

  /**
   * Every stored profile, id and all.
   *
   * For the leaderboard, which has to be able to show players who are not
   * currently connected - a board that emptied when the server did would say
   * nothing about anybody's progress.
   */
  entries(): IterableIterator<[string, StoredProfile]> {
    return this.profiles.entries();
  }

  /**
   * Apply a stored profile onto fresh player state.
   *
   * Only the DERIVING facts are restored. Level, movement speed, jump
   * velocity, the gain figures and the equipped mount are all recomputed by
   * their own services from these, so returning players get the current tuning
   * rather than a snapshot of whatever it was when they left.
   */
  restore(playerId: string, player: PlayerState): boolean {
    const profile = this.profiles.get(playerId);
    if (!profile) return false;

    player.totalSpeed = profile.totalSpeed;
    player.wins = profile.wins;
    // A profile saved before the roster existed owns nothing; the starter is
    // free, so it is always granted rather than leaving the player unmounted.
    player.unlockedMounts = profile.unlockedMounts | INITIAL_UNLOCKED_MOUNTS;
    player.rebirths = profile.rebirths;
    player.ownedTrails = profile.ownedTrails;
    player.trailSlot = profile.trailSlot;
    player.ownedAuras = profile.ownedAuras ?? 0;
    player.auraSlot = profile.auraSlot ?? 0;
    player.ownedItems = profile.ownedItems ?? 0;
    player.itemSlot = profile.itemSlot ?? 0;
    // `?? STARTER` rather than `|| STARTER`: a profile written before auras
    // and upgrade pads existed has neither field, and the free starter pad is
    // the only sensible reading of "no pad recorded". `UpgradeService` clamps
    // it to what the restored Wins actually reach.
    player.upgradeSlot = profile.upgradeSlot ?? STARTER_UPGRADE_SLOT;
    player.bestStage = profile.bestStage;
    return true;
  }

  /** Write the player's current progression back to the cache and the disk. */
  save(playerId: string, player: PlayerState): void {
    if (!playerId) return;
    this.profiles.set(playerId, {
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
    });
    this.adapter.save(this.profiles);
  }

  /** Make any pending write durable. Called on shutdown. */
  flush(): void {
    this.adapter.flush();
  }
}

/**
 * Process-wide singleton.
 *
 * A room dies with its last client, so per-room storage would lose a player's
 * progression the moment they were briefly alone and disconnected.
 */
export const profileStore = new ProfileStore();
