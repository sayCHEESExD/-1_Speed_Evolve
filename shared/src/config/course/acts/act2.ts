import { decorate, hazard, pit, widen } from '../emit.js';
import { defineStage } from '../stage.js';
import type { Route } from '../route.js';
import { abandonedCamp, cliffWall, scatterJungle, waterfall } from './scenery.js';

/**
 * ACT TWO - THE DEEP JUNGLE.
 *
 * Rivers, rope, cliffs and roots, and the act where OVERSHOOTING is taught.
 *
 * From here the chains of landings are sized so that gap plus landing is LESS
 * than a full jump: a player who holds W and jumps from the very edge sails
 * straight over the next landing. They have to take off early, or ease off,
 * and land where they meant to. Every such chain keeps gap plus TWICE the
 * landing above a jump, so there is always a takeoff that works and the
 * window is the landing's own length - a skill with a visible answer.
 *
 * The paths are seven wide and nothing either side of them is ground.
 */

/**
 * 6 - RAPIDS CROSSING.
 *
 * Rafts sliding up and down a fast river, a slick spur, a rope bridge, and
 * the first chain of short landings. The rafts are the timing: the river is
 * far too wide to jump, and a raft that has drifted away leaves a gap a jump
 * will not close.
 */
const rapidsCrossing = (r: Route): void => {
  r.made('rock').over('rapids', 2.4);
  r.fall = 9;
  const J = r.reach;
  r.width = 7;

  r.path(36, { aim: -8 });

  const riverFrom = r.z;
  const bank = J * 0.42;
  const raft = J * 0.48;
  const pitch = J * 0.95;
  const rafts = 4;
  const riverLength = bank * 2 + raft + pitch * (rafts - 1);
  widen(riverFrom - 6, riverFrom + riverLength + 6, 60);
  pit(6, 'rapids', r.x - 60, r.x + 60, riverFrom, riverFrom + riverLength, r.y - 8, 2.4);
  const lateral = [-4, 5, -5, 4];
  for (let i = 0; i < rafts; i += 1) {
    r.shuttle(riverFrom + bank + raft / 2 + i * pitch, {
      x: r.x + (lateral[i] as number),
      width: 6.5,
      length: raft,
      travel: J * 0.2,
      rate: 0.14 + i * 0.025,
      phase: i * 0.29,
      axis: 'z',
      kind: 'log',
    });
  }
  r.gap(riverLength, { aim: r.x + 4 });

  const spurFrom = r.z;
  r.path(26, { width: 8, kind: 'rock' });
  r.slippery(spurFrom, r.z, 0.66);
  r.ropeBridge(64, { width: 4.5, aim: -6 });
  r.path(18, { width: 7, kind: 'rock' });

  r.hops(4, { gap: J * 0.45, land: J * 0.42, width: 6, jog: 7, kind: 'rock', depth: 6 });
  r.gap(J * 0.42);
  r.path(30, { width: 8, kind: 'dirt', aim: 0 });

  waterfall(r, r.x - 44, riverFrom + 40, r.y + 34, 40, { width: 18 });
  abandonedCamp(r, riverFrom + 20, 1);
  scatterJungle(r, 6, undefined, { density: 1.4, palms: 0.4, inset: 10, reach: 34 });
};

/**
 * 7 - THE ROPEWALK.
 *
 * A climb into the canopy and three rope bridges between the trees, each with
 * a log swinging across it on a vine, and a run of tied planks between the
 * second and the third. A bridge four and a half wide leaves nowhere to stand
 * aside: the log is a WHEN, not a where.
 */
const ropewalk = (r: Route): void => {
  r.made('plank').over('void');
  const J = r.reach;
  r.width = 7;

  r.path(30, { rise: r.y + 12, kind: 'dirt' });
  r.stairs(6, 3.4, { run: 8, width: 8, kind: 'dirt' });

  const spans = [
    { length: 66, aim: -14, rate: 1.05, phase: 0 },
    { length: 60, aim: 12, rate: 1.35, phase: 0.4 },
    { length: 72, aim: -4, rate: 0.9, phase: 0.75 },
  ];
  spans.forEach((span, index) => {
    const midZ = r.z + span.length / 2;
    const midX = (r.x + span.aim) / 2;
    r.ropeBridge(span.length, { width: 4.5, aim: span.aim });
    hazard(7, 'swing', {
      x: midX,
      y: r.y + 3.4,
      z: midZ,
      radius: 3.2,
      sweep: 11,
      rate: span.rate,
      phase: span.phase,
    });
    decorate(7, 'vine', midX, r.y + 20, midZ, 2.2, 0, 0);
    r.path(16, { width: 7, kind: 'plank', rails: true });
    if (index === 1) {
      // Planks lashed between branches: short, and offset.
      r.hops(3, { gap: J * 0.45, land: J * 0.4, width: 5.5, jog: 6, kind: 'plank', depth: 1.6 });
      r.gap(J * 0.4);
      r.path(16, { width: 7, kind: 'plank', rails: true });
    }
  });

  r.stairs(6, -3.4, { run: 8, width: 8, kind: 'dirt' });
  r.made('dirt');
  r.path(30, { width: 8, aim: 0 });

  scatterJungle(r, 7, undefined, { density: 1.8, canopy: true, inset: 10, reach: 40 });
};

/**
 * 8 - WATERFALL LEDGE.
 *
 * A wet ledge along the gorge wall, broken into sections, each crossed by a
 * waterfall. The falls come down over the OUTER half of the ledge: there is a
 * lane past each one against the rock, a few units wide, and nowhere else.
 * The wind off the water pushes toward the drop.
 *
 * The old ledge put each fall dead centre on a ledge narrower than the fall,
 * so there was no lane at all - the stage could not be cleared.
 */
const waterfallLedge = (r: Route): void => {
  r.made('rock').over('water', 1.6);
  const J = r.reach;
  r.width = 8;

  r.path(36, { aim: 14, rise: r.y + 5 });
  const ledgeFrom = r.z;
  for (let i = 0; i < 3; i += 1) {
    const side = i % 2 === 0 ? 1 : -1;
    r.path(34, { width: 8, aim: r.x + side * 5 });
    // The fall hangs over the OUTER side (+X, away from the wall on -X) of a
    // STRAIGHT stretch, so the lane past it is the same width all the way:
    // the ledge runs x-4..x+4 and the fall covers x+1.5 outward, which after
    // the mount's own radius leaves a lane about three units wide.
    waterfall(r, r.x + 6.5, r.z + 13, r.y + 46, 46, { lethal: true, width: 10 });
    r.path(26, { width: 8 });
    if (i < 2) {
      r.hops(2, { gap: J * 0.45, land: J * 0.4, width: 6.5, jog: 5, kind: 'rock', depth: 5 });
      r.gap(J * 0.42);
    }
  }
  cliffWall(r, r.z - ledgeFrom, -1, 78);
  r.slippery(ledgeFrom, r.z, 0.6, 3);
  pit(8, 'water', r.x - 70, r.x + 70, ledgeFrom, r.z, r.y - 22, 1.1);

  r.path(40, { width: 9, kind: 'rock', aim: 0, rise: r.y - 4 });
  scatterJungle(r, 8, undefined, { density: 1.2, inset: 12, palms: 0.5 });
};

/**
 * 9 - ROOTWOOD CLIMB.
 *
 * Three switchbacks up a colossal tree, each a run of root-steps that climb
 * AND step sideways, then a landing where debris falls from the branches
 * above. Climbing is precise jumping with the landings getting higher: a jump
 * up lands sooner than a jump across, so the takeoff has to move with it.
 */
const rootwoodClimb = (r: Route): void => {
  r.made('log').over('void');
  const J = r.reach;
  const H = r.jumpHeight;
  r.width = 7;

  r.path(30, { kind: 'dirt', aim: -12 });
  for (let i = 0; i < 3; i += 1) {
    // Each flight drifts ten across while it climbs and steps three either
    // side: no single hop asks for more than about a quarter of its length
    // sideways, which is aiming rather than guessing.
    const toX = i % 2 === 0 ? 10 : -10;
    r.hops(4, { gap: J * 0.28, land: J * 0.38, step: H * 0.5, width: 6.5, jog: 3, kind: 'log', depth: 6, aim: toX });
    r.gap(J * 0.26, { rise: r.y + H * 0.45 });
    r.path(22, { width: 8, kind: 'log' });
    hazard(9, 'faller', {
      x: r.x,
      y: r.y,
      z: r.z - 11,
      radius: 4.2,
      sweep: 30,
      rate: 3.2,
      phase: i * 0.3,
    });
  }

  for (let i = 0; i < 6; i += 1) {
    decorate(9, 'tree', 0, r.y - 60 + i * 10, r.z - 120 + i * 4, 4.5, i * 0.8, 1);
  }
  for (let i = 0; i < 10; i += 1) {
    decorate(9, 'root', r.wobble(30), r.y - 50 + i * 8, r.z - 130 + r.next() * 120, 2 + r.next(), r.next() * 6.28, i % 2);
  }

  r.made('dirt');
  r.path(36, { width: 9, aim: 0 });
  scatterJungle(r, 9, undefined, { density: 1.5, canopy: true, inset: 10 });
};

/**
 * 10 - THE BROKEN SPAN.
 *
 * A collapsing bridge over a gorge, two turning stones across the gap where
 * the middle of the bridge used to be, and the broken far end as a chain of
 * short landings. The gap the stones cross is wider than a jump: the stones
 * are the only way over, so this is the first stage where waiting for the
 * right moment is not optional.
 */
const brokenSpan = (r: Route): void => {
  r.made('ruin').over('rapids', 2.8);
  const J = r.reach;
  r.width = 7;

  r.path(34, { kind: 'stone', aim: 0 });
  const gorgeFrom = r.z;
  widen(gorgeFrom - 8, gorgeFrom + 420, 58);
  pit(10, 'rapids', -58, 58, gorgeFrom, gorgeFrom + 420, r.y - 30, 2.8);

  r.collapsing(80, { sections: 5, rate: 0.14, width: 6.5, aim: -6 });
  r.path(14, { width: 7 });

  // The turning stones, orbiting two hubs either side of the line.
  const across = J * 1.45;
  const from = r.z;
  r.gap(across, { aim: 8 });
  r.carousel(from + across * 0.33, { x: -6, y: r.y, size: 12, radius: 12, rate: 0.8, kind: 'ruin' });
  r.carousel(from + across * 0.67, { x: 8, y: r.y, size: 12, radius: 12, rate: -0.75, phase: 0.5, kind: 'ruin' });
  r.path(16, { width: 7 });

  r.hops(3, { gap: J * 0.5, land: J * 0.38, width: 6, jog: 7, kind: 'ruin', depth: 8 });
  r.gap(J * 0.45, { aim: 0 });

  for (const z of [gorgeFrom + 10, gorgeFrom + 300]) {
    for (const side of [-1, 1]) {
      decorate(10, 'arch', side * 18, r.y, z, 2.6, 0, 0);
      decorate(10, 'statue', side * 26, r.y, z, 1.6, 0, 0);
    }
  }
  waterfall(r, -46, gorgeFrom + 120, r.y + 8, 44, { width: 22, scale: 2.4 });

  r.made('stone');
  r.path(36, { width: 9, aim: 0 });
  scatterJungle(r, 10, undefined, { density: 1.1, ruins: 0.5, inset: 12 });
};

export const buildAct2 = (): void => {
  defineStage(6, rapidsCrossing);
  defineStage(7, ropewalk);
  defineStage(8, waterfallLedge);
  defineStage(9, rootwoodClimb);
  defineStage(10, brokenSpan);
};

