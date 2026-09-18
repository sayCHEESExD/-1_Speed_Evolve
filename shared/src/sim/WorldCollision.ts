import {
  COURSE,
  COURSE_END_Z,
  COURSE_HAZARDS,
  COURSE_SOLIDS,
  MOVING_SOLIDS,
  corridorHalfWidthAt,
  hazardCentreY,
  hazardHalfHeight,
  hazardPositionAt,
  hazardZRange,
  pitAt,
  platformOffsetAt,
  platformTravelAt,
  stageAt,
  treadmillAt,
  winPadAt,
  type CourseSolid,
  type MotionPoint,
  type MovingSolid,
  type StageDefinition,
} from '../config/course.js';
import { MOVEMENT } from '../config/movement.js';
import { DEATH_PLANE_Y, MOUNT_HEIGHT, MOUNT_RADIUS } from '../constants/world.js';

/**
 * The gameplay shape of the world: what you can stand on, what stops you, what
 * carries you, and what kills you.
 *
 * Lives in `shared` because BOTH sides collide against it - the server
 * re-simulates movement against this object and the client predicts against an
 * identical one. A second copy anywhere would be a source of desync, which is
 * why the renderer builds its meshes from the same arrays rather than from
 * geometry of its own.
 *
 * Solids are bucketed by Z. The world is thousands of boxes strung out over
 * fifteen thousand units, and at late-game speeds `stepPlayer` subdivides one
 * frame into dozens of substeps - a linear scan per substep would be the whole
 * frame budget. A bucket lookup makes each test a handful of boxes.
 *
 * TIME is state on this object rather than an argument on every method,
 * because most of this world moves. `stepPlayer` sets it once per step from
 * the authoritative clock, so a whole step - and a whole replay - is evaluated
 * against one consistent instant.
 */

/** Z span of one spatial bucket, in world units. */
const BUCKET_SIZE = 24;

/**
 * How far BELOW a surface the mount may be and still land on it.
 *
 * Deliberately the same number as `MOVEMENT.stepHeight`, and that is not a
 * coincidence - it is the fix for a real trap. `surfaceYAt` reports the highest
 * surface within a step of the feet and `canLandOn` decides whether the mount
 * may actually settle onto it. When the two disagreed, every ledge between them
 * was reported as the floor and then refused as a landing, so the mount fell
 * straight through the solid ground underneath it and never recovered.
 */
const LANDING_TOLERANCE = MOVEMENT.stepHeight;

/** Slack on the head test, so grazing an underside does not snag. */
const CEILING_TOLERANCE = 0.05;

/**
 * How far a platform may have dropped and still be stood on.
 *
 * Past this a collapsing section is genuinely GONE: there is nothing to land on
 * and nothing to bump into, which is the whole point of a bridge that gives
 * way.
 */
const GONE_BELOW = MOVEMENT.stepHeight * 1.5;

/** What the player walked into this step. Every field is independent. */
export interface CourseTriggers {
  /** Stage whose win dais the player is standing on, or null. */
  winStage: StageDefinition | null;
  /** True if the mount intersects a hazard. */
  hazard: boolean;
  /** True if the player has fallen into a kill volume or off the world. */
  fell: boolean;
  /** Treadmill the player is standing on, or 0. */
  treadmill: number;
}

export class WorldCollision {
  /** Static solids indexed by Z bucket. A solid appears in every bucket it spans. */
  private readonly buckets = new Map<number, CourseSolid[]>();

  /**
   * Moving platforms, bucketed over every Z they can REACH.
   *
   * An orbiting platform travels a circle, so bucketing it where it was
   * authored would make it solid only for the quarter of its cycle it happened
   * to spend there - which is exactly the bug where a player rides a disc out
   * of the world and falls through it.
   */
  private readonly movingBuckets = new Map<number, MovingSolid[]>();

  /** Hazards, bucketed by the Z range they can reach. */
  private readonly hazardBuckets = new Map<number, number[]>();

  private readonly minBucket: number;
  private readonly maxBucket: number;

  /** The instant every query is evaluated at. Set once per simulation step. */
  private time = 0;

  /** Scratch, so nothing in the hot path allocates. */
  private readonly hazardAt: MotionPoint = { x: 0, y: 0, z: 0 };
  private readonly offset: MotionPoint = { x: 0, y: 0, z: 0 };
  private readonly scratch: MotionPoint = { x: 0, y: 0, z: 0 };

  constructor() {
    let lowest = Number.POSITIVE_INFINITY;
    let highest = Number.NEGATIVE_INFINITY;

    for (const solid of COURSE_SOLIDS) {
      const from = bucketOf(solid.minZ);
      const to = bucketOf(solid.maxZ);
      lowest = Math.min(lowest, from);
      highest = Math.max(highest, to);
      for (let b = from; b <= to; b += 1) push(this.buckets, b, solid);
    }

    for (const platform of MOVING_SOLIDS) {
      const reach = platformReachZ(platform);
      const from = bucketOf(platform.minZ - reach);
      const to = bucketOf(platform.maxZ + reach);
      lowest = Math.min(lowest, from);
      highest = Math.max(highest, to);
      for (let b = from; b <= to; b += 1) push(this.movingBuckets, b, platform);
    }

    for (let i = 0; i < COURSE_HAZARDS.length; i += 1) {
      const hazard = COURSE_HAZARDS[i];
      if (!hazard) continue;
      // How far along Z a hazard can ever get is a property OF THE HAZARD, so
      // it is answered in one place. A boulder travels its whole ramp and a
      // spinner reaches a radius either side of its hub; bucketing either as
      // if it stood still would leave it drawn, lethal on the server, and
      // completely absent from the client's prediction.
      const span = hazardZRange(hazard);
      const from = bucketOf(span.minZ) - 1;
      const to = bucketOf(span.maxZ) + 1;
      for (let b = from; b <= to; b += 1) {
        let list = this.hazardBuckets.get(b);
        if (!list) {
          list = [];
          this.hazardBuckets.set(b, list);
        }
        list.push(i);
      }
    }

    this.minBucket = Number.isFinite(lowest) ? lowest : 0;
    this.maxBucket = Number.isFinite(highest) ? highest : 0;
  }

  /**
   * The instant to evaluate against.
   *
   * Called once per simulation step by `stepPlayer`. Holding it here rather
   * than threading it through every signature keeps the whole step - and every
   * replayed step during reconciliation - on one consistent clock.
   */
  setTime(time: number): void {
    this.time = Number.isFinite(time) ? time : 0;
  }

  /** Solids that could touch a body centred at this Z. Never allocates. */
  private near(z: number): readonly CourseSolid[] {
    const bucket = bucketOf(z);
    if (bucket < this.minBucket - 1 || bucket > this.maxBucket + 1) return EMPTY;

    SCRATCH.length = 0;
    // The shifted-platform pool is handed out fresh for each query, so an
    // entry can never be overwritten while the caller is still reading it.
    shiftCursor = 0;
    for (let b = bucket - 1; b <= bucket + 1; b += 1) {
      const list = this.buckets.get(b);
      if (list) for (const solid of list) SCRATCH.push(solid);

      const moving = this.movingBuckets.get(b);
      if (!moving) continue;
      for (const platform of moving) {
        platformOffsetAt(platform, this.time, this.offset);
        // A platform that has dropped out of the way is genuinely gone.
        if (-this.offset.y > GONE_BELOW) continue;
        SCRATCH.push(shifted(platform, this.offset));
      }
    }
    return SCRATCH;
  }

  /**
   * Height of the walkable surface under the mount, or null over a gap.
   *
   * Only surfaces at or below `feetY + stepHeight` count: a block the player is
   * standing beside must not be reported as the floor they are on, or they
   * would be snapped up onto it without ever jumping.
   *
   * The body radius is honoured so the mount can stand on a plank edge rather
   * than falling the instant its centre passes it.
   */
  surfaceYAt(x: number, z: number, feetY: number): number | null {
    const ceiling = feetY + MOVEMENT.stepHeight;
    let best: number | null = null;
    for (const solid of this.near(z)) {
      if (x < solid.minX - MOUNT_RADIUS || x > solid.maxX + MOUNT_RADIUS) continue;
      if (z < solid.minZ - MOUNT_RADIUS || z > solid.maxZ + MOUNT_RADIUS) continue;
      if (solid.maxY > ceiling) continue;
      if (best === null || solid.maxY > best) best = solid.maxY;
    }
    return best;
  }

  /**
   * How far the platform under the mount has moved over the last `delta`.
   *
   * What CARRIES a rider, and the reason this world can have moving platforms
   * at all rather than only moving hazards. Written into `out`; `out` is zeroed
   * when the mount is standing on ordinary ground, which is almost always.
   *
   * The platform chosen is the HIGHEST one under the feet, which is the same
   * one `surfaceYAt` would have reported - so the mount is never carried by
   * something it is not actually standing on.
   */
  carryAt(x: number, z: number, feetY: number, delta: number, out: MotionPoint): MotionPoint {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    if (delta <= 0) return out;

    const bucket = bucketOf(z);
    let bestY = Number.NEGATIVE_INFINITY;
    let best: MovingSolid | null = null;

    for (let b = bucket - 1; b <= bucket + 1; b += 1) {
      const moving = this.movingBuckets.get(b);
      if (!moving) continue;
      for (const platform of moving) {
        platformOffsetAt(platform, this.time, this.offset);
        if (-this.offset.y > GONE_BELOW) continue;
        const top = platform.maxY + this.offset.y;
        // Standing ON it, within the same tolerance a landing uses.
        if (feetY > top + LANDING_TOLERANCE || feetY < top - LANDING_TOLERANCE) continue;
        if (x < platform.minX + this.offset.x - MOUNT_RADIUS) continue;
        if (x > platform.maxX + this.offset.x + MOUNT_RADIUS) continue;
        if (z < platform.minZ + this.offset.z - MOUNT_RADIUS) continue;
        if (z > platform.maxZ + this.offset.z + MOUNT_RADIUS) continue;
        if (top <= bestY) continue;
        bestY = top;
        best = platform;
      }
    }

    if (best) platformTravelAt(best, this.time, delta, out, this.scratch);
    return out;
  }

  /**
   * Underside of the lowest solid the mount is about to head-butt, or null.
   *
   * `previousHeadY` keeps it honest: only a slab the head was already BELOW can
   * stop it, so standing on a block never traps the player under the one they
   * are on. It is what makes the tunnels collide correctly with no new physics.
   */
  ceilingYAt(x: number, z: number, previousHeadY: number): number | null {
    let best: number | null = null;
    for (const solid of this.near(z)) {
      if (x < solid.minX || x > solid.maxX) continue;
      if (z < solid.minZ || z > solid.maxZ) continue;
      if (previousHeadY > solid.minY + CEILING_TOLERANCE) continue;
      if (best === null || solid.minY < best) best = solid.minY;
    }
    return best;
  }

  /** True when the mount may snap down onto `surfaceY` from `previousY`. */
  canLandOn(previousY: number, surfaceY: number): boolean {
    return previousY >= surfaceY - LANDING_TOLERANCE;
  }

  /**
   * Push the body out of anything it has walked into along ONE axis.
   *
   * Axis-separated resolution: the caller moves X, calls this with axis 0, then
   * moves Z and calls it with axis 2. Doing both at once needs a solver and
   * produces the classic corner-snag; doing them in turn is exact for an
   * axis-aligned world and cannot oscillate.
   *
   * @returns the corrected coordinate on that axis
   */
  resolveAxis(axis: 0 | 2, value: number, other: number, feetY: number): number {
    const headY = feetY + MOUNT_HEIGHT;
    const stepTop = feetY + MOVEMENT.stepHeight;
    let out = value;

    for (const solid of this.near(axis === 2 ? value : other)) {
      // Not tall enough to block, or entirely above the rider's head.
      if (solid.maxY <= stepTop) continue;
      if (solid.minY >= headY) continue;

      const minA = axis === 0 ? solid.minX : solid.minZ;
      const maxA = axis === 0 ? solid.maxX : solid.maxZ;
      const minB = axis === 0 ? solid.minZ : solid.minX;
      const maxB = axis === 0 ? solid.maxZ : solid.maxX;

      if (other + MOUNT_RADIUS <= minB || other - MOUNT_RADIUS >= maxB) continue;
      if (out + MOUNT_RADIUS <= minA || out - MOUNT_RADIUS >= maxA) continue;

      const pushLow = minA - MOUNT_RADIUS;
      const pushHigh = maxA + MOUNT_RADIUS;
      out = out - pushLow < pushHigh - out ? pushLow : pushHigh;
    }

    return out;
  }

  /**
   * Invisible boundary keeping the player inside the valley.
   *
   * A CLAMP rather than a wall collider: it is applied after the substep has
   * already integrated, so no speed and no jump arc can tunnel it the way a
   * thin box could be tunnelled.
   */
  clampToBounds(x: number, z: number, out: { x: number; z: number }): void {
    const limit = corridorHalfWidthAt(z);
    out.x = x < -limit ? -limit : x > limit ? limit : x;
    out.z =
      z < COURSE.campStartZ + 2
        ? COURSE.campStartZ + 2
        : z > COURSE_END_Z
          ? COURSE_END_Z
          : z;
  }

  /** Sample every trigger volume at the mount's current position. */
  sampleTriggers(x: number, y: number, z: number, time: number): CourseTriggers {
    this.setTime(time);
    return {
      winStage: winPadAt(x, y, z),
      hazard: this.touchesHazard(x, y, z, time),
      fell: this.hasFallen(x, y, z),
      treadmill: treadmillAt(x, y, z),
    };
  }

  /**
   * True when the player has fallen out of the world.
   *
   * Almost always through a KILL VOLUME rather than the global death plane: the
   * route lays one under every stretch it builds, at a fixed depth below that
   * stretch's own ground, so a miss on a bridge forty units up kills as
   * promptly as a miss on the valley floor. The death plane is the backstop for
   * a fall that somehow leaves every volume.
   */
  hasFallen(x: number, y: number, z: number): boolean {
    if (y <= DEATH_PLANE_Y) return true;
    return pitAt(x, y, z) !== null;
  }

  /**
   * True when the mount intersects a hazard at `time`.
   *
   * The hazard's position comes from `hazardPositionAt`, the single pure
   * function both sides evaluate. There is no hazard state on the wire and
   * therefore nothing a client can forge - the server checks this against its
   * own clock and its own authoritative position, and the client's identical
   * check is only ever a prediction.
   */
  touchesHazard(x: number, y: number, z: number, time: number): boolean {
    const indices = this.hazardBuckets.get(bucketOf(z));
    if (!indices) return false;

    const feet = y;
    const head = y + MOUNT_HEIGHT;

    for (const index of indices) {
      const hazard = COURSE_HAZARDS[index];
      if (!hazard) continue;

      // Position FIRST, height test second. A swing's whole point is that its
      // Y changes, so testing against the authored `y` would have it kill from
      // the top of its arc - or, with the sign the other way, never at all.
      hazardPositionAt(hazard, time, this.hazardAt);
      const half = hazardHalfHeight(hazard);
      const centreY = hazardCentreY(hazard, this.hazardAt.y);
      if (head < centreY - half) continue;
      if (feet > centreY + half) continue;

      const reach = hazard.radius + MOUNT_RADIUS;
      if (Math.abs(z - this.hazardAt.z) > reach) continue;
      if (Math.abs(x - this.hazardAt.x) > reach) continue;
      return true;
    }
    return false;
  }

  /** The stage containing a Z, or null. Re-exported so callers need one import. */
  stageAt(z: number): StageDefinition | null {
    return stageAt(z);
  }
}

/** Shared scratch list for `near`. Single-threaded, so sharing is safe. */
const SCRATCH: CourseSolid[] = [];
const EMPTY: readonly CourseSolid[] = [];

/** A solid whose fields may be written - the pooled form of a moving platform. */
type MutableSolid = { -readonly [K in keyof CourseSolid]: CourseSolid[K] };

/**
 * A moving platform expressed as a plain solid at its current position.
 *
 * Reused rather than allocated: `near` runs once per substep and a fresh object
 * per platform per substep would be the frame's whole garbage budget. The
 * cursor is reset at the top of every `near`, and the pool GROWS rather than
 * wrapping, so an entry can never be recycled while the caller that asked for
 * it is still reading it.
 */
const SHIFT_POOL: MutableSolid[] = [];
let shiftCursor = 0;

const shifted = (platform: MovingSolid, offset: MotionPoint): CourseSolid => {
  if (shiftCursor >= SHIFT_POOL.length) {
    SHIFT_POOL.push({
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      minZ: 0,
      maxZ: 0,
      kind: 'stone',
      stage: 0,
    });
  }
  const out = SHIFT_POOL[shiftCursor] as MutableSolid;
  shiftCursor += 1;
  out.minX = platform.minX + offset.x;
  out.maxX = platform.maxX + offset.x;
  out.minY = platform.minY + offset.y;
  out.maxY = platform.maxY + offset.y;
  out.minZ = platform.minZ + offset.z;
  out.maxZ = platform.maxZ + offset.z;
  out.kind = platform.kind;
  out.stage = platform.stage;
  return out;
};

/** How far along Z a platform can travel from where it was authored. */
const platformReachZ = (platform: MovingSolid): number => {
  if (platform.motion === 'orbit') return platform.amount;
  if (platform.motion === 'shuttle' && platform.axis === 'z') return platform.amount;
  return 0;
};

const push = <T>(map: Map<number, T[]>, key: number, value: T): void => {
  let list = map.get(key);
  if (!list) {
    list = [];
    map.set(key, list);
  }
  list.push(value);
};

const bucketOf = (z: number): number => Math.floor(z / BUCKET_SIZE);
