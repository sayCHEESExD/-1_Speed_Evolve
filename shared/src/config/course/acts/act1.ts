import { decorate, hazard, pit, widen } from '../emit.js';
import { defineStage } from '../stage.js';
import type { Route } from '../route.js';
import { scatterJungle, streamUnder } from './scenery.js';

/**
 * ACT ONE - THE JUNGLE ENTRANCE.
 *
 * Five stages that teach the mount at the width the player can afford to learn
 * at. The trail is wide, the drops are shallow, and every mechanic the rest of
 * the expedition uses is introduced here exactly once: a curve, a hop, a
 * lateral read, a climb, and a hazard - in that order, one per stage.
 *
 * Nothing in this act is a floating platform over a void. It is a cut trail
 * through real ground with a river beside it, which is the promise the whole
 * course is making about what kind of world this is.
 */

/**
 * 1 - RIVERSIDE TRAIL.
 *
 * One long S-curve on a wide dirt trail, with the river running alongside and
 * two shallow fords cut through it. The only thing it asks is that the player
 * steer while moving, which at level one they have to learn before anything
 * else can be asked of them.
 */
const riversideTrail = (r: Route): void => {
  // Over a DROP, not over the river. The river is a feature beside the trail -
  // laid explicitly by `streamUnder` where it actually crosses - rather than
  // the default under every metre of it. Setting the route's own `below` to
  // water floods the entire valley, which reads as a causeway through a lake
  // instead of a trail through a forest.
  r.made('dirt').over('void');
  r.width = 26;

  r.path(70, { aim: -16, shoulders: 58 });
  streamUnder(r, 10);
  r.path(58, { aim: 18, shoulders: 58 });

  // The first ford: a break in the trail with three broad stones across it.
  // Broad on purpose - at this level it is a walk, and it exists so the SHAPE
  // of a crossing is familiar long before one is difficult.
  r.gap(6);
  r.stones(3, { size: 14, gap: 4, weave: 3 });
  r.gap(6);

  r.path(74, { aim: -10, shoulders: 58 });
  r.gap(7);
  r.stones(3, { size: 13, gap: 5, weave: 4 });
  r.gap(7);
  r.path(62, { aim: 6, shoulders: 58 });

  scatterJungle(r, 1, undefined, { density: 1.4, palms: 0.3, inset: 17, reach: 38 });
};

/**
 * 2 - FALLEN TIMBER.
 *
 * The trail narrows and crosses a muddy gully on felled trunks. A log is
 * narrow and it runs straight, so it asks for a line rather than a jump - a
 * different skill from a gap, which is why the two are introduced on different
 * stages rather than together.
 */
const fallenTimber = (r: Route): void => {
  r.made('dirt').over('void');
  r.width = 22;

  r.path(52, { aim: 12, shoulders: 54 });
  r.width = 16;

  // The gully the timber crosses: mud, and only where the logs are.
  const gullyFrom = r.z;
  r.logs(3, { run: 20, gap: 5, width: 12, aim: -6 });
  r.path(34, { width: 18, aim: -14, shoulders: 50 });
  r.logs(4, { run: 17, gap: 6, width: 11, aim: 10 });

  // A bank of mud between the two log runs: slick, so the player feels the
  // ground change under them for the first time.
  const muddyFrom = r.z;
  r.path(46, { width: 20, aim: 0, shoulders: 50 });
  r.slippery(muddyFrom, r.z, 0.62);

  r.logs(3, { run: 18, gap: 7, width: 11, aim: -8 });
  pit(2, 'mud', -70, 70, gullyFrom, r.z, r.y - 9);
  r.path(40, { width: 22, aim: 0, shoulders: 54 });

  scatterJungle(r, 2, undefined, { density: 1.5, fallen: 0.5, inset: 16, reach: 34 });
};

/**
 * 3 - CREEKSTONES.
 *
 * A wide creek crossed on stones that WEAVE. The gaps are small; what is being
 * asked is that the player look left and right rather than straight ahead,
 * which is the reading skill every later stage assumes they have.
 */
const creekstones = (r: Route): void => {
  r.made('dirt').over('water', 0.5);
  r.width = 20;

  r.path(44, { aim: -8, shoulders: 52 });

  // The creek. Declared wide so the water reads as a body rather than a ditch,
  // and the stones weave nearly the full width of it.
  widen(r.z - 4, r.z + 150, 56);
  pit(3, 'water', -56, 56, r.z, r.z + 150, r.y - 6, 0.35);

  r.stones(5, { size: 13, gap: 6, weave: 9, aim: 14 });
  r.path(26, { width: 22, kind: 'rock', aim: 10 });
  r.stones(6, { size: 12, gap: 7, weave: 10, aim: -16 });
  r.path(24, { width: 20, kind: 'rock', aim: -12 });
  r.stones(4, { size: 12, gap: 8, weave: 9, aim: 4 });

  r.path(48, { width: 24, kind: 'dirt', aim: 0, shoulders: 52 });

  scatterJungle(r, 3, undefined, { density: 1.1, palms: 0.5, inset: 30, reach: 26 });
};

/**
 * 4 - CANOPY STEPS.
 *
 * The expedition leaves the ground. A staircase of ledges climbs into the
 * canopy, a plank walkway runs through it, and two slow shuttle platforms
 * carry the player across the gaps between trees.
 *
 * The first stage with real height, and therefore the first where a mistake
 * costs a run - which is why the platforms are slow and broad.
 */
const canopySteps = (r: Route): void => {
  r.made('dirt').over('void');
  r.width = 20;

  r.path(40, { aim: 10, shoulders: 50 });
  r.stairs(7, 3.4, { run: 7.5, width: 18 });
  r.made('plank');
  r.walkway(56, { width: 14, aim: -12, rails: true });

  // Two crossings, each on a platform sliding between two trees. Broad, slow
  // and out of phase with each other, so a player who misses the first has
  // somewhere to wait rather than a rhythm to fight.
  r.gap(30);
  r.shuttle(r.z - 15, { x: r.x + 6, width: 15, length: 15, travel: 16, rate: 0.13, kind: 'plank' });
  r.walkway(30, { width: 14, aim: 6 });
  r.gap(32);
  r.shuttle(r.z - 16, { x: r.x - 4, width: 15, length: 15, travel: 18, rate: 0.11, phase: 0.5, kind: 'plank' });
  r.walkway(38, { width: 15, aim: -6, rails: true });

  r.stairs(6, -3.2, { run: 8, width: 18, kind: 'dirt' });
  r.made('dirt');
  r.path(36, { width: 22, aim: 0 });

  scatterJungle(r, 4, undefined, { density: 1.6, canopy: true, inset: 20, reach: 30 });
};

/**
 * 5 - OVERGROWN GATE.
 *
 * The first ruin, and the first thing in the world that can kill on its own.
 * A stone causeway, a broken span with one real gap, and a small court where
 * two ancient arms sweep slowly across the floor.
 *
 * Slowly is the whole design. A hazard the player meets at level fifteen has
 * to be legible before it is dangerous, or the lesson it teaches is that the
 * game is unfair rather than that hazards have timing.
 */
const overgrownGate = (r: Route): void => {
  r.made('stone').over('void');
  r.width = 18;

  r.path(50, { aim: -10, shoulders: 46 });

  // The broken span: two stubs and one honest gap between them.
  r.path(30, { width: 14, kind: 'ruin' });
  r.gap(13, { aim: -4 });
  r.path(34, { width: 14, kind: 'ruin', aim: 4 });

  // The court. Two arms turning about a hub at the centre, at different radii
  // so the safe line changes as the player crosses rather than being a single
  // gap to walk through.
  const courtZ = r.z + 40;
  r.plaza(80, { halfWidth: 34, kind: 'ruin', aim: 0 });
  for (const [radius, rate, phase] of [
    [17, 0.42, 0],
    [27, -0.3, 0.35],
  ] as const) {
    for (let i = 0; i < 3; i += 1) {
      hazard(5, 'spinner', {
        x: 0,
        y: r.y + 2.4,
        z: courtZ,
        radius: 3.1,
        sweep: radius - i * 4.6,
        rate,
        phase,
      });
    }
  }
  decorate(5, 'statue', -26, r.y, courtZ - 22, 1.8, 0.4, 0);
  decorate(5, 'statue', 26, r.y, courtZ - 22, 1.8, -0.4, 0);
  decorate(5, 'arch', 0, r.y, courtZ + 34, 2.2, 0, 0);

  r.path(44, { width: 20, kind: 'stone', aim: 0 });

  scatterJungle(r, 5, undefined, { density: 1.3, ruins: 0.6, inset: 22, reach: 28 });
};

export const buildAct1 = (): void => {
  defineStage(1, riversideTrail);
  defineStage(2, fallenTimber);
  defineStage(3, creekstones);
  defineStage(4, canopySteps);
  defineStage(5, overgrownGate);
};
