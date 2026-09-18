/**
 * Everything worth keeping about a player between sessions.
 *
 * Deliberately the DERIVING facts only: level, movement speed, the gain
 * figures and the equipped mount are all recomputed from these on load through
 * the same formulas a live session uses, so a tuning change reaches returning
 * players too.
 */
export interface StoredProfile {
  /** Lifetime Speed farmed. Level follows from it. */
  totalSpeed: number;
  /** Stage wins banked. */
  wins: number;
  /**
   * Bitmask of mounts evolved into. The equipped one is the highest of these.
   *
   * Stored rather than re-derived from level and Wins, and that is deliberate:
   * a mount once earned is kept even if Wins are later spent below its
   * threshold, so the mask is the record of what happened rather than a cache
   * of what the current figures would imply.
   */
  unlockedMounts: number;
  /** Rebirths performed. */
  rebirths: number;
  /** Bitmask of trails bought, and the one worn. Permanent unlocks. */
  ownedTrails: number;
  trailSlot: number;
  /** Bitmask of auras bought, and the one worn. Permanent unlocks. */
  ownedAuras: number;
  auraSlot: number;
  /** Bitmask of items bought, and the one carried. Permanent unlocks. */
  ownedItems: number;
  itemSlot: number;
  /**
   * The speed-upgrade pad the player last rode onto.
   *
   * A CHOICE rather than a derived fact, which is why it is stored at all: the
   * pad is only gated on Wins, so re-deriving it would either silently promote
   * everyone to the best pad their wallet allows - emptying the left half of
   * the arena of any reason to visit it - or reset them to +1 every session,
   * which is friction with nothing on the other side of it. It is still
   * CLAMPED to what the restored Wins can afford on load.
   */
  upgradeSlot: number;
  /** Highest stage ever finished. */
  bestStage: number;
  /**
   * The player's Bloxity name as last seen, or '' for a player who has only
   * played signed out. Public text and never an account id - kept only so the
   * boards can name somebody who is not currently connected.
   */
  displayName: string;
  /** Wall clock of the last save, for diagnostics and future pruning. */
  updatedAt: number;
}

/**
 * Where profiles live.
 *
 * Nothing above this boundary knows whether that is a JSON file, a database or
 * nothing at all - `createPersistence` is the ONLY place that names a concrete
 * adapter.
 */
export interface PersistenceAdapter {
  /** Read everything into memory. Called once, before the server listens. */
  load(): Map<string, StoredProfile>;
  /** Queue a write. Implementations may debounce. */
  save(profiles: Map<string, StoredProfile>): void;
  /** Make any pending write durable. Called on shutdown. */
  flush(): void;
}
