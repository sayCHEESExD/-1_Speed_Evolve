import { box, decorate, guardianZone, surface } from '../emit.js';
import { defineStage } from '../stage.js';
import type { Route } from '../route.js';
import { liftCrossing, movingBridge, rocks } from './kit.js';
import { abandonedCamp, cliffWall, enclose, scatterJungle, waterfall } from './scenery.js';

/**
 * ACT FOUR - THE DANGER ZONE.
 *
 * The valley narrows into a gorge and the course turns on the rider. Rock
 * ledges eighteen wide with a verge of scrub, a void beside them, and
 * hazards that come AT the player: boulders down a ramp, boulders chasing
 * them down another, a gale off the cliff, the first guardian, shelves that
 * crumble in a wave, and a cataract to leap.
 *
 * Longer sequences, faster hazards, and terrain changing under the rider -
 * a climb into falling rock, a drop into a chase.
 */

const gorge = (r: Route): void => {
  r.over('void');
  r.fall = 13;
};

/**
 * 16 - BOULDER RUN.
 *
 * Up a wide ramp with boulders rolling down it - dodge across the slope, or
 * duck into the alcoves - then down another with boulders coming from BEHIND
 * faster than the mount can run: the chase. Out over the gorge on a barge.
 */
const boulderRun = (r: Route): void => {
  gorge(r);
  const J = r.reach;
  r.made('rock');

  r.path(40);
  const from = r.z;
  r.boulderRun(280, { toward: true, drop: 20, count: 6, rate: 55, radius: 5, alcoves: 4, width: 26 });
  r.path(40);
  r.boulderRun(260, { drop: 26, count: 4, rate: 150, radius: 5, width: 26, alcoves: 4 });
  r.path(30);
  r.ferry(J * 1.4, { size: J * 0.45, width: 18, rate: 0.16, kind: 'rock' });
  r.path(40, { aim: 0 });

  cliffWall(r, r.z - from, 1, 90);
  abandonedCamp(r, from + 20, -1);
  scatterJungle(r, 16, undefined, { density: 1.1, inset: 8 });
};

/**
 * 17 - CLIFFSIDE GALE.
 *
 * A ledge along the cliff with the wind trying to throw the rider off it,
 * logs swinging over it, thorn vines, a chain of rocks out over the drop,
 * and a shelf that collapses in a wave.
 */
const cliffsideGale = (r: Route): void => {
  gorge(r);
  const J = r.reach;
  r.made('rock');

  r.path(40);
  const from = r.z;
  r.swinging(160, { count: 4, rate: 1.4, verge: 0, width: 20 });
  r.vines(100, { count: 4, rate: 1.3 });
  // The gale: a steady push off the cliff, over the whole ledge.
  surface(17, -120, 120, from, r.z, 1, -r.speed * 0.55, 0);
  r.path(30);
  rocks(r, 4, { gap: J * 0.42, land: J * 0.4, width: 16, jog: 10 });
  r.path(J * 0.5);
  r.collapsing(J * 1.2, { sections: 6, rate: 0.18, hold: 0.65, spread: 0.45, width: 16, verge: 0 });
  r.path(40, { aim: 0 });

  cliffWall(r, r.z - from, 1, 110);
  scatterJungle(r, 17, undefined, { density: 0.8, drop: 90 });
};

/**
 * 18 - THE GUARDIAN'S GROVE.
 *
 * A clearing where the first guardian hunts, with fallen roots for cover -
 * then a quicksand bank before a gate, and a lift out of the grove.
 */
const guardiansGrove = (r: Route): void => {
  gorge(r);
  const J = r.reach;
  r.made('rock');

  r.path(40);
  const groveFrom = r.z;
  const groveLength = 280;
  const groveHalf = 36;
  r.plaza(groveLength, { halfWidth: groveHalf, kind: 'dirt' });
  guardianZone(18, groveFrom + 20, groveFrom + groveLength - 20, groveHalf - 8, r.y);
  // Fallen trunks and buttress roots as cover: short walls to jump or go round.
  for (let i = 0; i < 7; i += 1) {
    const z = groveFrom + 30 + i * 34;
    const x = r.x + ((i * 17) % 40) - 20;
    box(18, 'log', x, r.y + 2.8, z, 14, 3, 4.8);
    decorate(18, 'root', x + 8, r.y, z, 1.6, 0.4, i % 2);
  }
  r.path(30);
  r.quicksand(60, { islands: 3 });
  r.gate({ rate: 0.22, hold: 0.5 });
  r.path(30);
  liftCrossing(r, { gapIn: J * 0.4, size: J * 0.6, width: 18, gapOut: J * 0.35, drop: 0.5, travel: 2.6, rate: 0.19 });
  r.path(40, { aim: 0 });

  scatterJungle(r, 18, undefined, { density: 1.5, fallen: 0.3, canopy: true, inset: 4 });
};

/**
 * 19 - CRUMBLING SHELF.
 *
 * Shelves along the gorge that give way in a wave, a row of falling rock, a
 * lift, and a second crumbling shelf.
 */
const crumblingShelf = (r: Route): void => {
  gorge(r);
  const J = r.reach;
  r.made('rock');

  r.path(40);
  const from = r.z;
  r.collapsing(J * 1.1, { sections: 5, rate: 0.18, hold: 0.62, spread: 0.45, width: 18, verge: 0 });
  r.path(J * 0.9);
  // Under the overhang, where the rock is coming down.
  const overhangFrom = r.z;
  r.crushers(110, { rows: 3, lanes: 2, period: 2.6 });
  enclose(r, overhangFrom, { kind: 'cave', headroom: 24, dark: 0.5 });
  liftCrossing(r, { gapIn: J * 0.4, size: J * 0.6, width: 18, gapOut: J * 0.35, drop: 0.5, travel: 2.6, rate: 0.2 });
  r.path(J * 0.9);
  r.collapsing(J * 1.1, { sections: 5, rate: 0.2, hold: 0.62, spread: 0.45, width: 18, verge: 0 });
  r.path(40, { aim: 0 });

  cliffWall(r, r.z - from, -1, 100);
  scatterJungle(r, 19, undefined, { density: 0.8, drop: 90 });
};

/**
 * 20 - CATARACT LEAP.
 *
 * A ford across the top of the cataract with logs racing over it, a raft
 * across the pool, a leap down onto a lower shelf beside the falls, and a
 * moving bridge of drift logs out.
 */
const cataractLeap = (r: Route): void => {
  r.over('rapids', 2);
  r.fall = 13;
  const J = r.reach;
  r.made('rock');

  r.path(40);
  const from = r.z;
  r.ford(140, { current: -14, logs: { count: 4, rate: 20, length: 12 } });
  r.path(30);
  r.ferry(J * 1.5, { size: J * 0.45, width: 18, rate: 0.15, kind: 'log' });
  r.path(J * 0.6);
  r.gap(J * 0.5, { rise: r.y - 14 });
  r.path(J * 0.9);
  movingBridge(r, 3, { gap: J * 0.3, size: J * 0.33, width: 16, travel: 12, rate: 0.2, kind: 'log' });
  r.path(40, { aim: 0 });

  for (let i = 0; i < 3; i += 1) {
    waterfall(r, r.x + (i % 2 === 0 ? 46 : -46), from + 60 + i * 120, r.y + 90, 90, { width: 30, scale: 4 });
  }
  scatterJungle(r, 20, undefined, { density: 1, palms: 0.3, drop: 90 });
};

export const buildAct4 = (): void => {
  defineStage(16, boulderRun);
  defineStage(17, cliffsideGale);
  defineStage(18, guardiansGrove);
  defineStage(19, crumblingShelf);
  defineStage(20, cataractLeap);
};
