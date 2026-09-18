import { buildCamp } from './arena.js';
import { buildAct1 } from './acts/act1.js';
import { buildAct2 } from './acts/act2.js';
import { buildAct3 } from './acts/act3.js';
import { buildAct4 } from './acts/act4.js';
import { buildAct5 } from './acts/act5.js';
import { buildAct6 } from './acts/act6.js';
import {
  caves,
  decorations,
  hazards,
  movers,
  pits,
  solids,
  stages,
  surfaces,
  territories,
  wideAreas,
} from './emit.js';
import { COURSE, WIN_PAD } from './metrics.js';
import { courseEndZ } from './stage.js';
import type { PitRegion, StageDefinition, SurfaceRegion } from './types.js';

/**
 * The world, assembled.
 *
 * Built ONCE, at import time, on the client and on the server alike - so both
 * hold the identical arrays and neither can hold a platform the other has not
 * heard of. Everything below this line is read-only from here on.
 */

buildCamp();
buildAct1();
buildAct2();
buildAct3();
buildAct4();
buildAct5();
buildAct6();

export const COURSE_SOLIDS: readonly (typeof solids)[number][] = solids;
export const MOVING_SOLIDS: readonly (typeof movers)[number][] = movers;
export const PITS: readonly PitRegion[] = pits;
export const COURSE_HAZARDS: readonly (typeof hazards)[number][] = hazards;
export const DECORATIONS: readonly (typeof decorations)[number][] = decorations;
export const SURFACE_REGIONS: readonly SurfaceRegion[] = surfaces;
export const WIDE_AREAS: readonly (typeof wideAreas)[number][] = wideAreas;
export const CAVE_REGIONS: readonly (typeof caves)[number][] = caves;
export const GUARDIAN_TERRITORIES: readonly (typeof territories)[number][] = territories;
export const STAGES: readonly StageDefinition[] = stages;

/** Where the expedition ends. Everything past it is out of bounds. */
export const COURSE_END_Z: number = courseEndZ() + 30;

/**
 * Half the world's width at a Z.
 *
 * ONE definition, read by the movement clamp, the renderer's valley walls and
 * the hazard bounds check - so a stretch drawn wide and clamped narrow cannot
 * exist. Scanned rather than bucketed because the list is a few dozen entries
 * and this is called once per substep, not once per solid.
 */
export const corridorHalfWidthAt = (z: number): number => {
  let widest: number = COURSE.halfWidth;
  for (const area of wideAreas) {
    if (z >= area.minZ && z <= area.maxZ && area.halfWidth > widest) widest = area.halfWidth;
  }
  return widest;
};

/** The stage containing a Z, or null. */
export const stageAt = (z: number): StageDefinition | null => {
  for (const stage of stages) {
    if (z >= stage.startZ && z <= stage.endZ) return stage;
  }
  return null;
};

/**
 * The win dais a player is standing on, or null.
 *
 * Height matters as much as position: the dais sits at the top of whatever the
 * stage climbed to, and a player passing under it forty units below has not
 * finished the stage.
 */
export const winPadAt = (x: number, y: number, z: number): StageDefinition | null => {
  // The plate's own footprint plus a hair, from the one definition of it.
  const halfX = WIN_PAD.width / 2 + 0.4;
  const halfZ = WIN_PAD.length / 2 + 0.4;
  for (const stage of stages) {
    if (Math.abs(x - stage.winPadX) > halfX) continue;
    if (Math.abs(z - stage.winPadZ) > halfZ) continue;
    if (y < stage.winPadY - 3 || y > stage.winPadY + 6) continue;
    return stage;
  }
  return null;
};

/**
 * How the ground at a point handles, or null for ordinary footing.
 *
 * Read inside `stepPlayer` itself by both sides, so a slick ledge or a
 * crosswind cannot be simulated one way by the server and predicted another by
 * the client.
 */
export const surfaceAt = (x: number, z: number): SurfaceRegion | null => {
  for (const region of surfaces) {
    if (x < region.minX || x > region.maxX) continue;
    if (z < region.minZ || z > region.maxZ) continue;
    return region;
  }
  return null;
};

/**
 * The kill volume a point is inside, or null.
 *
 * Returns the one with the HIGHEST death line that the point is below, because
 * a stage that switchbacks up a cliff lays several at different elevations
 * over the same ground and the relevant one is always the nearest above the
 * faller - not the first in the array.
 */
export const pitAt = (x: number, y: number, z: number): PitRegion | null => {
  let found: PitRegion | null = null;
  for (const region of pits) {
    if (x < region.minX || x > region.maxX) continue;
    if (z < region.minZ || z > region.maxZ) continue;
    if (y > region.deathY) continue;
    if (!found || region.deathY > found.deathY) found = region;
  }
  return found;
};

/**
 * The kill volume drawn at a point, whatever the player's height.
 *
 * For the renderer, which needs to know what to paint under a stretch of path
 * rather than whether anybody has fallen into it.
 */
export const pitSurfaceAt = (x: number, z: number): PitRegion | null => {
  let found: PitRegion | null = null;
  for (const region of pits) {
    if (x < region.minX || x > region.maxX) continue;
    if (z < region.minZ || z > region.maxZ) continue;
    if (!found || region.surfaceY > found.surfaceY) found = region;
  }
  return found;
};

/** How dark it is at a Z, 0 in daylight and 1 deep underground. */
export const caveDepthAt = (z: number): number => {
  for (const region of caves) {
    if (z < region.minZ || z > region.maxZ) continue;
    // Eased in and out over the tunnel's mouths, so the light changes as the
    // player enters rather than snapping at a plane they cannot see.
    const span = region.maxZ - region.minZ;
    const fade = Math.min(24, span / 2);
    const into = Math.min(z - region.minZ, region.maxZ - z);
    return region.depth * Math.min(1, into / Math.max(1e-3, fade));
  }
  return 0;
};

export * from './types.js';
export * from './motion.js';
export { COURSE, ACTS, QUICKSAND, STAGE_TUNING, WIN_PAD, actOf, stageReward, type QuicksandTuning } from './metrics.js';
export {
  BOARDS,
  BOARD_ROW,
  SHOPS,
  SHOP_ROW,
  SHOP_SIZE_X,
  SHOP_SIZE_Z,
  TRAINING,
  TREADMILL_BELT_Y,
  UPGRADE_ROW,
  shopNear,
  activeTreadmillAt,
  treadmillAt,
  upgradePadAt,
  UPGRADE_FIRST_Z,
  UPGRADE_LAST_Z,
  UPGRADE_STAIR_WIDTH,
  UPGRADE_STAIR_Z,
  treadmillZ,
  upgradeSlotAt,
  upgradeX,
  upgradeY,
  upgradeZ,
  type ShopId,
  type ShopStall,
} from './arena.js';
