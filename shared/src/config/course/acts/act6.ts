import { block, decorate, guardianZone, hazard, mover, pit, surface, widen } from '../emit.js';
import { defineStage } from '../stage.js';
import type { Route } from '../route.js';
import { cliffWall, colonnade, guardians, routeAt, scatterJungle, torchlight, waterfall } from './scenery.js';

/**
 * ACT SIX - THE FINAL EXPEDITION.
 *
 * Everything at once. Six wide at most and five and a half in places; chains
 * whose landings are a third of a jump; every crossing wider than a jump
 * unless it is a chain; and hazards on top of the moving ground rather than
 * beside it. Each timed thing still has a ledge before it long enough to stop
 * on at this speed, and every chain still has a takeoff that works - the act
 * is demanding, never a lottery.
 */

/** Room to stop before a timed crossing at this stage's speed. */
const runIn = (r: Route): number => r.reach * 0.95;

/**
 * 26 - VALLEY OF ROOTS.
 *
 * The route forks over a valley of roots: a high arch of root with debris
 * falling on it, or a low line of root-tops with logs swinging across them.
 * The high line is continuous and asks for timing; the low line is a chain of
 * short landings and asks for precision. Neither is free.
 */
const valleyOfRoots = (r: Route): void => {
  r.made('log').over('void');
  const J = r.reach;
  r.width = 7;

  r.path(40, { aim: 0, kind: 'rock' });
  // The fork's pad reaches out to both lines, so choosing one is a steer
  // rather than a blind jump sideways.
  r.path(runIn(r) - 40, { width: 40, kind: 'rock' });
  const forkFrom = r.z;
  const forkLength = J * 2.6;
  widen(forkFrom - 10, forkFrom + forkLength + 20, 60);
  pit(26, 'void', -60, 60, forkFrom, forkFrom + forkLength + 20, r.y - 36);

  // The HIGH line: one long root, a jump up, collapsing in a wave, debris
  // falling on it. Flat along its length - a root that rose in steps would
  // be a wall every few units.
  {
    const steps = 12;
    for (let i = 0; i < steps; i += 1) {
      mover(26, 'log', -16, r.y + 4, forkFrom + (forkLength * (i + 0.5)) / steps, 6.5, forkLength / steps + 0.3, 'collapse', {
        amount: 30,
        rate: 0.16,
        phase: (i / steps) * 0.5,
        hold: 0.82,
      });
    }
    for (let i = 0; i < 4; i += 1) {
      hazard(26, 'faller', {
        x: -16,
        y: r.y + 4,
        z: forkFrom + forkLength * (0.2 + i * 0.2),
        radius: 4.6,
        sweep: 30,
        rate: 2.9,
        phase: (i * 0.27) % 1,
      });
    }
  }

  // The LOW line: root-tops a third of a jump long, logs swinging over them.
  {
    const land = J * 0.34;
    const gap = J * 0.42;
    const count = Math.floor((forkLength - gap) / (land + gap));
    for (let i = 0; i < count; i += 1) {
      const z = forkFrom + gap + i * (land + gap) + land / 2;
      block(26, 'log', 16 + (i % 2 === 0 ? 3 : -3) - 3, r.y - 6, z - land / 2, 6, 3, land);
    }
    for (let i = 0; i < 3; i += 1) {
      hazard(26, 'swing', {
        x: 16,
        y: r.y - 5,
        z: forkFrom + gap + land / 2 + (i * 2 + 1) * (land + gap),
        radius: 3.4,
        sweep: 12,
        rate: 1.5,
        phase: i * 0.4,
      });
    }
  }
  r.gap(forkLength, { aim: 0 });
  r.path(24, { width: 40, kind: 'rock' });

  for (let i = 0; i < 7; i += 1) {
    decorate(26, 'tree', -50 + i * 16, r.y - 34, forkFrom + 20 + i * 40, 6 + r.next() * 3, r.next() * 6.28, i % 3);
  }
  r.made('rock');
  r.path(40, { width: 9, aim: 0 });
  scatterJungle(r, 26, undefined, { density: 1.8, canopy: true, inset: 30, reach: 30 });
};

/**
 * 27 - THUNDER FALLS.
 *
 * The largest waterfall in the world, crossed four times on rocks in its
 * plunge pool, each crossing climbing back up onto a rail-edged shelf. The
 * lethal curtains come down beside the line of rocks and the spray pushes
 * toward them.
 */
const thunderFalls = (r: Route): void => {
  r.made('rock').over('rapids', 4);
  const J = r.reach;
  r.width = 6.5;

  r.path(36, { aim: -8, rise: r.y + 8 });
  const fallsFrom = r.z;
  widen(fallsFrom - 10, fallsFrom + 1400, 74);
  for (let i = 0; i < 4; i += 1) {
    const from = r.z;
    const side = i % 2 === 0 ? 1 : -1;
    r.path(J * 0.5, { width: 7, kind: 'rock', aim: r.x + side * 6, rails: true });
    const lineX = r.x;
    const chainFrom = r.z;
    r.hops(3, { gap: J * 0.45, land: J * 0.34, width: 6.5, jog: 6, kind: 'rock', depth: 7 });
    r.gap(J * 0.4);
    surface(27, r.x - 60, r.x + 60, chainFrom, r.z, 0.6, side * 10, 0);
    waterfall(r, lineX + side * 13.5, chainFrom + J * 0.6, r.y + 62, 62, { lethal: true, width: 9, scale: 3.2 });
    waterfall(r, lineX - side * 34, chainFrom + J, r.y + 62, 62, { width: 26, scale: 3.6 });
    pit(27, 'rapids', -74, 74, from, r.z, r.y - 12, 4);
  }
  cliffWall(r, r.z - fallsFrom, -1, 130);
  for (let i = 0; i < 14; i += 1) {
    decorate(27, 'cloud', r.x + r.wobble(80), r.y + 6 + r.next() * 24, fallsFrom + r.next() * (r.z - fallsFrom), 1.6 + r.next(), 0, 2);
  }

  r.path(40, { width: 9, aim: 0, rise: r.y - 6 });
  scatterJungle(r, 27, undefined, { density: 1.2, palms: 0.4, inset: 20 });
};

/**
 * 28 - THE SKYBRIDGE.
 *
 * Four hundred units of bridge a mile up: collapsing spans, rope bridges and
 * broken plank sections, with logs swinging across every part of it. The
 * climb up to it is a flight of real landings rather than a staircase of
 * walls.
 */
const skybridge = (r: Route): void => {
  r.made('plank').over('void');
  const J = r.reach;
  const H = r.jumpHeight;
  r.width = 6.5;

  r.path(34, { aim: 0, kind: 'rock' });
  r.hops(4, { gap: J * 0.25, land: J * 0.4, step: H * 0.5, width: 8, jog: 4, kind: 'rock', depth: 8 });
  r.gap(J * 0.25, { rise: r.y + H * 0.4 });
  r.path(runIn(r), { width: 7, kind: 'plank', rails: true });

  const spanFrom = r.z;
  widen(spanFrom - 10, spanFrom + 1800, 60);
  pit(28, 'void', -60, 60, spanFrom, spanFrom + 1800, r.y - 44);

  r.collapsing(J * 0.8, { sections: 6, rate: 0.19, width: 6, aim: 10, hold: 0.8, spread: 0.55 });
  r.path(20, { width: 7, kind: 'plank', rails: true });
  r.ropeBridge(J * 0.7, { width: 4.5, aim: -10 });
  r.path(20, { width: 7, kind: 'plank', rails: true });
  r.hops(3, { gap: J * 0.45, land: J * 0.34, width: 5.5, jog: 6, kind: 'plank', depth: 1.8 });
  r.gap(J * 0.42);
  r.path(runIn(r), { width: 7, kind: 'plank', rails: true });
  r.collapsing(J * 0.8, { sections: 6, rate: 0.22, width: 6, aim: 8, hold: 0.78, spread: 0.55 });
  r.path(20, { width: 7, kind: 'plank', rails: true });
  r.ropeBridge(J * 0.6, { width: 4.5, aim: 0 });
  const spanLength = r.z - spanFrom;

  for (let i = 0; i < 9; i += 1) {
    const z = spanFrom + 30 + (i * (spanLength - 60)) / 8;
    // Over the bridge where it actually is: it swings from side to side, and a
    // log hung from where the bridge ENDS swings over empty air for most of it.
    const here = routeAt(28, z - 3, z + 3);
    const x = here ? (here.left + here.right) / 2 : r.x;
    hazard(28, 'swing', {
      x,
      y: (here ? here.top : r.y) + 4,
      z,
      radius: 3.4,
      sweep: 14,
      rate: [1.1, 1.45, 0.85][i % 3] as number,
      phase: (i * 0.23) % 1,
    });
    decorate(28, 'vine', x, r.y + 22, z, 2.4, 0, i % 3);
  }
  for (const z of [spanFrom - 20, spanFrom + spanLength + 10]) {
    block(28, 'rock', -64, r.y - 90, z - 30, 128, 80, 44);
  }
  for (let i = 0; i < 18; i += 1) {
    decorate(28, 'cloud', r.wobble(120), r.y - 20 + r.next() * 40, spanFrom + r.next() * spanLength, 2 + r.next() * 2, 0, i % 3);
  }

  r.made('rock');
  r.path(42, { width: 9, aim: 0 });
  scatterJungle(r, 28, undefined, { density: 0.6, inset: 24 });
};

/**
 * 29 - GUARDIAN'S RUN.
 *
 * The second guardian - faster, and it commits harder - in a grove crossed by
 * trenches, then the boulder ramp down out of it. The grove is fifty-two wide
 * rather than ninety-six: room to dodge, not to ride round.
 */
const guardiansRun = (r: Route): void => {
  r.made('dirt').over('void');
  const J = r.reach;
  r.width = 8;

  r.path(34, { aim: 0 });
  const groveFrom = r.z;
  const groveHalf = 26;
  const pieces = [60, 58, 58, 56];
  const trenches = [J * 0.45, J * 0.5, J * 0.55];
  const groveLength = pieces.reduce((a, b) => a + b, 0) + trenches.reduce((a, b) => a + b, 0);
  widen(groveFrom - 10, groveFrom + groveLength + 12, groveHalf + 14);
  pieces.forEach((length, i) => {
    r.plaza(length, { halfWidth: groveHalf, kind: 'dirt', aim: 0 });
    const trench = trenches[i];
    if (trench !== undefined) r.gap(trench);
  });
  guardianZone(29, groveFrom + 16, groveFrom + groveLength - 16, groveHalf - 6, r.y);
  let z = groveFrom;
  pieces.forEach((length, i) => {
    for (let k = 0; k < 3; k += 1) {
      const x = -groveHalf + 10 + k * 16 + (i % 2) * 6;
      block(29, 'ruin', x - 5, r.y, z + length / 2 - 3, 10, 9, 6);
      decorate(29, 'root', x + 8, r.y, z + length / 2 + 7, 1.8, r.next() * 6.28, i % 2);
    }
    z += length + (trenches[i] ?? 0);
  });
  decorate(29, 'statue', 0, r.y, groveFrom + 12, 5.6, 0, 0);

  // The ramp out: narrower than a boulder, with alcoves at the bends.
  const rampFrom = r.z;
  const rampTop = r.y;
  const rampLength = 280;
  // Gentle enough to RIDE down. At this speed a mount leaving a steeper
  // slope flies until the slope falls away far enough to meet it - over a
  // hundred and fifty units on the old ramp - and cannot follow a bend.
  const rampDrop = 34;
  widen(rampFrom - 8, rampFrom + rampLength + 20, 52);
  const bends = [10, -10, 9, -6];
  for (let i = 0; i < bends.length; i += 1) {
    const to = bends[i] as number;
    r.path(rampLength / bends.length, {
      width: 14,
      aim: to,
      rise: rampTop - (rampDrop * (i + 1)) / bends.length,
      rails: true,
    });
    const alcoveX = to > 0 ? to + 12 : to - 12;
    block(29, 'rock', alcoveX - 7, r.y - 3, r.z - 22, 14, 3, 16);
  }
  // Six boulders, not seven, at the Boulder Run's own density: the player
  // comes down this ramp faster than they roll, so the space between two of
  // them is the space the player has to ride in.
  for (let i = 0; i < 6; i += 1) {
    hazard(29, 'boulder', {
      x: -14 + (i % 3) * 14,
      y: rampTop,
      z: rampFrom,
      radius: 8,
      rate: 80,
      phase: i / 6,
      fromZ: rampFrom - 24,
      toZ: rampFrom + rampLength + 10,
      fromY: rampTop + 4,
      toY: rampTop - rampDrop + 4,
      driftX: i % 2 === 0 ? 20 : -22,
    });
  }
  cliffWall(r, rampLength, 1, 100);

  r.path(30, { width: 8, aim: 0 });
  r.hops(3, { gap: J * 0.5, land: J * 0.34, width: 6, jog: 6, kind: 'rock', depth: 8 });
  r.gap(J * 0.45);
  r.path(44, { width: 9, aim: 0 });
  scatterJungle(r, 29, undefined, { density: 1.7, canopy: true, inset: 30, reach: 30 });
};

/**
 * 30 - SUMMIT TEMPLE.
 *
 * The last climb: lifts across three chasms, a ring of stones orbiting a
 * pillar over a void, the temple stair as a chain of landings, a collapsing
 * corridor with darts and falling stone, and the court at the top where six
 * stone arms turn about the summit altar.
 */
const summitTemple = (r: Route): void => {
  r.made('gilded').over('void');
  const J = r.reach;
  const H = r.jumpHeight;
  r.width = 6.5;

  r.path(40, { aim: 0, kind: 'stone' });
  guardians(r, r.z - 22, 5, 20);
  const templeFrom = r.z;
  widen(templeFrom - 12, templeFrom + 3000, 66);
  pit(30, 'void', -66, 66, templeFrom, templeFrom + 3000, r.y - 40);

  // Two chasms, each crossed on a lift. The lift is a jump to TIME the
  // takeoff for: it sits in a chasm wider than a jump, so a jump from the edge
  // sails over it and short of the far side.
  r.path(runIn(r), { width: 7 });
  for (let i = 0; i < 2; i += 1) {
    const across = J * 1.15;
    const from = r.z;
    r.gap(across, { aim: i % 2 === 0 ? 8 : -8 });
    // The lift works BELOW the ledges - its top between six under them and
    // two over - so it is always landed on from above. At this speed a lift
    // that rose higher presented its side face to a rider in the air, and a
    // mount that hits a side face loses all its speed and drops short of the
    // far ledge: a trap, not a timing. Every landing is long enough to stop on
    // before the next crossing - including the last, which the ring follows.
    r.lift(from + across / 2, { x: (r.x + (i % 2 === 0 ? 8 : -8)) / 2, y: r.y - 2, size: J * 0.38, width: 14, travel: 2.5, rate: 0.18, phase: i * 0.33, kind: 'gilded' });
    r.path(runIn(r), { width: 7 });
  }

  // The ring: stones orbiting a pillar in a void wider than a jump.
  const across = J * 1.25;
  const ringZ = r.z + across / 2;
  r.gap(across, { aim: 0, rise: r.y + 6 });
  for (let arm = 0; arm < 3; arm += 1) {
    for (let k = 0; k < 2; k += 1) {
      mover(30, 'gilded', 0, r.y - 6, ringZ, 16, 16, 'orbit', {
        amount: 16 + arm * 14,
        rate: (arm % 2 === 0 ? 1 : -1) * (0.4 - arm * 0.06),
        phase: (arm * 0.17 + k * 0.5) % 1,
      });
    }
  }
  // The pillar is SCENERY, not a solid. A solid pillar top far below the
  // path is somewhere a falling rider can land and then never jump back up
  // from - stranded rather than dead.
  decorate(30, 'stele', 0, r.y - 40, ringZ, 3.8, 0, 1);
  // Somewhere to come down off a moving stone before the climb begins.
  r.path(J * 0.6, { width: 8 });

  // The temple stair, as landings that climb.
  r.hops(5, { gap: J * 0.24, land: J * 0.36, step: H * 0.55, width: 8, jog: 5, kind: 'gilded', depth: 10 });
  r.gap(J * 0.22, { rise: r.y + H * 0.4 });
  r.path(runIn(r), { width: 7 });

  // The corridor: collapsing floor, darts from the walls, stone from the roof.
  const corridorFrom = r.z;
  const corridor = J * 1.1;
  r.collapsing(corridor, { sections: 8, rate: 0.21, width: 7, aim: 0, hold: 0.8, kind: 'gilded', spread: 0.5 });
  const steps = 9;
  for (let i = 0; i < steps; i += 1) {
    const z = corridorFrom + (corridor * i) / steps;
    for (const side of [-1, 1]) {
      block(30, 'gilded', r.x + side * 7 - (side < 0 ? 10 : 0), r.y - 20, z, 10, 42, corridor / steps + 0.4);
    }
    block(30, 'gilded', r.x - 17, r.y + 22, z, 34, 5, corridor / steps + 0.4);
    hazard(30, 'dart', {
      x: r.x + (i % 2 === 0 ? -7 : 7),
      y: r.y + 2.4,
      z: z + corridor / steps / 2,
      radius: 2.2,
      sweep: (i % 2 === 0 ? 1 : -1) * 14,
      rate: 1.9,
      phase: (i * 0.23) % 1,
    });
    if (i % 3 === 0) {
      hazard(30, 'faller', {
        x: r.x,
        y: r.y,
        z: z + corridor / steps / 2,
        radius: 4.4,
        sweep: 18,
        rate: 2.8,
        phase: (i * 0.4) % 1,
      });
    }
  }
  torchlight(r, corridor, 18);

  // The summit court: narrow, and the arms turn about the altar.
  const courtFrom = r.z;
  r.path(runIn(r), { width: 8 });
  r.plaza(J * 1.1, { halfWidth: 11, kind: 'gilded', aim: 0 });
  // ONE arm of four stones, reaching past the court's walls. Two arms
  // opposite each other make a bar through the altar that never leaves the
  // path clear for long enough to cross; one arm is a thing to watch go by.
  for (let stone = 0; stone < 4; stone += 1) {
    hazard(30, 'spinner', {
      x: 0,
      y: r.y + 3,
      z: r.z - J * 0.55,
      radius: 2.5,
      sweep: 5.5 + stone * 4.2,
      rate: 0.5,
      phase: 0,
    });
  }
  guardians(r, r.z - 20, 6, 22);
  colonnade(r, r.z - courtFrom, { spacing: 20, offset: 20, height: 56, broken: 0 });
  decorate(30, 'arch', 0, r.y, r.z + 6, 5, 0, 0);
  decorate(30, 'statue', 0, r.y, r.z - 8, 8, 0, 0);
  for (let i = 0; i < 8; i += 1) {
    decorate(30, 'torch', -16 + i * 4.5, r.y, r.z + 2, 1.8, 0, 0);
  }
  waterfall(r, -60, templeFrom + 300, r.y + 20, 120, { width: 26, scale: 5 });
  waterfall(r, 62, templeFrom + 520, r.y + 10, 110, { width: 24, scale: 4.6 });
  for (let i = 0; i < 22; i += 1) {
    decorate(30, 'cloud', r.wobble(140), r.y - 30 + r.next() * 50, templeFrom + r.next() * (r.z - templeFrom), 2.2 + r.next() * 2, 0, i % 3);
  }

  r.path(46, { width: 10, aim: 0 });
  scatterJungle(r, 30, undefined, { density: 0.7, ruins: 1, inset: 26, palms: 0 });
};

export const buildAct6 = (): void => {
  defineStage(26, valleyOfRoots);
  defineStage(27, thunderFalls);
  defineStage(28, skybridge);
  defineStage(29, guardiansRun);
  defineStage(30, summitTemple);
};
