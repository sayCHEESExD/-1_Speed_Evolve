import { MOVEMENT, resolveMovementProfile } from '../movement.js';
import { COURSE, QUICKSAND, STAGE_TUNING } from './metrics.js';
import {
  block,
  box,
  cave,
  decorate,
  hazard,
  jitter,
  mover,
  pit,
  rand,
  surface,
  widen,
} from './emit.js';
import type { MovingSolid, PitRegion, SolidKind } from './types.js';

/**
 * A cursor that walks the expedition's route and lays the world behind it.
 *
 * THE central idea of this world, and the thing that makes it a different game
 * from the previous one in the series. That game ran down a straight corridor
 * with a solid floor beneath every inch of it, and each stage was a pattern of
 * obstacles dropped onto that floor at lanes written as fractions of its
 * width. Here there is no floor: the cursor carries a POSITION, an ELEVATION
 * and a WIDTH, every call moves it forward, and what it emits is the only
 * thing the player can stand on. A route that turns, climbs, narrows, splits
 * and dives underground therefore costs the builder a line each, rather than
 * being impossible.
 *
 * The world axis is still +Z, because the stage ranges, the spatial buckets
 * and the camera all depend on it. What has changed is that the ROUTE inside
 * that axis is free: `aimAt` sets a lateral target and the next stretch curves
 * toward it in blocky steps, which is both how a Roblox path looks and how an
 * axis-aligned collision model stays exact.
 *
 * Every stretch also lays its own KILL VOLUME, at `COURSE.fallDepth` below the
 * lowest ground in it and spanning the whole valley. There is deliberately no
 * way to build a stretch of this course with a bottomless drop beside it: the
 * cursor does it, not the author, so it cannot be forgotten on the one stage
 * where it matters.
 */

/** Length of one emitted slab. Short enough that a curve reads as a curve. */
const STEP = 7;

/** Forward distance after which a new kill volume is laid. */
const PIT_STEP = 26;

/** Elevation change after which one is laid early, however short the stretch. */
const PIT_RISE = 9;

export interface RouteStart {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
}

/** Options common to everything the cursor emits. */
export interface StretchOptions {
  /** Override the cursor's width for this stretch only. */
  readonly width?: number;
  /** Material. Defaults to the cursor's current one. */
  readonly kind?: SolidKind;
  /** Lateral target to curve toward over this stretch. */
  readonly aim?: number;
  /** Elevation to reach by the end of this stretch. */
  readonly rise?: number;
  /** Raised kerbs down both edges, so a narrow path reads as one. */
  readonly rails?: boolean;
  /**
   * Half-width of the FOREST FLOOR laid either side of this stretch.
   *
   * The acts that happen on the ground need ground: without it a trail is a
   * causeway over nothing and everything planted beside it hangs in mid-air
   * forty units above the valley. The aprons are laid per step, so they follow
   * a meandering trail automatically, and only where the path itself exists -
   * a gap in the trail is still a gap in the world.
   *
   * The later acts leave this out on purpose. From the ruins onward the route
   * IS the world and what is beside it is a drop, which is the whole reason
   * the difficulty can keep climbing without the obstacles changing.
   */
  readonly shoulders?: number;
  /**
   * Width of the jungle VERGE laid either side of the path, level with it.
   *
   * Walkable, and part of the route: a trail cut through the forest has
   * undergrowth to its edges rather than a clean kerb and a drop. Defaults to
   * the cursor's own `verge`. Every obstacle that spans the route spans the
   * verge too, so it is never a way round one.
   */
  readonly verge?: number;
  /**
   * Climb or descend in a STRAIGHT line rather than an eased curve.
   *
   * For ramps something rolls down: a boulder or a log travels a straight
   * line between its two ends, and a ramp that eased in and out would leave
   * it floating over the middle of the slope or sunk into its ends.
   */
  readonly linear?: boolean;
}

export class Route {
  readonly stage: number;

  /** Centre of the path, and the height of its walkable TOP. */
  x: number;
  y: number;
  z: number;
  /** Where this stage began, so a builder can dress the whole of it. */
  readonly startZ: number;
  /** Width of the path the next stretch will lay. */
  width: number;
  /** Material the next stretch will be made of. */
  kind: SolidKind = 'dirt';
  /** Default jungle verge either side of every stretch. See `StretchOptions.verge`. */
  verge = 0;

  /** True while laying a `linear` stretch. */
  private straight = false;

  /**
   * The centre line as it was actually laid: one sample per slab, in Z order.
   *
   * What scenery asks when it wants to stand BESIDE the path at a given Z.
   * The cursor only knows where the route ended, and on a trail twenty-eight
   * wide that wanders from side to side, a tree placed off the end of the
   * stretch is a tree in the middle of it.
   */
  private readonly trace: { z: number; x: number; y: number; half: number }[] = [];

  /**
   * How far a full-speed jump carries at this stage's recommended level.
   *
   * THE unit this course is measured in. A gap written in world units means
   * something different at every stage - nine units is a real jump at level
   * one and a stride at level one hundred and sixty - and that is exactly how
   * the old course ended up a highway: its late gaps were a quarter of a jump.
   * Written as a fraction of `reach`, a gap is the same ask at every stage,
   * and the difficulty ladder is the fractions rather than an accident of
   * the speed curve.
   */
  readonly reach: number;
  /** Run speed at the recommended level. */
  readonly speed: number;
  /** How high a jump rises at the recommended level. */
  readonly jumpHeight: number;

  /** What is below, when this stretch lays its kill volume. */
  below: PitRegion['surface'] = 'void';
  /**
   * How far below the lowest ground the kill volume's surface sits.
   *
   * `COURSE.fallDepth` by default - a real drop. A swamp or a creek sets it
   * shallow, so the lethal surface is right beside the trail where it can be
   * SEEN, and stepping off the path is a visible mistake rather than a fall.
   */
  fall: number = COURSE.fallDepth;
  /** How fast that water moves, for the renderer. */
  flow = 0;

  /** Lateral and vertical targets the next stretch eases toward. */
  private aimX: number;
  private aimY: number;

  /** Where the current kill volume began, and the lowest ground since. */
  private pitFromZ: number;
  private pitLowY: number;
  private pitStartY: number;

  /** Bumped for every emitted thing, so the scatter is deterministic. */
  private seed: number;

  constructor(stage: number, start: RouteStart) {
    this.stage = stage;
    this.x = start.x;
    this.y = start.y;
    this.z = start.z;
    this.startZ = start.z;
    this.width = start.width;
    this.aimX = start.x;
    this.aimY = start.y;
    this.pitFromZ = start.z;
    this.pitLowY = start.y;
    this.pitStartY = start.y;
    this.seed = stage * 7919 + 13;

    const level = STAGE_TUNING[stage - 1]?.recommendedLevel ?? 1;
    const profile = resolveMovementProfile(level);
    this.speed = profile.runSpeed;
    this.reach = (profile.runSpeed * 2 * profile.jumpVelocity) / MOVEMENT.gravity;
    this.jumpHeight = (profile.jumpVelocity * profile.jumpVelocity) / (2 * MOVEMENT.gravity);
  }

  /** A fresh deterministic number. Never `Math.random`. */
  next(): number {
    this.seed += 1;
    return rand(this.seed);
  }

  /** A fresh deterministic value in `-spread..spread`. */
  wobble(spread: number): number {
    this.seed += 1;
    return jitter(this.seed, spread);
  }

  /** World X at a lateral offset from the path's centre. */
  side(offset: number): number {
    return this.x + offset;
  }

  /** Aim the route at a lateral position. The next stretch curves toward it. */
  aimAt(x: number): this {
    this.aimX = x;
    return this;
  }

  /** Aim the route at an elevation. The next stretch climbs or descends to it. */
  riseTo(y: number): this {
    this.aimY = y;
    return this;
  }

  /** Change material without emitting anything. */
  made(kind: SolidKind): this {
    this.kind = kind;
    return this;
  }

  /** Change what is under the route without emitting anything. */
  over(what: PitRegion['surface'], flow = 0): this {
    this.below = what;
    this.flow = flow;
    return this;
  }

  // -------------------------------------------------------------------------
  // What the cursor lays down.
  // -------------------------------------------------------------------------

  /**
   * Solid ground: a trail, a ledge, a temple floor.
   *
   * Emitted as a run of short slabs rather than one long box, because that is
   * what lets it curve and climb while every piece of it stays axis-aligned -
   * exact for the collision model, and blocky in exactly the way the art
   * direction wants.
   */
  path(length: number, options: StretchOptions = {}): this {
    this.applyTargets(options);
    const width = options.width ?? this.width;
    const kind = options.kind ?? this.kind;
    const verge = options.verge ?? this.verge;
    const steps = Math.max(1, Math.round(length / STEP));
    const span = length / steps;
    this.straight = options.linear === true;

    for (let i = 0; i < steps; i += 1) {
      // A straight ramp samples each slab at its MIDDLE, so the slab sits
      // centred on the line a boulder rolls down; a curve samples its far end,
      // which is what makes a bend step round rather than cut its corner.
      const t = this.straight ? (i + 0.5) / steps : (i + 1) / steps;
      const x = this.lerpX(t);
      const y = this.lerpY(t);
      const z = this.z + span * (i + 0.5);
      // Overlapped by a hair along Z, so a curving run has no seam a mount can
      // catch its feet in at three hundred units a second.
      box(this.stage, kind, x, y, z, width, span + 0.35);
      if (options.rails) this.railsAt(x, y, z, width, span, kind);
      if (options.shoulders) this.shouldersAt(x, y, z, width, span, options.shoulders);
      if (verge > 0) this.vergeAt(x, y, z, width, span, verge);
      this.noteGround(y);
      this.mark(x, y, z, width / 2 + verge);
    }

    this.straight = false;
    this.commit(length);
    return this;
  }

  /**
   * Record ground the cursor did not lay itself - a lift at the bottom of its
   * travel, a ferry, a stone on a carousel - so the kill volume under this
   * stretch goes below it rather than through it.
   */
  standing(y: number): this {
    this.noteGround(y);
    return this;
  }

  /**
   * Where the route is at a world Z: its centre, its height and its half
   * width there, from the nearest slab actually laid. Null before anything
   * has been laid at all.
   */
  lineAt(z: number): { x: number; y: number; half: number } | null {
    const trace = this.trace;
    if (trace.length === 0) return null;
    let lo = 0;
    let hi = trace.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((trace[mid] as { z: number }).z < z) lo = mid + 1;
      else hi = mid;
    }
    const after = trace[lo] as { z: number; x: number; y: number; half: number };
    const before = trace[Math.max(0, lo - 1)] as typeof after;
    return Math.abs(before.z - z) < Math.abs(after.z - z) ? before : after;
  }

  /**
   * Record a piece of route just laid, for `lineAt`. Public for builders
   * that lay ground by hand - a fork's two lanes - so the scenery still
   * knows where not to plant.
   */
  markLine(x: number, y: number, z: number, half: number): void {
    this.mark(x, y, z, half);
  }

  private mark(x: number, y: number, z: number, half: number): void {
    const last = this.trace[this.trace.length - 1];
    // Kept in Z order: anything laid behind the last sample (a spur, a
    // platform) is not the line.
    if (last && z < last.z) return;
    this.trace.push({ z, x, y, half });
  }

  /** The width a stretch actually offers underfoot: the path and both verges. */
  fullWidth(options: { width?: number; verge?: number } = {}): number {
    return (options.width ?? this.width) + 2 * (options.verge ?? this.verge);
  }

  /**
   * A plank walkway on posts.
   *
   * The same shape as a path, drawn as decking and stilted down to whatever is
   * below it - which is what makes an expedition walkway read as built rather
   * than as a floating slab.
   */
  walkway(length: number, options: StretchOptions = {}): this {
    const width = options.width ?? this.width;
    const startZ = this.z;
    const span = this.span(options);
    this.path(length, { ...options, kind: options.kind ?? 'plank' });

    const posts = Math.max(2, Math.round(length / 16));
    for (let i = 0; i <= posts; i += 1) {
      const t = i / posts;
      const z = startZ + length * t;
      const x = span.x(t);
      const y = span.y(t);
      for (const edge of [-1, 1]) {
        decorate(this.stage, 'crates', x + (edge * width) / 2, y, z, 0.35, 0, 3);
      }
    }
    return this;
  }

  /**
   * A rope bridge: narrow slats with gaps, strung between two posts.
   *
   * Every slat is a real solid and the gaps between them are real. At walking
   * pace it is a sequence of small hops; at expedition speed it is a straight
   * run, which is exactly the way speed is supposed to change this game.
   */
  ropeBridge(length: number, options: StretchOptions = {}): this {
    this.applyTargets(options);
    const width = options.width ?? Math.min(this.width, 7);
    const slats = Math.max(4, Math.round(length / 4.4));
    const span = length / slats;
    const startX = this.x;
    const startY = this.y;

    for (let i = 0; i < slats; i += 1) {
      const t = (i + 1) / slats;
      const x = this.lerpX(t);
      // A rope bridge SAGS. The dip is what tells the player at a glance that
      // this is rope rather than a plank walkway, and it costs one sine.
      const sag = Math.sin(t * Math.PI) * Math.min(4.5, length * 0.035);
      const y = this.lerpY(t) - sag;
      const z = this.z + span * (i + 0.5);
      box(this.stage, 'rope', x, y, z, width, span * 0.72, 0.9);
      this.noteGround(y - 1);
      this.mark(x, y, z, width / 2);
    }

    // The towers at each end, and the ropes between them.
    for (const [x, y, z] of [
      [startX, startY, this.z + 1],
      [this.lerpX(1), this.lerpY(1), this.z + length - 1],
    ] as const) {
      for (const edge of [-1, 1]) {
        decorate(this.stage, 'marker', x + (edge * (width + 2.4)) / 2, y, z, 0.9, 0, 1);
      }
    }
    for (let i = 0; i <= slats; i += 1) {
      const t = i / slats;
      const sag = Math.sin(t * Math.PI) * Math.min(4.5, length * 0.035);
      decorate(
        this.stage,
        'vine',
        this.lerpX(t) + (width / 2 + 1.1) * (i % 2 === 0 ? 1 : -1),
        this.lerpY(t) - sag + 3.2,
        this.z + length * t,
        0.8,
        0,
        2,
      );
    }

    this.commit(length);
    return this;
  }

  /**
   * Felled trunks laid end to end, with a gap between each.
   *
   * The first act's crossing. A log is narrow and round-shouldered, so it asks
   * for a straight line rather than a jump - a different skill from a gap, and
   * the reason the two are separate calls.
   */
  logs(
    count: number,
    options: StretchOptions & { gap?: number; run?: number; scatter?: number } = {},
  ): this {
    const run = options.run ?? 17;
    const gap = options.gap ?? 5;
    const width = options.width ?? Math.min(this.width, 6);
    const total = count * run + (count - 1) * gap;
    this.applyTargets(options);

    for (let i = 0; i < count; i += 1) {
      const at = i * (run + gap);
      const t = (at + run / 2) / total;
      // Lateral scatter, so a run of trunks is not a straight line of beams.
      // Small by default: on a seven-unit log a two-unit wobble is most of the
      // margin the player has, which turns a line into a lottery.
      const x = this.lerpX(t) + this.wobble(options.scatter ?? 0.8);
      const y = this.lerpY(t);
      box(this.stage, 'log', x, y, this.z + at + run / 2, width, run, 2.4);
      this.mark(x, y, this.z + at + run / 2, width / 2);
      // The stub of a branch, so a log reads as a tree rather than a beam.
      decorate(this.stage, 'fallenLog', x + width * 0.9, y - 1.6, this.z + at + run * 0.3, 0.7, 0.4, 1);
      this.noteGround(y);
      if (i < count - 1) this.noteGround(y);
    }

    this.commit(total);
    return this;
  }

  /**
   * Stepping stones, scattered across whatever is below.
   *
   * Laid with a deliberate lateral weave, so crossing a river is a line the
   * player has to read rather than a row of pads straight ahead.
   */
  stones(
    count: number,
    options: StretchOptions & { gap?: number; size?: number; weave?: number } = {},
  ): this {
    const size = options.size ?? 8;
    const gap = options.gap ?? 7;
    const weave = options.weave ?? 7;
    const total = count * size + (count - 1) * gap;
    this.applyTargets(options);

    for (let i = 0; i < count; i += 1) {
      const at = i * (size + gap);
      const t = (at + size / 2) / total;
      const x = this.lerpX(t) + Math.sin(i * 1.7) * weave;
      const y = this.lerpY(t) + (i % 2 === 0 ? 0 : -0.5);
      box(this.stage, options.kind ?? 'rock', x, y, this.z + at + size / 2, size, size, 2.6);
      this.noteGround(y);
      this.mark(x, y, this.z + at + size / 2, size / 2);
    }

    this.commit(total);
    return this;
  }

  /**
   * A flight of steps.
   *
   * The ONLY way this course gains serious height, because a mount steps over
   * a kerb and not over a storey: anything taller than `MOVEMENT.stepHeight`
   * is a wall unless it is a stair or a jump.
   */
  stairs(count: number, rise: number, options: StretchOptions & { run?: number } = {}): this {
    const run = options.run ?? 6.5;
    const width = options.width ?? this.width;
    const kind = options.kind ?? this.kind;
    const total = count * run;
    this.aimX = options.aim ?? this.aimX;

    for (let i = 0; i < count; i += 1) {
      const t = (i + 0.5) / count;
      const x = this.lerpX(t);
      const y = this.y + rise * (i + 1);
      // Thick enough that a stair is a solid block rather than a floating
      // tread with a gap under it the player can see the sky through.
      box(this.stage, kind, x, y, this.z + run * (i + 0.5), width, run + 0.3, rise + 2.2);
      this.noteGround(y);
      this.mark(x, y, this.z + run * (i + 0.5), width / 2);
    }

    this.x = this.lerpX(1);
    this.y += rise * count;
    this.aimY = this.y;
    this.z += total;
    this.maybeLayPit();
    return this;
  }

  /**
   * A chain of separate landings with a jump between each.
   *
   * The precision-jump primitive. Each landing is `land` long and each gap
   * `gap` wide, so a builder writes them as fractions of `reach` and the chain
   * asks the same of the player at every stage.
   *
   * Sized right, it is what holding W cannot do. When `gap + land` is LESS
   * than a full jump, a jump from the very edge overshoots the landing - the
   * player has to take off early, or ease off, and land where they meant to.
   * When `gap + 2 x land` is MORE than a jump there is always a takeoff that
   * works: the window is the landing's own length, so it is a skill with a
   * visible answer rather than a lottery.
   *
   * `jog` offsets each landing sideways, so the player has to aim a jump as
   * well as time it. A NUMBER is the whole side-to-side step between two
   * neighbouring landings - they sit half of it either side of the line - so
   * it is exactly the lateral distance a jump has to cover. A LIST gives each
   * landing's offset from the line, in order. `step` raises (or lowers) every
   * landing on the last: a climb.
   *
   * Keep `aim` and `jog` modest together: the chain drifts toward `aim` AND
   * alternates, and the two add. A sideways leap bigger than about a third of
   * a jump is not precision, it is a guess.
   */
  hops(
    count: number,
    options: {
      gap: number;
      land: number;
      width?: number;
      jog?: number | readonly number[];
      step?: number;
      depth?: number;
      kind?: SolidKind;
      aim?: number;
    },
  ): this {
    const width = options.width ?? this.width;
    const kind = options.kind ?? this.kind;
    const depth = options.depth ?? 2.6;
    const fromX = this.x;
    const toX = options.aim ?? this.x;
    let z = this.z;
    let x = this.x;
    let y = this.y;

    for (let i = 0; i < count; i += 1) {
      const t = count > 1 ? i / (count - 1) : 1;
      const base = fromX + (toX - fromX) * t;
      const jog = options.jog;
      const offset =
        jog === undefined
          ? 0
          : typeof jog === 'number'
            ? (i % 2 === 0 ? jog / 2 : -jog / 2)
            : (jog[i % jog.length] as number);
      x = base + offset;
      y += options.step ?? 0;
      z += options.gap;
      box(this.stage, kind, x, y, z + options.land / 2, width, options.land, depth);
      this.noteGround(y);
      this.mark(x, y, z + options.land / 2, width / 2);
      z += options.land;
    }

    this.x = x;
    this.y = y;
    this.aimX = x;
    this.aimY = y;
    this.z = z;
    this.maybeLayPit();
    return this;
  }

  /**
   * A narrow path that weaves side to side.
   *
   * `bends` stretches, each curving to the other side of the line by `amp`.
   * On a path this narrow the weave is the obstacle: holding W runs straight
   * off the outside of the first bend.
   */
  weave(
    length: number,
    options: StretchOptions & { amp: number; bends: number; centre?: number },
  ): this {
    const centre = options.centre ?? this.x;
    const each = length / options.bends;
    for (let i = 0; i < options.bends; i += 1) {
      const side = i % 2 === 0 ? 1 : -1;
      this.path(each, { ...options, aim: centre + side * options.amp });
    }
    return this;
  }

  /**
   * A gap: nothing at all, and the cursor moves on.
   *
   * This is where a stage's difficulty actually lives. At the game's base
   * speed a 9-unit gap is a jump; at a late-game multiplier the same gap is a
   * stride, which is why the ladder can keep widening them without ever
   * needing a new mechanic.
   */
  gap(length: number, options: { aim?: number; rise?: number } = {}): this {
    if (options.aim !== undefined) this.aimX = options.aim;
    if (options.rise !== undefined) this.aimY = options.rise;
    this.commit(length);
    return this;
  }

  /**
   * A wide open area: a courtyard, a grove, an arena.
   *
   * Declared WIDE, so the valley clamp and the renderer's walls both open out
   * with it rather than the floor being drawn wider than the player may go.
   */
  plaza(
    length: number,
    options: StretchOptions & { halfWidth?: number; hole?: number } = {},
  ): this {
    const half = options.halfWidth ?? 46;
    const kind = options.kind ?? this.kind;
    this.applyTargets(options);
    const centreX = this.aimX;

    widen(this.z - 6, this.z + length + 6, half + 16);

    const steps = Math.max(1, Math.round(length / STEP));
    const span = length / steps;
    for (let i = 0; i < steps; i += 1) {
      const y = this.lerpY((i + 1) / steps);
      const z = this.z + span * (i + 0.5);
      if (options.hole && Math.abs(z - (this.z + length / 2)) < options.hole / 2) {
        // A courtyard with its middle fallen in: two shoulders and a drop.
        const shoulder = half - options.hole / 2;
        box(this.stage, kind, centreX - half + shoulder / 2, y, z, shoulder, span + 0.35);
        box(this.stage, kind, centreX + half - shoulder / 2, y, z, shoulder, span + 0.35);
      } else {
        box(this.stage, kind, centreX, y, z, half * 2, span + 0.35);
      }
      this.noteGround(y);
      this.mark(centreX, y, z, half);
    }

    this.x = centreX;
    this.commit(length);
    return this;
  }

  /**
   * A tunnel: a path with a roof and walls, and the lighting change that makes
   * it read as underground.
   *
   * The roof is ordinary solids, which is what makes it collide correctly with
   * no new physics - `ceilingYAt` already stops a mount head-butting its way
   * out of the world. What makes it a CAVE is the declared region the renderer
   * darkens.
   */
  tunnel(length: number, options: StretchOptions & { headroom?: number } = {}): this {
    const headroom = options.headroom ?? 13;
    const width = options.width ?? this.width;
    const startZ = this.z;
    // Captured BEFORE the floor is laid. Laying it moves the cursor to the
    // tunnel's far end, and walls placed from there instead stand across the
    // floor of every earlier slab of a tunnel that weaves.
    const along = this.span(options);

    this.path(length, { ...options, kind: options.kind ?? 'cave' });

    const steps = Math.max(1, Math.round(length / STEP));
    const span = length / steps;
    for (let i = 0; i < steps; i += 1) {
      // The same sample the floor slab used, so walls and floor line up.
      const t = (i + 1) / steps;
      const z = startZ + span * (i + 0.5);
      const x = along.x(t);
      const y = along.y(t);
      // The roof, and the two walls that make it a passage rather than a lid.
      // The walls stand a little BACK from the floor's edge, so the floor is a
      // ledge in a wider cave. Walls built flush with a floor that weaves step
      // sideways slab by slab, and each step's end face stands in the lane.
      const inner = width / 2 + 3;
      block(this.stage, 'cave', x - inner - 8, y + headroom, z - span / 2, inner * 2 + 16, 7, span + 0.4);
      block(this.stage, 'cave', x - inner - 8, y - 4, z - span / 2, 8, headroom + 4, span + 0.4);
      block(this.stage, 'cave', x + inner, y - 4, z - span / 2, 8, headroom + 4, span + 0.4);
      if (i % 3 === 0) {
        decorate(this.stage, 'mushroom', x + this.wobble(width * 0.4), y, z, 0.8 + this.next() * 0.6, 0, 0);
      }
    }

    cave(this.stage, startZ - 4, this.z + 4);
    return this;
  }

  // -------------------------------------------------------------------------
  // Platforms that move. These do NOT advance the cursor's ground - the
  // builder places them across a gap the cursor has already stepped over.
  // -------------------------------------------------------------------------

  /** A platform sliding back and forth across the route. */
  shuttle(
    atZ: number,
    options: { x?: number; y?: number; width?: number; length?: number; travel?: number; rate?: number; phase?: number; kind?: SolidKind; axis?: 'x' | 'z' },
  ): MovingSolid {
    return mover(
      this.stage,
      options.kind ?? this.kind,
      options.x ?? this.x,
      options.y ?? this.y,
      atZ,
      options.width ?? 11,
      options.length ?? 11,
      'shuttle',
      {
        axis: options.axis ?? 'x',
        amount: options.travel ?? 14,
        rate: options.rate ?? 0.22,
        phase: options.phase ?? 0,
      },
    );
  }

  /** A platform travelling a circle: the temple carousels. */
  carousel(
    atZ: number,
    options: { x?: number; y?: number; size?: number; radius?: number; rate?: number; phase?: number; kind?: SolidKind },
  ): MovingSolid {
    return mover(
      this.stage,
      options.kind ?? 'stone',
      options.x ?? this.x,
      options.y ?? this.y,
      atZ,
      options.size ?? 12,
      options.size ?? 12,
      'orbit',
      { amount: options.radius ?? 15, rate: options.rate ?? 0.5, phase: options.phase ?? 0 },
    );
  }

  /**
   * A platform that rises and falls on the spot.
   *
   * `size` is its length along the route and, unless `width` says otherwise,
   * its width too. A late-game lift has to be long - a third of a jump, or the
   * mount is on it for a tenth of a second - but a lift that wide lets the
   * rider land anywhere across it and then face a sideways leap to a narrow
   * ledge, so the two are set separately.
   */
  lift(
    atZ: number,
    options: { x?: number; y?: number; size?: number; width?: number; travel?: number; rate?: number; phase?: number; kind?: SolidKind },
  ): MovingSolid {
    return mover(
      this.stage,
      options.kind ?? 'stone',
      options.x ?? this.x,
      options.y ?? this.y,
      atZ,
      options.width ?? options.size ?? 13,
      options.size ?? 13,
      'lift',
      { amount: options.travel ?? 8, rate: options.rate ?? 0.2, phase: options.phase ?? 0 },
    );
  }

  /**
   * A span that holds, gives way, and rebuilds itself.
   *
   * The collapsing bridge. Laid as a run of sections with STEPPED phases, so
   * the failure travels along the bridge the way a real one would rather than
   * the whole thing vanishing at once.
   */
  collapsing(
    length: number,
    options: StretchOptions & { sections?: number; rate?: number; hold?: number; spread?: number } = {},
  ): this {
    const sections = options.sections ?? Math.max(3, Math.round(length / 13));
    const span = length / sections;
    const width = options.width ?? this.width;
    const kind = options.kind ?? this.kind;
    this.applyTargets(options);

    for (let i = 0; i < sections; i += 1) {
      const t = (i + 0.5) / sections;
      mover(
        this.stage,
        kind,
        this.lerpX(t),
        this.lerpY(t),
        this.z + span * (i + 0.5),
        width,
        span + 0.3,
        'collapse',
        {
          amount: 26,
          rate: options.rate ?? 0.16,
          // Stepped, so the give-way runs along the span. `spread` below one
          // bunches the whole give-way into that fraction of the cycle,
          // leaving the rest of it with the span whole: a window to cross in
          // rather than a bridge that always has a hole somewhere.
          phase: ((options.spread ?? 1) * i) / sections,
          hold: options.hold ?? 0.78,
        },
      );
      this.noteGround(this.lerpY(t));
      this.mark(this.lerpX(t), this.lerpY(t), this.z + span * (i + 0.5), width / 2);
    }

    this.commit(length);
    return this;
  }

  // -------------------------------------------------------------------------
  // Obstacles ON the ground.
  //
  // The course is wide: difficulty comes from what is in the way, not from
  // how little floor there is. Every one of these lays its OWN ground and puts
  // its hazards on the line it actually laid, so an obstacle on a stretch that
  // curves or climbs is still on that stretch - never where the cursor ended.
  // -------------------------------------------------------------------------

  /**
   * Buttress roots grown ACROSS the trail: a low wall to jump.
   *
   * Not lethal - running into one stops the mount dead, and on a stage where
   * something is coming that is exactly as bad. Taller than a step and well
   * under a jump, at every level.
   */
  rootsAcross(
    length: number,
    options: StretchOptions & { count: number; height?: number; depth?: number },
  ): this {
    const height = options.height ?? 2.6;
    const depth = options.depth ?? 3;
    const full = this.fullWidth(options);
    const startZ = this.z;
    const line = this.span(options);
    this.path(length, options);
    for (let i = 0; i < options.count; i += 1) {
      const t = (i + 1) / (options.count + 1);
      const x = line.x(t);
      const y = line.y(t);
      const z = startZ + length * t;
      box(this.stage, 'log', x, y + height, z, full + 1, depth, height + 2);
      for (const side of [-1, 1]) {
        decorate(this.stage, 'root', x + side * (full / 2 + 1), y, z, 1.6, side > 0 ? 0.3 : -0.3, i % 2);
      }
    }
    return this;
  }

  /**
   * Quicksand: a flat stretch that swallows a mount that stops on it.
   *
   * Laid across the WHOLE width, verges included, over a mud pool whose kill
   * line sits exactly `QUICKSAND.drownDepth` under the surface - so the
   * simulation sinks the mount and the ordinary fall test drowns it. `islands`
   * are firm hummocks a hair proud of the mud: somewhere to stand while
   * waiting for whatever comes next, and the reason a quicksand field can sit
   * in front of a gate without being a lottery.
   */
  quicksand(
    length: number,
    options: StretchOptions & { islands?: number; islandSize?: number } = {},
  ): this {
    const full = this.fullWidth(options);
    const startZ = this.z;
    const top = this.y;
    const line = this.span({ ...options, rise: top });
    const steps = Math.max(1, Math.round(length / STEP));
    const span = length / steps;
    this.applyTargets({ ...options, rise: top });
    let minX = Infinity;
    let maxX = -Infinity;

    for (let i = 0; i < steps; i += 1) {
      const t = (i + 1) / steps;
      const x = line.x(t);
      const z = startZ + span * (i + 0.5);
      box(this.stage, 'quicksand', x, top, z, full, span + 0.35);
      this.mark(x, top, z, full / 2);
      minX = Math.min(minX, x - full / 2);
      maxX = Math.max(maxX, x + full / 2);
      this.noteGround(top);
    }
    pit(this.stage, 'mud', minX, maxX, startZ, startZ + length, top - QUICKSAND.drownDepth + 1.4);

    const islands = options.islands ?? 0;
    const size = options.islandSize ?? Math.min(12, full * 0.4);
    for (let i = 0; i < islands; i += 1) {
      const t = (i + 0.5) / islands;
      const side = i % 2 === 0 ? -1 : 1;
      const x = line.x(t) + side * (full / 2 - size / 2 - 1);
      box(this.stage, 'dirt', x, top + 0.25, startZ + length * t, size, size, 2.2);
      decorate(this.stage, 'fern', x, top + 0.25, startZ + length * t, 0.8, 0, i % 3);
    }

    this.commit(length);
    return this;
  }

  /**
   * A ford: a stony river bed just under running water.
   *
   * The player wades it; the water is drawn over the mount's legs. Step off
   * the bed and it is deep, and deep water kills. `current` pushes sideways
   * the way the river runs, and `logs` float across the ford on it - long,
   * lavender, and timed.
   */
  ford(
    length: number,
    options: StretchOptions & {
      depth?: number;
      current?: number;
      logs?: { count: number; rate: number; radius?: number; length?: number };
    } = {},
  ): this {
    const depth = options.depth ?? 0.7;
    const full = this.fullWidth({ ...options, verge: 0 });
    const startZ = this.z;
    const line = this.span(options);
    this.path(length, { ...options, kind: options.kind ?? 'rock', verge: 0 });
    const y = Math.min(line.y(0), line.y(1));
    pit(this.stage, 'rapids', -COURSE.halfWidth - 40, COURSE.halfWidth + 40, startZ, startZ + length, y + depth, Math.abs(options.current ?? 0) + 0.4);
    if (options.current) surface(this.stage, -COURSE.halfWidth - 40, COURSE.halfWidth + 40, startZ, startZ + length, 1, options.current, 0);

    const logs = options.logs;
    if (logs) {
      const radius = logs.radius ?? 1.3;
      const half = (logs.length ?? 9) / 2;
      const dir = (options.current ?? 1) >= 0 ? 1 : -1;
      for (let i = 0; i < logs.count; i += 1) {
        const t = (i + 0.5) / logs.count;
        const x = line.x(t);
        const reach = full / 2 + half + radius + 3;
        hazard(this.stage, 'boulder', {
          x: x - dir * reach,
          y: line.y(t) + radius * 0.8,
          z: startZ + length * t,
          radius,
          rate: logs.rate,
          phase: (i * 0.37) % 1,
          fromZ: startZ + length * t,
          toZ: startZ + length * t,
          driftX: dir * reach * 2,
          spanX: half,
        });
      }
    }
    return this;
  }

  /**
   * Logs rolling DOWN a slope at the rider: a straight ramp climbing ahead,
   * with trunks across its whole width coming the other way. Jump each one.
   */
  rollingLogs(
    length: number,
    options: StretchOptions & { count: number; rate: number; climb?: number; radius?: number },
  ): this {
    const radius = options.radius ?? 1.5;
    const climb = options.climb ?? length * 0.06;
    const full = this.fullWidth(options);
    const startZ = this.z;
    const fromY = this.y;
    const toY = this.y + climb;
    const line = this.span({ ...options, rise: toY });
    this.path(length, { ...options, rise: toY, linear: true });
    for (let i = 0; i < options.count; i += 1) {
      hazard(this.stage, 'boulder', {
        x: line.x(0.5),
        y: toY + radius,
        z: startZ + length,
        radius,
        rate: options.rate,
        phase: i / options.count,
        fromZ: startZ + length + radius,
        toZ: startZ - radius * 2,
        fromY: toY + radius,
        toY: fromY + radius,
        driftX: line.x(0) - line.x(1),
        spanX: full / 2 + 1 - radius,
      });
    }
    return this;
  }

  /**
   * Boulders rolling down a ramp.
   *
   * `toward` rolls them UP the rider's way - the ramp climbs ahead and they
   * come down it at the player, to be dodged across a wide slope. Otherwise
   * the ramp DESCENDS and they roll the same way the rider is going: the
   * chase, which is outrun or sidestepped into the alcoves on either side.
   */
  boulderRun(
    length: number,
    options: StretchOptions & {
      count: number;
      rate: number;
      drop: number;
      radius?: number;
      toward?: boolean;
      alcoves?: number;
    },
  ): this {
    const radius = options.radius ?? 4.5;
    const full = this.fullWidth(options);
    const startZ = this.z;
    const y0 = this.y;
    const y1 = options.toward ? this.y + options.drop : this.y - options.drop;
    const line = this.span({ ...options, rise: y1 });
    this.path(length, { ...options, rise: y1, linear: true });

    const lanes = Math.max(2, Math.floor(full / (radius * 2 + 3)));
    for (let i = 0; i < options.count; i += 1) {
      const lane = (i * 5) % lanes;
      const offset = -full / 2 + radius + 1 + (lane * (full - radius * 2 - 2)) / Math.max(1, lanes - 1);
      const from = options.toward ? 1 : 0;
      const to = options.toward ? 0 : 1;
      const fromZ = startZ + length * from + (options.toward ? radius : -radius * 3);
      const toZ = startZ + length * to + (options.toward ? -radius * 3 : radius);
      hazard(this.stage, 'boulder', {
        x: line.x(from) + offset,
        y: (from ? y1 : y0) + radius,
        z: fromZ,
        radius,
        rate: options.rate,
        phase: i / options.count,
        fromZ,
        toZ,
        fromY: (from ? y1 : y0) + radius,
        toY: (to ? y1 : y0) + radius,
        driftX: line.x(to) - line.x(from),
      });
    }

    // Alcoves cut into the sides: a pocket to step into and let one pass.
    const alcoves = options.alcoves ?? 0;
    for (let i = 0; i < alcoves; i += 1) {
      const t = (i + 0.5) / alcoves;
      const side = i % 2 === 0 ? 1 : -1;
      const x = line.x(t) + side * (full / 2 + 4);
      box(this.stage, this.kind, x, line.y(t), startZ + length * t, 8, 14);
      decorate(this.stage, 'torch', x + side * 3, line.y(t), startZ + length * t, 1, 0, 0);
    }
    return this;
  }

  /**
   * Boulders rolling ACROSS the route, out of the jungle on one side and into
   * it on the other. Waited for, or run past.
   */
  crossingBoulders(
    length: number,
    options: StretchOptions & { count: number; rate: number; radius?: number },
  ): this {
    const radius = options.radius ?? 3.2;
    const full = this.fullWidth(options);
    const startZ = this.z;
    const line = this.span(options);
    this.path(length, options);
    for (let i = 0; i < options.count; i += 1) {
      const t = (i + 0.5) / options.count;
      const dir = i % 2 === 0 ? 1 : -1;
      const reach = full / 2 + radius + 4;
      const z = startZ + length * t;
      const y = line.y(t) + radius;
      hazard(this.stage, 'boulder', {
        x: line.x(t) - dir * reach,
        y,
        z,
        radius,
        rate: options.rate,
        phase: (i * 0.41) % 1,
        fromZ: z,
        toZ: z,
        fromY: y,
        toY: y,
        driftX: dir * reach * 2,
      });
    }
    return this;
  }

  /**
   * Rotating logs: arms sweeping round a hub in the middle of the trail,
   * a jump high. Timed, or jumped.
   */
  sweepers(
    length: number,
    options: StretchOptions & { count: number; rate: number; arms?: number; height?: number },
  ): this {
    const full = this.fullWidth(options);
    const arms = options.arms ?? 1;
    const height = options.height ?? 1.3;
    const startZ = this.z;
    const line = this.span(options);
    this.path(length, options);
    const reach = full / 2;
    for (let i = 0; i < options.count; i += 1) {
      const t = (i + 0.5) / options.count;
      const x = line.x(t);
      const y = line.y(t);
      const z = startZ + length * t;
      // The hub: a stump the arm turns on. Solid, and in the way.
      box(this.stage, 'log', x, y + 3, z, 2.4, 2.4, 3.2);
      for (let a = 0; a < arms; a += 1) {
        for (let d = 2.6; d <= reach; d += 2.4) {
          hazard(this.stage, 'spinner', {
            x,
            y: y + height,
            z,
            radius: 1.2,
            sweep: d,
            rate: options.rate * (i % 2 === 0 ? 1 : -1),
            phase: (a / arms + i * 0.29) % 1,
          });
        }
      }
    }
    return this;
  }

  /** Logs hung from the canopy, swinging across the trail. */
  swinging(
    length: number,
    options: StretchOptions & { count: number; rate: number; low?: number; log?: number },
  ): this {
    const full = this.fullWidth(options);
    const startZ = this.z;
    const line = this.span(options);
    this.path(length, options);
    const log = options.log ?? 4;
    for (let i = 0; i < options.count; i += 1) {
      const t = (i + 0.5) / options.count;
      const x = line.x(t);
      const y = line.y(t);
      const z = startZ + length * t;
      hazard(this.stage, 'swing', {
        x,
        y: y + (options.low ?? 1.6),
        z,
        radius: 1.3,
        sweep: full / 2 - log / 2,
        rate: options.rate,
        phase: (i * 0.31) % 1,
        spanX: log / 2,
      });
      for (const side of [-1, 1]) decorate(this.stage, 'vine', x + side * (full / 2 - 1), y + 16, z, 1.2, 0, i % 3);
    }
    return this;
  }

  /** Thorn vines swinging across the trail from the canopy: dodged, never jumped. */
  vines(
    length: number,
    options: StretchOptions & { count: number; rate: number; sweep?: number },
  ): this {
    const full = this.fullWidth(options);
    const startZ = this.z;
    const line = this.span(options);
    this.path(length, options);
    const sweep = options.sweep ?? full * 0.3;
    for (let i = 0; i < options.count; i += 1) {
      const t = (i + 0.5) / options.count;
      const lane = ((i * 3) % 5) / 4 - 0.5;
      const x = line.x(t) + lane * (full - sweep * 2 - 2);
      const y = line.y(t);
      hazard(this.stage, 'vine', {
        x,
        y: y + 18,
        z: startZ + length * t,
        radius: 0.9,
        sweep,
        rate: options.rate,
        phase: (i * 0.23) % 1,
        fromY: y - 0.5,
      });
      // Hung FROM something: a canopy crown over the anchor. A lavender
      // column swinging from open sky is a thing floating, not a vine.
      decorate(this.stage, 'tree', x, y + 18, startZ + length * t, 2.2, i * 1.3, 1);
    }
    return this;
  }

  /**
   * Falling temple stones: a grid of crushers over the floor, each with the
   * shadow that tells the player it is coming.
   */
  crushers(
    length: number,
    options: StretchOptions & { rows: number; lanes?: number; period: number; size?: number },
  ): this {
    const full = this.fullWidth(options);
    const lanes = options.lanes ?? 2;
    const size = options.size ?? Math.min(5, full / (lanes * 2));
    const startZ = this.z;
    const line = this.span(options);
    this.path(length, options);
    for (let row = 0; row < options.rows; row += 1) {
      const t = (row + 0.5) / options.rows;
      for (let lane = 0; lane < lanes; lane += 1) {
        const offset = -full / 2 + (full * (lane + 0.5)) / lanes;
        hazard(this.stage, 'faller', {
          x: line.x(t) + offset,
          y: line.y(t),
          z: startZ + length * t,
          radius: size,
          sweep: 16,
          rate: options.period,
          phase: ((row * 0.37 + lane * 0.5) % 1),
        });
      }
    }
    return this;
  }

  /** Dart traps: bolts fired across the trail from one wall to the other. */
  darts(
    length: number,
    options: StretchOptions & { count: number; period: number; height?: number },
  ): this {
    const full = this.fullWidth(options);
    const startZ = this.z;
    const line = this.span(options);
    this.path(length, options);
    for (let i = 0; i < options.count; i += 1) {
      const t = (i + 0.5) / options.count;
      const side = i % 2 === 0 ? 1 : -1;
      const x = line.x(t);
      const y = line.y(t);
      const z = startZ + length * t;
      hazard(this.stage, 'dart', {
        x: x + side * (full / 2 + 2),
        y: y + (options.height ?? 2.4),
        z,
        radius: 0.9,
        sweep: -side * (full + 4),
        rate: options.period,
        phase: (i * 0.29) % 1,
      });
      decorate(this.stage, 'stele', x + side * (full / 2 + 3.5), y, z, 0.9, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
    }
    return this;
  }

  /**
   * A timed gate across the whole route, too tall to jump, in a frame of
   * posts. Laid on a short run of ground; the builder decides what is in
   * front of it - usually something that punishes standing still.
   */
  gate(options: StretchOptions & { rate: number; hold?: number; phase?: number; height?: number; lift?: number } ): this {
    const full = this.fullWidth(options);
    const height = options.height ?? 13;
    const lift = options.lift ?? 8.5;
    const length = 12;
    const x = this.x;
    const y = this.y;
    const z = this.z + length / 2;
    this.path(length, options);
    mover(this.stage, 'gate', x, y + height, z, full + 2, 3, 'gate', {
      amount: lift,
      rate: options.rate,
      phase: options.phase ?? 0,
      hold: options.hold ?? 0.5,
      thickness: height,
    });
    // The frame: two posts and a lintel above the lifted gate.
    const post = options.kind === 'gilded' || options.kind === 'stone' || options.kind === 'ruin' ? 'stone' : 'log';
    for (const side of [-1, 1]) {
      block(this.stage, post, x + side * (full / 2 + 1) - 1.8, y, z - 2.4, 3.6, height + lift + 3, 4.8);
    }
    block(this.stage, post, x - full / 2 - 3, y + height + lift + 3, z - 2.4, full + 6, 2.6, 4.8);
    return this;
  }

  /**
   * A raft or barge that ferries the rider across a gap too wide to jump:
   * a z-shuttle that touches the near bank at one end of its run and the far
   * bank at the other. Waited for, boarded, ridden, and left.
   */
  ferry(
    gap: number,
    options: { size: number; width?: number; rate: number; phase?: number; kind?: SolidKind; x?: number },
  ): MovingSolid {
    const travel = Math.max(0, (gap - options.size) / 2);
    const platform = mover(
      this.stage,
      options.kind ?? 'log',
      options.x ?? this.x,
      this.y,
      this.z + gap / 2,
      options.width ?? Math.min(18, this.fullWidth()),
      options.size,
      'shuttle',
      { axis: 'z', amount: travel, rate: options.rate, phase: options.phase ?? 0 },
    );
    this.gap(gap);
    return platform;
  }

  /**
   * A slide: a straight descent on slick ground that pushes the rider down
   * it. Harder to stop and to steer than to go fast on.
   */
  slide(length: number, drop: number, options: StretchOptions & { grip?: number; push?: number } = {}): this {
    const startZ = this.z;
    this.path(length, { ...options, rise: this.y - drop, linear: true });
    surface(this.stage, -COURSE.halfWidth - 40, COURSE.halfWidth + 40, startZ, this.z, options.grip ?? 0.35, 0, options.push ?? 0);
    return this;
  }

  // -------------------------------------------------------------------------
  // Internals.
  // -------------------------------------------------------------------------

  /**
   * Forest floor either side of a stretch, a little below it.
   *
   * Dropped 2.2 - well over the step height - so the trail stays a TRAIL: the
   * player can leave it and ride the forest floor, but they can feel where the
   * path is and the cut edge reads from a distance. Laid as two aprons rather
   * than one slab under everything, so the trail's own material still shows.
   */
  private shouldersAt(
    x: number,
    y: number,
    z: number,
    width: number,
    span: number,
    half: number,
  ): void {
    const apron = half - width / 2;
    if (apron <= 2) return;
    for (const side of [-1, 1]) {
      box(
        this.stage,
        'jungle',
        x + side * (width / 2 + apron / 2),
        y - 2.2,
        z,
        apron,
        span + 0.35,
        6,
      );
    }
  }

  /**
   * Jungle verge either side of a slab: undergrowth to the path's edges.
   *
   * A hair BELOW the path - under one step height - so the trail reads as cut
   * through it, and so its top never shares a plane with the path's and
   * flickers.
   */
  private vergeAt(x: number, y: number, z: number, width: number, span: number, verge: number): void {
    for (const side of [-1, 1]) {
      box(this.stage, 'jungle', x + side * (width / 2 + verge / 2), y - 0.3, z, verge, span + 0.35);
    }
  }

  /** Kerbs down both edges of a stretch. Under one step height, so rideable. */
  private railsAt(
    x: number,
    y: number,
    z: number,
    width: number,
    span: number,
    kind: SolidKind,
  ): void {
    for (const edge of [-1, 1]) {
      box(this.stage, kind, x + (edge * width) / 2, y + 0.55, z, 1.1, span + 0.35, 1.4);
    }
  }

  private applyTargets(options: StretchOptions): void {
    if (options.aim !== undefined) this.aimX = options.aim;
    if (options.rise !== undefined) this.aimY = options.rise;
  }

  /** Eased lateral position a fraction of the way through a stretch. */
  private lerpX(t: number): number {
    const e = this.straight ? t : t * t * (3 - 2 * t);
    return this.x + (this.aimX - this.x) * e;
  }

  private lerpY(t: number): number {
    const e = this.straight ? t : t * t * (3 - 2 * t);
    return this.y + (this.aimY - this.y) * e;
  }

  /**
   * The eased line a stretch is about to follow, as functions of 0..1.
   *
   * Taken BEFORE the stretch is laid, because laying it moves the cursor: a
   * builder that asks the cursor afterwards where the stretch was is asking
   * where it ended.
   */
  private span(options: StretchOptions): { x: (t: number) => number; y: (t: number) => number } {
    const fromX = this.x;
    const fromY = this.y;
    const toX = options.aim ?? this.aimX;
    const toY = options.rise ?? this.aimY;
    const ease = (t: number): number => t * t * (3 - 2 * t);
    return {
      x: (t) => fromX + (toX - fromX) * ease(t),
      y: (t) => fromY + (toY - fromY) * ease(t),
    };
  }

  /** Where a stretch that started at `fromZ` is, at a world Z inside it. */
  private xAt(z: number, fromZ: number, length: number): number {
    return this.lerpX(Math.min(1, Math.max(0, (z - fromZ) / length)));
  }

  private yAt(z: number, fromZ: number, length: number): number {
    return this.lerpY(Math.min(1, Math.max(0, (z - fromZ) / length)));
  }

  private noteGround(y: number): void {
    if (y < this.pitLowY) this.pitLowY = y;
  }

  /** Advance the cursor past a stretch it has finished laying. */
  private commit(length: number): void {
    this.x = this.aimX;
    this.y = this.aimY;
    this.z += length;
    this.maybeLayPit();
  }

  /**
   * Lay the kill volume under everything since the last one.
   *
   * Triggered by DISTANCE or by a change in elevation, whichever comes first,
   * so a long flat trail gets one and a switchback climb gets one per storey -
   * and neither has to ask for it.
   */
  private maybeLayPit(): void {
    const travelled = this.z - this.pitFromZ;
    const climbed = Math.abs(this.y - this.pitStartY);
    if (travelled < PIT_STEP && climbed < PIT_RISE) return;
    this.layPit();
  }

  /** Close off the current kill volume. Called at the end of every stage too. */
  layPit(): void {
    if (this.z <= this.pitFromZ) return;
    pit(
      this.stage,
      this.below,
      -COURSE.halfWidth - 40,
      COURSE.halfWidth + 40,
      this.pitFromZ,
      this.z,
      this.pitLowY - this.fall,
      this.flow,
    );
    this.pitFromZ = this.z;
    this.pitLowY = this.y;
    this.pitStartY = this.y;
  }

  /** Slick footing over a stretch already laid: wet stone, mud, spray. */
  slippery(fromZ: number, toZ: number, grip: number, windX = 0): this {
    surface(this.stage, this.x - 60, this.x + 60, fromZ, toZ, grip, windX, 0);
    return this;
  }
}
