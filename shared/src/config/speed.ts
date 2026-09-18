import { auraMultiplier } from './auras.js';
import { mountMultiplier } from './mounts.js';
import { rebirthMultiplier } from './rebirth.js';
import { trailMultiplier } from './trails.js';
import { treadmillMultiplier } from './treadmills.js';
import { MAX_TOTAL_SPEED } from './progression.js';
import { upgradePerStep } from './upgrades.js';

/**
 * Speed: the progression currency, and the level curve it drives.
 *
 * Every step the mount takes is worth a base figure set by the equipped
 * upgrade pad, multiplied by everything the player has earned. That lifetime
 * total is what the HUD shows as "Speed", and where it sits on the curve is
 * the player's LEVEL - which in turn is the only thing that makes the mount
 * physically faster.
 *
 * Speed is granted by the SERVER from movement it observes. The client only
 * ever displays the replicated total; it never awards its own progress.
 *
 * THE LEVEL CURVE COMPOUNDS. The first nine levels are the authored linear run
 * the reference art shows, and every level after that costs six percent more
 * than the linear term alone, compounded. That is the difference between a
 * hundredth level costing five more than the ninety-ninth and costing eight
 * thousand more, and it is the whole reason the back half of this game has a
 * shape at all.
 */
export interface SpeedConfig {
  /** World units of travel that count as one step. */
  readonly strideDistance: number;
  /** Steps' worth of Speed granted each time the mount leaves the ground. */
  readonly jumpBonusSteps: number;
  /**
   * Largest distance the server will credit from a single simulated step.
   *
   * Expressed as a multiple of the step's own maximum honest travel, so it
   * scales with the player's authoritative speed instead of throttling a fast
   * player back to a beginner's cap. A teleport still pays nothing.
   */
  readonly creditSlack: number;
  /**
   * The LINEAR term: level L's requirement starts at `levelStep * L`.
   *
   * Five, and the first nine levels are exactly that and nothing else. The
   * reference art pins three of them - level 5 reads "16.00 / 25.00", level 8
   * reads "24.00 / 40.00" over a lifetime "Speed: 164.00", and level 9 reads
   * "36.00 / 45.00" - and 25, 40 and 45 are 5x5, 5x8 and 5x9. Those are
   * figures a player reads on screen every second, so the curve reproduces
   * them exactly rather than approximately.
   */
  readonly levelStep: number;
  /**
   * The level at which the curve stops being linear and starts COMPOUNDING.
   *
   * Nine, which is the last level the reference art pins. Everything below it
   * is the authored linear run; everything above it grows geometrically.
   */
  readonly levelKnee: number;
  /**
   * How much more each level costs than the linear term alone, compounded.
   *
   * THE number that decides what the back half of this game feels like. The
   * curve used to be purely linear, so level 100 cost 500 and level 101 cost
   * 505 - a one percent step, which after a few hundred levels of a multiplier
   * stack that reaches the millions is no progression at all. Compounding at
   * six percent a level on top of the linear term means level 101 costs about
   * eight thousand more than level 100 rather than five.
   *
   * Six percent is chosen against both failure modes. Much lower and the late
   * game is the flat grind it was; much higher and the curve outruns a
   * float64 before the rebirth ladder runs out of rungs, which is the
   * "impossible" end of the scale rather than the demanding one. At six
   * percent the requirement saturates somewhere past level four hundred and
   * eighty - far beyond the twenty rebirths it would take to be allowed there.
   */
  readonly levelGrowth: number;
}

export const SPEED: SpeedConfig = {
  strideDistance: 2,
  jumpBonusSteps: 2,
  creditSlack: 1.6,
  levelStep: 5,
  levelKnee: 9,
  levelGrowth: 1.06,
};

/**
 * Speed needed to advance FROM `level` to the next one.
 *
 * `levelStep * L` for the authored head of the curve, and then that same
 * linear figure compounded once per level beyond the knee. Rounded, because
 * the bar prints this number and "3,053,271.88" is not a reading.
 */
export const speedForNextLevel = (level: number): number => {
  const from = Math.max(1, Math.floor(level));
  const linear = SPEED.levelStep * from;
  const beyond = Math.max(0, from - SPEED.levelKnee);
  const cost = linear * SPEED.levelGrowth ** beyond;
  // Saturates rather than overflowing. Past this the figure stops being a
  // number a float64 can add one to, and a requirement that silently stops
  // increasing is better than one that silently goes backwards.
  return Math.min(MAX_TOTAL_SPEED, Math.round(cost));
};

/**
 * The cumulative cost of every level, built once.
 *
 * A TABLE rather than a closed form, and it has to be: the per-level cost is
 * rounded, so the running total is a sum of rounded terms and no formula
 * reproduces it. Building it once is also what guarantees that
 * `totalSpeedToReach` and `speedForNextLevel` can never disagree - the table
 * is made OF the latter.
 *
 * `CUMULATIVE[i]` is the lifetime Speed needed to have reached level `i + 1`,
 * so entry zero is zero: level 1 is free.
 */
const CUMULATIVE: readonly number[] = (() => {
  const table: number[] = [0];
  // One thousand is well past the point the curve saturates, and past any
  // level the rebirth ladder could gate. The loop stops early when adding the
  // next level stops changing the total, which is the real ceiling.
  for (let level = 1; level < 1000; level += 1) {
    const next = (table[level - 1] as number) + speedForNextLevel(level);
    if (!Number.isFinite(next) || next >= MAX_TOTAL_SPEED) {
      table.push(MAX_TOTAL_SPEED);
      break;
    }
    table.push(next);
  }
  return table;
})();

/** The highest level the curve can express before it saturates. */
export const MAX_CURVE_LEVEL = CUMULATIVE.length;

/**
 * Cumulative Speed needed to have REACHED `level`. Level 1 costs nothing.
 *
 * Read straight out of the table, so it is the exact sum of the requirements
 * the bar showed on the way up rather than a formula that approximates them.
 */
export const totalSpeedToReach = (level: number): number => {
  const target = Math.max(1, Math.floor(level));
  const index = Math.min(target, MAX_CURVE_LEVEL) - 1;
  return CUMULATIVE[index] as number;
};

/** Where a lifetime Speed total sits on the level curve. */
export interface LevelProgress {
  /** Current level. Everyone starts at 1. */
  readonly level: number;
  /** Speed earned toward the next level. */
  readonly into: number;
  /** Speed needed for the next level. */
  readonly required: number;
  /** 0..1 fill for the level bar. */
  readonly fraction: number;
  /** True when the level cap has been reached and the bar is full. */
  readonly capped: boolean;
}

/**
 * Resolve a lifetime Speed total into a level and a bar position.
 *
 * A BINARY SEARCH of the cumulative table. The curve used to be linear, so
 * `total = step * L(L-1)/2` inverted to a quadratic and the level was one
 * square root; a compounding curve has no such inverse, and counting levels in
 * a loop would be a few hundred iterations on a function the HUD calls every
 * frame. Twelve comparisons against a table built once is neither.
 *
 * It is also EXACT, which the square root was not: the old version needed two
 * correction loops afterwards to settle a floating-point boundary by a level
 * either way, and a search over the same integers the requirements were summed
 * from has no boundary to settle.
 */
export const resolveLevel = (totalSpeed: number, levelCap: number): LevelProgress => {
  const cap = Math.max(1, Math.floor(levelCap));
  const total = Number.isFinite(totalSpeed) ? Math.max(0, totalSpeed) : 0;

  // The highest index whose cumulative cost this total covers.
  let lo = 0;
  let hi = CUMULATIVE.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((CUMULATIVE[mid] as number) <= total) lo = mid;
    else hi = mid - 1;
  }
  const level = Math.max(1, Math.min(lo + 1, cap));

  if (level >= cap) {
    const required = speedForNextLevel(cap);
    return { level: cap, into: required, required, fraction: 1, capped: true };
  }

  const required = speedForNextLevel(level);
  const into = total - totalSpeedToReach(level);
  return {
    level,
    into,
    required,
    fraction: required > 0 ? Math.min(Math.max(into / required, 0), 1) : 0,
    capped: false,
  };
};

/**
 * Everything that decides what one step is worth.
 *
 * Passed as a struct rather than six positional arguments because six numbers
 * in a row is exactly the signature that gets called with two of them swapped,
 * and a swapped mount and trail would pay out silently rather than fail.
 */
export interface GainInputs {
  /** Equipped upgrade pad. Sets the BASE, which nothing else does. */
  readonly upgradeSlot: number;
  /** Completed rebirths. */
  readonly rebirths: number;
  /** Equipped mount slot. */
  readonly mountSlot: number;
  /** Equipped trail slot, and the mask proving it is owned. */
  readonly trailSlot: number;
  readonly ownedTrails: number;
  /** Equipped aura slot, and the mask proving it is owned. */
  readonly auraSlot: number;
  readonly ownedAuras: number;
  /** Belt underfoot, or 0. Derived from position, never from a message. */
  readonly treadmill: number;
}

/**
 * The product of every MULTIPLIER a player has earned, with no base.
 *
 * This is the figure the HUD prints as "Total Multiplier: x2.20". It is
 * separated from the per-step value so the two cannot drift: the HUD shows
 * exactly the number the gain formula multiplies by, because it is the same
 * call.
 *
 * Every factor appears here EXACTLY ONCE. That is the whole reason this
 * function exists rather than four call sites each multiplying in what they
 * happen to know about - a bonus applied twice is invisible in code review and
 * obvious in the economy a week later.
 */
export const totalMultiplier = (inputs: GainInputs): number =>
  rebirthMultiplier(inputs.rebirths) *
  mountMultiplier(inputs.mountSlot) *
  trailMultiplier(inputs.trailSlot, inputs.ownedTrails) *
  auraMultiplier(inputs.auraSlot, inputs.ownedAuras) *
  treadmillMultiplier(inputs.treadmill, inputs.rebirths);

/**
 * Speed granted for ONE step.
 *
 * THE single gain evaluator. The base comes from the upgrade pad and every
 * other term is a factor through `totalMultiplier`, so a new bonus is a factor
 * added there and never a second formula anywhere.
 */
export const speedPerStep = (inputs: GainInputs): number =>
  upgradePerStep(inputs.upgradeSlot) * totalMultiplier(inputs);

/**
 * The compact ladder, largest first.
 *
 * It runs to quintillions because this prints WINS as well as Speed, and the
 * Sun trail costs 250 trillion. A figure past the top is shown in exponential
 * rather than as a wall of digits: nothing in the game should reach it, and if
 * something does, a readable oddity beats an unreadable one.
 */
const UNITS: readonly (readonly [number, string])[] = [
  [1e18, 'E'],
  [1e15, 'Qa'],
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];

/**
 * One decimal place, and NEVER a trailing zero.
 *
 * "1K", not "1.0K"; "2.5K", not "2K". The decimal earns its place when it
 * carries a digit and is noise when it does not, and a round thousand is
 * exactly the figure a player sees most often.
 */
const oneDecimal = (value: number): string => {
  const text = value.toFixed(1);
  return text.endsWith('.0') ? text.slice(0, -2) : text;
};

/**
 * Compact display form: 940, 1K, 2.5K, 13.2K, 100K, 3.1M, 1B, 1T.
 *
 * THE one place a large figure is abbreviated. Every surface that prints Speed
 * or Wins - the HUD, the level bar, the popups, the leaderboards, the shop
 * prices, the upgrade plates, the stage markers - goes through here, so the
 * game cannot end up abbreviating in two styles depending on where you look.
 */
export const formatSpeed = (value: number): string => {
  const amount = Number.isFinite(value) ? Math.max(0, value) : 0;
  for (const [size, suffix] of UNITS) {
    if (amount >= size) return `${oneDecimal(amount / size)}${suffix}`;
  }
  return Math.floor(amount).toString();
};

/**
 * Where an exact figure stops being a reading and becomes a wall of digits.
 *
 * A thousand. Below it the two decimal places the reference art draws are
 * worth having; at and above it nobody parses "1043215.75" as a quantity, and
 * "1M" is the same information in two characters. It sits here rather than
 * being written at each call site so the headline figure and the level bar
 * cannot disagree about when to abbreviate - which is the one way a player
 * ends up reading "Speed: 1043215.75" over a bar that says "1K/2.5K".
 */
export const COMPACT_ABOVE = 1_000;

/**
 * The HUD's headline Speed reading: two decimal places, as the art shows it.
 *
 * "Speed: 76.00" is a LITERAL total up to `COMPACT_ABOVE` and the compact form
 * past it. Every figure the reference art pins - 76.00, 164.00, and the
 * 16.00 / 25.00 on the level bar - is under the threshold, so all of them
 * still read exactly the way they are drawn.
 */
export const formatSpeedExact = (value: number): string => {
  const amount = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (amount >= COMPACT_ABOVE) return formatSpeed(amount);
  return amount.toFixed(2);
};
