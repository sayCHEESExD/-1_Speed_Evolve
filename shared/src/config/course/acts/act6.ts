import { box, decorate, guardianZone, hazard, surface } from '../emit.js';
import { defineStage } from '../stage.js';
import type { Route } from '../route.js';
import { carouselCrossing, liftCrossing, movingBridge } from './kit.js';
import {
  abandonedCamp,
  cliffWall,
  colonnade,
  guardians,
  enclose,
  scatterJungle,
  torchlight,
  waterfall,
} from './scenery.js';

/**
 * ACT SIX - THE FINAL EXPEDITION.
 *
 * Everything at once, at scale. A split path over a valley of roots, the
 * largest waterfall in the world, a skybridge in a gale, the guardian's run
 * with boulders chasing the rider down to it, and the summit temple, which
 * asks for every skill the course has taught in one long sequence.
 *
 * Still wide - eighteen across with a scrub verge - because the difficulty
 * here is the SEQUENCE: moving platforms into hazards into terrain that
 * changes, with nowhere to stop for long.
 */

const heights = (r: Route): void => {
  r.over('void');
  r.fall = 13;
};

/**
 * A FORK: two lanes side by side over the drop, each with its own trouble,
 * joining again at the end. The player picks one - boulders rolling across
 * the left lane, rotating logs on the right - and a mistake in either is the
 * same fall.
 */
const fork = (r: Route, length: number, rate: number): void => {
  const from = r.z;
  const y = r.y;
  const cx = r.x;
  const lane = 14;
  const off = 17;
  const steps = Math.max(1, Math.round(length / 7));
  const span = length / steps;
  for (let i = 0; i < steps; i += 1) {
    const z = from + span * (i + 0.5);
    box(r.stage, 'log', cx + off, y, z, lane, span + 0.35);
    box(r.stage, 'log', cx - off, y, z, lane, span + 0.35);
    r.markLine(cx, y, z, off + lane / 2);
  }
  // The left lane (+X): boulders rolling across it out of the valley.
  for (let i = 0; i < 4; i += 1) {
    const z = from + length * ((i + 0.5) / 4);
    const radius = 3.2;
    const reach = lane / 2 + radius + 3;
    const dir = i % 2 === 0 ? 1 : -1;
    hazard(r.stage, 'boulder', {
      x: cx + off - dir * reach,
      y: y + radius,
      z,
      radius,
      rate,
      phase: (i * 0.41) % 1,
      fromZ: z,
      toZ: z,
      driftX: dir * reach * 2,
    });
  }
  // The right lane (-X): logs turning on stumps.
  for (let i = 0; i < 3; i += 1) {
    const z = from + length * ((i + 0.5) / 3);
    box(r.stage, 'log', cx - off, y + 3, z, 2.4, 2.4, 3.2);
    for (let d = 2.6; d <= lane / 2; d += 2.4) {
      hazard(r.stage, 'spinner', {
        x: cx - off,
        y: y + 1.3,
        z,
        radius: 1.2,
        sweep: d,
        rate: 1.4 * (i % 2 === 0 ? 1 : -1),
        phase: (i * 0.29) % 1,
      });
    }
  }
  // Roots of the valley below, between the lanes.
  for (let i = 0; i < 6; i += 1) {
    decorate(r.stage, 'root', cx, y - 8, from + (length * (i + 0.5)) / 6, 2.4, i * 0.9, i % 2);
  }
  r.gap(length);
};

/**
 * 26 - VALLEY OF ROOTS.
 *
 * The fork over the root valley, then a slope with logs rolling down it, a
 * moving bridge of drift logs, and thorn vines.
 */
const valleyOfRoots = (r: Route): void => {
  heights(r);
  const J = r.reach;
  r.made('dirt');

  r.path(40);
  r.path(30, { width: 48, verge: 0 });
  fork(r, 260, 26);
  r.path(30, { width: 48, verge: 0 });
  r.rollingLogs(160, { count: 3, rate: 30, climb: 10 });
  movingBridge(r, 3, { gap: J * 0.28, size: J * 0.33, width: 16, travel: 12, rate: 0.2, kind: 'log' });
  r.path(40);
  r.vines(100, { count: 5, rate: 1.4 });
  r.path(40, { aim: 0 });

  scatterJungle(r, 26, undefined, { density: 1.6, fallen: 0.3, canopy: true, drop: 90 });
};

/**
 * 27 - THUNDER FALLS.
 *
 * The largest waterfall in the world. A wet ledge under falls pouring over
 * alternate sides, a ford across the plunge pool with logs coming over it, a
 * raft, a lift out of the spray, and a moving bridge.
 */
const thunderFalls = (r: Route): void => {
  r.over('rapids', 3);
  r.fall = 13;
  const J = r.reach;
  r.made('rock');

  r.path(40);
  const from = r.z;
  r.path(170, { width: 22, verge: 0, aim: -6 });
  r.slippery(from, r.z, 0.55);
  for (let i = 0; i < 4; i += 1) {
    const z = from + 25 + i * 40;
    const line = r.lineAt(z);
    if (!line) continue;
    const side = i % 2 === 0 ? 1 : -1;
    waterfall(r, line.x + side * (line.half - 4.5), z, line.y + 70, 70, { lethal: true, width: 9, scale: 3.4 });
  }
  // The cave BEHIND the falls: the plunge pool's ford runs under the rock.
  const behindFrom = r.z;
  r.ford(140, { current: 16, logs: { count: 4, rate: 22, length: 12 } });
  enclose(r, behindFrom, { kind: 'cave', headroom: 20, dark: 0.55 });
  r.path(30);
  r.ferry(J * 1.5, { size: J * 0.45, width: 18, rate: 0.15, kind: 'log' });
  r.path(J * 0.6);
  liftCrossing(r, { gapIn: J * 0.4, size: J * 0.6, width: 18, gapOut: J * 0.35, drop: 0.5, travel: 2.6, rate: 0.2, kind: 'rock' });
  r.path(J * 0.6);
  movingBridge(r, 2, { gap: J * 0.28, size: J * 0.33, width: 16, travel: 12, rate: 0.21, kind: 'log' });
  r.path(40, { aim: 0 });

  // The great fall itself, over the whole stage, off to the left.
  waterfall(r, r.x + 60, from + 200, r.y + 160, 160, { width: 60, scale: 8 });
  cliffWall(r, r.z - from, 1, 150);
  scatterJungle(r, 27, undefined, { density: 1, palms: 0.4, drop: 90 });
};

/**
 * 28 - THE SKYBRIDGE.
 *
 * Four hundred units of plank bridge strung across the sky, in a gale: logs
 * swinging across it, a stretch that collapses in a wave, loose planks
 * sliding side to side, and thorn vines hung from the cables.
 */
const skybridge = (r: Route): void => {
  heights(r);
  const J = r.reach;
  r.made('plank');

  r.path(40, { kind: 'rock' });
  const from = r.z;
  r.swinging(140, { count: 4, rate: 1.5, width: 18, verge: 0 });
  r.collapsing(J * 1.0, { sections: 5, rate: 0.2, hold: 0.62, spread: 0.45, width: 18, verge: 0 });
  r.path(J * 0.6, { width: 18, verge: 0 });
  movingBridge(r, 3, { gap: J * 0.28, size: J * 0.33, width: 16, travel: 12, rate: 0.2, kind: 'plank' });
  r.path(J * 0.6, { width: 18, verge: 0 });
  r.vines(120, { count: 5, rate: 1.5, width: 18, verge: 0 });
  surface(28, -120, 120, from, r.z, 1, r.speed * 0.45, 0);
  r.path(40, { aim: 0, kind: 'rock' });

  scatterJungle(r, 28, 80, { density: 0.8 });
};

/**
 * 29 - GUARDIAN'S RUN.
 *
 * Boulders chasing the rider down to a span that is giving way and a
 * moving bridge of drift logs, then the
 * guardian's clearing - where the second guardian hunts - and a quicksand
 * bank before the last gate before the summit.
 */
const guardiansRun = (r: Route): void => {
  heights(r);
  const J = r.reach;
  r.made('rock');

  r.path(40);
  const from = r.z;
  r.boulderRun(260, { drop: 24, count: 5, rate: 150, radius: 5, width: 26, alcoves: 4 });
  r.path(J * 0.5);
  // Out of the chase and straight onto a span that is giving way.
  r.gap(J * 0.3);
  r.collapsing(J * 1.1, { sections: 5, rate: 0.2, hold: 0.6, spread: 0.45, width: 18, verge: 0 });
  r.path(J * 0.4);
  movingBridge(r, 2, { gap: J * 0.28, size: J * 0.33, width: 16, travel: 12, rate: 0.22, kind: 'log' });
  r.path(20);
  const groveFrom = r.z;
  const groveLength = 300;
  const groveHalf = 34;
  r.plaza(groveLength, { halfWidth: groveHalf, kind: 'dirt' });
  guardianZone(29, groveFrom + 16, groveFrom + groveLength - 16, groveHalf - 6, r.y);
  for (let i = 0; i < 8; i += 1) {
    const z = groveFrom + 30 + i * 32;
    const x = r.x + ((i * 23) % 44) - 22;
    box(29, 'log', x, r.y + 2.8, z, 12, 3, 4.8);
  }
  r.path(30);
  r.quicksand(60, { islands: 3 });
  r.gate({ rate: 0.22, hold: 0.55 });
  r.path(40, { aim: 0 });

  abandonedCamp(r, from + 20, 1);
  scatterJungle(r, 29, undefined, { density: 1.3, fallen: 0.3, inset: 4 });
};

/**
 * 30 - SUMMIT TEMPLE.
 *
 * The last climb: a gilded stair, a dart row, a lift, a floor of falling
 * blocks, turning stones over the void, a sand trap before the summit gate,
 * a moving bridge, and the temple's sweeping arms in front of the dais.
 */
const summitTemple = (r: Route): void => {
  heights(r);
  const J = r.reach;
  r.made('gilded');

  r.path(40);
  const from = r.z;
  r.stairs(8, 0.8, { run: 10 });
  r.darts(120, { count: 6, period: 1.6 });
  liftCrossing(r, { gapIn: J * 0.4, size: J * 0.6, width: 18, gapOut: J * 0.35, drop: 0.5, travel: 2.6, rate: 0.21, kind: 'gilded' });
  r.path(J * 0.5);
  r.crushers(120, { rows: 4, lanes: 3, period: 2.2 });
  carouselCrossing(r, { across: J * 1.3, size: 24, radius: J * 0.26, rate: 0.8, offset: -6, kind: 'gilded' });
  r.path(J * 0.7);
  r.quicksand(60, { islands: 3 });
  r.gate({ rate: 0.24, hold: 0.5, kind: 'gilded' });
  r.path(30);
  movingBridge(r, 3, { gap: J * 0.28, size: J * 0.33, width: 16, travel: 12, rate: 0.21, kind: 'gilded' });
  r.path(J * 0.5);
  r.sweepers(100, { count: 2, rate: 1.5 });
  r.path(40, { aim: 0 });

  colonnade(r, r.z - from, { spacing: 30, offset: 34, height: 56, broken: 0.05 });
  torchlight(r, r.z - from, 30);
  guardians(r, r.z - 20, 6, 24);
  scatterJungle(r, 30, undefined, { density: 0.5, ruins: 1, palms: 0, inset: 20 });
};

export const buildAct6 = (): void => {
  defineStage(26, valleyOfRoots);
  defineStage(27, thunderFalls);
  defineStage(28, skybridge);
  defineStage(29, guardiansRun);
  defineStage(30, summitTemple);
};
