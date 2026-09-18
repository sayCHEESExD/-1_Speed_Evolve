import {
  STARTER_UPGRADE_SLOT,
  canRebirth,
  maxLevelForRebirth,
  nextRebirthTier,
  rebirthMultiplier,
} from '@evolve/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import type { SpeedService } from './SpeedService.js';

/** Outcome of a rebirth attempt. */
export type RebirthResult =
  | { readonly ok: true; readonly rebirths: number; readonly multiplier: number }
  | { readonly ok: false; readonly reason: 'not-eligible' };

/**
 * Server authority over rebirths.
 *
 * A rebirth trades the current level curve for a permanently higher ceiling
 * and a bigger Speed-gain multiplier. What it must NOT touch is anything the
 * player earned OUTSIDE that curve: Wins, evolved mounts, owned trails and
 * owned auras are permanent unlocks and survive untouched.
 *
 * The equipped upgrade PAD is the one deliberate exception, and it is reset to
 * the free starter. That is what gives a rebirth a cost the player can feel
 * without taking anything away from them: the pad is gated on Wins, which a
 * rebirth keeps, so re-equipping it is a ride across the arena they were
 * making anyway rather than a grind. It also puts the left side of the arena
 * back in play after every prestige, which is the whole reason it is a place
 * rather than a menu.
 *
 * The client sends an empty message. Eligibility is decided here from the
 * server's own level and rebirth count, so there is nothing in the request that
 * could be wrong and nothing to validate.
 */
export class RebirthService {
  /**
   * Refresh the cap that follows from the rebirth count.
   *
   * Deliberately does NOT write `moveMultiplier`. Movement speed has exactly
   * one evaluator - `SpeedService` - and a second one here would be free to
   * drift from it the moment either curve was retuned.
   */
  sync(player: PlayerState): void {
    player.maxLevel = maxLevelForRebirth(player.rebirths);
  }

  /** True once the player has reached their current max level. */
  isEligible(player: PlayerState): boolean {
    return canRebirth(player.level, player.rebirths);
  }

  /** The level the next rebirth needs, for the HUD's locked state. */
  requiredLevel(player: PlayerState): number {
    return nextRebirthTier(player.rebirths).requiredLevel;
  }

  /**
   * Perform a rebirth.
   *
   * Resets the level curve and everything derived from it, returns the player
   * to the free upgrade pad, raises the cap and the multiplier, and
   * deliberately leaves Wins, mounts, trails and auras alone.
   */
  rebirth(player: PlayerState, speeds: SpeedService): RebirthResult {
    if (!this.isEligible(player)) return { ok: false, reason: 'not-eligible' };

    player.rebirths += 1;
    // Level FOLLOWS from lifetime Speed, so clearing the Speed total is what
    // actually returns the player to level 1. Setting the level alone would be
    // undone by the next credit.
    player.totalSpeed = 0;
    player.level = 1;
    player.upgradeSlot = STARTER_UPGRADE_SLOT;

    this.sync(player);
    // Movement speed, jump velocity and the cap all re-derive through the one
    // formula rather than being written here.
    speeds.syncDerived(player);

    return {
      ok: true,
      rebirths: player.rebirths,
      multiplier: rebirthMultiplier(player.rebirths),
    };
  }
}
