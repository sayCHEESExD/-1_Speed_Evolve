import { block, decorate, guardianZone, hazard, mover, pit, surface, widen } from '../emit.js';
import { defineStage } from '../stage.js';
import type { Route } from '../route.js';
import { cliffWall, colonnade, guardians, scatterJungle, torchlight, waterfall } from './scenery.js';

/**
 * ACT SIX - THE FINAL EXPEDITION.
 *
 * Everything the course has taught, at a scale nothing before it has used. The
 * five stages here are the five biggest structures in the world, and each of
 * them combines mechanics that the earlier acts were careful to introduce one
 * at a time.
 *
 * They are also the fastest. A player arriving here is moving several times as
 * quickly as one leaving the camp, so the geometry is authored around that:
 * long sight lines, generous run-ups, and gaps that are a stride at the
 * intended level and an impossibility below it.
 */

/**
 * 26 - VALLEY OF ROOTS.
 *
 * A valley spanned by the roots of trees that grew through the temple, and the
 * only stage in the game with a SPLIT PATH: the two routes separate for two
 * hundred units and rejoin, one high and hazardous, one low and narrow.
 *
 * Both are the same length. The choice is a matter of which risk the player
 * prefers, which is a thing this course has never asked before and asks here
 * because by now the player has a preference.
 */
const valleyOfRoots = (r: Route): void => {
  r.made('log').over('void');
  r.width = 16;

  r.path(40, { aim: 0, kind: 'rock' });

  const forkFrom = r.z;
  const forkLength = 220;
  widen(forkFrom - 10, forkFrom + forkLength + 20, 70);
  pit(26, 'void', -70, 70, forkFrom, forkFrom + forkLength + 20, r.y - 36);

  // The HIGH road: a broad root arching up over the valley, with rocks coming
  // off the canopy onto it.
  {
    const high = r.y + 26;
    const steps = 10;
    for (let i = 0; i < steps; i += 1) {
      const t = (i + 0.5) / steps;
      const lift = Math.sin(t * Math.PI) * 26;
      block(26, 'log', -34 - 8, r.y + lift, forkFrom + (forkLength * i) / steps, 16, 3, forkLength / steps + 0.4);
    }
    for (let i = 0; i < 4; i += 1) {
      hazard(26, 'faller', {
        x: -34,
        y: r.y + 18,
        z: forkFrom + 34 + i * 48,
        radius: 5.4,
        sweep: 36,
        rate: 2.9,
        phase: (i * 0.27) % 1,
      });
    }
    void high;
  }

  // The LOW road: a narrow root running level, with a swinging vine-log over
  // its middle and no room to dodge.
  {
    const steps = 10;
    for (let i = 0; i < steps; i += 1) {
      block(26, 'log', 30 - 5, r.y - 4, forkFrom + (forkLength * i) / steps, 10, 3, forkLength / steps + 0.4);
    }
    for (let i = 0; i < 3; i += 1) {
      hazard(26, 'swing', {
        x: 34,
        y: r.y - 1,
        z: forkFrom + 54 + i * 60,
        radius: 3.8,
        sweep: 17,
        rate: 1.5,
        phase: i * 0.4,
      });
    }
  }

  // The fork and the rejoin, both wide enough to choose on.
  block(26, 'rock', -46, r.y - 3, forkFrom - 14, 92, 3, 16);
  block(26, 'rock', -46, r.y - 3, forkFrom + forkLength - 2, 92, 3, 18);
  r.gap(forkLength + 20, { aim: 0 });

  // The trees the roots belong to, standing in the valley.
  for (let i = 0; i < 7; i += 1) {
    decorate(26, 'tree', -60 + i * 20, r.y - 34, forkFrom + 20 + i * 28, 6 + r.next() * 3, r.next() * 6.28, i % 3);
  }
  r.made('rock');
  r.path(44, { width: 24, aim: 0 });
  scatterJungle(r, 26, undefined, { density: 1.6, canopy: true, inset: 76, reach: 30 });
};

/**
 * 27 - THUNDER FALLS.
 *
 * The largest waterfall in the world, and the route goes across its face. Wet
 * stone, a crosswind of spray, four lethal curtains, and rocks standing in the
 * white water between them.
 *
 * Act two's waterfall ledge asked the player to time one fall on a ledge they
 * could stand still on. This asks for four, on stones, at speed, in a wind.
 */
const thunderFalls = (r: Route): void => {
  r.made('rock').over('rapids', 4);
  r.width = 15;

  r.path(36, { aim: -18, rise: r.y + 12 });

  const fallsFrom = r.z;
  widen(fallsFrom - 10, fallsFrom + 340, 74);

  for (let i = 0; i < 4; i += 1) {
    const from = r.z;
    // A shelf to launch from.
    r.path(30, { width: 16, kind: 'rock', aim: i % 2 === 0 ? 22 : -22, rise: r.y - 5, rails: true });
    // Stones in the current.
    r.stones(3, { size: 10, gap: 16 + i * 3, weave: 15, kind: 'rock' });
    r.slippery(from, r.z, 0.55, i % 2 === 0 ? 11 : -11);
    surface(27, r.x - 60, r.x + 60, from, r.z, 0.55, i % 2 === 0 ? 11 : -11, 0);

    // The curtain, across the line the player has to take.
    waterfall(r, r.x, r.z - 22, r.y + 62, 62, { lethal: true, width: 19, scale: 3.2 });
    waterfall(r, r.x + 34, r.z - 6, r.y + 62, 62, { width: 26, scale: 3.6 });

    // The white water under THIS step, at this step's own elevation. The falls
    // descend twenty units over the stage, and one volume laid at the top of
    // them would leave the last shelf standing under its own river.
    pit(27, 'rapids', -74, 74, from, r.z, r.y - 12, 4);
  }

  cliffWall(r, 340, 1, 130);
  for (let i = 0; i < 14; i += 1) {
    decorate(27, 'cloud', r.x + r.wobble(80), r.y + 6 + r.next() * 24, fallsFrom + r.next() * 340, 1.6 + r.next(), 0, 2);
  }

  r.path(44, { width: 24, aim: 0, rise: r.y - 6 });
  scatterJungle(r, 27, undefined, { density: 0.9, palms: 0.4, inset: 44 });
};

/**
 * 28 - THE SKYBRIDGE.
 *
 * A single span, four hundred units long and nine wide, strung between two
 * peaks with nothing under it. Sections of it collapse; logs swing across it;
 * and there is no cover, no alternative and no wide bit to stop on.
 *
 * The purest test in the game. Everything the player has is needed and nothing
 * else is offered.
 */
const skybridge = (r: Route): void => {
  r.made('plank').over('void');
  r.width = 14;

  r.path(34, { aim: 0, kind: 'rock', rise: r.y + 20 });
  r.stairs(6, 3.4, { run: 7, width: 16, kind: 'rock' });

  const spanFrom = r.z;
  widen(spanFrom - 10, spanFrom + 420, 60);
  pit(28, 'void', -60, 60, spanFrom, spanFrom + 420, r.y - 44);

  // Four runs, each a different failure mode, each with a slat platform
  // between it and the next so the span is survivable in pieces.
  r.collapsing(96, { sections: 7, rate: 0.19, width: 9, aim: 14, hold: 0.74 });
  r.path(20, { width: 13, kind: 'plank', rails: true });

  r.ropeBridge(94, { width: 8, aim: -16 });
  r.path(20, { width: 13, kind: 'plank', rails: true });

  r.collapsing(90, { sections: 6, rate: 0.22, width: 9, aim: 12, hold: 0.7 });
  r.path(20, { width: 13, kind: 'plank', rails: true });

  r.ropeBridge(80, { width: 8, aim: 0 });

  // Swinging logs the whole length, on three rates so the span never has a
  // rhythm to it.
  for (let i = 0; i < 9; i += 1) {
    hazard(28, 'swing', {
      x: 0,
      y: r.y + 4,
      z: spanFrom + 34 + i * 42,
      radius: 3.6,
      sweep: 20,
      rate: [1.1, 1.45, 0.85][i % 3] as number,
      phase: (i * 0.23) % 1,
    });
    decorate(28, 'vine', 0, r.y + 22, spanFrom + 34 + i * 42, 2.4, 0, i % 3);
  }

  // The two peaks, so the span has ends.
  for (const z of [spanFrom - 20, spanFrom + 430]) {
    block(28, 'rock', -64, r.y - 90, z - 30, 128, 90, 44);
  }
  for (let i = 0; i < 18; i += 1) {
    decorate(28, 'cloud', r.wobble(120), r.y - 20 + r.next() * 40, spanFrom + r.next() * 420, 2 + r.next() * 2, 0, i % 3);
  }

  r.made('rock');
  r.path(42, { width: 24, aim: 0 });
  scatterJungle(r, 28, undefined, { density: 0.4, inset: 48 });
};

/**
 * 29 - GUARDIAN'S RUN.
 *
 * A chase, downhill, with boulders. The second guardian is waiting in a grove
 * at the top; the only way past it is through, and the way out is a long
 * descending ramp it follows the player down while the mountain sheds rocks
 * behind them.
 *
 * The one stage in the game the player is expected to run rather than to read.
 */
const guardiansRun = (r: Route): void => {
  r.made('dirt').over('void');
  r.width = 20;

  r.path(34, { aim: 0 });

  // The grove: smaller and tighter than stage 18's, with less cover.
  const groveFrom = r.z;
  const groveHalf = 48;
  const groveLength = 190;
  widen(groveFrom - 10, groveFrom + groveLength + 12, groveHalf + 14);
  r.plaza(groveLength, { halfWidth: groveHalf, kind: 'dirt', aim: 0 });
  guardianZone(29, groveFrom + 16, groveFrom + groveLength - 16, groveHalf - 8, r.y);

  for (let row = 0; row < 5; row += 1) {
    for (let i = 0; i < 3; i += 1) {
      const x = -groveHalf + 18 + i * 30 + (row % 2) * 15;
      const z = groveFrom + 26 + row * 34;
      block(29, 'ruin', x - 7, r.y, z - 3, 14, 10, 6);
      decorate(29, 'root', x + 10, r.y, z + 8, 1.8, r.next() * 6.28, row % 2);
    }
  }
  decorate(29, 'statue', 0, r.y, groveFrom + 12, 5.6, 0, 0);

  // The descent, with the boulders. Steeper and faster than stage 16's, and
  // with narrower alcoves.
  const rampFrom = r.z;
  const rampTop = r.y;
  const rampLength = 280;
  const rampDrop = 96;
  widen(rampFrom - 8, rampFrom + rampLength + 20, 52);

  const bends = [20, -22, 18, -14];
  for (let i = 0; i < bends.length; i += 1) {
    const to = bends[i] as number;
    r.path(rampLength / bends.length, {
      width: 16,
      aim: to,
      rise: rampTop - (rampDrop * (i + 1)) / bends.length,
      rails: true,
    });
    const alcoveX = to > 0 ? to - 17 : to + 17;
    block(29, 'rock', alcoveX - 7, r.y - 3, r.z - 22, 14, 3, 16);
  }

  for (let i = 0; i < 7; i += 1) {
    hazard(29, 'boulder', {
      x: -16 + (i % 4) * 12,
      y: rampTop,
      z: rampFrom,
      radius: 10,
      rate: 92,
      phase: i / 7,
      fromZ: rampFrom - 24,
      toZ: rampFrom + rampLength + 10,
      fromY: rampTop + 4,
      toY: rampTop - rampDrop + 4,
      driftX: i % 2 === 0 ? 24 : -26,
    });
  }

  cliffWall(r, 280, 1, 100);
  r.path(44, { width: 24, aim: 0 });
  scatterJungle(r, 29, undefined, { density: 1.5, canopy: true, inset: 54, reach: 36 });
};

/**
 * 30 - SUMMIT TEMPLE.
 *
 * The end of the expedition. A climb up the outside of the summit temple on
 * lifts and carousels, a run through its trap corridor, and a final courtyard
 * at the top of the world with the thing the expedition came for standing in
 * the middle of it.
 *
 * It uses every mechanic in the game once and is the longest stage by half
 * again. It should not feel like stage 29 with wider gaps; it should feel like
 * arriving somewhere.
 */
const summitTemple = (r: Route): void => {
  r.made('gilded').over('void');
  r.width = 18;

  r.path(40, { aim: 0, kind: 'stone' });
  guardians(r, r.z - 22, 5, 30);

  const templeFrom = r.z;
  widen(templeFrom - 12, templeFrom + 560, 66);
  pit(30, 'void', -66, 66, templeFrom, templeFrom + 560, r.y - 40);

  // --- The climb: three terraces, each reached differently. ---------------
  // First by lifts, so the player waits and times.
  r.path(26, { width: 20 });
  for (let i = 0; i < 3; i += 1) {
    r.gap(30, { aim: i % 2 === 0 ? 16 : -16 });
    r.lift(r.z - 15, {
      x: r.x,
      y: r.y + 4 + i * 5,
      size: 14,
      travel: 11,
      rate: 0.16,
      phase: i * 0.33,
      kind: 'gilded',
    });
    r.path(22, { width: 18, rise: r.y + 11 });
  }

  // Then by carousel, so they ride.
  const ringZ = r.z + 46;
  r.gap(92, { aim: 0, rise: r.y + 14 });
  for (let arm = 0; arm < 3; arm += 1) {
    for (let k = 0; k < 2; k += 1) {
      mover(30, 'gilded', 0, r.y, ringZ, 13, 13, 'orbit', {
        amount: 18 + arm * 14,
        rate: (arm % 2 === 0 ? 1 : -1) * (0.4 - arm * 0.06),
        phase: (arm * 0.17 + k * 0.5) % 1,
      });
    }
  }
  block(30, 'gilded', -5, r.y - 40, ringZ - 5, 10, 40, 10);

  // Then by stair, so they climb.
  r.path(24, { width: 20 });
  r.stairs(14, 3.4, { run: 6.6, width: 20 });

  // --- The trap corridor: darts, crushers and a collapsing floor at once. --
  const corridorFrom = r.z;
  r.collapsing(120, { sections: 8, rate: 0.21, width: 12, aim: 0, hold: 0.72, kind: 'gilded' });
  const steps = 9;
  for (let i = 0; i < steps; i += 1) {
    const z = corridorFrom + (120 * i) / steps;
    for (const side of [-1, 1]) {
      block(30, 'gilded', r.x + side * 7 - (side < 0 ? 10 : 0), r.y, z, 10, 22, 120 / steps + 0.4);
    }
    block(30, 'gilded', r.x - 17, r.y + 22, z, 34, 5, 120 / steps + 0.4);
    hazard(30, 'dart', {
      x: r.x + (i % 2 === 0 ? -8 : 8),
      y: r.y + 2.4,
      z: z + 6,
      radius: 2.4,
      sweep: (i % 2 === 0 ? 1 : -1) * 17,
      rate: 1.6,
      phase: (i * 0.23) % 1,
    });
    if (i % 3 === 0) {
      hazard(30, 'faller', {
        x: r.x,
        y: r.y,
        z: z + 6,
        radius: 5.4,
        sweep: 18,
        rate: 2.6,
        phase: (i * 0.4) % 1,
      });
    }
  }
  torchlight(r, 120, 18);

  // --- The summit courtyard. ---------------------------------------------
  const courtFrom = r.z;
  r.path(30, { width: 24 });
  r.plaza(150, { halfWidth: 44, kind: 'gilded', aim: 0 });

  // Sweeping arms across the courtyard's mouth, and the last two guardians.
  for (let arm = 0; arm < 6; arm += 1) {
    hazard(30, 'spinner', {
      x: 0,
      y: r.y + 3,
      z: courtFrom + 60,
      radius: 3.2,
      sweep: 10 + arm * 6,
      rate: 0.44,
      phase: 0,
    });
  }
  guardians(r, courtFrom + 130, 6, 40);
  colonnade(r, 150, { spacing: 20, offset: 48, height: 56, broken: 0 });
  decorate(30, 'arch', 0, r.y, courtFrom + 168, 5, 0, 0);
  decorate(30, 'statue', 0, r.y, courtFrom + 150, 8, 0, 0);
  for (let i = 0; i < 8; i += 1) {
    decorate(30, 'torch', -36 + i * 10, r.y, courtFrom + 160, 1.8, 0, 0);
  }

  waterfall(r, -60, templeFrom + 300, r.y + 20, 120, { width: 26, scale: 5 });
  waterfall(r, 62, templeFrom + 420, r.y + 10, 110, { width: 24, scale: 4.6 });
  for (let i = 0; i < 22; i += 1) {
    decorate(30, 'cloud', r.wobble(140), r.y - 30 + r.next() * 50, templeFrom + r.next() * 560, 2.2 + r.next() * 2, 0, i % 3);
  }

  r.path(46, { width: 26, aim: 0 });
  scatterJungle(r, 30, undefined, { density: 0.5, ruins: 1, inset: 60, palms: 0 });
};

export const buildAct6 = (): void => {
  defineStage(26, valleyOfRoots);
  defineStage(27, thunderFalls);
  defineStage(28, skybridge);
  defineStage(29, guardiansRun);
  defineStage(30, summitTemple);
};
