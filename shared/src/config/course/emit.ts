import { COURSE } from './metrics.js';
import type {
  CaveRegion,
  GuardianTerritory,
  CourseHazard,
  CourseSolid,
  Decoration,
  DecorationKind,
  HazardKind,
  MovingSolid,
  PitRegion,
  SolidKind,
  StageDefinition,
  SurfaceRegion,
  WideArea,
} from './types.js';

/**
 * The world, under construction.
 *
 * Every builder in `acts/` appends here and nothing reads these arrays until
 * `index.ts` has run them all and frozen the result. Module-level mutable
 * arrays are deliberate: the world is built ONCE at import time and is
 * immutable for the rest of the process's life, on the client and the server
 * alike, which is what makes it safe for both to treat it as a constant.
 */
export const solids: CourseSolid[] = [];
export const movers: MovingSolid[] = [];
export const pits: PitRegion[] = [];
export const hazards: CourseHazard[] = [];
export const decorations: Decoration[] = [];
export const surfaces: SurfaceRegion[] = [];
export const wideAreas: WideArea[] = [];
export const caves: CaveRegion[] = [];
export const territories: GuardianTerritory[] = [];
export const stages: StageDefinition[] = [];

/**
 * A deterministic pseudo-random number in 0..1.
 *
 * Every scattered thing in this world - a fern's position, a tree's tone, the
 * lean of a palm - comes from here rather than from `Math.random`, because the
 * world is built independently on every client and on the server. A jungle
 * that was differently overgrown on each machine would be a jungle where one
 * player's cover is another's open ground.
 */
export const rand = (seed: number): number => {
  let value = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
};

/** A deterministic value in `-spread..spread`. */
export const jitter = (seed: number, spread: number): number =>
  (rand(seed) - 0.5) * 2 * spread;

/**
 * A solid box, given its CENTRE on the horizontal plane and its TOP surface.
 *
 * Authored from the top down because that is the number the player interacts
 * with: a path is "at height 12", and how thick the slab under it happens to
 * be is a fact about the art rather than about the route.
 */
export const box = (
  stage: number,
  kind: SolidKind,
  x: number,
  topY: number,
  z: number,
  width: number,
  length: number,
  thickness = COURSE.slabThickness,
): CourseSolid => {
  const solid: CourseSolid = {
    minX: x - width / 2,
    maxX: x + width / 2,
    minY: topY - thickness,
    maxY: topY,
    minZ: z - length / 2,
    maxZ: z + length / 2,
    kind,
    stage,
  };
  solids.push(solid);
  return solid;
};

/**
 * A solid authored from its MIN corner and explicit spans.
 *
 * For walls, lintels and anything whose height matters as much as its top -
 * a temple doorway is a hole of a certain size, not a floor at a certain
 * level.
 */
export const block = (
  stage: number,
  kind: SolidKind,
  minX: number,
  minY: number,
  minZ: number,
  spanX: number,
  spanY: number,
  spanZ: number,
): CourseSolid => {
  const solid: CourseSolid = {
    minX,
    maxX: minX + spanX,
    minY,
    maxY: minY + spanY,
    minZ,
    maxZ: minZ + spanZ,
    kind,
    stage,
  };
  solids.push(solid);
  return solid;
};

/** A platform that moves, and carries whoever is standing on it. */
export const mover = (
  stage: number,
  kind: SolidKind,
  x: number,
  topY: number,
  z: number,
  width: number,
  length: number,
  motion: MovingSolid['motion'],
  options: {
    axis?: 'x' | 'z';
    amount: number;
    rate: number;
    phase?: number;
    hold?: number;
    thickness?: number;
  },
): MovingSolid => {
  const thickness = options.thickness ?? COURSE.slabThickness;
  const solid: MovingSolid = {
    minX: x - width / 2,
    maxX: x + width / 2,
    minY: topY - thickness,
    maxY: topY,
    minZ: z - length / 2,
    maxZ: z + length / 2,
    kind,
    stage,
    motion,
    axis: options.axis ?? 'x',
    amount: options.amount,
    rate: options.rate,
    phase: options.phase ?? 0,
    // A collapsing platform is SOLID for four fifths of its cycle by default.
    // A bridge that is gone half the time is a timing puzzle; one that is gone
    // briefly is a bridge that gives way, which is the set piece this is for.
    hold: options.hold ?? 0.8,
  };
  movers.push(solid);
  return solid;
};

/** A volume that kills. */
export const pit = (
  stage: number,
  surface: PitRegion['surface'],
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  surfaceY: number,
  flow = 0,
): PitRegion => {
  const region: PitRegion = {
    stage,
    surface,
    minX,
    maxX,
    minZ,
    maxZ,
    surfaceY,
    // Just under the surface, so falling in kills at once. A pit the player
    // sinks ten units into before dying reads as a bug in the floor.
    deathY: surfaceY - 1.4,
    flow,
  };
  pits.push(region);
  return region;
};

/** A hazard. Every field it does not use is zeroed rather than left undefined. */
export const hazard = (
  stage: number,
  kind: HazardKind,
  fields: {
    x: number;
    y: number;
    z: number;
    radius: number;
    sweep?: number;
    rate: number;
    phase?: number;
    fromZ?: number;
    toZ?: number;
    fromY?: number;
    toY?: number;
    driftX?: number;
  },
): CourseHazard => {
  const entry: CourseHazard = {
    kind,
    stage,
    x: fields.x,
    y: fields.y,
    z: fields.z,
    radius: fields.radius,
    sweep: fields.sweep ?? 0,
    rate: fields.rate,
    phase: fields.phase ?? 0,
    fromZ: fields.fromZ ?? fields.z,
    toZ: fields.toZ ?? fields.z,
    fromY: fields.fromY ?? fields.y,
    toY: fields.toY ?? fields.y,
    driftX: fields.driftX ?? 0,
  };
  hazards.push(entry);
  return entry;
};

/** A piece of scenery. */
export const decorate = (
  stage: number,
  kind: DecorationKind,
  x: number,
  y: number,
  z: number,
  scale = 1,
  rotationY = 0,
  tone = 0,
): void => {
  decorations.push({ kind, stage, x, y, z, scale, rotationY, tone });
};

/** A patch of ground that handles differently. */
export const surface = (
  stage: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  grip: number,
  windX = 0,
  windZ = 0,
): void => {
  surfaces.push({ stage, minX, maxX, minZ, maxZ, grip, windX, windZ });
};

/**
 * The surface of the highest kill volume at a point, or null.
 *
 * Used DURING the build, by the scenery scatter, to find something to stand a
 * tree on. A stage's own volumes are all laid by the time its builder dresses
 * it, so this sees exactly the ground that stage created - and a tree planted
 * beside a bridge ends up on the riverbank forty units below rather than
 * hanging in the air beside the handrail.
 */
export const groundDuringBuild = (x: number, z: number): number | null => {
  let best: number | null = null;
  for (const region of pits) {
    if (x < region.minX || x > region.maxX) continue;
    if (z < region.minZ || z > region.maxZ) continue;
    if (best === null || region.surfaceY > best) best = region.surfaceY;
  }
  return best;
};

/** Declare a stretch of world wider than the default valley. */
export const widen = (minZ: number, maxZ: number, halfWidth: number): void => {
  wideAreas.push({ minZ, maxZ, halfWidth });
};

/** Declare a stretch the player travels underground. */
export const cave = (stage: number, minZ: number, maxZ: number, depth = 0.85): void => {
  caves.push({ stage, minZ, maxZ, depth });
};

/**
 * Declare ground a guardian hunts over.
 *
 * The ONLY thing in this world that is not a pure function of time, and the
 * only reason any of it is replicated: a guardian reacts to where the players
 * are, which is state. Its territory is DERIVED from the arena a stage
 * actually laid rather than authored beside it - a guardian whose patrol range
 * and whose floor disagree is one that walks off the edge of its own stage.
 */
export const guardianZone = (
  stage: number,
  minZ: number,
  maxZ: number,
  halfWidth: number,
  floorY: number,
): void => {
  territories.push({ stage, minZ, maxZ, halfWidth, floorY });
};
