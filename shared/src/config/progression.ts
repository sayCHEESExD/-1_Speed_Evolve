import { maxLevelForRebirth, nextRebirthTier, rebirthMultiplier } from './rebirth.js';

/**
 * Progression tuning. Level, Speed, Wins, rebirths, the equipped upgrade pad,
 * the mount and the two cosmetic ladders are all SERVER-AUTHORITATIVE; the
 * client may predict for UI feel but never decides any of them.
 *
 * The level cap is NOT a constant here - it is whatever the next rebirth
 * requires, so reaching the cap and unlocking a rebirth are the same moment.
 * See `config/rebirth.ts`.
 */

/**
 * The largest Wins total the game will hold.
 *
 * `PlayerState.wins` is a `float64` rather than the previous game's `uint32`,
 * and it had to become one: the Sun trail costs 250 TRILLION Wins and a uint32
 * stops at 4.3 billion, so the top half of the shop would have been unbuyable
 * by construction. A float64 is exact on integers up to 2^53, which is where
 * this ceiling comes from - past it, adding one stops changing the number, so
 * every path that adds Wins clamps here and saturates rather than silently
 * freezing.
 */
export const MAX_WINS = Number.MAX_SAFE_INTEGER;

/**
 * The largest lifetime Speed the game will hold, for the same reason.
 *
 * Speed climbs faster than Wins do - a +2K pad under a 400x trail and a 300x
 * aura is 240 million a step - so this ceiling is the one that actually gets
 * approached. It is also where the level curve stops: `speedForNextLevel`
 * compounds, so it would run past a float64 eventually, and it saturates here
 * instead. A requirement that silently stopped increasing is survivable; one
 * that silently went backwards is not.
 */
export const MAX_TOTAL_SPEED = Number.MAX_SAFE_INTEGER;

/** Level cap before any rebirth. Derived, so the two can never disagree. */
export const BASE_LEVEL_CAP = nextRebirthTier(0).requiredLevel;

/**
 * Re-exported under the names the rest of the codebase already uses.
 *
 * The rebirth module owns the ladder; these exist so a caller needs one import
 * for "what is this player's cap" rather than knowing which file the ladder
 * happens to live in.
 */
export { maxLevelForRebirth, rebirthMultiplier };

/** Clamp a Wins figure into the range the game can actually hold. */
export const clampWins = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, MAX_WINS);
};

/** Clamp a lifetime Speed figure into the range the game can actually hold. */
export const clampSpeed = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, MAX_TOTAL_SPEED);
};
