import { block, decorate, guardianZone, hazard, pit, surface, widen } from '../emit.js';
import { defineStage } from '../stage.js';
import type { Route } from '../route.js';
import { abandonedCamp, cliffWall, scatterJungle, waterfall } from './scenery.js';

/**
 * ACT FOUR - THE DANGER ZONE.
 *
 * Out of the ruins and onto the mountain, where the jungle stops being scenery
 * and starts trying to kill the expedition. This act is where the course
 * finally demands the speed the player has spent four acts buying: a boulder
 * that outruns a slow mount, a gale that pushes a slow mount off a ledge, and
 * a guardian that catches one.
 *
 * Every stage here is a SET PIECE rather than a pattern. The player should be
 * able to describe each of the five afterwards in a sentence.
 */

/**
 * 16 - BOULDER RUN.
 *
 * A long descending ramp with enormous rocks coming down it. The ramp falls
 * ninety units over its length, the boulders accelerate down it, and there are
 * alcoves cut into the inside of every bend to duck into.
 *
 * The alcoves are what make it a chase rather than a lottery: a player who
 * reads the ramp can always reach cover, and a player who is fast enough never
 * needs to.
 */
const boulderRun = (r: Route): void => {
  r.made('rock').over('void');
  r.width = 20;

  r.path(40, { aim: 0 });

  const rampFrom = r.z;
  const rampTop = r.y;
  const rampLength = 300;
  const rampDrop = 88;
  widen(rampFrom - 8, rampFrom + rampLength + 20, 56);

  // The ramp: four long descending bends, alternating direction.
  const bends = [24, -24, 20, -16];
  for (let i = 0; i < bends.length; i += 1) {
    const to = bends[i] as number;
    r.path(rampLength / bends.length, {
      width: 19,
      aim: to,
      rise: rampTop - (rampDrop * (i + 1)) / bends.length,
      rails: true,
    });
    // The alcove on the inside of the bend: a shelf the boulders' lane misses.
    const alcoveX = to > 0 ? to - 20 : to + 20;
    block(16, 'rock', alcoveX - 9, r.y - 3, r.z - 26, 18, 3, 20);
    decorate(16, 'torch', alcoveX, r.y, r.z - 16, 1.1, 0, 0);
  }

  // Five boulders, spread over the run and out of phase, each descending with
  // the ramp and drifting across it as the bends do.
  for (let i = 0; i < 5; i += 1) {
    hazard(16, 'boulder', {
      x: -18 + (i % 3) * 18,
      y: rampTop,
      z: rampFrom,
      radius: 9.5,
      rate: 74,
      phase: i / 5,
      fromZ: rampFrom - 30,
      toZ: rampFrom + rampLength + 10,
      fromY: rampTop + 4,
      toY: rampTop - rampDrop + 4,
      driftX: i % 2 === 0 ? 26 : -30,
    });
  }

  r.path(46, { width: 24, aim: 0 });
  cliffWall(r, 120, 1, 90);
  abandonedCamp(r, rampFrom + 30, -1);
  scatterJungle(r, 16, undefined, { density: 1.1, inset: 28, reach: 40 });
};

/**
 * 17 - CLIFFSIDE GALE.
 *
 * A ledge a mount's width wide, cut into a sheer face, with a crosswind that
 * never stops pushing. The wind alternates direction between sections, so the
 * lean that kept the player on the ledge a moment ago is the lean that throws
 * them off it now.
 *
 * The narrowest stage in the game, and the one that most rewards a player who
 * has learned to stop.
 */
const cliffsideGale = (r: Route): void => {
  r.made('rock').over('void');
  r.width = 12;

  r.path(34, { aim: 10, rise: r.y + 10 });

  const ledgeFrom = r.z;
  const sections = 6;
  for (let i = 0; i < sections; i += 1) {
    const blow = i % 2 === 0 ? 1 : -1;
    const from = r.z;
    r.path(46, {
      width: 10.5,
      aim: r.x + blow * 8,
      rise: r.y + (i % 3 === 0 ? 7 : -3),
      rails: true,
    });
    // The wind is a SURFACE, read inside the shared step, so the server's
    // simulation and the client's prediction lean identically. A client
    // predicting a different lean would spend the whole ledge being pulled
    // back to a position it did not steer to.
    surface(17, r.x - 40, r.x + 40, from, r.z, 0.82, blow * 17, 0);
    // A gap where the ledge has fallen away, and the wind is at its strongest.
    if (i < sections - 1) r.gap(11, { aim: r.x - blow * 4 });
  }
  cliffWall(r, r.z - ledgeFrom, -1, 110);
  pit(17, 'void', r.x - 90, r.x + 90, ledgeFrom, r.z, r.y - 40);

  // The gale made visible: cloud tearing past at the player's own height.
  for (let i = 0; i < 12; i += 1) {
    decorate(17, 'cloud', r.x + r.wobble(70), r.y + 4 + r.next() * 20, ledgeFrom + r.next() * (r.z - ledgeFrom), 1.4 + r.next(), 0, i % 3);
  }

  r.path(42, { width: 20, aim: 0 });
  scatterJungle(r, 17, undefined, { density: 0.5, inset: 36, palms: 0.1 });
};

/**
 * 18 - THE GUARDIAN'S GROVE.
 *
 * A vast overgrown arena with something enormous living in it. The guardian
 * patrols, notices, and charges; the grove is full of toppled masonry to break
 * line of sight behind; and the way out is at the far end.
 *
 * The one thing in this world that is not a pure function of time. It reacts
 * to where the players ARE, which is state rather than a formula, so the
 * server simulates it and replicates it and decides the trample itself.
 */
const guardiansGrove = (r: Route): void => {
  r.made('dirt').over('void');
  r.width = 20;

  r.path(36, { aim: 0 });

  const groveFrom = r.z;
  const groveLength = 300;
  const groveHalf = 62;
  widen(groveFrom - 10, groveFrom + groveLength + 14, groveHalf + 16);
  r.plaza(groveLength, { halfWidth: groveHalf, kind: 'dirt', aim: 0 });

  // The guardian's ground, DERIVED from the arena that was just laid rather
  // than authored beside it.
  guardianZone(18, groveFrom + 20, groveFrom + groveLength - 20, groveHalf - 10, r.y);

  // Cover: fallen columns and root walls, in a lattice rather than a scatter,
  // so there is always something within a charge's length to get behind.
  for (let row = 0; row < 7; row += 1) {
    for (let i = 0; i < 4; i += 1) {
      const x = -groveHalf + 16 + i * 30 + (row % 2) * 15;
      const z = groveFrom + 30 + row * 38;
      block(18, 'ruin', x - 9, r.y, z - 3.4, 18, 9, 6.8);
      decorate(18, 'vine', x, r.y + 9, z, 1.2, 0, row % 3);
      if (i % 2 === 0) decorate(18, 'root', x + 12, r.y, z + 9, 1.6, r.next() * 6.28, row % 2);
    }
  }
  decorate(18, 'statue', 0, r.y, groveFrom + 30, 5.2, 0, 0);
  decorate(18, 'arch', 0, r.y, groveFrom + groveLength - 10, 3.2, 0, 0);

  r.path(44, { width: 24, aim: 0 });
  scatterJungle(r, 18, undefined, { density: 1.7, canopy: true, inset: 66, reach: 34 });
};

/**
 * 19 - CRUMBLING SHELF.
 *
 * A ravine crossed on rock shelves that give way, with the mountain shedding
 * rocks onto them from above. Two hazards at once for the first time, and they
 * pull in different directions: the shelf says keep moving, the falling rock
 * says wait.
 */
const crumblingShelf = (r: Route): void => {
  r.made('rock').over('void');
  r.width = 15;

  r.path(34, { aim: -12 });

  const ravineFrom = r.z;
  widen(ravineFrom - 8, ravineFrom + 280, 54);
  pit(19, 'void', -54, 54, ravineFrom, ravineFrom + 280, r.y - 34);

  for (let i = 0; i < 4; i += 1) {
    const to = i % 2 === 0 ? 18 : -18;
    r.collapsing(58, { sections: 4, rate: 0.17, width: 14, aim: to, hold: 0.76 });
    r.path(16, { width: 17, kind: 'rock' });

    // Rocks off the wall above, one per shelf, timed against the shelf rather
    // than with it.
    for (let j = 0; j < 2; j += 1) {
      hazard(19, 'faller', {
        x: to * 0.7 + j * 9 - 4,
        y: r.y,
        z: r.z - 40 + j * 22,
        radius: 5.4,
        sweep: 40,
        rate: 3.1,
        phase: (i * 0.31 + j * 0.5) % 1,
      });
    }
  }

  cliffWall(r, 280, 1, 120);
  waterfall(r, 44, ravineFrom + 150, r.y + 30, 62, { width: 18, scale: 3 });
  r.path(40, { width: 22, aim: 0 });
  scatterJungle(r, 19, undefined, { density: 0.7, inset: 36 });
};

/**
 * 20 - CATARACT LEAP.
 *
 * The act's finale, and the biggest single jump in the game so far. A river
 * pours over a cliff in three steps; the route crosses the lip of each step on
 * rocks standing in the current, with the falls themselves lethal between
 * them.
 *
 * At the intended level the gaps are a stride. Below it they are a jump. Below
 * that they are the reason to go back and farm, which is the whole economy of
 * the game expressed as a piece of terrain.
 */
const cataractLeap = (r: Route): void => {
  r.made('rock').over('rapids', 3.4);
  r.width = 16;

  r.path(38, { aim: 0 });

  const fallsFrom = r.z;
  widen(fallsFrom - 8, fallsFrom + 320, 66);

  let lip = r.y;
  for (let step = 0; step < 3; step += 1) {
    const from = r.z;
    pit(20, 'rapids', -66, 66, from, from + 100, lip - 6, 3.4);

    // Rocks standing in the water at the lip. The weave is wide and the gaps
    // are long: this is a leaping stage, not a balancing one.
    r.stones(4, {
      size: 11,
      gap: 15 + step * 4,
      weave: 17,
      kind: 'rock',
      aim: step % 2 === 0 ? 20 : -20,
    });
    r.slippery(from, r.z, 0.6);

    // The fall itself, between the rocks, and lethal.
    waterfall(r, r.x + (step % 2 === 0 ? -22 : 22), from + 52, lip, 46, { lethal: true, width: 17, scale: 2.4 });
    waterfall(r, r.x + (step % 2 === 0 ? 26 : -26), from + 78, lip, 46, { width: 20, scale: 2.4 });

    // Down to the next step.
    lip -= 16;
    r.path(24, { width: 20, kind: 'rock', rise: lip });
  }

  r.path(44, { width: 24, aim: 0 });
  scatterJungle(r, 20, undefined, { density: 1, palms: 0.4, inset: 40 });
};

export const buildAct4 = (): void => {
  defineStage(16, boulderRun);
  defineStage(17, cliffsideGale);
  defineStage(18, guardiansGrove);
  defineStage(19, crumblingShelf);
  defineStage(20, cataractLeap);
};
