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
  /**
   * Steps in one FOOTFALL: the unit the server pays and announces in.
   *
   * A step is the unit the RATE is quoted in - the pad's "+1/Steps" - and at
   * two world units it is a sliver of one stride of the mount's legs. Paid and
   * announced one step at a time, a level-twelve rider earned nineteen awards
   * a second, and a player watching one stride of the legs saw a spray of
   * twenty "+1" popups. A footfall pays the steps it covers as ONE award, of
   * exactly `footfallSpeedGain`, so one stride on screen is one number.
   *
   * It moves how often Speed ARRIVES and nothing about how much: the Speed a
   * unit of distance pays is the rate over `strideDistance`, as it always was.
   */
  readonly footfallSteps: number;
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
  footfallSteps: 6,
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
 * What ONE step is worth, and every factor that made it so.
 *
 * Returned whole rather than as a bare number so the figure a player is paid
 * can always be explained: the server logs it, `verify:progression` asserts on
 * it, and the HUD's "Total Multiplier" is its `multiplier` field. There is no
 * second place that knows how these combine.
 */
export interface SpeedGainBreakdown {
  /** The equipped Speed Upgrade pad's per-step value. The only BASE. */
  readonly base: number;
  /** The mount's multiplier - what evolving buys. */
  readonly animal: number;
  /** The Speed Training belt underfoot, or 1 off a belt or on a locked one. */
  readonly training: number;
  /**
   * Always 1 for SPEED, and deliberately listed anyway.
   *
   * The item ladder multiplies the WINS a stage pays (`StageService`), not
   * Speed - that is what stops the third shop being the first two at a worse
   * price. It sits in the breakdown at 1 so a log line reads the whole
   * formula, and so nobody "fixes" its absence by multiplying an item in.
   */
  readonly items: number;
  /** The equipped trail's multiplier, 1 if none or unowned. */
  readonly trail: number;
  /** The equipped aura's multiplier, 1 if none or unowned. */
  readonly aura: number;
  /** The rebirth ladder's multiplier. */
  readonly rebirth: number;
  /** animal x training x items x trail x aura x rebirth: the HUD's figure. */
  readonly multiplier: number;
  /** base x every factor above, in that order: Speed per step. */
  readonly gain: number;
}

/**
 * THE Speed calculation. Nothing else in the game decides what a step is worth.
 *
 *   gain = base x animal x training x items x trail x aura x rebirth
 *
 * Multiplied in ONE FIXED ORDER, so the same inputs produce the same float64
 * down to the last bit on the server, in a test and in a log - floating-point
 * multiplication is not associative, and two call sites multiplying the same
 * six numbers in different orders can disagree in the last digit. Every
 * factor comes from its own config table and appears exactly once.
 *
 * It is a PER-STEP figure and deliberately knows nothing about distance or
 * time. How many steps a player took is the server's business
 * (`SpeedService`), and it always pays a WHOLE number of them - so every step
 * a player is credited is worth exactly this, and nothing in between.
 */
export const calculateSpeedGain = (inputs: GainInputs): SpeedGainBreakdown => {
  const base = upgradePerStep(inputs.upgradeSlot);
  const animal = mountMultiplier(inputs.mountSlot);
  const training = treadmillMultiplier(inputs.treadmill, inputs.rebirths);
  const items = 1;
  const trail = trailMultiplier(inputs.trailSlot, inputs.ownedTrails);
  const aura = auraMultiplier(inputs.auraSlot, inputs.ownedAuras);
  const rebirth = rebirthMultiplier(inputs.rebirths);

  const multiplier = animal * training * items * trail * aura * rebirth;
  const gain = base * animal * training * items * trail * aura * rebirth;
  return { base, animal, training, items, trail, aura, rebirth, multiplier, gain };
};

/**
 * The product of every MULTIPLIER a player has earned, with no base.
 *
 * The HUD's "Total Multiplier: x2.20". A view onto `calculateSpeedGain`, not a
 * second formula - which is the whole reason it cannot drift from what a step
 * actually pays.
 */
export const totalMultiplier = (inputs: GainInputs): number =>
  calculateSpeedGain(inputs).multiplier;

/** Speed granted for ONE step. A view onto `calculateSpeedGain`. */
export const speedPerStep = (inputs: GainInputs): number => calculateSpeedGain(inputs).gain;

/** World units of travel in one footfall - the distance one award stands for. */
export const FOOTFALL_DISTANCE = SPEED.strideDistance * SPEED.footfallSteps;

/**
 * Speed paid for ONE footfall: the gain of every step it covers, as one sum.
 *
 * The number on a popup. Still a view onto `calculateSpeedGain` - nothing
 * about the player enters here that did not enter there - so it is the same
 * figure for every footfall a given setup takes.
 */
export const footfallSpeedGain = (breakdown: SpeedGainBreakdown): number =>
  breakdown.gain * SPEED.footfallSteps;

/**
 * One line a person can check by hand:
 *
 *   Base 8 -> Animal x1.04 = 8.32 -> Training x1 = 8.32 -> ... -> Final Gain 8.32
 *
 * Figures are printed EXACTLY (to four decimals, with thousands separators).
 *
 * Each arrow carries the running product, so a wrong factor is visible at the
 * exact stage it went wrong rather than only in the total.
 */
export const describeSpeedGain = (b: SpeedGainBreakdown): string => {
  // EXACT, not compact: this is the line somebody checks with a calculator,
  // and "3.5K" hides the digits they are checking.
  const n = (value: number): string =>
    value.toLocaleString('en-US', { maximumFractionDigits: 4 });
  let running = b.base;
  const parts = [`Base ${n(b.base)}`];
  const stages: readonly (readonly [string, number])[] = [
    ['Animal', b.animal],
    ['Training', b.training],
    ['Items', b.items],
    ['Trail', b.trail],
    ['Aura', b.aura],
    ['Rebirth', b.rebirth],
  ];
  for (const [name, factor] of stages) {
    running *= factor;
    parts.push(`${name} x${n(factor)} = ${n(running)}`);
  }
  parts.push(`Final Gain ${n(b.gain)}`);
  return parts.join(' -> ');
};

/**
 * How a per-step GAIN is printed: exact below a thousand, compact above.
 *
 * Two decimal places at most, trailing zeros dropped - "+1.04", "+2.5",
 * "+125". NOT `formatSpeed`, which floors anything under a thousand to a whole
 * number: a mount paying 1.04 a step would have shown "+1" while the total
 * rose by 1.04, which is precisely the displayed-versus-paid disagreement a
 * deterministic gain is supposed to end.
 */
export const formatSpeedGain = (value: number): string => {
  const amount = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (amount >= COMPACT_ABOVE) return formatSpeed(amount);
  return String(Number(amount.toFixed(2)));
};

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
