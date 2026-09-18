import { block, box, decorate, hazard, mover, pit, widen } from '../emit.js';
import { defineStage } from '../stage.js';
import type { Route } from '../route.js';
import { colonnade, guardians, scatterJungle, torchlight } from './scenery.js';

/**
 * ACT THREE - THE ANCIENT RUINS.
 *
 * The jungle opens onto a civilisation. Everything underfoot from here is cut
 * stone, the scenery becomes architecture, and the hazards stop being natural
 * - a falling rock is bad luck, a dart trap was AIMED, and the difference is
 * the whole character of this act.
 *
 * It should look nothing like the two acts before it. Where those were green,
 * open and organic, this is grey, enclosed and rectilinear: colonnades instead
 * of treelines, torchlight instead of sky, and corridors instead of trails.
 */

/**
 * 11 - TEMPLE APPROACH.
 *
 * A ceremonial causeway, dead straight for the first time in the game, rising
 * to a great stair between two rows of guardians. The straightness is the
 * point: after two acts of curves it reads as something MADE, and it lets the
 * player see the whole approach at once.
 */
const templeApproach = (r: Route): void => {
  r.made('stone').over('void');
  r.width = 22;

  const causewayFrom = r.z;
  r.path(120, { aim: 0, rails: true });
  colonnade(r, 120, { spacing: 20, offset: 20, height: 30, broken: 0.3 });
  for (let i = 0; i < 5; i += 1) guardians(r, causewayFrom + 18 + i * 24, 2, 32);

  // The stair. Wide and slow, so the first thing this act does is show its
  // scale rather than test anything.
  r.stairs(12, 3.2, { run: 7, width: 26 });

  // The terrace at the top, and the first dart traps - fired from the bases of
  // the columns, which is where the player has been walking safely past them
  // for the last hundred units.
  const terraceFrom = r.z;
  r.plaza(96, { halfWidth: 30, kind: 'stone' });
  for (let i = 0; i < 6; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    hazard(11, 'dart', {
      x: side * 30,
      y: r.y + 2.6,
      z: terraceFrom + 14 + i * 14,
      radius: 2.4,
      sweep: -side * 60,
      rate: 2.6,
      phase: i * 0.17,
    });
  }
  torchlight(r, 96, 16);
  decorate(11, 'arch', 0, r.y, terraceFrom + 92, 3.4, 0, 0);

  r.path(40, { width: 24, aim: 0 });
  scatterJungle(r, 11, undefined, { density: 0.7, ruins: 0.8, inset: 40, palms: 0 });
};

/**
 * 12 - HALL OF STATUES.
 *
 * A narrow stone floor running between colossal seated figures whose arms
 * sweep across it. The floor is deliberately narrow and the arms are
 * deliberately long: there is a safe line through every pair, but it is never
 * the middle, so the stage is read rather than memorised.
 */
const hallOfStatues = (r: Route): void => {
  r.made('stone').over('void');
  r.width = 15;

  r.path(40, { aim: 0, rails: true });

  const hallFrom = r.z;
  for (let i = 0; i < 7; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = r.z + 20;
    r.path(40, { width: 14, aim: r.x + (i % 3 === 0 ? 7 : -7), rails: true });

    // One statue per bay, its arm sweeping from its own side across the floor.
    decorate(12, 'statue', side * 26, r.y, z, 3.6, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
    for (let arm = 0; arm < 4; arm += 1) {
      hazard(12, 'spinner', {
        x: side * 26,
        y: r.y + 3.2,
        z,
        radius: 2.8,
        sweep: 10 + arm * 6.5,
        rate: side * (0.5 + i * 0.045),
        phase: i * 0.31,
      });
    }
  }
  colonnade(r, r.z - hallFrom, { spacing: 20, offset: 34, height: 40, broken: 0.1 });
  torchlight(r, r.z - hallFrom, 20);

  r.path(38, { width: 20, aim: 0 });
  scatterJungle(r, 12, undefined, { density: 0.5, ruins: 1, inset: 48, palms: 0 });
};

/**
 * 13 - TURNING STONES.
 *
 * A vault whose floor is gone, crossed on discs that turn about hubs. The
 * player RIDES them: each disc carries whoever is standing on it, so the
 * crossing is a sequence of boardings rather than a sequence of jumps.
 *
 * This is the stage the whole moving-platform system exists for, and it is
 * placed here rather than later because being carried is a thing the player
 * has to be taught before it can be combined with anything.
 */
const turningStones = (r: Route): void => {
  r.made('ruin').over('void');
  r.width = 18;

  r.path(34, { aim: 0 });
  const vaultFrom = r.z;
  widen(vaultFrom - 8, vaultFrom + 250, 62);
  pit(13, 'void', -62, 62, vaultFrom, vaultFrom + 250, r.y - 26);

  // Four hubs, alternating direction, with a fixed island between each pair so
  // a missed boarding costs one disc rather than the stage.
  const rates = [0.42, -0.5, 0.36, -0.46];
  for (let i = 0; i < 4; i += 1) {
    const hubX = i % 2 === 0 ? -16 : 16;
    const hubZ = r.z + 30;
    r.carousel(hubZ, { x: hubX, y: r.y, size: 14, radius: 19, rate: rates[i] as number, phase: i * 0.25, kind: 'stone' });
    // A second disc on the same hub, opposite it, so there is always one
    // coming - a single disc per hub is a wait, not an obstacle.
    r.carousel(hubZ, { x: hubX, y: r.y, size: 12, radius: 19, rate: rates[i] as number, phase: (i * 0.25 + 0.5) % 1, kind: 'stone' });

    r.gap(56, { aim: -hubX * 0.5 });
    r.path(22, { width: 17, kind: 'ruin' });

    // The hub column itself, so a turning disc reads as machinery rather than
    // as a slab orbiting nothing.
    block(13, 'ruin', hubX - 4, r.y - 24, hubZ - 4, 8, 24, 8);
    decorate(13, 'torch', hubX, r.y, hubZ, 1.3, 0, 0);
  }

  colonnade(r, 250, { spacing: 30, offset: 52, height: 46, broken: 0.2 });
  r.path(34, { width: 20, aim: 0, kind: 'stone' });
  scatterJungle(r, 13, undefined, { density: 0.4, ruins: 1, inset: 60, palms: 0 });
};

/**
 * 14 - THE DART CORRIDOR.
 *
 * A long, low, narrow passage with trap ports down both walls and blocks
 * dropping from the ceiling. There is no room to dodge sideways: the corridor
 * is barely wider than the mount, so every trap is a question of WHEN, and the
 * answer is speed.
 *
 * The most claustrophobic thing in the game, and the reason act three feels
 * like an interior.
 */
const dartCorridor = (r: Route): void => {
  r.made('stone').over('void');
  r.width = 12;

  r.path(34, { aim: 0, rails: true });

  const corridorFrom = r.z;
  const length = 210;
  r.path(length, { width: 11, aim: 0, rails: true });

  // Walls and a ceiling, so it is genuinely a corridor and a mount cannot
  // simply leave through the side of it.
  const steps = Math.round(length / 14);
  for (let i = 0; i < steps; i += 1) {
    const z = corridorFrom + (length * i) / steps;
    for (const side of [-1, 1]) {
      block(14, 'stone', r.x + side * 6 - (side < 0 ? 9 : 0), r.y, z, 9, 20, length / steps + 0.4);
    }
    block(14, 'stone', r.x - 16, r.y + 20, z, 32, 5, length / steps + 0.4);
  }

  // Darts from alternating walls, paced so that at the intended level the
  // player crosses each port between firings rather than waiting for one.
  for (let i = 0; i < 14; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    hazard(14, 'dart', {
      x: r.x + side * 7,
      y: r.y + 2.4,
      z: corridorFrom + 12 + i * 14,
      radius: 2.2,
      sweep: -side * 15,
      rate: 1.9,
      phase: (i * 0.29) % 1,
    });
  }
  // And crushers from the ceiling, on a slower cycle, so the two rhythms
  // interfere rather than lining up.
  for (let i = 0; i < 5; i += 1) {
    hazard(14, 'faller', {
      x: r.x,
      y: r.y,
      z: corridorFrom + 26 + i * 40,
      radius: 5,
      sweep: 17,
      rate: 2.9,
      phase: (i * 0.37) % 1,
    });
  }
  torchlight(r, length, 26);

  r.path(38, { width: 20, aim: 0 });
  scatterJungle(r, 14, undefined, { density: 0.4, ruins: 0.9, inset: 50, palms: 0 });
};

/**
 * 15 - COLLAPSING COURT.
 *
 * A great courtyard whose flagstones give way in a WAVE that travels across
 * it. The player has to move with the wave rather than across it, which makes
 * this the first stage where standing still is the thing that kills.
 *
 * The act's closing exam, and the last of the ruins before the jungle takes
 * over again on the far side.
 */
const collapsingCourt = (r: Route): void => {
  r.made('ruin').over('void');
  r.width = 20;

  r.path(34, { aim: 0 });

  const courtFrom = r.z;
  widen(courtFrom - 8, courtFrom + 230, 60);
  pit(15, 'void', -60, 60, courtFrom, courtFrom + 230, r.y - 24);

  // The court's floor IS the obstacle: a grid of flagstones, each of which
  // holds, gives way and rebuilds. The phase is a function of the cell's own
  // position, so the failure travels across the court as a DIAGONAL WAVE -
  // there is exactly one line that outruns it, and it is not the straight one.
  const lanes = 7;
  const rows = 16;
  const cell = 15;
  const laneX = (lane: number): number => (lane - (lanes - 1) / 2) * cell;
  for (let row = 0; row < rows; row += 1) {
    for (let lane = 0; lane < lanes; lane += 1) {
      if ((row + lane) % 3 !== 0) continue;
      box(15, 'ruin', laneX(lane), r.y, courtFrom + 12 + row * cell, cell - 1.2, cell - 1.2);
    }
  }
  // And the cells that actually fail - every one that is not fixed.
  for (let row = 0; row < rows; row += 1) {
    for (let lane = 0; lane < lanes; lane += 1) {
      if ((row + lane) % 3 === 0) continue;
      mover(
        15,
        'ruin',
        laneX(lane),
        r.y,
        courtFrom + 12 + row * cell,
        cell - 1.2,
        cell - 1.2,
        'collapse',
        { amount: 30, rate: 0.16, phase: ((row * 0.13 + lane * 0.21) % 1), hold: 0.74 },
      );
    }
  }
  r.gap(rows * cell + 20, { aim: 0 });

  colonnade(r, 230, { spacing: 26, offset: 50, height: 34, broken: 0.4 });
  guardians(r, courtFrom + 115, 3, 54);
  torchlight(r, 230, 34);

  r.path(40, { width: 22, aim: 0, kind: 'stone' });
  scatterJungle(r, 15, undefined, { density: 0.9, ruins: 0.7, inset: 46, palms: 0.1 });
};

export const buildAct3 = (): void => {
  defineStage(11, templeApproach);
  defineStage(12, hallOfStatues);
  defineStage(13, turningStones);
  defineStage(14, dartCorridor);
  defineStage(15, collapsingCourt);
};
