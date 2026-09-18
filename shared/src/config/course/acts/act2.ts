import { decorate, hazard, pit, widen } from '../emit.js';
import { defineStage } from '../stage.js';
import type { Route } from '../route.js';
import { abandonedCamp, cliffWall, scatterJungle, waterfall } from './scenery.js';

/**
 * ACT TWO - DEEP JUNGLE.
 *
 * The trail stops being a trail. From here the expedition is crossing things
 * rather than walking past them: a river in spate, a gorge on rope, a cliff
 * behind a waterfall, a climb up the roots of a tree the size of a building,
 * and finally a bridge somebody else built and did not finish crossing.
 *
 * The act's job is COMBINATION. Act one introduced a curve, a hop, a lateral
 * read, a climb and a hazard one at a time; every stage here asks for two of
 * them at once, which is the whole difference between knowing the controls and
 * being able to use them.
 */

/**
 * 6 - RAPIDS CROSSING.
 *
 * A river too wide and too fast to ford. Three crossings in sequence: drifting
 * logs that slide across the current, a spur of wet rock, and a rope bridge
 * over the fastest water.
 *
 * The logs move ALONG the river rather than across the player's path, so the
 * question is when to step on rather than how far to jump - which is the first
 * time this course asks for timing at all.
 */
const rapidsCrossing = (r: Route): void => {
  r.made('rock').over('rapids', 2.4);
  r.width = 18;

  r.path(46, { aim: -12 });

  // The river itself: wide, fast, and declared as one body so the renderer
  // draws a single sheet of moving water under the whole crossing.
  const riverFrom = r.z;
  widen(riverFrom - 6, riverFrom + 250, 62);
  pit(6, 'rapids', -62, 62, riverFrom, riverFrom + 250, r.y - 9, 2.4);

  // Drifting logs. Each shuttles along Z at its own rate, so the line across
  // is never the same twice.
  for (let i = 0; i < 4; i += 1) {
    r.shuttle(riverFrom + 22 + i * 26, {
      x: r.x - 14 + i * 9,
      width: 9,
      length: 26,
      travel: 15,
      rate: 0.1 + i * 0.022,
      phase: i * 0.27,
      axis: 'z',
      kind: 'log',
    });
  }
  r.gap(124, { aim: 16 });

  // A wet rock spur to regroup on. Slick, because everything in this river is.
  const spurFrom = r.z;
  r.path(40, { width: 22, kind: 'rock' });
  r.slippery(spurFrom, r.z, 0.66);

  r.ropeBridge(86, { width: 7, aim: -8 });
  r.path(34, { width: 20, kind: 'dirt', aim: 0 });

  waterfall(r, r.x - 54, riverFrom + 40, r.y + 34, 40, { width: 18 });
  abandonedCamp(r, riverFrom + 20, 1);
  scatterJungle(r, 6, undefined, { density: 1.2, palms: 0.4, inset: 22 });
};

/**
 * 7 - THE ROPEWALK.
 *
 * A gorge crossed on three rope bridges strung between the trees, high enough
 * that the valley floor is a texture rather than a place. Vine-hung logs swing
 * across the spans.
 *
 * A rope bridge SAGS and its slats have gaps between them, so a player moving
 * slowly hops and a player moving fast runs straight over the gaps. The stage
 * is therefore easier the faster you are, which is the first time the course
 * rewards the progression directly rather than merely permitting it.
 */
const ropewalk = (r: Route): void => {
  r.made('plank').over('void');
  r.width = 16;

  r.path(34, { rise: r.y + 14, kind: 'dirt' });
  r.stairs(6, 3.6, { run: 7, width: 16, kind: 'dirt' });

  // Three spans, each with a swinging log over its middle, each swinging at a
  // different rate so the crossings cannot be learned as one rhythm.
  const spans = [
    { length: 80, aim: -20, rate: 1.05, phase: 0 },
    { length: 74, aim: 18, rate: 1.4, phase: 0.4 },
    { length: 88, aim: -6, rate: 0.85, phase: 0.75 },
  ];
  for (const span of spans) {
    const midZ = r.z + span.length / 2;
    const midX = (r.x + span.aim) / 2;
    r.ropeBridge(span.length, { width: 7, aim: span.aim });
    hazard(7, 'swing', {
      x: midX,
      y: r.y + 3.4,
      z: midZ,
      radius: 3.4,
      sweep: 15,
      rate: span.rate,
      phase: span.phase,
    });
    decorate(7, 'vine', midX, r.y + 20, midZ, 2.2, 0, 0);
    // A platform between spans, so a crossing is a crossing rather than a
    // 240-unit single failure.
    r.path(22, { width: 17, kind: 'plank', rails: true });
  }

  r.stairs(6, -3.4, { run: 7.5, width: 18, kind: 'dirt' });
  r.made('dirt');
  r.path(30, { width: 22, aim: 0 });

  scatterJungle(r, 7, undefined, { density: 1.5, canopy: true, inset: 24, reach: 52 });
};

/**
 * 8 - WATERFALL LEDGE.
 *
 * A narrow shelf cut into a cliff, running BEHIND three falls. The cliff is a
 * real solid on one side and the drop is real on the other, and the falls
 * themselves kill - so the whole stage is one long question about timing on a
 * surface that is deliberately slick with spray.
 */
const waterfallLedge = (r: Route): void => {
  r.made('rock').over('water', 1.6);
  r.width = 13;

  r.path(40, { aim: 20, rise: r.y + 6 });

  const ledgeFrom = r.z;
  // Three curtains. The gaps between them are where the player waits, and they
  // are wide enough to wait ON - a timing stage with nowhere to stand is a
  // memory test.
  for (let i = 0; i < 3; i += 1) {
    r.path(38, { width: 12, aim: r.x + (i % 2 === 0 ? -9 : 9), rails: true });
    const fallZ = r.z + 9;
    waterfall(r, r.x, fallZ, r.y + 46, 46, { lethal: true, width: 15 });
    r.gap(0);
    r.path(20, { width: 12 });
  }
  cliffWall(r, r.z - ledgeFrom, 1, 78);
  r.slippery(ledgeFrom, r.z, 0.58, -3.5);

  // The pool at the bottom of the falls, so the drop has a bottom that belongs
  // to the same waterfall the player has been dodging.
  pit(8, 'water', r.x - 70, r.x + 70, ledgeFrom, r.z, r.y - 24, 1.1);

  r.path(44, { width: 20, kind: 'rock', aim: 0, rise: r.y - 4 });
  scatterJungle(r, 8, undefined, { density: 0.9, inset: 30, palms: 0.5 });
};

/**
 * 9 - ROOTWOOD CLIMB.
 *
 * Vertical. The route switchbacks up the buttress roots of one enormous tree,
 * turning back on itself four times, while rocks come down from the canopy.
 *
 * The switchback is the point: it is the first stage where the player is
 * travelling in -X as often as +X, and where what is above them matters as
 * much as what is in front.
 */
const rootwoodClimb = (r: Route): void => {
  r.made('log').over('void');
  r.width = 14;

  r.path(34, { kind: 'dirt', aim: -26 });

  // Four switchback ramps. Each climbs, then the route reverses across the
  // trunk and climbs again.
  let height = r.y;
  for (let i = 0; i < 4; i += 1) {
    const toX = i % 2 === 0 ? 26 : -26;
    height += 15;
    r.path(62, { width: 13, aim: toX, rise: height, rails: true });
    r.path(20, { width: 16, aim: toX * 0.8 });

    // Debris from above, one per landing, offset so the whole climb is never
    // safe at the same moment.
    hazard(9, 'faller', {
      x: toX * 0.8,
      y: height,
      z: r.z - 10,
      radius: 4.2,
      sweep: 34,
      rate: 3.4,
      phase: i * 0.23,
    });
  }

  // The trunk itself, standing in the middle of the switchbacks.
  for (let i = 0; i < 6; i += 1) {
    decorate(9, 'tree', 0, r.y - 60 + i * 12, r.z - 120 + i * 4, 4.5, i * 0.8, 1);
  }
  for (let i = 0; i < 10; i += 1) {
    decorate(9, 'root', r.wobble(40), r.y - 56 + i * 9, r.z - 130 + r.next() * 120, 2 + r.next(), r.next() * 6.28, i % 2);
  }

  r.made('dirt');
  r.path(40, { width: 20, aim: 0 });
  scatterJungle(r, 9, undefined, { density: 1.3, canopy: true, inset: 34 });
};

/**
 * 10 - THE BROKEN SPAN.
 *
 * Somebody built a bridge here, and it has been falling down for a century.
 * The near half still holds under weight but not for long; the middle is gone
 * entirely and is crossed on two stone discs turning about their own hubs; the
 * far half is stubs with real gaps.
 *
 * The act's closing exam: a collapse, a moving platform and a jump, in that
 * order, with no ground between them.
 */
const brokenSpan = (r: Route): void => {
  r.made('ruin').over('rapids', 2.8);
  r.width = 16;

  r.path(36, { kind: 'stone', aim: 0 });

  const gorgeFrom = r.z;
  widen(gorgeFrom - 8, gorgeFrom + 300, 58);
  pit(10, 'rapids', -58, 58, gorgeFrom, gorgeFrom + 300, r.y - 30, 2.8);

  // The near half: five sections, each giving way a beat after the one before.
  r.collapsing(78, { sections: 5, rate: 0.14, width: 15, aim: -8 });

  // The missing middle. Two carousels, counter-rotating, at a radius that puts
  // their near edges within a stride of the stubs at either side.
  const hubZ = r.z + 44;
  r.gap(88, { aim: 10 });
  r.carousel(hubZ - 18, { x: -20, y: r.y, size: 13, radius: 17, rate: 0.46, kind: 'ruin' });
  r.carousel(hubZ + 20, { x: 18, y: r.y, size: 13, radius: 17, rate: -0.4, phase: 0.5, kind: 'ruin' });

  // The far half: stubs and honest gaps.
  r.path(26, { width: 14 });
  r.gap(14, { aim: 2 });
  r.path(24, { width: 13 });
  r.gap(16, { aim: -6 });
  r.path(30, { width: 15, aim: 0 });

  // The bridge's ruined towers, so the span reads as a structure.
  for (const z of [gorgeFrom + 10, gorgeFrom + 290]) {
    for (const side of [-1, 1]) {
      decorate(10, 'arch', side * 22, r.y, z, 2.6, 0, 0);
      decorate(10, 'statue', side * 30, r.y, z, 1.6, 0, 0);
    }
  }
  waterfall(r, -46, gorgeFrom + 120, r.y + 8, 44, { width: 22, scale: 2.4 });

  r.made('stone');
  r.path(38, { width: 20, aim: 0 });
  scatterJungle(r, 10, undefined, { density: 1, ruins: 0.5, inset: 30 });
};

export const buildAct2 = (): void => {
  defineStage(6, rapidsCrossing);
  defineStage(7, ropewalk);
  defineStage(8, waterfallLedge);
  defineStage(9, rootwoodClimb);
  defineStage(10, brokenSpan);
};
