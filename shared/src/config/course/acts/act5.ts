import { block, box, decorate, hazard, mover, pit, widen } from '../emit.js';
import { defineStage } from '../stage.js';
import type { Route } from '../route.js';
import { colonnade, guardians, scatterCave, scatterJungle, torchlight, waterfall } from './scenery.js';

/**
 * ACT FIVE - THE LOST TEMPLE.
 *
 * The thing the expedition came for. Five stages inside one enormous building:
 * up its face, down into its vaults, through its furnace, across its
 * machinery, and out through the cave the river cut underneath it.
 *
 * The act's identity is VERTICALITY and ENCLOSURE. Act three's ruins were
 * roofless and grey; this is gold-veined, torchlit, and mostly indoors, and
 * two of its five stages take place underground - which is why the cave
 * lighting system exists at all.
 */

/**
 * 21 - THE GREAT STAIR.
 *
 * A monumental flight up the temple's face, three hundred units of climb, with
 * stone arms sweeping across the treads and lifts to carry the player over the
 * landings the stair itself no longer reaches.
 *
 * Climbing is slow, and everything here is designed around that: the sweeps
 * are wide and slow too, so the stage is a long steady pressure rather than a
 * sequence of reflexes.
 */
const greatStair = (r: Route): void => {
  r.made('gilded').over('void');
  r.width = 24;

  r.path(40, { aim: 0 });
  guardians(r, r.z - 20, 4.5, 34);

  const stairFrom = r.z;
  widen(stairFrom - 10, stairFrom + 330, 56);

  let flight = 0;
  for (let i = 0; i < 4; i += 1) {
    r.stairs(11, 3.4, { run: 6.8, width: 22 });
    flight += 1;

    // A landing, with an arm sweeping across it.
    const landingZ = r.z + 16;
    r.path(32, { width: 24, aim: i % 2 === 0 ? 10 : -10 });
    for (let arm = 0; arm < 5; arm += 1) {
      hazard(21, 'spinner', {
        x: 0,
        y: r.y + 2.8,
        z: landingZ,
        radius: 3,
        sweep: 8 + arm * 6,
        rate: i % 2 === 0 ? 0.36 : -0.34,
        phase: i * 0.27,
      });
    }

    // The next flight's bottom step is missing; a lift bridges it.
    if (i < 3) {
      r.gap(26);
      r.lift(r.z - 13, { x: r.x, size: 15, travel: 9, rate: 0.17, phase: i * 0.3, kind: 'gilded' });
    }
  }

  colonnade(r, 330, { spacing: 24, offset: 34, height: 44, broken: 0.12 });
  torchlight(r, 330, 26);
  r.path(40, { width: 26, aim: 0 });
  scatterJungle(r, 21, undefined, { density: 0.4, ruins: 1, inset: 56, palms: 0 });
  void flight;
};

/**
 * 22 - SUNKEN VAULT.
 *
 * Down into the temple's flooded basement. The route descends a shaft, runs
 * along narrow stone walkways a metre above black water, and climbs out the
 * far side. Low ceilings and torchlight the whole way.
 *
 * The first genuinely underground stage, and the first time the player's own
 * height above the floor is the thing that is scarce.
 */
const sunkenVault = (r: Route): void => {
  // The route's own kill volumes are VOID here, and the water is laid
  // explicitly and narrow. A route that declares water under itself floods the
  // whole valley - which under a roof is a pale plane filling the frame rather
  // than a flooded basement.
  r.made('stone').over('void');
  r.width = 16;

  r.path(30, { aim: 0 });

  // The descent: a switchback shaft cut into the floor of the temple.
  const shaftTop = r.y;
  r.tunnel(40, { width: 16, aim: 14, rise: shaftTop - 16, headroom: 15 });
  r.tunnel(40, { width: 16, aim: -14, rise: shaftTop - 32, headroom: 15 });

  const vaultFrom = r.z;
  widen(vaultFrom - 6, vaultFrom + 230, 48);
  pit(22, 'water', -40, 40, vaultFrom, vaultFrom + 230, r.y - 5, 0.2);

  // Narrow causeways over the water, with pillars rising out of it. The
  // causeways are barely wider than the mount, and there is a real ceiling
  // eleven units up, so this is the tightest space in the game.
  for (let i = 0; i < 4; i += 1) {
    const to = i % 2 === 0 ? 18 : -18;
    r.tunnel(50, { width: 9, aim: to, headroom: 12, kind: 'stone' });
    // A gap in the causeway, crossed on a slab that slides across the vault.
    r.gap(20);
    r.shuttle(r.z - 10, { x: r.x, width: 12, length: 13, travel: 15, rate: 0.19, phase: i * 0.3, kind: 'stone' });
    for (let p = 0; p < 3; p += 1) {
      block(22, 'stone', to + p * 14 - 20, r.y - 12, r.z - 44 + p * 16, 5, 24, 5);
    }
  }
  torchlight(r, 230, 24);

  // Back up, and out.
  r.tunnel(44, { width: 16, aim: 0, rise: shaftTop - 16, headroom: 16 });
  r.path(40, { width: 22, rise: shaftTop, kind: 'gilded' });
  scatterCave(r, 22);
};

/**
 * 23 - THE EMBERWAY.
 *
 * The temple's furnace floor: a hall of fire pits crossed on stone slabs that
 * slide across them, with censers swinging over the crossings.
 *
 * Fire is used here and nowhere else in the world, and only because a temple
 * this old having kept something burning is the single most legible way to say
 * that it is not as abandoned as it looks.
 */
const emberway = (r: Route): void => {
  r.made('gilded').over('fire');
  r.width = 15;

  r.path(34, { aim: 0 });

  const hallFrom = r.z;
  widen(hallFrom - 8, hallFrom + 250, 46);
  pit(23, 'fire', -46, 46, hallFrom, hallFrom + 250, r.y - 7);

  for (let i = 0; i < 5; i += 1) {
    // A fixed island.
    r.path(26, { width: 18, kind: 'gilded', aim: i % 2 === 0 ? -14 : 14 });

    // The crossing: two slabs sliding in opposite directions over the pit.
    r.gap(46);
    for (const [offset, dir] of [
      [-13, 1],
      [13, -1],
    ] as const) {
      mover(
        23,
        'gilded',
        r.x + offset,
        r.y,
        r.z - 34 + (dir > 0 ? 0 : 18),
        13,
        13,
        'shuttle',
        { axis: 'x', amount: 17, rate: 0.23 * dir, phase: i * 0.2 },
      );
    }

    // A censer swinging over the middle of the crossing.
    hazard(23, 'swing', {
      x: r.x,
      y: r.y + 4,
      z: r.z - 23,
      radius: 3.6,
      sweep: 16,
      rate: 1.25,
      phase: i * 0.33,
    });
    decorate(23, 'torch', r.x + 22, r.y, r.z - 23, 1.6, 0, 0);
    decorate(23, 'torch', r.x - 22, r.y, r.z - 23, 1.6, 0, 0);
  }

  colonnade(r, 250, { spacing: 22, offset: 40, height: 38, broken: 0.05 });
  r.path(38, { width: 22, aim: 0 });
  scatterJungle(r, 23, undefined, { density: 0.3, ruins: 0.9, inset: 54, palms: 0 });
};

/**
 * 24 - CAROUSEL COURT.
 *
 * The temple's machinery, still running. A vast circular hall whose floor is
 * four rings of orbiting stones at four radii and four speeds, turning over a
 * drop, with the way out on the far side.
 *
 * The purest expression of the moving-platform system: there is no fixed
 * ground at all between the entrance and the exit, and the whole crossing is
 * done by riding.
 */
const carouselCourt = (r: Route): void => {
  r.made('gilded').over('void');
  r.width = 18;

  r.path(34, { aim: 0 });

  const hallFrom = r.z;
  const hallHalf = 60;
  widen(hallFrom - 10, hallFrom + 260, hallHalf + 14);
  pit(24, 'void', -hallHalf, hallHalf, hallFrom, hallFrom + 260, r.y - 30);

  // Four hubs down the hall's centreline, each carrying three arms at stepped
  // radii, alternating direction. A player crosses by stepping outward on one
  // hub and inward on the next.
  for (let hub = 0; hub < 4; hub += 1) {
    const hubZ = hallFrom + 44 + hub * 58;
    const dir = hub % 2 === 0 ? 1 : -1;
    for (let arm = 0; arm < 3; arm += 1) {
      for (let k = 0; k < 2; k += 1) {
        mover(
          24,
          'gilded',
          0,
          r.y,
          hubZ,
          14 - arm,
          14 - arm,
          'orbit',
          {
            amount: 16 + arm * 15,
            rate: dir * (0.42 - arm * 0.07),
            phase: (arm * 0.2 + k * 0.5 + hub * 0.11) % 1,
          },
        );
      }
    }
    block(24, 'gilded', -4, r.y - 30, hubZ - 4, 8, 30, 8);
    decorate(24, 'torch', 0, r.y, hubZ, 1.6, 0, 0);
  }

  // Censers swinging between the hubs, so the ride is not a free one.
  for (let i = 0; i < 3; i += 1) {
    hazard(24, 'swing', {
      x: 0,
      y: r.y + 5,
      z: hallFrom + 73 + i * 58,
      radius: 4,
      sweep: 34,
      rate: 0.9,
      phase: i * 0.4,
    });
  }

  r.gap(260, { aim: 0 });
  colonnade(r, 260, { spacing: 26, offset: hallHalf + 4, height: 50, broken: 0.08 });
  guardians(r, hallFrom + 250, 4, hallHalf - 6);

  r.path(40, { width: 22, aim: 0 });
  scatterJungle(r, 24, undefined, { density: 0.3, ruins: 0.9, inset: 66, palms: 0 });
};

/**
 * 25 - THE DEEP CAVERN.
 *
 * Out through the bottom. The river that undermined the temple runs through a
 * cave beneath it, and the expedition follows it: a long, dark, narrow,
 * descending tunnel lit by nothing but fungus and the odd shaft of daylight,
 * with the roof coming down in pieces.
 *
 * The darkest and most enclosed stage in the game, and deliberately the one
 * immediately before the act that is all sky.
 */
const deepCavern = (r: Route): void => {
  // Void under the route; the river itself is laid narrow, below. See
  // `sunkenVault` for why.
  r.made('cave').over('void');
  r.width = 16;

  r.path(28, { aim: 0, kind: 'stone' });

  const caveFrom = r.z;
  const mouth = r.y;
  r.tunnel(56, { width: 15, aim: -14, rise: mouth - 14, headroom: 16 });
  // The river below, laid SECTION BY SECTION as the cave descends.
  //
  // One volume across the whole stage would be laid at the elevation the route
  // happened to be at when the line ran, and this cave drops another sixteen
  // units after that - which put the last of its own floor underneath its own
  // river. A kill volume has to follow the ground it protects.
  // Narrow, because it is a river in a cave rather than a flooded valley: a
  // volume the full width of the world reads as a pale plane filling the
  // frame once there is a roof over it.
  pit(25, 'rapids', -34, 34, caveFrom, r.z, r.y - 8, 2.2);

  for (let i = 0; i < 4; i += 1) {
    const to = i % 2 === 0 ? 16 : -16;
    const sectionFrom = r.z;
    r.tunnel(52, { width: 11, aim: to, rise: r.y - 4, headroom: 13 });

    // A break in the cave floor, crossed on stones standing in the river.
    r.gap(12);
    r.stones(2, { size: 9, gap: 8, weave: 6, kind: 'cave' });

    // Roof falls, from a ceiling the player cannot see past.
    hazard(25, 'faller', {
      x: to * 0.6,
      y: r.y,
      z: r.z - 24,
      radius: 5.6,
      sweep: 13,
      rate: 2.7,
      phase: (i * 0.29) % 1,
    });
    for (let j = 0; j < 3; j += 1) {
      decorate(25, 'mushroom', r.x + r.wobble(9), r.y, r.z - 40 + j * 14, 1 + r.next(), 0, j % 2);
    }
    pit(25, 'rapids', -34, 34, sectionFrom, r.z, r.y - 8, 2.2);
  }

  // A shaft of daylight where the roof has fallen in, and a fall coming
  // through it - the one bright thing in the stage, and the way out is under it.
  waterfall(r, r.x + 12, r.z + 18, r.y + 34, 36, { width: 12, scale: 2 });
  r.tunnel(46, { width: 15, aim: 0, rise: r.y + 12, headroom: 20 });

  r.made('rock');
  r.path(40, { width: 22, rise: r.y + 8 });
  scatterCave(r, 25);
};

export const buildAct5 = (): void => {
  defineStage(21, greatStair);
  defineStage(22, sunkenVault);
  defineStage(23, emberway);
  defineStage(24, carouselCourt);
  defineStage(25, deepCavern);
};
