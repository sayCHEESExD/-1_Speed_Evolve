/**
 * Rebirth: the prestige ladder.
 *
 * Ported from the previous game's rebirth system and kept behaviourally
 * identical - a rebirth trades the current level curve for a max level
 * twenty-five higher and a bigger multiplier, and deliberately leaves
 * everything the player earned OUTSIDE that curve alone. Wins and owned animals are permanent
 * unlocks and survive a rebirth untouched.
 *
 * Data-driven: `REBIRTH_TIERS` is the authored head of the ladder and
 * `EXTENSION` continues the same pattern for ever after it, so adding a third
 * rebirth is one row in a table rather than a new branch anywhere.
 */

/** One rung of the ladder. */
export interface RebirthTier {
  /** How many rebirths the player will have AFTER performing this one. */
  readonly index: number;
  /** Level that must be reached before this rebirth may be performed. */
  readonly requiredLevel: number;
  /** Speed multiplier granted once it has been performed. */
  readonly multiplier: number;
}

/**
 * The authored rungs.
 *
 * Rebirth 1 at level 25 and rebirth 2 at level 50, as specified. Everything past
 * the table continues by `EXTENSION`, so the ladder never runs out.
 */
export const REBIRTH_TIERS: readonly RebirthTier[] = [
  { index: 1, requiredLevel: 25, multiplier: 2 },
  { index: 2, requiredLevel: 50, multiplier: 3 },
];

/** How the ladder continues once the authored table is exhausted. */
const EXTENSION = {
  /** Extra levels required per rebirth beyond the last authored one. */
  levelsPerRebirth: 25,
  /** Extra multiplier per rebirth beyond the last authored one. */
  multiplierPerRebirth: 1,
} as const;

/** The rung a player with `count` rebirths is working toward. */
export const nextRebirthTier = (count: number): RebirthTier => {
  const done = Math.max(0, Math.floor(count));
  const authored = REBIRTH_TIERS[done];
  if (authored) return authored;

  // Past the table: continue the same pattern rather than stopping.
  const last = REBIRTH_TIERS[REBIRTH_TIERS.length - 1] as RebirthTier;
  const beyond = done - REBIRTH_TIERS.length + 1;
  return {
    index: done + 1,
    requiredLevel: last.requiredLevel + beyond * EXTENSION.levelsPerRebirth,
    multiplier: last.multiplier + beyond * EXTENSION.multiplierPerRebirth,
  };
};

/** Speed multiplier granted by `count` completed rebirths. */
export const rebirthMultiplier = (count: number): number => {
  const done = Math.max(0, Math.floor(count));
  if (done <= 0) return 1;
  const authored = REBIRTH_TIERS[done - 1];
  if (authored) return authored.multiplier;
  const last = REBIRTH_TIERS[REBIRTH_TIERS.length - 1] as RebirthTier;
  const beyond = done - REBIRTH_TIERS.length;
  return last.multiplier + beyond * EXTENSION.multiplierPerRebirth;
};

/**
 * Highest level reachable at this rebirth count: `(rebirths + 1) x 25`.
 *
 * 25 before the first rebirth, 50 after it, 475 after eighteen, and on by
 * twenty-five for ever. It is exactly the level the NEXT rebirth needs, which
 * is what makes reaching the cap and unlocking the rebirth the same moment -
 * the cap is a gate, never a dead end.
 *
 * Read off the ladder rather than written as its own formula, so the cap and
 * the requirement cannot drift apart; `verify:progression` checks that the
 * ladder does produce `(rebirths + 1) x 25`. There is deliberately NO clamp
 * here and no maximum rebirth count anywhere: the fields that carry these on
 * the wire are float64, so neither wraps.
 */
export const maxLevelForRebirth = (count: number): number => nextRebirthTier(count).requiredLevel;

/** A player may rebirth once they have reached their current max level. */
export const canRebirth = (level: number, count: number): boolean =>
  Math.floor(level) >= maxLevelForRebirth(count);
