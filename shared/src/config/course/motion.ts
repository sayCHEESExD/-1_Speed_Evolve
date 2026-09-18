import type { CourseHazard, MovingSolid } from './types.js';

/**
 * Everything in this world that moves, as PURE FUNCTIONS OF TIME.
 *
 * No state, no allocation, no randomness. The server evaluates these against
 * its own clock to decide a death or a carry, and every client evaluates the
 * identical functions against the replicated clock to draw the same thing - so
 * there is no world state on the wire at all, and a client has nothing it
 * could usefully forge. Everything here writes into a caller-supplied output
 * object, because at late-game speeds one simulated frame is dozens of
 * substeps and a fresh vector per hazard per substep would be the entire
 * garbage budget.
 */

/** A point, filled in by the functions below. */
export interface MotionPoint {
  x: number;
  y: number;
  z: number;
}

const TAU = Math.PI * 2;

/** Smooth 0..1 ease, for anything that starts and stops rather than cycles. */
const ease = (t: number): number => t * t * (3 - 2 * t);

/** The fraction of its cycle a thing is at, given its rate and phase. */
const cycle = (time: number, rate: number, phase: number): number => {
  const period = rate > 0 ? 1 / rate : 1;
  return (((time / period + phase) % 1) + 1) % 1;
};

// ---------------------------------------------------------------------------
// Platforms.
// ---------------------------------------------------------------------------

/**
 * Where a moving platform is, relative to where it was authored.
 *
 * Returns an OFFSET rather than a position so the caller can apply it to all
 * six faces of the authored box at once - the platform's shape never changes,
 * only where that shape is.
 */
export const platformOffsetAt = (
  solid: MovingSolid,
  time: number,
  out: MotionPoint,
): MotionPoint => {
  out.x = 0;
  out.y = 0;
  out.z = 0;

  switch (solid.motion) {
    case 'shuttle': {
      const swing = Math.sin((time * solid.rate + solid.phase) * TAU) * solid.amount;
      if (solid.axis === 'z') out.z = swing;
      else out.x = swing;
      return out;
    }

    case 'orbit': {
      // A circle in the horizontal plane. The platform stays axis-aligned: a
      // box that actually turned would need a rotating collision test, which
      // against an axis-aligned world is a solver rather than a radius.
      const angle = time * solid.rate + solid.phase * TAU;
      out.x = Math.cos(angle) * solid.amount;
      out.z = Math.sin(angle) * solid.amount;
      return out;
    }

    case 'lift': {
      out.y = Math.sin((time * solid.rate + solid.phase) * TAU) * solid.amount;
      return out;
    }

    case 'collapse': {
      const t = cycle(time, solid.rate, solid.phase);
      if (t < solid.hold) return out;

      // Past the hold: it drops away, stays away, and snaps back at the end of
      // the cycle. The drop is FAST - a bridge section that sank gracefully
      // would be a lift, and the whole point of this platform is that it gives
      // way under the player.
      const after = (t - solid.hold) / Math.max(1e-6, 1 - solid.hold);
      out.y = -solid.amount * ease(Math.min(1, after * 3.4));
      return out;
    }

    case 'gate': {
      out.y = solid.amount * gateOpennessAt(solid, time);
      return out;
    }

    default:
      return out;
  }
};

/** Fraction of a gate's cycle spent lifting, and again spent dropping. */
const GATE_SWING = 0.07;

/**
 * How open a timed gate is, 0 shut to 1 fully lifted.
 *
 * Exported for the renderer, which shows the warning before it drops from the
 * same curve the collision uses. Shut for `hold` of the cycle, then a quick
 * lift, a long stretch open, and a quick drop - so "open" and "shut" are both
 * states a player can see and plan around rather than a gate always moving.
 */
export const gateOpennessAt = (solid: MovingSolid, time: number): number => {
  if (solid.motion !== 'gate') return 0;
  const t = cycle(time, solid.rate, solid.phase);
  if (t < solid.hold) return 0;
  if (t < solid.hold + GATE_SWING) return ease((t - solid.hold) / GATE_SWING);
  if (t < 1 - GATE_SWING) return 1;
  return ease((1 - t) / GATE_SWING);
};

/**
 * How far a platform has moved over the last `delta` seconds.
 *
 * What CARRIES a rider. Computed as the difference between two evaluations
 * rather than from a derivative, because a derivative would have to be written
 * once per motion and would then be free to disagree with the position that
 * motion actually produces - which is the class of bug where a player slowly
 * slides off a platform that is, by every other measure, working.
 */
export const platformTravelAt = (
  solid: MovingSolid,
  time: number,
  delta: number,
  out: MotionPoint,
  scratch: MotionPoint,
): MotionPoint => {
  platformOffsetAt(solid, time, out);
  platformOffsetAt(solid, time - delta, scratch);
  out.x -= scratch.x;
  out.y -= scratch.y;
  out.z -= scratch.z;
  return out;
};

/**
 * How close a collapsing platform is to giving way, 0..1.
 *
 * Presentation only: the renderer shakes it and flushes it toward a warning
 * colour. A section that vanished with no tell would be a trap rather than an
 * obstacle, and this course has both - but only where it means to.
 */
export const collapseWarningAt = (solid: MovingSolid, time: number): number => {
  if (solid.motion !== 'collapse') return 0;
  const t = cycle(time, solid.rate, solid.phase);
  if (t >= solid.hold) return 1;
  const warn = 0.22;
  const into = (t - (solid.hold - warn)) / warn;
  return into <= 0 ? 0 : Math.min(1, into);
};

// ---------------------------------------------------------------------------
// Hazards.
// ---------------------------------------------------------------------------

/**
 * Where a hazard is at an instant.
 *
 * Position FIRST and the height test second, everywhere this is used: a
 * swing's whole point is that its Y changes, so testing against the authored
 * `y` would have it kill from the top of its arc - or, with the sign the other
 * way, never kill at all.
 */
export const hazardPositionAt = (
  hazard: CourseHazard,
  time: number,
  out: MotionPoint,
): MotionPoint => {
  switch (hazard.kind) {
    case 'boulder': {
      // Rolls from `fromZ` to `toZ`, DESCENDING as it goes and drifting in X.
      // The previous game's roller stayed level; on a sloped, curving path
      // that read as a ball hovering above the ground it was supposed to be
      // rolling down.
      // The period is the whole PATH over the speed, not just its Z. A boulder
      // rolling across the route has no Z span at all, and timing it by Z
      // alone gave it a period of nothing.
      const span = hazard.toZ - hazard.fromZ;
      const period =
        Math.max(1, Math.hypot(span, hazard.driftX)) / Math.max(1e-3, hazard.rate);
      const t = (((time / period + hazard.phase) % 1) + 1) % 1;
      out.z = hazard.fromZ + span * t;
      out.y = hazard.fromY + (hazard.toY - hazard.fromY) * t;
      out.x = hazard.x + hazard.driftX * t;
      return out;
    }

    case 'swing': {
      // A pendulum: low in the middle of its arc and high at the ends, so the
      // question it asks is WHEN rather than where.
      const angle = Math.sin(time * hazard.rate + hazard.phase * TAU);
      out.x = hazard.x + angle * hazard.sweep;
      out.y = hazard.y + (1 - Math.cos(angle * 1.1)) * hazard.sweep * 0.42;
      out.z = hazard.z;
      return out;
    }

    case 'spinner': {
      const angle = time * hazard.rate + hazard.phase * TAU;
      out.x = hazard.x + Math.cos(angle) * hazard.sweep;
      out.y = hazard.y;
      out.z = hazard.z + Math.sin(angle) * hazard.sweep;
      return out;
    }

    case 'faller': {
      out.x = hazard.x;
      out.z = hazard.z;
      out.y = hazard.y + fallerLiftAt(hazard, time);
      return out;
    }

    case 'dart': {
      // Waits, then crosses the path fast, then resets. Most of the cycle is
      // the wait, which is what makes the crossing readable.
      const t = cycle(time, 1 / Math.max(1e-3, hazard.rate), hazard.phase);
      const fire = 0.22;
      const travel = t < fire ? ease(t / fire) : 1;
      out.x = hazard.x + hazard.sweep * travel;
      out.y = hazard.y;
      out.z = hazard.z;
      return out;
    }

    case 'vine': {
      // Swings like a pendulum but stays a full-height column, so it sweeps
      // across the path rather than dipping under a jump.
      out.x = hazard.x + Math.sin(time * hazard.rate + hazard.phase * TAU) * hazard.sweep;
      out.y = hazard.y;
      out.z = hazard.z;
      return out;
    }

    case 'cascade':
    default:
      // A falling column of water does not move. It is a hazard rather than a
      // decoration because standing under it kills, and it is listed here so
      // one loop can evaluate every killer in the world.
      out.x = hazard.x;
      out.y = hazard.y;
      out.z = hazard.z;
      return out;
  }
};

/**
 * How far above its resting spot a faller is.
 *
 * Exported because the renderer draws the warning patch on the ground from it,
 * and a warning derived from a second copy of this curve would be free to
 * disagree with the rock it is warning about.
 */
export const fallerLiftAt = (hazard: CourseHazard, time: number): number => {
  const t = cycle(time, 1 / Math.max(1e-3, hazard.rate), hazard.phase);
  // Hover for most of the cycle, drop fast, rest, then rise back.
  const hover = 0.55;
  const drop = 0.1;
  const rest = 0.15;
  if (t < hover) return hazard.sweep;
  if (t < hover + drop) return hazard.sweep * (1 - ease((t - hover) / drop));
  if (t < hover + drop + rest) return 0;
  return hazard.sweep * ease((t - hover - drop - rest) / (1 - hover - drop - rest));
};

/**
 * How far a hazard can reach in X, and over what Z it can be found.
 *
 * ONE definition of each, because `sweep` means something different to every
 * kind - an arc's half-width, an orbit's radius, a fall HEIGHT, a dart's
 * travel - and code that assumed one meaning bucketed crushers as if they hung
 * through the valley wall.
 */
export const hazardReachX = (hazard: CourseHazard): number =>
  hazardReachXCore(hazard) + hazard.spanX;

const hazardReachXCore = (hazard: CourseHazard): number => {
  switch (hazard.kind) {
    case 'swing':
    case 'spinner':
    case 'vine':
      return Math.abs(hazard.x) + hazard.sweep + hazard.radius;
    case 'dart':
      // A dart travels FROM `x` TO `x + sweep`, so its extremes are those two
      // points. Adding their magnitudes together said a trap firing from +30
      // to -30 reached 92 units out, which is most of a valley.
      return Math.max(Math.abs(hazard.x), Math.abs(hazard.x + hazard.sweep)) + hazard.radius;
    case 'boulder':
      return Math.abs(hazard.x) + Math.abs(hazard.driftX) + hazard.radius;
    default:
      return Math.abs(hazard.x) + hazard.radius;
  }
};

export const hazardZRange = (hazard: CourseHazard): { minZ: number; maxZ: number } => {
  switch (hazard.kind) {
    case 'boulder': {
      const lo = Math.min(hazard.fromZ, hazard.toZ);
      const hi = Math.max(hazard.fromZ, hazard.toZ);
      return { minZ: lo - hazard.radius, maxZ: hi + hazard.radius };
    }
    case 'spinner':
      return { minZ: hazard.z - hazard.sweep - hazard.radius, maxZ: hazard.z + hazard.sweep + hazard.radius };
    case 'cascade':
      return { minZ: hazard.z - hazard.radius, maxZ: hazard.z + hazard.radius };
    default:
      return { minZ: hazard.z - hazard.radius, maxZ: hazard.z + hazard.radius };
  }
};

/**
 * Vertical half-extent of a hazard, for the height test.
 *
 * A cascade is a COLUMN rather than a ball: it hangs from its own `y` down by
 * `sweep`, and testing it as a sphere would let a player ride straight through
 * the bottom of a waterfall.
 */
export const hazardHalfHeight = (hazard: CourseHazard): number => {
  if (hazard.kind === 'cascade') return hazard.sweep / 2;
  if (hazard.kind === 'vine') return Math.max(0.5, (hazard.y - hazard.fromY) / 2);
  return hazard.radius;
};

/** Centre Y of a hazard's kill volume, given where `hazardPositionAt` put it. */
export const hazardCentreY = (hazard: CourseHazard, y: number): number => {
  if (hazard.kind === 'cascade') return y - hazard.sweep / 2;
  if (hazard.kind === 'vine') return y - hazardHalfHeight(hazard);
  return y;
};
