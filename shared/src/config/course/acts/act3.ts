import { block, box, decorate, hazard, mover, pit, widen } from '../emit.js';
import { defineStage } from '../stage.js';
import type { Route } from '../route.js';
import { colonnade, guardians, scatterJungle, torchlight } from './scenery.js';

/**
 * ACT THREE - THE ANCIENT RUINS.
 *
 * Cut stone, and the act where the WORLD starts to move against the player:
 * darts, statues' arms, turning stones and a floor that gives way. The paths
 * are six and a half wide, the chains of landings overshoot, and every timed
 * thing has a readable rhythm and a stretch before it long enough to stop on.
 *
 * The old act laid a hundred and twenty units of straight causeway, a sixty-
 * wide plaza, and turning stones across gaps a jump could clear without them.
 * Every one of those was a place to hold W.
 */

/**
 * 11 - TEMPLE APPROACH.
 *
 * The causeway to the first temple, fallen into a chain of slabs; the great
 * stair; and a terrace crossed by dart traps. The terrace is a single lane
 * with the darts firing ACROSS it, so they are timed or jumped rather than
 * avoided by riding round them.
 */
const templeApproach = (r: Route): void => {
  r.made('stone').over('void');
  const J = r.reach;
  r.width = 7;

  r.path(24, { aim: 0, rails: true });
  const causewayFrom = r.z;
  r.hops(4, { gap: J * 0.45, land: J * 0.42, width: 7, jog: [0, 5, -5, 0], kind: 'stone', depth: 10 });
  r.gap(J * 0.42);
  colonnade(r, r.z - causewayFrom, { spacing: 20, offset: 13, height: 30, broken: 0.3 });
  for (let i = 0; i < 4; i += 1) guardians(r, causewayFrom + 18 + i * 40, 2, 16);

  r.path(16, { width: 8 });
  r.stairs(10, 3.2, { run: 7.5, width: 9 });

  // The dart terrace: one lane, the darts firing across it from the walls.
  r.path(20, { width: 7, rails: true });
  const terraceFrom = r.z;
  const terrace = 150;
  r.path(terrace, { width: 6.5, rails: true });
  for (let i = 0; i < 7; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    hazard(11, 'dart', {
      x: r.x + side * 10,
      y: r.y + 2.6,
      z: terraceFrom + 14 + i * 19,
      radius: 2.2,
      sweep: -side * 20,
      rate: 2.4,
      phase: (i * 0.23) % 1,
    });
    block(11, 'stone', r.x + side * 10 - 1.5, r.y, terraceFrom + 12 + i * 19, 3, 6, 4);
  }
  torchlight(r, terrace, 16);
  decorate(11, 'arch', r.x, r.y, r.z - 4, 3.4, 0, 0);

  r.path(36, { width: 9, aim: 0 });
  scatterJungle(r, 11, undefined, { density: 0.9, ruins: 0.8, inset: 12, palms: 0 });
};

/**
 * 12 - HALL OF STATUES.
 *
 * A processional of seven narrow sections, each guarded by a statue whose
 * stone arms reach across the walk, broken by gaps. The arms sweep from the
 * side, so there is always a moment when the near half of the walk is clear
 * and a moment when the far half is: read the arm, pick the half.
 */
const hallOfStatues = (r: Route): void => {
  r.made('stone').over('void');
  const J = r.reach;
  r.width = 6.5;

  r.path(30, { aim: 0, rails: true });
  const hallFrom = r.z;
  for (let i = 0; i < 7; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    // Long enough to stop on at this speed: the arms are a timing, and a
    // timing a player cannot stop short of is not one.
    const length = i % 2 === 0 ? J * 0.75 : J * 0.62;
    const z = r.z + length / 2;
    r.path(length, { width: 6.5, aim: r.x + (i % 3 === 0 ? 4 : -4), rails: true });
    decorate(12, 'statue', r.x + side * 14, r.y, z, 3.2, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
    for (let arm = 0; arm < 4; arm += 1) {
      hazard(12, 'spinner', {
        x: r.x + side * 14,
        y: r.y + 3,
        z,
        radius: 2.4,
        sweep: 5 + arm * 4.2,
        rate: side * (0.6 + i * 0.04),
        phase: i * 0.31,
      });
    }
    if (i < 6) r.gap(J * 0.42);
  }
  colonnade(r, r.z - hallFrom, { spacing: 20, offset: 22, height: 40, broken: 0.1 });
  torchlight(r, r.z - hallFrom, 20);

  r.path(36, { width: 9, aim: 0 });
  scatterJungle(r, 12, undefined, { density: 0.7, ruins: 1, inset: 24, palms: 0 });
};

/**
 * 13 - TURNING STONES.
 *
 * Four chasms, each crossed on two stones circling a pillar in the middle.
 * Every chasm is WIDER than a jump: the stones are the only way over. They
 * are sized and paced so one is always coming, and the ledge before each
 * chasm is long enough to stop and watch it.
 */
const turningStones = (r: Route): void => {
  r.made('ruin').over('void');
  const J = r.reach;
  r.width = 7;

  r.path(30, { aim: 0 });
  const vaultFrom = r.z;
  widen(vaultFrom - 8, vaultFrom + 700, 60);
  pit(13, 'void', -60, 60, vaultFrom, vaultFrom + 700, r.y - 26);

  const rates = [0.8, -0.85, 0.75, -0.8];
  for (let i = 0; i < 4; i += 1) {
    const across = J * 1.3;
    const hubX = r.x + (i % 2 === 0 ? -5 : 5);
    const hubZ = r.z + across / 2;
    const rate = rates[i] as number;
    r.carousel(hubZ, { x: hubX, y: r.y, size: 12, radius: J * 0.26, rate, phase: i * 0.25, kind: 'stone' });
    r.carousel(hubZ, { x: hubX, y: r.y, size: 11, radius: J * 0.26, rate, phase: (i * 0.25 + 0.5) % 1, kind: 'stone' });
    // The pillar is SCENERY, not a solid. A solid pillar top far below the
    // path is somewhere a falling rider can land and then never jump back up
    // from - stranded rather than dead.
    decorate(13, 'stele', hubX, r.y - 30, hubZ, 3.2, 0, 1);
    decorate(13, 'torch', hubX, r.y - 8, hubZ, 1.3, 0, 0);
    r.gap(across, { aim: r.x + (i % 2 === 0 ? 3 : -3) });
    // Each ledge is longer than it takes to stop from full speed, so the
    // player can arrive, stop, and watch the stones come round.
    r.path(i < 3 ? J * 0.82 : 30, { width: 7, kind: 'ruin' });
  }
  colonnade(r, r.z - vaultFrom, { spacing: 30, offset: 40, height: 46, broken: 0.2 });

  r.path(34, { width: 9, aim: 0, kind: 'stone' });
  scatterJungle(r, 13, undefined, { density: 0.5, ruins: 1, inset: 44, palms: 0 });
};

/**
 * 14 - THE DART CORRIDOR.
 *
 * A roofed corridor six wide, darts firing across it from both walls, stones
 * dropping from the roof, and three places where the floor has fallen through.
 * The roof is high enough to jump under, and the gaps are where a dart and a
 * jump have to be timed together.
 */
const dartCorridor = (r: Route): void => {
  r.made('stone').over('void');
  const J = r.reach;
  r.width = 6;

  r.path(34, { aim: 0, rails: true });
  const corridorFrom = r.z;
  const piece = J * 0.5;
  const pieces = 5;
  for (let i = 0; i < pieces; i += 1) {
    r.path(piece, { width: 6, aim: 0 });
    if (i < pieces - 1) r.gap(J * 0.4);
  }
  const length = r.z - corridorFrom;

  // Walls and roof down the whole run, gaps included: a corridor that stopped
  // at every hole would be three short corridors.
  const segments = Math.round(length / 14);
  for (let i = 0; i < segments; i += 1) {
    const z = corridorFrom + (length * i) / segments;
    for (const side of [-1, 1]) {
      block(14, 'stone', r.x + side * 5 - (side < 0 ? 8 : 0), r.y - 18, z, 8, 38, length / segments + 0.4);
    }
    block(14, 'stone', r.x - 13, r.y + 20, z, 26, 5, length / segments + 0.4);
  }

  for (let i = 0; i < 16; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    hazard(14, 'dart', {
      x: r.x + side * 5,
      y: r.y + 2.4,
      z: corridorFrom + 10 + i * (length - 20) / 15,
      radius: 2,
      sweep: -side * 10,
      rate: 2.1,
      phase: (i * 0.29) % 1,
    });
  }
  for (let i = 0; i < 5; i += 1) {
    hazard(14, 'faller', {
      x: r.x,
      y: r.y,
      z: corridorFrom + piece * 0.5 + i * (piece + J * 0.4),
      radius: 4.2,
      sweep: 15,
      rate: 2.9,
      phase: (i * 0.37) % 1,
    });
  }
  torchlight(r, length, 26);

  r.path(36, { width: 9, aim: 0 });
  scatterJungle(r, 14, undefined, { density: 0.6, ruins: 0.9, inset: 18, palms: 0 });
};

/**
 * 15 - COLLAPSING COURT.
 *
 * A narrow court whose floor gives way in a wave that travels diagonally
 * across it. There is no safe tile: every tile falls and comes back, and the
 * wave's shape is the only information. Three jumps long, with each tile up
 * a little over half the time, so a player who lands without reading the
 * wave lands in it. The old court kept every third tile
 * solid, which made it a checkerboard a player could hop across without
 * reading anything.
 */
const collapsingCourt = (r: Route): void => {
  r.made('ruin').over('void');
  r.width = 8;

  r.path(34, { aim: 0 });
  const courtFrom = r.z;
  const lanes = 3;
  const rows = 24;
  const cell = 12;
  widen(courtFrom - 8, courtFrom + rows * cell + 30, 50);
  pit(15, 'void', -50, 50, courtFrom, courtFrom + rows * cell + 24, r.y - 24);

  const laneX = (lane: number): number => r.x + (lane - (lanes - 1) / 2) * cell;
  for (let row = 0; row < rows; row += 1) {
    for (let lane = 0; lane < lanes; lane += 1) {
      mover(15, 'ruin', laneX(lane), r.y, courtFrom + 12 + row * cell, cell - 1.2, cell - 1.2, 'collapse', {
        amount: 30,
        rate: 0.25,
        phase: (row * 0.09 + lane * 0.33) % 1,
        hold: 0.55,
      });
    }
  }
  box(15, 'ruin', r.x, r.y, courtFrom + 4, lanes * cell, 8);
  r.gap(rows * cell + 20, { aim: r.x });

  colonnade(r, rows * cell + 20, { spacing: 26, offset: 28, height: 34, broken: 0.4 });
  guardians(r, courtFrom + 115, 3, 32);
  torchlight(r, rows * cell + 20, 34);

  r.path(40, { width: 9, aim: 0, kind: 'stone' });
  scatterJungle(r, 15, undefined, { density: 1, ruins: 0.7, inset: 30, palms: 0.1 });
};

export const buildAct3 = (): void => {
  defineStage(11, templeApproach);
  defineStage(12, hallOfStatues);
  defineStage(13, turningStones);
  defineStage(14, dartCorridor);
  defineStage(15, collapsingCourt);
};
