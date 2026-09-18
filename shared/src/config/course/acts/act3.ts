import { box, mover, pit, widen } from '../emit.js';
import { defineStage } from '../stage.js';
import type { Route } from '../route.js';
import { carouselCrossing, liftCrossing, movingBridge } from './kit.js';
import { colonnade, enclose, guardians, scatterJungle, torchlight } from './scenery.js';

/**
 * ACT THREE - THE ANCIENT RUINS.
 *
 * Cut stone, grey and rectilinear where the jungle was green and organic,
 * over a void rather than a river. Twenty wide, and every hazard here is a
 * TRAP somebody built: darts from the walls, stones dropped from above,
 * statues whose arms sweep the hall, stones that turn over the void, and a
 * court whose floor gives way in a wave.
 *
 * Hazards now come two at a time. A sand trap sits in front of a gate; a
 * dart row runs into a crusher row; the turning stones are separated by a
 * rotating arm and a lift.
 */

const ruins = (r: Route): void => {
  r.over('void');
  r.fall = 13;
};

/**
 * 11 - TEMPLE APPROACH.
 *
 * A colonnaded causeway: darts fired across it, a stair, a row of crushers,
 * a sand trap before a stone gate, and a moving bridge of cut stone.
 */
const templeApproach = (r: Route): void => {
  ruins(r);
  const J = r.reach;
  r.made('stone');

  r.path(60, { aim: 6 });
  const hallFrom = r.z;
  r.darts(110, { count: 5, period: 2.2 });
  r.stairs(5, 0.8, { run: 8 });
  r.crushers(100, { rows: 3, lanes: 2, period: 3 });
  r.quicksand(55, { islands: 2 });
  r.gate({ rate: 0.24, hold: 0.5, kind: 'stone' });
  r.path(50);
  movingBridge(r, 2, { gap: J * 0.3, size: J * 0.35, width: 14, travel: 12, rate: 0.22, kind: 'stone' });
  r.path(40, { aim: 0 });

  colonnade(r, r.z - hallFrom, { spacing: 24, height: 34, broken: 0.3 });
  for (let i = 0; i < 3; i += 1) guardians(r, hallFrom + 30 + i * 120, 2.2, 20);
  scatterJungle(r, 11, undefined, { density: 0.7, ruins: 0.8, palms: 0.1, inset: 12 });
};

/**
 * 12 - HALL OF STATUES.
 *
 * A wide hall where the statues' arms sweep the floor, darts, a moving
 * bridge over a fallen section, and a floor of crushers.
 */
const hallOfStatues = (r: Route): void => {
  ruins(r);
  const J = r.reach;
  r.made('stone');

  r.path(40);
  const hallFrom = r.z;
  r.sweepers(150, { count: 3, rate: 0.9, width: 30 });
  r.darts(90, { count: 5, period: 2 });
  movingBridge(r, 3, { gap: J * 0.28, size: J * 0.33, width: 14, travel: 13, rate: 0.2, kind: 'stone' });
  r.path(40);
  r.crushers(100, { rows: 4, lanes: 3, period: 2.8 });
  r.path(40, { aim: 0 });

  colonnade(r, r.z - hallFrom, { spacing: 22, height: 40, broken: 0.15 });
  torchlight(r, r.z - hallFrom, 24);
  for (let i = 0; i < 3; i += 1) guardians(r, hallFrom + 25 + i * 50, 3.2, 22);
  scatterJungle(r, 12, undefined, { density: 0.6, ruins: 1, palms: 0, inset: 14 });
};

/**
 * 13 - TURNING STONES.
 *
 * Two chasms crossed on stones circling a pillar - wider than a jump, so the
 * stones are the only way - with a rotating arm and a lift between them.
 */
const turningStones = (r: Route): void => {
  ruins(r);
  const J = r.reach;
  r.made('ruin');

  r.path(40);
  const from = r.z;
  carouselCrossing(r, { across: J * 1.3, size: 18, radius: J * 0.26, rate: 0.8, offset: -5 });
  r.path(J * 0.8);
  r.sweepers(90, { count: 2, rate: 1.2 });
  liftCrossing(r, { gapIn: J * 0.4, size: J * 0.6, width: 18, gapOut: J * 0.35, drop: 0.5, travel: 2.6, rate: 0.2 });
  r.path(J * 0.8);
  carouselCrossing(r, { across: J * 1.3, size: 18, radius: J * 0.26, rate: -0.85, offset: 5, phase: 0.3 });
  r.path(40, { aim: 0, kind: 'stone' });

  colonnade(r, r.z - from, { spacing: 30, offset: 34, height: 46, broken: 0.2 });
  scatterJungle(r, 13, undefined, { density: 0.5, ruins: 1, palms: 0, inset: 20 });
};

/**
 * 14 - THE DART CORRIDOR.
 *
 * A walled passage: rows of darts, a row of crushers, a sand trap in front
 * of a stone gate, and more darts, faster.
 */
const dartCorridor = (r: Route): void => {
  ruins(r);
  r.made('stone');

  r.path(40);
  const from = r.z;
  r.darts(160, { count: 8, period: 1.8 });
  r.crushers(80, { rows: 2, lanes: 2, period: 2.6 });
  r.quicksand(50, { islands: 2 });
  r.gate({ rate: 0.26, hold: 0.5, kind: 'stone' });
  r.darts(120, { count: 6, period: 1.6 });
  enclose(r, from, { kind: 'stone', headroom: 20 });
  torchlight(r, r.z - from, 26);
  r.path(40, { aim: 0 });

  scatterJungle(r, 14, undefined, { density: 0.5, ruins: 0.9, palms: 0, inset: 16 });
};

/**
 * 15 - COLLAPSING COURT.
 *
 * A court whose floor gives way in a wave that travels diagonally across it:
 * every tile falls and comes back, and the wave's shape is the only
 * information. Then rotating arms, a gate, and a moving bridge out.
 */
const collapsingCourt = (r: Route): void => {
  ruins(r);
  const J = r.reach;
  r.made('ruin');

  r.path(40, { aim: 0 });
  const courtFrom = r.z;
  const lanes = 4;
  const rows = 22;
  const cell = 11;
  widen(courtFrom - 8, courtFrom + rows * cell + 30, 60);
  pit(15, 'void', -60, 60, courtFrom, courtFrom + rows * cell + 24, r.y - 24);
  const laneX = (lane: number): number => r.x + (lane - (lanes - 1) / 2) * cell;
  for (let row = 0; row < rows; row += 1) {
    for (let lane = 0; lane < lanes; lane += 1) {
      mover(15, 'ruin', laneX(lane), r.y, courtFrom + 12 + row * cell, cell - 1.2, cell - 1.2, 'collapse', {
        amount: 30,
        rate: 0.25,
        phase: (row * 0.09 + lane * 0.25) % 1,
        hold: 0.55,
      });
    }
    r.markLine(r.x, r.y, courtFrom + 12 + row * cell, (lanes * cell) / 2);
  }
  box(15, 'ruin', r.x, r.y, courtFrom + 4, lanes * cell, 8);
  r.gap(rows * cell + 20, { aim: r.x });
  r.path(J * 0.6);
  r.sweepers(90, { count: 2, rate: 1.3, width: 24 });
  r.gate({ rate: 0.24, hold: 0.5, kind: 'ruin' });
  r.path(30);
  movingBridge(r, 2, { gap: J * 0.28, size: J * 0.33, width: 14, travel: 13, rate: 0.21, kind: 'ruin' });
  r.path(40, { aim: 0, kind: 'stone' });

  colonnade(r, r.z - courtFrom, { spacing: 26, offset: 34, height: 34, broken: 0.4 });
  guardians(r, courtFrom + 115, 3, 34);
  torchlight(r, rows * cell + 20, 34);
  scatterJungle(r, 15, undefined, { density: 0.8, ruins: 0.7, palms: 0.1, inset: 14 });
};

export const buildAct3 = (): void => {
  defineStage(11, templeApproach);
  defineStage(12, hallOfStatues);
  defineStage(13, turningStones);
  defineStage(14, dartCorridor);
  defineStage(15, collapsingCourt);
};
