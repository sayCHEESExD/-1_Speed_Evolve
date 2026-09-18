import {
  MOUNTS,
  highestEarnedMount,
  isMountUnlocked,
  mountBit,
  mountForSlot,
  nextMount,
  qualifiesForMount,
  type MountDefinition,
} from '@evolve/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';

/** What an evolution check found. */
export interface EvolveResult {
  /** True when the player just moved up the chain. */
  readonly evolved: boolean;
  /** The mount now being ridden. Never null - everyone is always mounted. */
  readonly mount: MountDefinition;
}

/**
 * Server authority over the evolution chain.
 *
 * Evolution is AUTOMATIC, which is the whole difference between this game's
 * mounts and the previous game's purchasable animals. There is no stand to
 * ride onto, no price to pay and no message to send: the moment the player's
 * level and Wins both reach the next mount's requirement, the server unlocks
 * it and equips it. The Evolve menu is therefore a WINDOW onto a decision the
 * server has already made rather than a place a decision is made, which is why
 * it can never promise something that does not then happen.
 *
 * Wins are a THRESHOLD, not a price. Nothing is deducted. That matters more
 * than it looks: the trail and aura shops spend the same wallet, so a
 * subtractive evolution would mean buying a trail could cost the player a
 * mount they had already earned - and, worse, could cost it to someone who
 * never saw the connection.
 *
 * The chain is walked in ORDER. Qualifying for the dragon without ever having
 * met the spider's requirement is not a state this game recognises, which is
 * what keeps "the next mount" always the rung directly above where the player
 * actually is.
 */
export class EvolveService {
  /**
   * Bring a player's mount into line with what they have earned.
   *
   * Called on join, after a stage reward, after a level-up and after a
   * rebirth - every moment at which level or Wins can have moved. It is
   * IDEMPOTENT: calling it when nothing has changed does nothing and reports
   * `evolved: false`, so callers may be generous rather than careful.
   */
  refresh(player: PlayerState): EvolveResult {
    const earned = highestEarnedMount(player.level, player.wins);

    // Every rung up to the earned one is unlocked, not just the top one. The
    // mask is what the Evolve menu draws its history from, and a chain with
    // holes in it would show a player mounts they had apparently skipped.
    for (const mount of MOUNTS) {
      if (mount.slot <= earned) player.unlockedMounts |= mountBit(mount.slot);
    }

    const before = player.mountSlot;

    // The highest unlocked, never merely the highest earned. They are the same
    // number in every ordinary session, and they come apart exactly once: a
    // player whose Wins have been SPENT below a mount's requirement keeps the
    // mount they already evolved into. Losing a mount at the shop counter
    // would be the single most confusing thing this economy could do.
    player.mountSlot = this.highestUnlocked(player.unlockedMounts);

    return {
      evolved: player.mountSlot > before,
      mount: mountForSlot(player.mountSlot),
    };
  }

  /**
   * The mount the player is working toward, and whether they qualify yet.
   *
   * Used by the room to answer the Evolve menu. The menu could compute this
   * itself from replicated state - and it does, to light its button - but the
   * server needs the same answer to decide an evolution, and one shared
   * predicate (`qualifiesForMount`) is what keeps the two from ever differing.
   */
  next(player: PlayerState): { mount: MountDefinition | null; qualifies: boolean } {
    const upcoming = nextMount(player.mountSlot);
    if (!upcoming) return { mount: null, qualifies: false };
    return {
      mount: upcoming,
      qualifies: qualifiesForMount(upcoming.slot, player.level, player.wins),
    };
  }

  /**
   * Highest slot set in the unlocked mask.
   *
   * Scanned from the top of the roster down, so it stops at the first hit.
   */
  private highestUnlocked(unlocked: number): number {
    for (let i = MOUNTS.length - 1; i >= 0; i -= 1) {
      const mount = MOUNTS[i] as MountDefinition;
      if (isMountUnlocked(unlocked, mount.slot)) return mount.slot;
    }
    return (MOUNTS[0] as MountDefinition).slot;
  }
}
