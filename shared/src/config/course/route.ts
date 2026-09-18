import { COURSE } from './metrics.js';
import {
  block,
  box,
  cave,
  decorate,
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

  /** What is below, when this stretch lays its kill volume. */
  below: PitRegion['surface'] = 'void';
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
    const steps = Math.max(1, Math.round(length / STEP));
    const span = length / steps;

    for (let i = 0; i < steps; i += 1) {
      const t = (i + 1) / steps;
      const x = this.lerpX(t);
      const y = this.lerpY(t);
      const z = this.z + span * (i + 0.5);
      // Overlapped by a hair along Z, so a curving run has no seam a mount can
      // catch its feet in at three hundred units a second.
      box(this.stage, kind, x, y, z, width, span + 0.35);
      if (options.rails) this.railsAt(x, y, z, width, span, kind);
      if (options.shoulders) this.shouldersAt(x, y, z, width, span, options.shoulders);
      this.noteGround(y);
    }

    this.commit(length);
    return this;
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
    this.path(length, { ...options, kind: options.kind ?? 'plank' });

    const posts = Math.max(2, Math.round(length / 16));
    for (let i = 0; i <= posts; i += 1) {
      const t = i / posts;
      const z = startZ + length * t;
      const x = this.xAt(z, startZ, length);
      const y = this.yAt(z, startZ, length);
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
    }

    this.x = this.lerpX(1);
    this.y += rise * count;
    this.aimY = this.y;
    this.z += total;
    this.maybeLayPit();
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

    this.path(length, { ...options, kind: options.kind ?? 'cave' });

    const steps = Math.max(1, Math.round(length / STEP));
    const span = length / steps;
    for (let i = 0; i < steps; i += 1) {
      const t = (i + 0.5) / steps;
      const z = startZ + span * (i + 0.5);
      const x = this.xAt(z, startZ, length);
      const y = this.yAt(z, startZ, length);
      // The roof, and the two walls that make it a passage rather than a lid.
      block(this.stage, 'cave', x - width / 2 - 8, y + headroom, z - span / 2, width + 16, 7, span + 0.4);
      block(this.stage, 'cave', x - width / 2 - 8, y - 4, z - span / 2, 8, headroom + 4, span + 0.4);
      block(this.stage, 'cave', x + width / 2, y - 4, z - span / 2, 8, headroom + 4, span + 0.4);
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

  /** A platform that rises and falls on the spot. */
  lift(
    atZ: number,
    options: { x?: number; y?: number; size?: number; travel?: number; rate?: number; phase?: number; kind?: SolidKind },
  ): MovingSolid {
    return mover(
      this.stage,
      options.kind ?? 'stone',
      options.x ?? this.x,
      options.y ?? this.y,
      atZ,
      options.size ?? 13,
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
    options: StretchOptions & { sections?: number; rate?: number; hold?: number } = {},
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
          // Stepped, so the give-way runs along the span.
          phase: i / sections,
          hold: options.hold ?? 0.78,
        },
      );
      this.noteGround(this.lerpY(t));
    }

    this.commit(length);
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
    const e = t * t * (3 - 2 * t);
    return this.x + (this.aimX - this.x) * e;
  }

  private lerpY(t: number): number {
    const e = t * t * (3 - 2 * t);
    return this.y + (this.aimY - this.y) * e;
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
      this.pitLowY - COURSE.fallDepth,
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
