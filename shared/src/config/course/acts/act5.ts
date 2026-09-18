import { block, decorate, hazard, mover, pit, widen } from '../emit.js';
import { defineStage } from '../stage.js';
import type { Route } from '../route.js';
import { colonnade, guardians, scatterCave, scatterJungle, torchlight, waterfall } from './scenery.js';

/**
 * ACT FIVE - THE LOST TEMPLE.
 *
 * The great stair, the flooded vault, the fire hall, the carousel court and
 * the cavern. Six wide, and every crossing is WIDER than a jump unless it is
 * a chain: lifts, sliding platforms and orbiting stones are the only way over,
 * so they are waited for, not ridden past. Every one has a ledge before it
 * longer than it takes to stop from full speed.
 *
 * The old act's crossings were twenty-six and forty-six units wide at a level
 * where a jump carries a hundred and twenty. The moving platforms in them were
 * scenery; the player jumped straight over.
 */

/** Room to stop before a timed crossing at this stage's speed. */
const runIn = (r: Route): number => r.reach * 0.92;

/**
 * 21 - THE GREAT STAIR.
 *
 * Four flights up the temple's face. Each landing is swept by stone arms,
 * and between the flights the stair has fallen away: a lift rising and
 * falling in a gap no jump clears is the only way to the next flight.
 */
const greatStair = (r: Route): void => {
  r.made('gilded').over('void');
  const J = r.reach;
  r.width = 7;

  r.path(36, { aim: 0 });
  guardians(r, r.z - 20, 4.5, 20);
  const stairFrom = r.z;
  widen(stairFrom - 10, stairFrom + 1200, 56);

  for (let i = 0; i < 4; i += 1) {
    r.stairs(9, 3.4, { run: 8, width: 8 });
    const landingZ = r.z + J * 0.45;
    r.path(J * 0.9, { width: 8, aim: i % 2 === 0 ? 6 : -6 });
    for (let arm = 0; arm < 5; arm += 1) {
      hazard(21, 'spinner', {
        x: r.x,
        y: r.y + 2.8,
        z: landingZ,
        radius: 2.6,
        sweep: 5 + arm * 4,
        rate: i % 2 === 0 ? 0.6 : -0.55,
        phase: i * 0.27,
      });
    }
    if (i < 3) {
      r.path(J * 0.5, { width: 7 });
      const across = J * 1.2;
      const from = r.z;
      r.gap(across);
      // A third of a jump square: at this speed anything smaller is under
      // the mount for a tenth of a second.
      r.lift(from + across / 2, { x: r.x, size: J * 0.3, width: 14, travel: 7, rate: 0.2, phase: i * 0.3, kind: 'gilded' });
      // Somewhere to come down at speed before the next flight starts.
      r.path(J * 0.6, { width: 8 });
    }
  }
  colonnade(r, r.z - stairFrom, { spacing: 24, offset: 22, height: 44, broken: 0.12 });
  torchlight(r, r.z - stairFrom, 26);

  r.path(40, { width: 9, aim: 0 });
  scatterJungle(r, 21, undefined, { density: 0.6, ruins: 1, inset: 30, palms: 0 });
};

/**
 * 22 - SUNKEN VAULT.
 *
 * Down through the temple floor into a flooded vault: tunnels six wide, and
 * between them a stone slab sliding across the water in a gap no jump clears.
 * The tunnels are roofed, which is what makes the timing honest - there is no
 * jumping high and hoping.
 */
const sunkenVault = (r: Route): void => {
  r.made('stone').over('void');
  const J = r.reach;
  r.width = 8;

  r.path(30, { aim: 0 });
  const shaftTop = r.y;
  r.tunnel(40, { width: 8, aim: 8, rise: shaftTop - 16, headroom: 15 });
  r.tunnel(40, { width: 8, aim: -8, rise: shaftTop - 32, headroom: 15 });

  const vaultFrom = r.z;
  widen(vaultFrom - 6, vaultFrom + 1200, 48);
  for (let i = 0; i < 4; i += 1) {
    const to = i % 2 === 0 ? 8 : -8;
    r.tunnel(runIn(r), { width: 6, aim: to, headroom: 14, kind: 'stone' });
    const across = J * 1.15;
    const from = r.z;
    r.gap(across);
    r.shuttle(from + across / 2, { x: r.x, width: 9, length: J * 0.34, travel: 14, rate: 0.19, phase: i * 0.3, kind: 'stone' });
    pit(22, 'water', r.x - 40, r.x + 40, from - 2, r.z + 2, r.y - 5, 0.2);
    for (let p = 0; p < 3; p += 1) {
      block(22, 'stone', r.x + (p - 1) * 16 - 2.5, r.y - 16, from + (across * (p + 0.5)) / 3, 5, 12, 5);
    }
  }
  torchlight(r, r.z - vaultFrom, 24);
  r.tunnel(44, { width: 9, aim: 0, rise: shaftTop - 16, headroom: 16 });
  r.path(40, { width: 9, rise: shaftTop, kind: 'gilded' });

  scatterCave(r, 22);
};

/**
 * 23 - THE EMBERWAY.
 *
 * A hall over fire, crossed five times on pairs of slabs sliding across each
 * gap from opposite sides, with a censer swinging over the middle. A gap is a
 * jump and a fifth: slab, then slab, then the far ledge, and the censer
 * decides WHEN.
 */
const emberway = (r: Route): void => {
  r.made('gilded').over('fire');
  const J = r.reach;
  r.width = 7;

  r.path(34, { aim: 0 });
  const hallFrom = r.z;
  widen(hallFrom - 8, hallFrom + 1400, 46);

  for (let i = 0; i < 5; i += 1) {
    r.path(runIn(r), { width: 7, kind: 'gilded', aim: i % 2 === 0 ? -6 : 6 });
    const across = J * 1.2;
    const from = r.z;
    const slab = J * 0.28;
    const hop = (across - slab * 2) / 3;
    r.gap(across);
    pit(23, 'fire', r.x - 46, r.x + 46, from - 2, r.z + 2, r.y - 7);
    for (const [k, dir] of [
      [0, 1],
      [1, -1],
    ] as const) {
      mover(
        23,
        'gilded',
        r.x,
        r.y,
        from + hop * (k + 1) + slab * (k + 0.5),
        9,
        slab,
        'shuttle',
        { axis: 'x', amount: 13, rate: 0.24 * dir, phase: i * 0.2 },
      );
    }
    hazard(23, 'swing', {
      x: r.x,
      y: r.y + 4,
      z: from + across / 2,
      radius: 3.4,
      sweep: 13,
      rate: 1.2,
      phase: i * 0.33,
    });
    decorate(23, 'torch', r.x + 18, r.y, from + across / 2, 1.6, 0, 0);
    decorate(23, 'torch', r.x - 18, r.y, from + across / 2, 1.6, 0, 0);
  }
  colonnade(r, r.z - hallFrom, { spacing: 22, offset: 28, height: 38, broken: 0.05 });

  r.path(38, { width: 9, aim: 0 });
  scatterJungle(r, 23, undefined, { density: 0.5, ruins: 0.9, inset: 34, palms: 0 });
};

/**
 * 24 - CAROUSEL COURT.
 *
 * A hall with no floor at all, crossed on stones orbiting four pillars in
 * three rings each, with censers swinging between the rings. The pillars'
 * own tops are out of reach now: in the old court they stood level with the
 * path, eight units square, and made a chain of free landings straight down
 * the middle.
 */
const carouselCourt = (r: Route): void => {
  r.made('gilded').over('void');
  const J = r.reach;
  r.width = 8;

  r.path(34, { aim: 0 });
  r.path(runIn(r) - 34, { width: 7 });
  const hallFrom = r.z;
  const hubs = 4;
  const pitch = J * 0.5;
  const hallLength = pitch * (hubs + 1);
  widen(hallFrom - 10, hallFrom + hallLength + 14, 74);
  pit(24, 'void', -60, 60, hallFrom, hallFrom + hallLength, r.y - 30);

  for (let hub = 0; hub < hubs; hub += 1) {
    const hubZ = hallFrom + pitch * (hub + 1);
    const dir = hub % 2 === 0 ? 1 : -1;
    // Two rings a pillar, the stones large and slow: this is a court of
    // jumps between moving landings, and a third ring with censers between
    // made it a court of guesses.
    for (let arm = 0; arm < 2; arm += 1) {
      for (let k = 0; k < 2; k += 1) {
        mover(24, 'gilded', r.x, r.y, hubZ, 16, 16, 'orbit', {
          amount: 13 + arm * 14,
          rate: dir * (0.42 - arm * 0.1),
          phase: (arm * 0.2 + k * 0.5 + hub * 0.11) % 1,
        });
      }
    }
    // The pillar is SCENERY, not a solid. A solid pillar top far below the
    // path is somewhere a falling rider can land and then never jump back up
    // from - stranded rather than dead.
    decorate(24, 'stele', r.x, r.y - 30, hubZ, 3.4, 0, 1);
    decorate(24, 'torch', r.x, r.y - 14, hubZ, 1.6, 0, 0);
  }
  for (let i = 0; i < 3; i += 1) {
    // Over a pillar, where the inner ring passes under it.
    hazard(24, 'swing', {
      x: r.x,
      y: r.y + 5,
      z: hallFrom + pitch * (i + 1.5),
      radius: 3.2,
      sweep: 12,
      rate: 0.9,
      phase: i * 0.4,
    });
  }
  r.gap(hallLength, { aim: r.x });
  colonnade(r, hallLength, { spacing: 26, offset: 56, height: 50, broken: 0.08 });
  guardians(r, hallFrom + hallLength - 10, 4, 50);

  r.path(40, { width: 9, aim: 0 });
  scatterJungle(r, 24, undefined, { density: 0.4, ruins: 0.9, inset: 60, palms: 0 });
};

/**
 * 25 - THE DEEP CAVERN.
 *
 * The river's own cave, underneath the temple: roofed passages six wide that
 * weave, stepping stones across the underground river, and rock falling from
 * the roof on the far bank of every crossing.
 */
const deepCavern = (r: Route): void => {
  r.made('cave').over('void');
  const J = r.reach;
  r.width = 8;

  r.path(28, { aim: 0, kind: 'stone' });
  const caveFrom = r.z;
  const mouth = r.y;
  r.tunnel(56, { width: 8, aim: -8, rise: mouth - 14, headroom: 16 });
  pit(25, 'rapids', -34, 34, caveFrom, r.z, r.y - 8, 2.2);

  for (let i = 0; i < 4; i += 1) {
    const to = i % 2 === 0 ? 8 : -8;
    const sectionFrom = r.z;
    r.tunnel(52, { width: 6, aim: to, rise: r.y - 4, headroom: 14 });
    // Gap plus twice the landing is comfortably over a jump, so there is a
    // real takeoff window; gap plus one landing is well under, so there is
    // an overshoot to avoid.
    r.hops(3, { gap: J * 0.42, land: J * 0.36, width: 6, jog: 5, kind: 'cave', depth: 5 });
    r.gap(J * 0.42);
    r.tunnel(J * 0.5, { width: 7, headroom: 14 });
    hazard(25, 'faller', {
      x: r.x,
      y: r.y,
      z: r.z - J * 0.25,
      radius: 4.6,
      sweep: 11,
      rate: 2.7,
      phase: (i * 0.29) % 1,
    });
    for (let j = 0; j < 3; j += 1) {
      decorate(25, 'mushroom', r.x + r.wobble(6), r.y, r.z - 40 + j * 14, 1 + r.next(), 0, j % 2);
    }
    pit(25, 'rapids', -34, 34, sectionFrom, r.z, r.y - 8, 2.2);
  }

  waterfall(r, r.x + 12, r.z + 18, r.y + 34, 36, { width: 12, scale: 2 });
  r.tunnel(46, { width: 9, aim: 0, rise: r.y + 12, headroom: 20 });
  r.made('rock');
  r.path(40, { width: 9, rise: r.y + 8 });

  scatterCave(r, 25);
};

export const buildAct5 = (): void => {
  defineStage(21, greatStair);
  defineStage(22, sunkenVault);
  defineStage(23, emberway);
  defineStage(24, carouselCourt);
  defineStage(25, deepCavern);
};

