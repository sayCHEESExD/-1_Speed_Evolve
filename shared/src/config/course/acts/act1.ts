import { decorate, hazard } from '../emit.js';
import { defineStage } from '../stage.js';
import type { Route } from '../route.js';
import { scatterJungle, streamUnder } from './scenery.js';

/**
 * ACT ONE - THE JUNGLE ENTRANCE.
 *
 * Five stages that teach the mount, in the order everything later assumes:
 * steer, hop, read a weave, climb, time a hazard.
 *
 * THE TRAIL IS RAISED THROUGH SWAMP. Either side of it is a strip of verge and
 * then mud, a few units down, which is where a run ends. That is what the old
 * act lacked: it laid walkable forest floor twenty-nine units out on both
 * sides, so the "trail" was a paint stripe down the middle of a field and a
 * player could hold W for five stages without looking at it. The trees now
 * stand IN the swamp right beside the verge, so the rainforest is what bounds
 * the path rather than a clamp nobody can see.
 *
 * Every size here is a fraction of `r.reach` - how far a jump carries at the
 * stage's own level - so a gap asks the same of a player at stage one as it
 * does at stage five. This act keeps every chain FORGIVING: gap plus landing
 * is at least a whole jump, so a jump from the very edge never overshoots.
 * Overshooting is taught in act two.
 */

/** A raised trail through a swamp: a shallow, visible, lethal surface. */
const swamp = (r: Route): void => {
  r.over('mud');
  r.fall = 4.5;
};

/** The verge either side of a trail this wide: three units of undergrowth. */
const verge = (width: number): number => width / 2 + 3;

/**
 * 1 - RIVERSIDE TRAIL.
 *
 * Steering, and the first two fords. A trail ten wide that weaves, then a
 * ford of broad stones with honest little gaps, then a longer weave, then a
 * second ford whose stones step side to side. At level one this is a walk
 * that asks the player to look where they are going.
 */
const riversideTrail = (r: Route): void => {
  swamp(r);
  const J = r.reach;
  r.width = 10;
  r.made('dirt');

  r.path(46, { aim: -12, shoulders: verge(10) });
  r.path(40, { aim: 10, shoulders: verge(10) });
  streamUnder(r, 10);

  // The first ford: three broad stones, gaps a third of a jump.
  r.hops(3, { gap: J * 0.35, land: J * 0.95, width: 10, jog: 4, kind: 'rock' });
  r.gap(J * 0.35);

  r.weave(78, { width: 9, amp: 9, bends: 3, shoulders: verge(9) });

  // The second ford: narrower stones that step side to side.
  r.hops(4, { gap: J * 0.4, land: J * 0.85, width: 8, jog: 6, kind: 'rock' });
  r.gap(J * 0.4);
  r.path(40, { width: 10, aim: 0, shoulders: verge(10) });

  scatterJungle(r, 1, undefined, { density: 1.7, palms: 0.3, inset: 9, reach: 34, drop: 12 });
};

/**
 * 2 - FALLEN TIMBER.
 *
 * Logs across a muddy gully. A log is five wide and it runs straight, so it
 * asks for a LINE rather than a jump - and the logs do not line up with each
 * other, so each one is a small aim. Between the runs, a bank of slick mud
 * that weaves.
 */
const fallenTimber = (r: Route): void => {
  swamp(r);
  const J = r.reach;
  r.width = 9;
  r.made('dirt');

  r.path(40, { aim: 8, shoulders: verge(9) });
  r.logs(3, { run: 18, gap: J * 0.4, width: 6, aim: -6, scatter: 1.6 });

  const muddyFrom = r.z;
  r.gap(J * 0.35);
  r.weave(56, { width: 8, amp: 7, bends: 2, kind: 'mud', shoulders: verge(8) });
  r.slippery(muddyFrom, r.z, 0.62);

  r.logs(4, { run: 15, gap: J * 0.45, width: 5.5, aim: 8, scatter: 2 });
  r.gap(J * 0.3);
  r.path(28, { width: 8, aim: -4, shoulders: verge(8) });
  r.logs(3, { run: 14, gap: J * 0.5, width: 5, aim: -2, scatter: 2.2 });
  r.gap(J * 0.3);
  r.path(34, { width: 9, aim: 0, shoulders: verge(9) });

  scatterJungle(r, 2, undefined, { density: 1.8, fallen: 0.5, inset: 8, reach: 30, drop: 12 });
};

/**
 * 3 - CREEKSTONES.
 *
 * A creek crossed on stones that WEAVE, in three runs, each tighter than the
 * last. The gaps stay kind; what is being asked is that the player look left
 * and right before every jump rather than straight ahead - the reading skill
 * every later stage assumes they have.
 */
const creekstones = (r: Route): void => {
  r.over('water', 0.45);
  r.fall = 3.5;
  const J = r.reach;
  r.width = 9;
  r.made('dirt');

  r.path(36, { aim: -6, shoulders: verge(9) });

  r.hops(5, { gap: J * 0.4, land: J * 0.72, width: 8, jog: 7, kind: 'rock', aim: 6 });
  r.gap(J * 0.35);
  r.path(18, { width: 9, kind: 'rock' });
  r.hops(6, { gap: J * 0.45, land: J * 0.68, width: 7, jog: 8, kind: 'rock', aim: -4 });
  r.gap(J * 0.35);
  r.path(18, { width: 9, kind: 'rock' });
  r.hops(4, { gap: J * 0.5, land: J * 0.66, width: 6.5, jog: 9, kind: 'rock' });
  r.gap(J * 0.4);

  r.path(40, { width: 10, kind: 'dirt', aim: 0, shoulders: verge(10) });

  scatterJungle(r, 3, undefined, { density: 1.3, palms: 0.5, inset: 8, reach: 30, drop: 12 });
};

/**
 * 4 - CANOPY STEPS.
 *
 * The expedition leaves the ground: a climb up buttress roots, each one a
 * short hop UP and to the side, then a plank walkway, two crossings on
 * platforms sliding between trees, and a way back down.
 *
 * The first real height and the first thing that has to be WAITED for. Each
 * shuttle crossing is too wide to jump without the platform, and the walkway
 * before it is long enough to stop on.
 */
const canopySteps = (r: Route): void => {
  r.made('dirt').over('void');
  const J = r.reach;
  const H = r.jumpHeight;
  r.width = 9;

  r.path(34, { aim: 8 });
  r.hops(6, { gap: J * 0.3, land: J * 0.7, step: H * 0.45, width: 8, jog: 6, kind: 'log', depth: 5 });
  r.gap(J * 0.3);
  r.made('plank');
  r.walkway(40, { width: 7, aim: -8, rails: true });

  // Two crossings on platforms sliding between trees. The span is too wide
  // to jump without them; slow, and out of phase with each other.
  for (const [side, phase] of [
    [1, 0],
    [-1, 0.5],
  ] as const) {
    const from = r.z;
    const reachOut = J * 0.42;
    const platform = J * 0.45;
    r.gap(reachOut * 2 + platform);
    r.shuttle(from + reachOut + platform / 2, {
      x: r.x,
      width: 9,
      length: platform,
      travel: 13,
      rate: 0.14,
      phase,
      kind: 'plank',
    });
    decorate(4, 'tree', r.x + side * 18, r.y - 40, from + reachOut, 2.6, 0, 1);
    r.walkway(32, { width: 7, aim: r.x - side * 6, rails: true });
  }

  r.stairs(6, -3.2, { run: 8, width: 9, kind: 'dirt' });
  r.made('dirt');
  r.path(34, { width: 10, aim: 0 });

  scatterJungle(r, 4, undefined, { density: 1.8, canopy: true, inset: 9, reach: 30 });
};

/**
 * 5 - OVERGROWN GATE.
 *
 * The first ruin and the first thing that kills on its own. A broken span, a
 * run of fallen pillar-tops, and a narrow court where two stone arms sweep
 * the whole floor.
 *
 * The court is sixteen units wide rather than sixty-eight. In the old one the
 * arm swept a plaza a player could simply ride round the edge of; here there
 * is no edge to ride round, so the arm is a timing and not a detour. ONE arm,
 * and slow: watch it pass, then go. Two arms opposite each other make a bar
 * through the middle that is never clear for long enough to cross.
 */
const overgrownGate = (r: Route): void => {
  r.made('stone').over('void');
  const J = r.reach;
  r.width = 8;

  r.path(40, { aim: -8 });
  r.path(24, { width: 7, kind: 'ruin' });
  r.gap(J * 0.55, { aim: -3 });
  r.path(24, { width: 7, kind: 'ruin', aim: 3 });

  r.hops(3, { gap: J * 0.4, land: J * 0.66, width: 7, jog: 7, kind: 'ruin', depth: 8 });
  r.gap(J * 0.35);
  r.path(18, { width: 8, kind: 'stone' });

  const courtZ = r.z + 34;
  r.plaza(68, { halfWidth: 8, kind: 'ruin', aim: r.x });
  for (let i = 0; i < 3; i += 1) {
    hazard(5, 'spinner', {
      x: r.x,
      y: r.y + 2.4,
      z: courtZ,
      radius: 2.4,
      sweep: 14.5 - i * 4.2,
      rate: 0.5,
      phase: 0,
    });
  }
  decorate(5, 'statue', r.x - 16, r.y, courtZ - 26, 1.8, 0.4, 0);
  decorate(5, 'statue', r.x + 16, r.y, courtZ - 26, 1.8, -0.4, 0);
  decorate(5, 'arch', r.x, r.y, courtZ + 30, 2.2, 0, 0);

  r.path(40, { width: 9, kind: 'stone', aim: 0 });

  scatterJungle(r, 5, undefined, { density: 1.6, ruins: 0.6, inset: 10, reach: 30 });
};

export const buildAct1 = (): void => {
  defineStage(1, riversideTrail);
  defineStage(2, fallenTimber);
  defineStage(3, creekstones);
  defineStage(4, canopySteps);
  defineStage(5, overgrownGate);
};
