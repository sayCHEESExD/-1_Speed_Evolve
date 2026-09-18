import { totalSpeedToReach } from '../speed.js';
import { box, decorate, stages } from './emit.js';
import { COURSE, STAGE_TUNING, WIN_PAD, actOf, stageReward } from './metrics.js';
import { Route } from './route.js';
import type { StageDefinition } from './types.js';

/**
 * The scaffolding every stage is built inside.
 *
 * A stage builder receives a `Route` already positioned at the end of the last
 * stage and does nothing but lay its own section of the expedition. It never
 * decides where it starts, never writes its own `StageDefinition`, and never
 * places its own win pad - all three are done here, once, which is why thirty
 * hand-authored stages cannot drift into thirty slightly different ideas of
 * where a stage ends.
 */

/** Where the next stage will begin. Advanced by `defineStage`. */
let cursorZ: number = COURSE.campEndZ;

/** The route's lateral and vertical position, carried between stages. */
let cursorX = 0;
let cursorY: number = COURSE.floorY;

/**
 * How wide the path is at the start of a stage, by act.
 *
 * WIDE, and it stays wide. The course before this one ran eleven down to six
 * and a half, and felt like riding along a snake's back through the jungle:
 * the only difficulty it could express was less floor. This one gives the
 * player room to run, jump, dodge and recover, and asks for skill with what
 * is IN the way - boulders, logs, gates, quicksand, things that move. It
 * narrows a little act by act because the ruins and the temple are built
 * spaces, not because a thin floor is a challenge.
 */
const ENTRY_WIDTH = [22, 20, 20, 18, 18, 18];

/**
 * The jungle verge either side of the path, by act: undergrowth to the edge
 * of the trail outdoors, and none in the masonry of the ruins and the temple.
 */
const ENTRY_VERGE = [3, 3, 0, 2, 0, 2];

export interface StageBuild {
  /** Called with a cursor at the stage's first metre. */
  readonly build: (route: Route) => void;
}

/**
 * Build one stage, and record where it ended.
 *
 * The LINK between stages is built here too: a short run of ordinary ground
 * carrying the stage marker, so the player always arrives at a stage on solid
 * footing and always sees which one they are entering. A course where a stage
 * ended in mid-air would be a course where the previous stage's last jump and
 * the next one's first are the same jump.
 */
export const defineStage = (index: number, build: (route: Route) => void): void => {
  const tuning = STAGE_TUNING[index - 1];
  if (!tuning) return;

  const act = actOf(index);
  const startZ = cursorZ;

  const route = new Route(index, {
    x: cursorX,
    y: cursorY,
    z: startZ,
    width: ENTRY_WIDTH[act - 1] ?? 18,
  });
  route.verge = ENTRY_VERGE[act - 1] ?? 0;

  // The approach: solid ground, the carved marker, and the act's own material
  // under the player's feet before anything is asked of them.
  route.made(act >= 3 ? 'stone' : 'dirt');
  route.path(COURSE.stageGap);
  const posts = route.fullWidth() / 2 + 4;
  decorate(index, 'marker', route.side(-posts), route.y, startZ + 14, 1.4, 0, act);
  decorate(index, 'marker', route.side(posts), route.y, startZ + 14, 1.4, Math.PI, act);

  build(route);

  /*
   * The landing: a short apron so the stage ends somewhere a mount can stop,
   * and the win dais on a spur OFF it, at the player's RIGHT - which is -X.
   *
   * Off the line, and that is the whole point. Banking a stage RETURNS the
   * player to the camp, so a dais sitting in the middle of the route is a dais
   * that teleports away anyone trying to run deeper into the expedition. The
   * apron is widened to carry the spur and the dais sits beyond the width the
   * route itself travels, so passing through costs nothing and claiming is a
   * deliberate steer.
   */
  const apron = Math.max(route.fullWidth(), 14);
  const spur = apron / 2 + WIN_PAD.width / 2 + 3;
  route.aimAt(route.x).riseTo(route.y);
  route.path(30, { width: apron + WIN_PAD.width + 8, verge: 0, kind: act >= 3 ? 'stone' : 'dirt' });

  const padX = route.x - spur;
  const padZ = route.z - 15;
  const padY = route.y + WIN_PAD.height;
  box(index, 'winPad', padX, padY, padZ, WIN_PAD.width, WIN_PAD.length, WIN_PAD.height);

  route.layPit();

  stages.push({
    index,
    name: tuning.name,
    difficulty: tuning.difficulty,
    act,
    recommendedLevel: tuning.recommendedLevel,
    // DERIVED from the level through the same curve the player actually levels
    // on, never written beside it. A hand-authored figure is free to drift into
    // advertising a total that does not correspond to the level printed next
    // to it, and the marker shows both.
    recommendedSpeed: totalSpeedToReach(tuning.recommendedLevel),
    startZ,
    endZ: route.z,
    winPadX: padX,
    winPadY: padY,
    winPadZ: padZ,
    winReward: stageReward(index),
  } satisfies StageDefinition);

  cursorZ = route.z;
  cursorX = route.x;
  cursorY = route.y;
};

/** Where the whole course currently ends. Read once every stage is built. */
export const courseEndZ = (): number => cursorZ;
