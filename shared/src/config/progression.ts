import { rebirthMultiplier } from './rebirth.js';

/**
 * Progression tuning. Level, Speed, Wins, rebirths, the equipped upgrade pad,
 * the mount and the two cosmetic ladders are all SERVER-AUTHORITATIVE; the
 * client may predict for UI feel but never decides any of them.
 *
 * There is NO level cap. Levels run on one compounding curve for ever, and a
 * rebirth is unlocked by REACHING a level rather than by being stopped at it.
 * See `config/speed.ts` and `config/rebirth.ts`.
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
 * The largest lifetime Speed the game will hold: the largest number a float64
 * can hold at all, about 1.8e308.
 *
 * This is NOT a level cap - the curve runs on past it, it is simply where the
 * arithmetic ends (around level twelve thousand). It exists so a total that
 * overflows SATURATES rather than turning into `Infinity`, which the clamp
 * below would otherwise read as garbage and reset to zero.
 */
export const MAX_TOTAL_SPEED = Number.MAX_VALUE;

/** Re-exported under the name the rest of the codebase already uses. */
export { rebirthMultiplier };

/** Clamp a Wins figure into the range the game can actually hold. */
export const clampWins = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, MAX_WINS);
};

/** Clamp a lifetime Speed figure into the range the game can actually hold. */
export const clampSpeed = (value: number): number => {
  if (Number.isNaN(value) || value <= 0) return 0;
  return Math.min(value, MAX_TOTAL_SPEED);
};
