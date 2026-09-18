import { defineStage } from '../stage.js';
import type { Route } from '../route.js';
import { liftCrossing, movingBridge, rocks } from './kit.js';
import { abandonedCamp, scatterJungle, streamUnder } from './scenery.js';

/**
 * ACT ONE - THE JUNGLE ENTRANCE.
 *
 * Wide dirt trails - twenty-two across with a jungle verge either side -
 * raised through swamp and river. Room to run, room to recover, and ONE new
 * thing at a time: roots to jump, rocks across a river, a boulder that rolls
 * across the trail, logs rolling down a slope, a log swinging from the
 * canopy, the first raft, the first lift, the first quicksand, the first
 * rotating log, thorn vines, and at the act's end the first timed gate and
 * the first moving bridge.
 *
 * Forgiving throughout: every chain of jumps has at least a whole jump of
 * gap plus landing, so a jump from the very edge never overshoots, and every
 * hazard is slow enough to watch go round once before committing. The swamp
 * and the river either side are shallow and VISIBLE - leaving the trail is a
 * mistake the player can see coming.
 */

/** A trail raised through swamp: a shallow, visible, lethal surface. */
const swamp = (r: Route): void => {
  r.over('mud');
  r.fall = 4.5;
};

/** A trail beside the river: the same, but water. */
const riverside = (r: Route): void => {
  r.over('water', 0.4);
  r.fall = 4.5;
};

/**
 * 1 - RIVERSIDE TRAIL.
 *
 * Steering and the first obstacles, none of them fast. A wide trail that
 * bends, a double row of buttress roots across it, three big rocks across the
 * river, two boulders rolling slowly across the trail out of the forest, and
 * a shallow ford to wade.
 */
const riversideTrail = (r: Route): void => {
  riverside(r);
  const J = r.reach;
  r.made('dirt');

  r.path(60, { aim: 8 });
  r.rootsAcross(60, { count: 2, height: 2.2, aim: -4 });
  r.path(40, { aim: -6 });
  streamUnder(r, 12);
  rocks(r, 3, { gap: J * 0.3, land: J * 0.9, width: 20, jog: 6 });
  r.path(50, { aim: 4 });
  r.crossingBoulders(70, { count: 2, rate: 9, radius: 2.6 });
  r.path(30);
  r.ford(60, { current: 2 });
  r.path(40, { aim: 0 });

  abandonedCamp(r, r.startZ + 80, 1);
  scatterJungle(r, 1, undefined, { density: 1.4, palms: 0.35 });
};

/**
 * 2 - FALLEN TIMBER.
 *
 * Felled trunks across the swamp, then a gentle slope with logs rolling down
 * it at the rider - jump each one - a pair of logs swinging from the canopy,
 * and a triple row of roots.
 */
const fallenTimber = (r: Route): void => {
  swamp(r);
  const J = r.reach;
  r.made('dirt');

  r.path(50, { aim: -6 });
  r.logs(3, { run: J * 0.95, gap: J * 0.3, width: 12, scatter: 0.4 });
  r.path(40, { aim: 0 });
  r.rollingLogs(130, { count: 2, rate: 14, climb: 6 });
  r.path(30);
  r.swinging(80, { count: 2, rate: 1.1 });
  r.rootsAcross(70, { count: 3, height: 2.4, aim: 6 });
  r.path(40, { aim: 0 });

  scatterJungle(r, 2, undefined, { density: 1.3, fallen: 0.35 });
};

/**
 * 3 - CREEKSTONES.
 *
 * A ford with logs floating across it on the current, big rocks across a
 * rapid, and the first RAFT: a gap too wide to jump, crossed on a raft that
 * shuttles between the banks. Wait for it, board it, ride it, step off.
 */
const creekstones = (r: Route): void => {
  riverside(r);
  const J = r.reach;
  r.made('dirt');

  r.path(40);
  r.ford(80, { current: 4, logs: { count: 2, rate: 8, length: 8 } });
  r.path(30, { aim: 6 });
  rocks(r, 4, { gap: J * 0.38, land: J * 0.62, width: 16, jog: 8 });
  r.path(40, { aim: -4 });
  r.ferry(J * 1.5, { size: 13, width: 16, rate: 0.2 });
  r.path(40);
  r.crossingBoulders(70, { count: 2, rate: 12, radius: 2.8 });
  r.path(30, { aim: 0 });

  scatterJungle(r, 3, undefined, { density: 1.2, palms: 0.4 });
};

/**
 * 4 - CANOPY STEPS.
 *
 * Up into the canopy on a stair and a plank walkway, across a chasm on the
 * first LIFT - it rises to meet the far ledge and sinks out of reach of it -
 * down again, through the first patch of quicksand, and past the first
 * rotating log.
 */
const canopySteps = (r: Route): void => {
  r.over('mud');
  r.fall = 13;
  const J = r.reach;
  r.made('dirt');

  r.path(40);
  r.stairs(6, 0.8, { run: 7 });
  r.walkway(60, { aim: 8, verge: 0 });
  liftCrossing(r, {
    gapIn: J * 0.4,
    size: J * 0.45,
    width: 16,
    gapOut: J * 0.4,
    drop: 0.6,
    travel: 2.6,
    rate: 0.22,
    kind: 'plank',
  });
  r.walkway(50, { verge: 0 });
  r.path(50, { rise: r.y - 4.8, aim: 0 });
  r.fall = 4.5;
  r.quicksand(50, { islands: 2 });
  r.path(30);
  r.sweepers(60, { count: 1, rate: 1.1 });
  r.path(30, { aim: 0 });

  scatterJungle(r, 4, undefined, { density: 1.2, canopy: true });
};

/**
 * 5 - OVERGROWN GATE.
 *
 * Thorn vines swinging across the trail, then quicksand in front of the first
 * TIMED GATE - wait on a firm hummock, not in the mud - the first moving
 * bridge over the swamp, roots, and two swinging logs.
 */
const overgrownGate = (r: Route): void => {
  swamp(r);
  const J = r.reach;
  r.made('dirt');

  r.path(40);
  r.vines(90, { count: 3, rate: 1.0 });
  r.path(30);
  r.quicksand(45, { islands: 2 });
  r.gate({ rate: 0.25, hold: 0.5 });
  r.path(40);
  movingBridge(r, 2, { gap: J * 0.3, size: J * 0.4, width: 12, travel: 11, rate: 0.25, kind: 'log' });
  r.path(40);
  r.rootsAcross(60, { count: 2, height: 2.6 });
  r.swinging(70, { count: 2, rate: 1.2 });
  r.path(30, { aim: 0 });

  scatterJungle(r, 5, undefined, { density: 1.3, ruins: 0.1 });
};

export const buildAct1 = (): void => {
  defineStage(1, riversideTrail);
  defineStage(2, fallenTimber);
  defineStage(3, creekstones);
  defineStage(4, canopySteps);
  defineStage(5, overgrownGate);
};
