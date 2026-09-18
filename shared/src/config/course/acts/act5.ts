import { defineStage } from '../stage.js';
import type { Route } from '../route.js';
import { carouselCrossing, liftCrossing, movingBridge } from './kit.js';
import { colonnade, enclose, guardians, scatterCave, scatterJungle, torchlight } from './scenery.js';

/**
 * ACT FIVE - THE LOST TEMPLE.
 *
 * Gold-veined stone and black water, and the temple's own machinery. Floors
 * eighteen wide, built rather than cut, and every stage is a COMBINATION: a
 * climb into rolling stone and falling blocks, a flooded vault crossed on a
 * barge and a lift, a fire-pit way of moving planks and dart rows, the
 * orbiting carousels, and a cave that holds every trap in the act.
 */

const temple = (r: Route): void => {
  r.over('void');
  r.fall = 13;
};

/**
 * 21 - THE GREAT STAIR.
 *
 * A monumental approach: a slope with stone balls rolling down it, falling
 * blocks on the landing, a stair, a second slope of rolling stone, a gilded
 * gate, and a lift to the upper terrace.
 */
const greatStair = (r: Route): void => {
  temple(r);
  const J = r.reach;
  r.made('gilded');

  r.path(40);
  const from = r.z;
  r.boulderRun(220, { toward: true, drop: 18, count: 5, rate: 50, radius: 4.5, width: 24 });
  r.crushers(100, { rows: 3, lanes: 2, period: 2.6 });
  r.stairs(8, 0.8, { run: 9 });
  r.boulderRun(200, { toward: true, drop: 16, count: 4, rate: 55, radius: 4.5, width: 24 });
  r.gate({ rate: 0.24, hold: 0.5, kind: 'gilded' });
  r.path(30);
  liftCrossing(r, { gapIn: J * 0.4, size: J * 0.6, width: 18, gapOut: J * 0.35, drop: 0.5, travel: 2.6, rate: 0.2, kind: 'gilded' });
  r.path(40, { aim: 0 });

  torchlight(r, r.z - from, 30);
  guardians(r, r.z - 20, 4.5, 22);
  scatterJungle(r, 21, undefined, { density: 0.6, ruins: 0.8, palms: 0, inset: 12 });
};

/**
 * 22 - SUNKEN VAULT.
 *
 * A flooded vault: wade a channel with logs coming across it, cross the deep
 * water on a barge, ride a lift out of it, and cross a silt bank in front of
 * a gate.
 */
const sunkenVault = (r: Route): void => {
  r.over('water', 0.6);
  r.fall = 13;
  const J = r.reach;
  r.made('stone');

  r.path(40);
  const from = r.z;
  r.ford(150, { current: 12, logs: { count: 4, rate: 18, length: 10 } });
  r.path(30);
  r.ferry(J * 1.5, { size: J * 0.45, width: 18, rate: 0.15, kind: 'gilded' });
  r.path(J * 0.6);
  // The vault is UNDERGROUND: the channel and the deep water are under its roof.
  enclose(r, from, { kind: 'cave', headroom: 22, dark: 0.7 });
  liftCrossing(r, { gapIn: J * 0.4, size: J * 0.6, width: 18, gapOut: J * 0.35, drop: 0.5, travel: 2.6, rate: 0.21, kind: 'gilded' });
  r.path(J * 0.5);
  r.quicksand(70, { islands: 3 });
  r.gate({ rate: 0.22, hold: 0.55, kind: 'stone' });
  r.path(40, { aim: 0 });

  colonnade(r, r.z - from, { spacing: 28, height: 40, broken: 0.25 });
  scatterJungle(r, 22, undefined, { density: 0.6, ruins: 0.6, palms: 0.1, inset: 14 });
};

/**
 * 23 - THE EMBERWAY.
 *
 * A way across the temple's fire pits: a moving bridge of gilded slabs over
 * the fire, a dart row, a span that collapses into the flames, and a floor
 * of falling blocks.
 */
const emberway = (r: Route): void => {
  r.over('fire');
  r.fall = 8;
  const J = r.reach;
  r.made('stone');

  r.path(40);
  const from = r.z;
  movingBridge(r, 3, { gap: J * 0.28, size: J * 0.33, width: 16, travel: 12, rate: 0.2, kind: 'gilded' });
  r.path(J * 0.6);
  r.darts(120, { count: 6, period: 1.8 });
  r.collapsing(J * 1.2, { sections: 6, rate: 0.2, hold: 0.62, spread: 0.45, kind: 'gilded' });
  r.path(J * 0.6);
  r.crushers(120, { rows: 4, lanes: 2, period: 2.4 });
  r.path(40, { aim: 0 });

  torchlight(r, r.z - from, 26);
  scatterJungle(r, 23, undefined, { density: 0.4, ruins: 1, palms: 0, inset: 14 });
};

/**
 * 24 - CAROUSEL COURT.
 *
 * The temple's orbiting machinery: sweeping arms across a wide court, two
 * chasms crossed on turning stones, and a lift.
 */
const carouselCourt = (r: Route): void => {
  temple(r);
  const J = r.reach;
  r.made('gilded');

  r.path(40);
  const from = r.z;
  r.sweepers(120, { count: 2, rate: 1.2, width: 30 });
  carouselCrossing(r, { across: J * 1.3, size: 24, radius: J * 0.26, rate: 0.75, offset: -6, kind: 'gilded' });
  r.path(J * 0.8);
  carouselCrossing(r, { across: J * 1.3, size: 24, radius: J * 0.26, rate: -0.8, offset: 6, phase: 0.4, kind: 'gilded' });
  r.path(J * 0.6);
  liftCrossing(r, { gapIn: J * 0.4, size: J * 0.6, width: 18, gapOut: J * 0.35, drop: 0.5, travel: 2.6, rate: 0.2, kind: 'gilded' });
  r.path(40, { aim: 0 });

  colonnade(r, r.z - from, { spacing: 30, offset: 36, height: 50, broken: 0.1 });
  torchlight(r, r.z - from, 34);
  scatterJungle(r, 24, undefined, { density: 0.4, ruins: 1, palms: 0, inset: 20 });
};

/**
 * 25 - THE DEEP CAVERN.
 *
 * The cave the river cut under the temple, and every trap in the act inside
 * it: stalactites dropping, boulders rolling down the cave floor at the
 * rider, a silt bank, and a lift over a chasm in the dark.
 */
const deepCavern = (r: Route): void => {
  temple(r);
  const J = r.reach;
  r.made('cave');

  r.path(40);
  const from = r.z;
  r.crushers(120, { rows: 4, lanes: 2, period: 2.5 });
  r.boulderRun(200, { toward: true, drop: 12, count: 4, rate: 60, radius: 4 });
  r.quicksand(60, { islands: 3 });
  r.path(30);
  liftCrossing(r, { gapIn: J * 0.4, size: J * 0.6, width: 18, gapOut: J * 0.35, drop: 0.5, travel: 2.6, rate: 0.2, kind: 'cave' });
  r.path(J * 0.6);
  enclose(r, from, { kind: 'cave', headroom: 24 });
  scatterCave(r, 25, r.z - from);
  r.path(40, { aim: 0, kind: 'stone' });

  scatterJungle(r, 25, 60, { density: 0.8 });
};

export const buildAct5 = (): void => {
  defineStage(21, greatStair);
  defineStage(22, sunkenVault);
  defineStage(23, emberway);
  defineStage(24, carouselCourt);
  defineStage(25, deepCavern);
};
