import { defineStage } from '../stage.js';
import type { Route } from '../route.js';
import { liftCrossing, movingBridge, rocks } from './kit.js';
import { cliffWall, enclose, scatterCave, scatterJungle, waterfall } from './scenery.js';

/**
 * ACT TWO - THE DEEP JUNGLE.
 *
 * Rivers, rope bridges, a gorge and the first waterfall. The trail is still
 * wide - twenty across with its verge - and the difficulty climbs in what is
 * ON it and between its pieces: rafts on a rapid, a rope bridge that gives
 * way under the rider, a ledge under lethal falls, logs rolling down a root
 * climb, a ruined span of moving planks.
 *
 * From here, every chain of rocks OVERSHOOTS: gap plus landing is less than
 * a jump, so a jump from the very edge sails past the landing. Take off early
 * or ease off. Gap plus two landings stays over 1.15 jumps, so there is
 * always a takeoff that works.
 */

/**
 * 6 - RAPIDS CROSSING.
 *
 * A ford with logs racing across it on the current, a raft over a rapid too
 * wide to jump, a chain of river rocks, boulders rolling across the far bank,
 * and a second raft.
 */
const rapidsCrossing = (r: Route): void => {
  r.over('rapids', 1.2);
  r.fall = 6;
  const J = r.reach;
  r.made('dirt');

  r.path(50, { aim: -8 });
  r.ford(100, { current: 8, logs: { count: 3, rate: 13, length: 10 } });
  r.path(30, { aim: 0 });
  r.ferry(J * 1.5, { size: J * 0.45, width: 16, rate: 0.19, kind: 'log' });
  r.path(40, { aim: 8 });
  rocks(r, 4, { gap: J * 0.45, land: J * 0.5, width: 14, jog: 8 });
  r.path(40, { aim: -4 });
  r.crossingBoulders(80, { count: 3, rate: 16, radius: 3 });
  r.ferry(J * 1.6, { size: J * 0.45, width: 16, rate: 0.17, phase: 0.5, kind: 'log' });
  r.path(40, { aim: 0 });

  scatterJungle(r, 6, undefined, { density: 1.3, palms: 0.3, fallen: 0.25 });
};

/**
 * 7 - THE ROPEWALK.
 *
 * A gorge crossed on rope. A long rope bridge, a rock shelf with logs
 * swinging over it, a rope bridge that GIVES WAY in a wave along its length,
 * a moving bridge of planks, and a last rope bridge.
 */
const ropewalk = (r: Route): void => {
  r.over('void');
  r.fall = 13;
  const J = r.reach;
  r.made('dirt');

  r.path(40);
  r.ropeBridge(100, { width: 14 });
  r.path(40, { kind: 'rock' });
  r.swinging(90, { count: 3, rate: 1.3, kind: 'rock' });
  r.path(J * 0.4, { kind: 'rock' });
  r.collapsing(J * 1.6, { sections: 6, rate: 0.2, hold: 0.62, spread: 0.45, kind: 'rope', width: 14, verge: 0 });
  r.path(40, { kind: 'rock' });
  movingBridge(r, 3, { gap: J * 0.3, size: J * 0.38, width: 14, travel: 14, rate: 0.24, kind: 'plank' });
  r.path(30);
  r.ropeBridge(80, { width: 14 });
  r.path(40, { aim: 0 });

  cliffWall(r, r.z - r.startZ - 60, -1, 70);
  scatterJungle(r, 7, undefined, { density: 1, palms: 0.2, drop: 90 });
};

/**
 * 8 - WATERFALL LEDGE.
 *
 * A wet rock ledge under a cliff, with falls pouring over its OUTER half in
 * turn - a lane stays open on the inside - then thorn vines, a lift across a
 * chasm behind the spray, and a bank of quicksand in front of a timed gate.
 */
const waterfallLedge = (r: Route): void => {
  r.over('water', 0.8);
  r.fall = 13;
  const J = r.reach;
  r.made('rock');

  r.path(40);
  const ledgeFrom = r.z;
  r.path(150, { width: 22, verge: 0, aim: 6 });
  r.slippery(ledgeFrom, r.z, 0.6);
  for (let i = 0; i < 4; i += 1) {
    const z = ledgeFrom + 22 + i * 36;
    const line = r.lineAt(z);
    if (!line) continue;
    const side = i % 2 === 0 ? 1 : -1;
    waterfall(r, line.x + side * (line.half - 4), z, line.y + 60, 60, { lethal: true, width: 8, scale: 3 });
  }
  r.vines(90, { count: 4, rate: 1.2 });
  liftCrossing(r, { gapIn: J * 0.4, size: J * 0.6, width: 16, gapOut: J * 0.35, drop: 0.5, travel: 2.6, rate: 0.2 });
  r.path(40);
  r.quicksand(60, { islands: 3 });
  r.gate({ rate: 0.22, hold: 0.55 });
  r.path(40, { aim: 0 });

  cliffWall(r, r.z - ledgeFrom, 1, 90);
  scatterJungle(r, 8, undefined, { density: 1, palms: 0.2 });
};

/**
 * 9 - ROOTWOOD CLIMB.
 *
 * Up a slope with logs rolling down it at the rider, a stair, rows of
 * buttress roots, a climb from root to root, and two rotating logs.
 */
const rootwoodClimb = (r: Route): void => {
  r.over('void');
  r.fall = 13;
  const J = r.reach;
  r.made('dirt');

  r.path(40);
  // Up through a HOLLOW ROOT: the slope and its rolling logs are inside a
  // tunnel the forest grew, and daylight is at the top of it.
  const hollowFrom = r.z;
  r.rollingLogs(160, { count: 3, rate: 24, climb: 12 });
  enclose(r, hollowFrom, { kind: 'cave', headroom: 18, dark: 0.6 });
  scatterCave(r, 9, r.z - hollowFrom);
  r.path(30);
  r.stairs(6, 0.8, { run: 8 });
  r.rootsAcross(90, { count: 3, height: 3 });
  rocks(r, 3, { gap: J * 0.4, land: J * 0.5, width: 14, jog: 8, step: 3, kind: 'log' });
  r.path(40);
  r.sweepers(80, { count: 2, rate: 1.4 });
  r.path(30, { aim: 0 });

  scatterJungle(r, 9, undefined, { density: 1.4, fallen: 0.3, canopy: true });
};

/**
 * 10 - THE BROKEN SPAN.
 *
 * A ruined expedition bridge: a plank walkway, a span that collapses in a
 * wave, a moving bridge of loose planks, boulders crossing the far bank, and
 * a last barge across the gorge.
 */
const brokenSpan = (r: Route): void => {
  r.over('void');
  r.fall = 13;
  const J = r.reach;
  r.made('dirt');

  r.path(40);
  r.walkway(60, { verge: 0, width: 22 });
  r.gap(J * 0.45);
  r.collapsing(J * 1.4, { sections: 7, rate: 0.2, hold: 0.65, spread: 0.5, kind: 'plank', width: 16, verge: 0 });
  r.path(J * 0.6, { kind: 'plank', verge: 0 });
  movingBridge(r, 3, { gap: J * 0.3, size: J * 0.35, width: 13, travel: 12, rate: 0.22, kind: 'plank' });
  r.path(40);
  r.crossingBoulders(90, { count: 3, rate: 20, radius: 3.4 });
  r.ferry(J * 1.6, { size: J * 0.45, width: 16, rate: 0.16, kind: 'plank' });
  r.path(40, { aim: 0 });

  scatterJungle(r, 10, undefined, { density: 1, ruins: 0.2, drop: 90 });
};

export const buildAct2 = (): void => {
  defineStage(6, rapidsCrossing);
  defineStage(7, ropewalk);
  defineStage(8, waterfallLedge);
  defineStage(9, rootwoodClimb);
  defineStage(10, brokenSpan);
};
