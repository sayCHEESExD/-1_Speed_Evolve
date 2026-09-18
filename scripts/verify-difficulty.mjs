/**
 * Is the course a course, or a highway?
 *
 * Drives the REAL shared simulation - `stepPlayer`, `WorldCollision`, the
 * server's own death test (`sampleTriggers`) and the moving platforms' clock -
 * with three riders:
 *
 *   hold     W held and jump pressed again the instant it lands. Never steers.
 *            The literal "hold W + spam jump".
 *   spam     The same, but it steers - toward the ground under the point it is
 *            going to LAND on. W held, jump hammered, mount kept on the path.
 *   runner   W held, steering along the path, jumping only where the ground
 *            ends or steps up. The realistic "just hold W and hop the gaps"
 *            player: no timing, no line choice, no waiting for anything.
 *   skilled  Plans. Every few frames it tries a handful of options on a copy of
 *            the simulation - run on, jump now, wait for something to come
 *            round - 2.5 seconds ahead, and takes one that does not die. It is
 *            what proves a stage FAIR: a stage the skilled rider cannot clear
 *            from most start times is a stage with an unreadable or
 *            unavoidable death in it.
 *
 * The course passes when the three riders with no skill fail most of it and
 * the skilled rider clears all of it. Guardians chase and are simulated only on the server, so
 * stages 18 and 29 are measured without them - they are harder than reported.
 *
 *   npm run verify:difficulty                 full report and the pass bar
 *   node scripts/verify-difficulty.mjs --stage 12 [--trace]
 */
import {
  COURSE_SOLIDS,
  MOVEMENT,
  MOVING_SOLIDS,
  STAGES,
  WorldCollision,
  copyMotion,
  createMotion,
  platformOffsetAt,
  resolveMovementProfile,
  stepPlayer,
} from '../shared/dist/index.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => (flag(name) ? Number(args[args.indexOf(name) + 1]) : null);
const onlyStage = value('--stage');
const trace = flag('--trace');
const quick = flag('--quick');

const collision = new WorldCollision();
const DT = 1 / 60;
const G = MOVEMENT.gravity;
const PHASES = quick ? [0, 3.9, 9.4] : [0, 1.7, 3.9, 6.2, 9.4];
const scratch = { x: 0, y: 0, z: 0 };

// ---------------------------------------------------------------------------
// The ground, as a rider sees it.
// ---------------------------------------------------------------------------

const ALL_FIXED = COURSE_SOLIDS.filter(
  (s) => s.stage > 0 && s.kind !== 'winPad' && s.maxX - s.minX < 200,
);
const ALL_MOVING = MOVING_SOLIDS.filter((s) => s.stage > 0);

const groundNear = (fromZ, toZ) => ({
  fixed: ALL_FIXED.filter((s) => s.maxZ >= fromZ && s.minZ <= toZ),
  moving: ALL_MOVING.filter((s) => s.maxZ + 60 >= fromZ && s.minZ - 60 <= toZ),
});

const stageAt = (z) =>
  STAGES.find((st) => z >= st.startZ && z < st.endZ) ?? STAGES[STAGES.length - 1];

/**
 * The X to steer for so the mount is over ground at world Z `z`.
 *
 * Among surfaces spanning `z` that are not above what a jump reaches, the one
 * needing the least lateral correction, aimed at with a small margin inside
 * its edge. That is the whole of the lazy rider's intelligence.
 */
const steerFor = (ground, x, y, z, time, reach) => {
  let best = null;
  let bestCost = Infinity;
  const consider = (minX, maxX, minZ, maxZ, top) => {
    if (z < minZ || z > maxZ) return;
    if (top > y + reach || top < y - 45) return;
    const margin = Math.min(2.2, (maxX - minX) / 3);
    const aim = Math.min(maxX - margin, Math.max(minX + margin, x));
    const cost = Math.abs(aim - x) + Math.abs(top - y) * 0.25;
    if (cost < bestCost) {
      bestCost = cost;
      best = aim;
    }
  };
  for (const s of ground.fixed) consider(s.minX, s.maxX, s.minZ, s.maxZ, s.maxY);
  for (const s of ground.moving) {
    platformOffsetAt(s, time, scratch);
    consider(
      s.minX + scratch.x,
      s.maxX + scratch.x,
      s.minZ + scratch.z,
      s.maxZ + scratch.z,
      s.maxY + scratch.y,
    );
  }
  return best;
};

/**
 * Steer for ground at `z`, or - when `z` is over a gap - at the nearest Z
 * around it that has ground. A person steers toward the path's line even when
 * their exact landing spot is over water.
 */
const steerAround = (ground, x, y, z, time, reach) => {
  for (let d = 0; d <= 48; d += 4) {
    const ahead = steerFor(ground, x, y, z + d, time, reach);
    if (ahead !== null) return ahead;
    if (d > 0) {
      const behind = steerFor(ground, x, y, z - d, time, reach);
      if (behind !== null) return behind;
    }
  }
  return null;
};

/** Where the mount will come down, if it jumps now (grounded) or is falling. */
const landingZ = (m, jumpVelocity) => {
  const vy = m.grounded ? jumpVelocity : m.vy;
  const t = Math.max(0.12, (vy + Math.sqrt(Math.max(0, vy * vy))) / G);
  return m.z + Math.max(m.vz, 0) * t;
};

/** Camera yaw 0: the camera's RIGHT is world -X, so moving to +X is a NEGATIVE moveX. */
const steerInput = (target, x) =>
  target === null ? 0 : Math.max(-1, Math.min(1, -(target - x) / 2.2));

// ---------------------------------------------------------------------------
// A ride.
// ---------------------------------------------------------------------------

const startOf = (stage) => {
  const z = stage.startZ + 4;
  const under = COURSE_SOLIDS.filter(
    (s) => s.stage === stage.index && s.minZ <= z && s.maxZ >= z && s.kind !== 'jungle',
  ).sort((a, b) => b.maxY - a.maxY)[0];
  return under ? { x: (under.minX + under.maxX) / 2, y: under.maxY + 0.05, z } : { x: 0, y: 0, z };
};

/**
 * The ground-following input every rider but `hold` uses.
 *
 * On the ground it looks a third of a second ahead - where a person riding
 * along a path is looking. In the air, or about to jump, it looks at where
 * the mount will come down.
 */
const followInput = (m, ctx, time, { moveZ = 1, jump = false } = {}) => {
  const near = Math.max(5, Math.max(m.vz, 0) * 0.33);
  const z = m.grounded && !jump ? m.z + near : landingZ(m, ctx.jumpVelocity);
  const target = steerAround(ctx.ground, m.x, m.y, z, time, ctx.reach);
  return { moveX: steerInput(target, m.x), moveZ, jump, cameraYaw: 0 };
};

/**
 * True when a rider who jumps ON PURPOSE would jump: the ground ahead ends,
 * drops away, or steps up higher than the mount can walk.
 */
const atEdge = (m, time, reach) => {
  if (!m.grounded) return false;
  const ahead = Math.max(1.5, Math.max(m.vz, 0) * DT * 4);
  collision.setTime(time);
  const floor = collision.surfaceYAt(m.x, m.z + ahead, m.y);
  if (floor === null || floor < m.y - 1.5) return true;
  // A step up: something ahead within a jump's height that the feet cannot walk onto.
  const up = collision.surfaceYAt(m.x, m.z + ahead + 1, m.y + reach - MOVEMENT.stepHeight);
  return up !== null && up > m.y + MOVEMENT.stepHeight;
};

/**
 * The skilled rider's jump: at the LAST moment the jump still lands on
 * ground.
 *
 * Where it would come down is estimated from its current velocity and a
 * level-ground airtime, and the ground there is checked at the moment it
 * would arrive - so a platform that will have moved is judged where it will
 * be. It jumps when landing now works and landing two frames later would not:
 * exactly how a competent player takes a chain whose landings are shorter
 * than a jump. At the very edge it jumps regardless.
 */
const smartJump = (m, time, ctx) => {
  if (!m.grounded) return false;
  if (atEdge(m, time, ctx.reach)) return true;
  const air = (2 * ctx.jumpVelocity) / G;
  const landsOn = (lead) => {
    const x = m.x + m.vx * (air + lead);
    const z = m.z + m.vz * (air + lead);
    collision.setTime(time + lead + air);
    const floor = collision.surfaceYAt(x, z, m.y + 1.5);
    return floor !== null && floor > m.y - 12;
  };
  // Only worth thinking about when the ground runs out within a jump.
  collision.setTime(time);
  const ahead = collision.surfaceYAt(m.x, m.z + Math.max(m.vz, 0) * air, m.y + 0.5);
  if (ahead !== null && ahead >= m.y - 1.5) return false;
  return landsOn(0) && !landsOn(DT * 2);
};

const events = { jumpStarted: false, landed: false };

/** Step once with an input; returns 'fell' | 'hazard' | null. */
const advance = (m, input, params, time) => {
  params.time = time;
  stepPlayer(m, input, params, DT, collision, events);
  const t = collision.sampleTriggers(m.x, m.y, m.z, time);
  return t.fell ? 'fell' : t.hazard ? 'hazard' : null;
};

/**
 * The skilled rider's options, each a function of (frame-within-plan, motion).
 * After its opening move every plan rides on with the same competent policy:
 * follow the ground, jump at edges.
 */
const PLANS = [
  { name: 'run', open: 0, moveZ: 1, jumpNow: false },
  { name: 'jump', open: 1, moveZ: 1, jumpNow: true },
  { name: 'wait-short', open: 18, moveZ: 0, jumpNow: false },
  { name: 'wait', open: 42, moveZ: 0, jumpNow: false },
  { name: 'wait-long', open: 90, moveZ: 0, jumpNow: false },
  { name: 'wait-longer', open: 150, moveZ: 0, jumpNow: false },
  { name: 'wait-cycle', open: 240, moveZ: 0, jumpNow: false },
  { name: 'back', open: 24, moveZ: -1, jumpNow: false },
];
const REPLAN = 3;

const planInput = (plan, k, m, ctx, time) => {
  if (k < plan.open) {
    if (plan.jumpNow) return followInput(m, ctx, time, { moveZ: 1, jump: true });
    return followInput(m, ctx, time, { moveZ: plan.moveZ, jump: false });
  }
  const jump = ctx.style === 'edge' ? atEdge(m, time, ctx.reach) : smartJump(m, time, ctx);
  return followInput(m, ctx, time, { moveZ: 1, jump: jump && k % 2 === 0 });
};

/**
 * What a plan leads to: an outcome CLASS and the progress made.
 *
 *   3  reaches the goal
 *   2  carries the rider the full look-ahead DISTANCE without dying
 *   1  dies, but not close by           0  dies close by
 *
 * Measured in DISTANCE, not time, and that is the whole trick. With a time
 * window, "wait a moment" or "back off" always looks better than "run": the
 * same death simply lands after the window closes. Asked to cover the same
 * ground, waiting only wins when it genuinely avoids a death - a platform that
 * arrives, a hazard that swings clear - which is exactly when a person waits.
 * Inside a class, moving on beats waiting, and progress breaks ties.
 */
const probe = createMotion();
const evaluate = (plan, m, ctx, params, t0) => {
  copyMotion(m, probe);
  const z0 = probe.z;
  const distance = Math.max(30, ctx.runSpeed * 1.6);
  const near = Math.max(12, ctx.runSpeed * 0.6);
  const frames = plan.open + Math.ceil((distance / ctx.runSpeed) * 60 * 2.5) + 120;
  let reachedAt = -1;
  for (let k = 0; k < frames; k += 1) {
    const time = t0 + k * DT;
    const input = planInput(plan, k, probe, ctx, time);
    if (advance(probe, input, params, time)) {
      const went = probe.z - z0;
      return { cls: went < near ? 0 : 1, progress: went };
    }
    if (probe.z >= ctx.goal) return { cls: 3, progress: 1e6 - k };
    // Past the distance, give it up to a second to come DOWN. A rider judged
    // the instant it passes a fixed distance is often in mid-air there, and a
    // jump that falls short looks exactly as safe as one that lands until the
    // moment it comes down. A death in that second still counts; a rider
    // still aloft and alive at the end of it is given the benefit.
    if (probe.z - z0 >= distance) {
      if (reachedAt < 0) reachedAt = k;
      if (ctx.style === 'edge' || probe.grounded || k - reachedAt > 60) {
        return { cls: 2, progress: distance - k * 0.01 };
      }
    }
  }
  return { cls: 1, progress: probe.z - z0 };
};

const better = (a, b) => {
  if (a.outcome.cls !== b.outcome.cls) return a.outcome.cls > b.outcome.cls;
  const aWaits = a.plan.moveZ !== 1;
  const bWaits = b.plan.moveZ !== 1;
  if (aWaits !== bWaits) return !aWaits;
  return a.outcome.progress > b.outcome.progress + 0.5;
};

const ride = ({ from, to, level, mode, t0, style = 'smart' }) => {
  const first = STAGES[from - 1];
  const last = STAGES[to - 1];
  const profile = resolveMovementProfile(level);
  const params = { moveMultiplier: profile.multiplier, jumpVelocity: profile.jumpVelocity, rebirths: 0, time: t0 };
  const m = createMotion();
  const start = startOf(first);
  m.x = start.x;
  m.y = start.y;
  m.z = start.z;
  const ctx = {
    ground: groundNear(m.z - 30, m.z + 500),
    groundFrom: m.z,
    reach: (profile.jumpVelocity * profile.jumpVelocity) / (2 * G) - 0.4,
    jumpVelocity: profile.jumpVelocity,
    runSpeed: profile.runSpeed,
    goal: last.winPadZ - 4,
    style,
  };
  const span = ctx.goal - start.z;
  const limit = Math.max(45, (span / profile.runSpeed) * (mode === 'skilled' ? 6 : 3) + 25 * (to - from + 1));

  let furthest = m.z;
  let stall = 0;
  let plan = PLANS[0];
  let planFrame = 0;
  const done = (why) => ({
    progress: Math.min(1, (furthest - start.z) / span),
    why,
    at: furthest,
    stage: stageAt(furthest),
  });

  for (let f = 0; f * DT < limit; f += 1) {
    const time = t0 + f * DT;
    if (m.z - ctx.groundFrom > 250) {
      ctx.ground = groundNear(m.z - 30, m.z + 500);
      ctx.groundFrom = m.z;
    }

    let input;
    if (mode === 'hold') {
      input = { moveX: 0, moveZ: 1, jump: f % 2 === 0, cameraYaw: 0 };
    } else if (mode === 'spam') {
      input = followInput(m, ctx, time, { moveZ: 1, jump: f % 2 === 0 });
    } else if (mode === 'runner') {
      input = followInput(m, ctx, time, { moveZ: 1, jump: atEdge(m, time, ctx.reach) && f % 2 === 0 });
    } else {
      if (f % REPLAN === 0) {
        let best = null;
        const scores = [];
        for (const candidate of PLANS) {
          const option = { plan: candidate, outcome: evaluate(candidate, m, ctx, params, time) };
          scores.push(`${candidate.name}=${option.outcome.cls}/${option.outcome.progress.toFixed(0)}`);
          if (!best || better(option, best)) best = option;
        }
        plan = best.plan;
        planFrame = 0;
        if (flag('--scores') && (f < 30 || (value('--near') !== null && Math.abs(m.z - first.startZ - value('--near')) < 60))) {
          console.log(`    f=${f} dz=${(m.z - first.startZ).toFixed(0)} ${scores.join(' ')} -> ${plan.name}`);
        }
      }
      input = planInput(plan, planFrame, m, ctx, time);
      planFrame += 1;
    }

    const died = advance(m, input, params, time);
    if (trace && (f % 20 === 0 || (value('--near') !== null && Math.abs(m.z - first.startZ - value('--near')) < 90 && f % 3 === 0))) {
      console.log(
        `    t=${(f * DT).toFixed(1)} x=${m.x.toFixed(1)} y=${m.y.toFixed(1)} dz=${(m.z - first.startZ).toFixed(0)}` +
          ` ${m.grounded ? 'G' : '-'} ${mode === 'skilled' ? plan.name : ''}`,
      );
    }
    if (died) return done(died);
    if (m.z >= ctx.goal) {
      furthest = m.z;
      return done('cleared');
    }
    if (m.z > furthest + 0.05) {
      furthest = m.z;
      stall = 0;
    } else if ((stall += DT) > 12) {
      return done('stuck');
    }
  }
  return done('timeout');
};

// ---------------------------------------------------------------------------
// The report.
// ---------------------------------------------------------------------------

const cleared = (runs) => runs.filter((r) => r.why === 'cleared').length;
const where = (runs, stage) =>
  [...new Set(runs.filter((r) => r.why !== 'cleared').map((r) => `${r.why}@${Math.round(r.at - stage.startZ)}`))]
    .slice(0, 3)
    .join(' ');

const NO_SKILL = ['hold', 'spam', 'runner'];

console.log('course difficulty, each stage at its own recommended level');
console.log(`  stage                          lvl  jump   hold  spam  runner  skilled   (where the skilled rider died)`);
const rows = [];
for (const stage of STAGES) {
  if (onlyStage !== null && stage.index !== onlyStage) continue;
  const at = { from: stage.index, to: stage.index, level: stage.recommendedLevel };
  const profile = resolveMovementProfile(stage.recommendedLevel);
  const jump = (profile.runSpeed * 2 * profile.jumpVelocity) / G;
  const row = { stage };
  for (const mode of NO_SKILL) row[mode] = PHASES.map((t0) => ride({ ...at, mode, t0 }));
  // The skilled rider plays two ways - jumping at edges, or at the last moment
  // a jump still lands - and a start time counts as cleared if either works,
  // the way a player picks the approach a section calls for.
  row.skilled = PHASES.map((t0) => {
    const edge = ride({ ...at, mode: 'skilled', t0, style: 'edge' });
    return edge.why === 'cleared' ? edge : ride({ ...at, mode: 'skilled', t0, style: 'smart' });
  });
  rows.push(row);
  const n = PHASES.length;
  console.log(
    `  ${String(stage.index).padStart(2)} ${stage.name.padEnd(26)} ${String(stage.recommendedLevel).padStart(4)} ${jump.toFixed(0).padStart(5)}` +
      `   ${cleared(row.hold)}/${n}   ${cleared(row.spam)}/${n}   ${cleared(row.runner)}/${n}     ${cleared(row.skilled)}/${n}     ${where(row.skilled, stage)}` +
      (trace ? `\n      runner died: ${where(row.runner, stage)}   spam died: ${where(row.spam, stage)}` : ''),
  );
}

/*
 * EVERY STAGE AT ENDGAME SPEED.
 *
 * There are no checkpoints: a run always starts at stage one, so a player
 * going for stage thirty rides stages one to twenty-nine at level one hundred
 * and sixty. A stage that is fair at its own level but cannot be ridden that
 * fast locks every late-game player out of everything after it. Controls take
 * the same TIME to answer at every level, so a faster rider covers more ground
 * while turning - the weaves, the landings and the lanes all have to survive
 * that.
 */
const ENDGAME = 160;
const endgameRows = [];
{
  console.log('');
  console.log(`every stage ridden at level ${ENDGAME} (how an endgame player meets it on every run)`);
  console.log('  stage                          skilled   (where it died)');
  for (const stage of STAGES) {
    if (onlyStage !== null && stage.index !== onlyStage) continue;
    const at = { from: stage.index, to: stage.index, level: Math.max(ENDGAME, stage.recommendedLevel) };
    const runs = PHASES.map((t0) => {
      const edge = ride({ ...at, mode: 'skilled', t0, style: 'edge' });
      return edge.why === 'cleared' ? edge : ride({ ...at, mode: 'skilled', t0, style: 'smart' });
    });
    endgameRows.push({ stage, runs });
    console.log(`  ${String(stage.index).padStart(2)} ${stage.name.padEnd(26)}       ${cleared(runs)}/${PHASES.length}     ${where(runs, stage)}`);
  }
}

if (onlyStage === null) {
  console.log('');
  console.log('full run from stage 1 at a fixed level: stage reached per start time (31 = all cleared)');
  console.log('  level  jump   spam            runner');
  for (const level of [15, 40, 80, 120, 160]) {
    const profile = resolveMovementProfile(level);
    const jump = (profile.runSpeed * 2 * profile.jumpVelocity) / G;
    const reached = (mode) =>
      PHASES.map((t0) => ride({ from: 1, to: 30, level, mode, t0 }))
        .map((r) => (r.why === 'cleared' ? 31 : r.stage.index))
        .join(' ');
    console.log(`  ${String(level).padStart(5)} ${jump.toFixed(0).padStart(5)}   ${reached('spam').padEnd(15)} ${reached('runner')}`);
  }

  const most = Math.ceil(PHASES.length / 2);
  const trivial = rows.filter((r) => NO_SKILL.some((mode) => cleared(r[mode]) >= most));
  const lateTrivial = trivial.filter((r) => r.stage.index >= 6);
  const unfair = rows.filter((r) => cleared(r.skilled) < most);
  const lockout = endgameRows.filter((r) => cleared(r.runs) < most);
  console.log('');
  console.log(`  stages a rider with NO skill clears from most start times: ${trivial.length}/30 (${trivial.map((r) => r.stage.index).join(', ') || 'none'})`);
  console.log(`  stages the skilled rider CANNOT clear from most start times: ${unfair.length}/30 (${unfair.map((r) => r.stage.index).join(', ') || 'none'})`);
  console.log(`  stages the skilled rider CANNOT clear at level ${ENDGAME}: ${lockout.length}/30 (${lockout.map((r) => r.stage.index).join(', ') || 'none'})`);
  const ok = trivial.length <= 6 && lateTrivial.length <= 2 && unfair.length === 0 && lockout.length === 0;
  console.log(ok ? '\ndifficulty OK' : '\ndifficulty FAILED');
  if (!ok) process.exitCode = 1;
}
