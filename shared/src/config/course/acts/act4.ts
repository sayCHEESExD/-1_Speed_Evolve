import { block, decorate, guardianZone, hazard, pit, surface, widen } from '../emit.js';
import { defineStage } from '../stage.js';
import type { Route } from '../route.js';
import { abandonedCamp, cliffWall, scatterJungle, waterfall } from './scenery.js';

/**
 * ACT FOUR - THE DANGER ZONE.
 *
 * Boulders, gales, the first guardian, crumbling shelves and the cataract:
 * the act where hazards COMBINE. A chain of landings with wind across it, a
 * collapsing run with rocks falling on it, a guardian arena with trenches
 * across it. The paths are six and a half wide and the chains ask for half a
 * jump across and a third of a jump to land on.
 */

/**
 * 16 - BOULDER RUN.
 *
 * A long descending ramp with boulders rolling down it, alcoves cut into the
 * cliff at every bend, and the broken foot of the ramp as a chain of short
 * landings. The ramp is thirteen wide - narrower than a boulder - so a boulder
 * is dodged INTO an alcove or not at all.
 */
const boulderRun = (r: Route): void => {
  r.made('rock').over('void');
  const J = r.reach;
  r.width = 13;

  r.path(36, { aim: 0 });
  const rampFrom = r.z;
  const rampTop = r.y;
  const rampLength = 300;
  const rampDrop = 88;
  widen(rampFrom - 8, rampFrom + rampLength + 20, 56);

  const bends = [22, -22, 18, -14];
  for (let i = 0; i < bends.length; i += 1) {
    const to = bends[i] as number;
    r.path(rampLength / bends.length, {
      width: 13,
      aim: to,
      rise: rampTop - (rampDrop * (i + 1)) / bends.length,
      rails: true,
    });
    // The alcove, on the OUTSIDE of the bend where a boulder does not go.
    const alcoveX = to > 0 ? to + 13 : to - 13;
    block(16, 'rock', alcoveX - 7, r.y - 3, r.z - 26, 14, 3, 20);
    decorate(16, 'torch', alcoveX, r.y, r.z - 16, 1.1, 0, 0);
  }

  for (let i = 0; i < 5; i += 1) {
    hazard(16, 'boulder', {
      x: -14 + (i % 3) * 14,
      y: rampTop,
      z: rampFrom,
      radius: 8.5,
      rate: 74,
      phase: i / 5,
      fromZ: rampFrom - 30,
      toZ: rampFrom + rampLength + 10,
      fromY: rampTop + 4,
      toY: rampTop - rampDrop + 4,
      driftX: i % 2 === 0 ? 20 : -24,
    });
  }

  r.path(30, { width: 8, aim: 0 });
  r.hops(4, { gap: J * 0.5, land: J * 0.35, width: 6.5, jog: 7, kind: 'rock', depth: 8 });
  r.gap(J * 0.45);
  r.path(36, { width: 9, aim: 0 });

  cliffWall(r, 120, 1, 90);
  abandonedCamp(r, rampFrom + 30, -1);
  scatterJungle(r, 16, undefined, { density: 1.3, inset: 20, reach: 40 });
};

/**
 * 17 - CLIFFSIDE GALE.
 *
 * Ledges on a cliff with a gale blowing across them, broken into sections a
 * real jump apart that step up and down. The wind pushes a mount sideways on
 * the ledge and the ledge is six and a half wide: the player leans into it or
 * leaves the cliff.
 */
const cliffsideGale = (r: Route): void => {
  r.made('rock').over('void');
  const J = r.reach;
  r.width = 6.5;

  r.path(34, { aim: 8, rise: r.y + 6 });
  const ledgeFrom = r.z;
  const sections = 7;
  for (let i = 0; i < sections; i += 1) {
    const blow = i % 2 === 0 ? 1 : -1;
    const from = r.z;
    r.path(J * 0.44, { width: 6.5, aim: r.x + blow * 5, rails: true });
    surface(17, r.x - 40, r.x + 40, from, r.z, 0.82, blow * 15, 0);
    if (i < sections - 1) r.gap(J * 0.5, { aim: r.x - blow * 3, rise: r.y + (i % 3 === 0 ? 3 : -2) });
  }
  cliffWall(r, r.z - ledgeFrom, -1, 110);
  pit(17, 'void', r.x - 90, r.x + 90, ledgeFrom, r.z, r.y - 40);
  for (let i = 0; i < 12; i += 1) {
    decorate(17, 'cloud', r.x + r.wobble(70), r.y + 4 + r.next() * 20, ledgeFrom + r.next() * (r.z - ledgeFrom), 1.4 + r.next(), 0, i % 3);
  }

  r.path(40, { width: 9, aim: 0 });
  scatterJungle(r, 17, undefined, { density: 0.8, inset: 16, palms: 0.1 });
};

/**
 * 18 - THE GUARDIAN'S GROVE.
 *
 * The first guardian, in a grove sixty wide rather than a hundred and twenty-
 * four, with fallen masonry to put between it and the player and trenches
 * across the floor. Being chased while jumping is the lesson: the trenches
 * are a real jump each, so running flat out from the guardian is not a plan.
 */
const guardiansGrove = (r: Route): void => {
  r.made('dirt').over('void');
  const J = r.reach;
  r.width = 8;

  r.path(34, { aim: 0 });
  const groveFrom = r.z;
  const groveHalf = 30;
  const pieces = [72, 70, 70, 66];
  const trenches = [J * 0.4, J * 0.45, J * 0.5];
  const groveLength = pieces.reduce((a, b) => a + b, 0) + trenches.reduce((a, b) => a + b, 0);
  widen(groveFrom - 10, groveFrom + groveLength + 14, groveHalf + 16);
  pieces.forEach((length, i) => {
    r.plaza(length, { halfWidth: groveHalf, kind: 'dirt', aim: 0 });
    const trench = trenches[i];
    if (trench !== undefined) r.gap(trench);
  });
  guardianZone(18, groveFrom + 20, groveFrom + groveLength - 20, groveHalf - 8, r.y);

  // Masonry cover on the pieces of floor, three a row, offset row to row.
  let z = groveFrom;
  pieces.forEach((length, i) => {
    for (let row = 0; row < 2; row += 1) {
      for (let k = 0; k < 3; k += 1) {
        const x = -groveHalf + 12 + k * 18 + ((row + i) % 2) * 8;
        const zz = z + 18 + row * (length - 36);
        block(18, 'ruin', x - 6, r.y, zz - 3, 12, 8, 6);
        decorate(18, 'vine', x, r.y + 8, zz, 1.2, 0, row % 3);
        if (k % 2 === 0) decorate(18, 'root', x + 9, r.y, zz + 7, 1.6, r.next() * 6.28, row % 2);
      }
    }
    z += length + (trenches[i] ?? 0);
  });
  decorate(18, 'statue', 0, r.y, groveFrom + 30, 5.2, 0, 0);
  decorate(18, 'arch', 0, r.y, groveFrom + groveLength - 10, 3.2, 0, 0);

  r.path(40, { width: 9, aim: 0 });
  scatterJungle(r, 18, undefined, { density: 1.9, canopy: true, inset: 36, reach: 30 });
};

/**
 * 19 - CRUMBLING SHELF.
 *
 * A ravine crossed on shelves that give way, rocks falling on them, and a
 * pair of short landings between each shelf and the next. The collapse
 * travels along each shelf, so the shelf is ridden at the speed the collapse
 * sets - and the landings after it overshoot at that speed.
 */
const crumblingShelf = (r: Route): void => {
  r.made('rock').over('void');
  const J = r.reach;
  r.width = 6.5;

  r.path(34, { aim: -8 });
  const ravineFrom = r.z;
  widen(ravineFrom - 8, ravineFrom + 800, 54);
  pit(19, 'void', -54, 54, ravineFrom, ravineFrom + 800, r.y - 34);

  for (let i = 0; i < 4; i += 1) {
    const to = i % 2 === 0 ? 10 : -10;
    // Room to stop before every shelf: it gives way in a wave over half its
    // cycle and stands whole for the other half, which is the window.
    r.path(J * 0.9, { width: 7, kind: 'rock', aim: r.x + (to > 0 ? -3 : 3) });
    r.collapsing(J * 0.6, { sections: 4, rate: 0.17, width: 6.5, aim: to, hold: 0.8, spread: 0.5 });
    for (let j = 0; j < 2; j += 1) {
      hazard(19, 'faller', {
        x: r.x,
        y: r.y,
        z: r.z - J * 0.45 + j * J * 0.25,
        radius: 4.6,
        sweep: 36,
        rate: 3.1,
        phase: (i * 0.31 + j * 0.5) % 1,
      });
    }
    r.path(12, { width: 7, kind: 'rock' });
    if (i < 3) {
      r.hops(2, { gap: J * 0.45, land: J * 0.36, width: 6.5, jog: 6, kind: 'rock', depth: 8 });
      r.gap(J * 0.42);
    }
  }
  cliffWall(r, 280, 1, 120);
  waterfall(r, 40, ravineFrom + 150, r.y + 30, 62, { width: 18, scale: 3 });

  r.path(40, { width: 9, aim: 0 });
  scatterJungle(r, 19, undefined, { density: 0.9, inset: 22 });
};

/**
 * 20 - CATARACT LEAP.
 *
 * Three tiers of the cataract, each crossed on rocks in the rapids and then
 * dropped off onto the next. The rocks are a third of a jump long, the gaps
 * half a jump, and the falls come down BESIDE the line of rocks - close
 * enough that a jump aimed carelessly goes through one.
 */
const cataractLeap = (r: Route): void => {
  r.made('rock').over('rapids', 3.4);
  const J = r.reach;
  r.width = 7;

  r.path(36, { aim: 0 });
  const fallsFrom = r.z;
  widen(fallsFrom - 8, fallsFrom + 900, 66);
  for (let tier = 0; tier < 3; tier += 1) {
    const from = r.z;
    const lineX = r.x;
    const side = tier % 2 === 0 ? 1 : -1;
    r.hops(4, { gap: J * 0.5, land: J * 0.3, width: 7, jog: 7, kind: 'rock', depth: 6 });
    r.slippery(from, r.z, 0.6);
    pit(20, 'rapids', -66, 66, from - 4, r.z + 4, r.y - 7, 3.4);
    // Lethal falls beside the rocks, on alternating sides of the line.
    for (let k = 0; k < 2; k += 1) {
      const z = from + J * (0.25 + k * 1.6);
      waterfall(r, lineX + side * (k % 2 === 0 ? 13 : -13), z, r.y + 46, 46, { lethal: true, width: 9, scale: 2.4 });
    }
    waterfall(r, lineX - side * 30, from + J, r.y + 46, 46, { width: 20, scale: 2.4 });
    // Dropping fourteen to the next tier carries a mount a long way forward
    // even stepping off the edge, so the landing below is most of a jump long.
    r.gap(J * 0.35, { rise: r.y - 14 });
    r.path(J * 0.9, { width: 8, kind: 'rock', aim: r.x - side * 4 });
  }

  r.path(40, { width: 9, aim: 0 });
  scatterJungle(r, 20, undefined, { density: 1.2, palms: 0.4, inset: 18 });
};

export const buildAct4 = (): void => {
  defineStage(16, boulderRun);
  defineStage(17, cliffsideGale);
  defineStage(18, guardiansGrove);
  defineStage(19, crumblingShelf);
  defineStage(20, cataractLeap);
};
