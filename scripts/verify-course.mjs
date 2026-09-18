/**
 * Structural checks on the generated world.
 *
 * The course is BUILT, not authored: thirty stage builders walk a route cursor
 * and the geometry falls out of it. That makes it cheap to tune and easy to
 * break in ways a screenshot will not show - a kill volume that stops one
 * stretch short, a hazard that reaches through a valley wall, a gap nobody can
 * clear at the level the marker recommends. This is what catches those.
 *
 * Run with `npm run verify:course` (builds shared first).
 */
import {
  ACTS,
  CAVE_REGIONS,
  corridorHalfWidthAt,
  COURSE,
  COURSE_END_Z,
  COURSE_HAZARDS,
  COURSE_SOLIDS,
  DECORATIONS,
  GUARDIAN_TERRITORIES,
  hazardReachX,
  hazardZRange,
  MOVEMENT,
  MOVING_SOLIDS,
  pitAt,
  PITS,
  QUICKSAND,
  resolveMovementProfile,
  shopNear,
  SHOPS,
  SHOP_ROW,
  SPAWN_POSITION,
  SPEED_UPGRADES,
  STAGES,
  TRAINING,
  TREADMILL_BELT_Y,
  treadmillAt,
  TREADMILLS,
  treadmillZ,
  UPGRADE_FIRST_Z,
  UPGRADE_LAST_Z,
  UPGRADE_ROW,
  UPGRADE_STAIR_WIDTH,
  UPGRADE_STAIR_Z,
  upgradePadAt,
  upgradeSlotAt,
  upgradeX,
  upgradeY,
  upgradeZ,
  WorldCollision,
} from '../shared/dist/index.js';

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.error(`  FAIL  ${message}`);
};
const pass = (message) => console.log(`  ok    ${message}`);

/**
 * How far a player at `level` can clear.
 *
 * Derived from the SAME movement formula the game runs on, so a retune of the
 * speed curve automatically retunes what this file considers reachable.
 */
const reachAt = (level) => {
  const profile = resolveMovementProfile(level);
  const airtime = (2 * profile.jumpVelocity) / MOVEMENT.gravity;
  return profile.runSpeed * airtime;
};

console.log('stages');
{
  if (STAGES.length !== COURSE.stageCount) {
    fail(`${STAGES.length} stages, expected ${COURSE.stageCount}`);
  }
  let overlaps = 0;
  for (let i = 1; i < STAGES.length; i += 1) {
    if (STAGES[i].startZ < STAGES[i - 1].endZ - 0.01) overlaps += 1;
  }
  if (overlaps > 0) fail(`${overlaps} stage(s) overlap the one before`);
  else pass(`${STAGES.length} stages, none overlapping, ending at z=${Math.round(COURSE_END_Z)}`);

  // Six acts of five, and every act present in the data rather than only in
  // the table that names them.
  const perAct = new Map();
  for (const stage of STAGES) perAct.set(stage.act, (perAct.get(stage.act) ?? 0) + 1);
  const shapedRight = ACTS.every((act) => perAct.get(act.index) === 5);
  if (!shapedRight) fail(`acts are not five stages each: ${JSON.stringify([...perAct])}`);
  else pass(`six acts of five: ${ACTS.map((a) => a.name).join(', ')}`);
}

console.log('support');
{
  /*
   * Nowhere in any stage may there be a stretch of Z with nothing to stand on
   * that is longer than the player can clear at that stage's own recommended
   * level.
   *
   * Moving platforms count over their whole REACH, because a platform that
   * arrives is a platform: an orbiting disc supports its stretch for part of
   * every cycle, which is the mechanic rather than a hole.
   */
  const STEP = 2;
  let worst = { gap: 0, stage: 0, z: 0 };
  let broken = 0;

  for (const stage of STAGES) {
    const supported = new Uint8Array(Math.ceil((stage.endZ - stage.startZ) / STEP) + 2);
    const mark = (minZ, maxZ) => {
      const from = Math.max(0, Math.floor((minZ - stage.startZ) / STEP));
      const to = Math.min(supported.length - 1, Math.ceil((maxZ - stage.startZ) / STEP));
      for (let i = from; i <= to; i += 1) supported[i] = 1;
    };

    for (const solid of COURSE_SOLIDS) {
      if (solid.stage !== stage.index) continue;
      mark(solid.minZ, solid.maxZ);
    }
    for (const platform of MOVING_SOLIDS) {
      if (platform.stage !== stage.index) continue;
      const reach =
        platform.motion === 'orbit' || (platform.motion === 'shuttle' && platform.axis === 'z')
          ? platform.amount
          : 0;
      mark(platform.minZ - reach, platform.maxZ + reach);
    }

    const allowed = reachAt(stage.recommendedLevel);
    let run = 0;
    for (let i = 0; i < supported.length; i += 1) {
      if (supported[i]) {
        run = 0;
        continue;
      }
      run += STEP;
      if (run > worst.gap) worst = { gap: run, stage: stage.index, z: stage.startZ + i * STEP };
      if (run > allowed) {
        broken += 1;
        break;
      }
    }
  }

  if (broken > 0) fail(`${broken} stage(s) have a gap wider than their own level can clear`);
  else {
    pass(
      `widest unsupported run is ${worst.gap.toFixed(0)} at z=${Math.round(worst.z)} ` +
        `(stage ${worst.stage}); reach there is ${reachAt(
          STAGES[worst.stage - 1]?.recommendedLevel ?? 1,
        ).toFixed(0)}`,
    );
  }
}

console.log('kill volumes');
{
  // Every stage must be covered by kill volumes over its whole length, or a
  // miss somewhere in it is a fall the player never recovers from and never
  // dies in.
  const STEP = 8;
  let uncovered = 0;
  for (const stage of STAGES) {
    for (let z = stage.startZ + 4; z < stage.endZ - 4; z += STEP) {
      // Far below anything the stage builds, so this asks "is there a floor of
      // last resort here" rather than "is this point lethal".
      if (pitAt(0, -400, z) === null) {
        uncovered += 1;
        if (uncovered === 1) fail(`stage ${stage.index} has no kill volume at z=${Math.round(z)}`);
        break;
      }
    }
  }
  if (uncovered === 0) pass(`${PITS.length} kill volumes, covering all 30 stages`);

  // And every one of them must sit BELOW the ground it protects, or it kills
  // players who are standing on the path.
  let tooHigh = 0;
  for (const solid of COURSE_SOLIDS) {
    if (solid.stage < 1) continue;
    const under = pitAt((solid.minX + solid.maxX) / 2, solid.maxY, (solid.minZ + solid.maxZ) / 2);
    if (under) tooHigh += 1;
  }
  if (tooHigh > 0) fail(`${tooHigh} solid(s) have their top inside a kill volume`);
  else pass('no walkable surface is inside a kill volume');
}

console.log('win pads');
{
  let bad = 0;
  for (const stage of STAGES) {
    // Solid ground under the dais, at the dais's own height.
    const floor = COURSE_SOLIDS.some(
      (s) =>
        s.stage === stage.index &&
        s.kind !== 'winPad' &&
        stage.winPadX >= s.minX - 1 &&
        stage.winPadX <= s.maxX + 1 &&
        stage.winPadZ >= s.minZ - 1 &&
        stage.winPadZ <= s.maxZ + 1 &&
        Math.abs(s.maxY - (stage.winPadY - 0.4)) < 2.5,
    );
    if (!floor) {
      bad += 1;
      fail(`stage ${stage.index} win dais has no floor under it`);
    }
    if (pitAt(stage.winPadX, stage.winPadY, stage.winPadZ)) {
      bad += 1;
      fail(`stage ${stage.index} win dais is inside a kill volume`);
    }
  }
  if (bad === 0) pass(`${STAGES.length} win daises, all on solid ground`);

  const expected = [1, 3, 9, 27, 81, 243, 729, 2187];
  let rewardsOk = true;
  for (let i = 0; i < expected.length; i += 1) {
    if (STAGES[i].winReward !== expected[i]) rewardsOk = false;
  }
  if (!rewardsOk) fail('stage rewards are not 1/3/9/27/…');
  else pass(`rewards are ${expected.join(', ')} … ${STAGES[29].winReward.toLocaleString('en-US')}`);
}

console.log('difficulty');
{
  let rising = true;
  for (let i = 1; i < STAGES.length; i += 1) {
    if (STAGES[i].recommendedLevel <= STAGES[i - 1].recommendedLevel) rising = false;
    if (STAGES[i].winReward <= STAGES[i - 1].winReward) rising = false;
  }
  if (!rising) fail('a stage is easier or pays less than the one before it');
  else {
    const rebirths = Math.ceil(STAGES[29].recommendedLevel / 25) - 1;
    pass(`levels 1-${STAGES[29].recommendedLevel} rising every stage (${rebirths} rebirths)`);
  }
}

console.log('the set pieces');
{
  // Every named set piece the world is supposed to contain, checked from the
  // data rather than from a screenshot. A stage that quietly lost its boulders
  // in a retune is the kind of thing only this catches.
  const byKind = (kind) => COURSE_HAZARDS.filter((h) => h.kind === kind);
  const motions = (motion) => MOVING_SOLIDS.filter((m) => m.motion === motion);

  const boulders = byKind('boulder');
  const checks = [
    ['boulders rolling down ramps', boulders.filter((h) => h.spanX === 0 && h.fromZ !== h.toZ).length >= 20],
    ['boulders rolling across the path', boulders.filter((h) => h.spanX === 0 && h.fromZ === h.toZ).length >= 10],
    ['logs rolling down slopes', boulders.filter((h) => h.spanX > 0 && h.fromZ !== h.toZ).length >= 6],
    ['logs floating across fords', boulders.filter((h) => h.spanX > 0 && h.fromZ === h.toZ).length >= 12],
    ['swinging logs', byKind('swing').length >= 12],
    ['rotating logs and statue arms', byKind('spinner').length >= 50],
    ['falling temple stones', byKind('faller').length >= 40],
    ['dart traps', byKind('dart').length >= 25],
    ['thorn vines', byKind('vine').length >= 15],
    ['lethal waterfalls', byKind('cascade').length >= 6],
    ['collapsing bridges and floors', motions('collapse').length >= 80],
    ['orbiting platforms', motions('orbit').length >= 8],
    ['moving bridges and rafts', motions('shuttle').length >= 30],
    ['lifts', motions('lift').length >= 8],
    ['timed gates', motions('gate').length >= 8],
    ['quicksand', COURSE_SOLIDS.filter((s) => s.kind === 'quicksand').length >= 50],
    ['roots across the path', COURSE_SOLIDS.filter((s) => s.kind === 'log' && s.maxY - s.minY > 4).length >= 20],
    ['cave sections', CAVE_REGIONS.length >= 5],
    ['rivers and rapids', PITS.some((p) => p.surface === 'rapids')],
    ['still water', PITS.some((p) => p.surface === 'water')],
    ['mud', PITS.some((p) => p.surface === 'mud')],
    ['temple fire', PITS.some((p) => p.surface === 'fire')],
    ['two guardian arenas', GUARDIAN_TERRITORIES.length === 2],
    ['rope bridges', COURSE_SOLIDS.some((s) => s.kind === 'rope')],
    ['log crossings', COURSE_SOLIDS.some((s) => s.kind === 'log')],
    ['temple gold', COURSE_SOLIDS.some((s) => s.kind === 'gilded')],
    ['cave rock', COURSE_SOLIDS.some((s) => s.kind === 'cave')],
  ];
  for (const [name, ok] of checks) {
    if (!ok) fail(`missing: ${name}`);
  }
  if (failures === 0) pass(`all ${checks.length} set pieces present`);

  // The guardians must be in acts four and six, which is where the chase
  // belongs - one to learn on and one that is the stage.
  const stagesWithGuardians = GUARDIAN_TERRITORIES.map((t) => t.stage).sort((a, b) => a - b);
  if (stagesWithGuardians.join(',') !== '18,29') {
    fail(`guardians are at stages ${stagesWithGuardians.join(', ')}, expected 18 and 29`);
  } else {
    pass('guardians hunt stages 18 and 29');
  }
}

console.log('quicksand');
{
  /*
   * Every quicksand slab must sit over a MUD POOL whose kill line is exactly
   * where the simulation drowns a mount: `QUICKSAND.drownDepth` under the
   * slab's top. Too shallow and a player who pauses for half a second is
   * dead; missing entirely and a player who stops sinks to the bottom and
   * stays there, alive and stuck, for ever.
   */
  let bad = 0;
  const sand = COURSE_SOLIDS.filter((s) => s.kind === 'quicksand');
  for (const slab of sand) {
    const x = (slab.minX + slab.maxX) / 2;
    const z = (slab.minZ + slab.maxZ) / 2;
    const drown = slab.maxY - QUICKSAND.drownDepth;
    const above = pitAt(x, drown + 0.05, z);
    const below = pitAt(x, drown - 0.05, z);
    if (above !== null || below === null) {
      bad += 1;
      if (bad === 1) fail(`quicksand at z=${Math.round(z)} (stage ${slab.stage}) does not drown at ${QUICKSAND.drownDepth}`);
    }
  }
  if (bad === 0) pass(`${sand.length} quicksand slabs, every one drowning at exactly ${QUICKSAND.drownDepth} deep`);
}

console.log('the environment');
{
  // Every act must have its own material identity, or the six of them read as
  // one long stage. Checked as "this act uses this ground", which is the thing
  // the player actually sees.
  const kindsIn = (act) => {
    const set = new Set();
    for (const solid of COURSE_SOLIDS) {
      const stage = STAGES[solid.stage - 1];
      if (stage && stage.act === act) set.add(solid.kind);
    }
    return set;
  };
  const signature = [
    [1, 'dirt'],
    [2, 'rope'],
    [3, 'stone'],
    [4, 'rock'],
    [5, 'gilded'],
    [6, 'plank'],
  ];
  let themed = true;
  for (const [act, kind] of signature) {
    if (!kindsIn(act).has(kind)) {
      themed = false;
      fail(`act ${act} has no ${kind}`);
    }
  }
  if (themed) pass('every act has its own ground material');

  if (DECORATIONS.length < 2000) fail(`only ${DECORATIONS.length} pieces of scenery - too sparse`);
  else pass(`${DECORATIONS.length} pieces of scenery placed`);

  const scenery = new Set(DECORATIONS.map((d) => d.kind));
  const wanted = ['tree', 'palm', 'fern', 'bush', 'vine', 'root', 'rock', 'mushroom',
    'fallenLog', 'waterfall', 'arch', 'statue', 'stele', 'torch', 'tent', 'crates', 'marker'];
  const missing = wanted.filter((k) => !scenery.has(k));
  if (missing.length > 0) fail(`scenery kinds never placed: ${missing.join(', ')}`);
  else pass(`${wanted.length} scenery kinds all in use`);
}

console.log('bounds');
{
  let outside = 0;
  for (const hazard of COURSE_HAZARDS) {
    const span = hazardZRange(hazard);
    const half = corridorHalfWidthAt((span.minZ + span.maxZ) / 2);
    if (hazardReachX(hazard) > half + 4) {
      outside += 1;
      if (outside === 1) {
        fail(
          `a ${hazard.kind} on stage ${hazard.stage} reaches ${hazardReachX(hazard).toFixed(
            0,
          )} past a valley half-width of ${half}`,
        );
      }
    }
  }
  if (outside === 0) pass(`${COURSE_HAZARDS.length} hazards, all inside the valley`);

  let wide = 0;
  for (const solid of COURSE_SOLIDS) {
    if (solid.stage < 1) continue;
    const half = corridorHalfWidthAt((solid.minZ + solid.maxZ) / 2);
    if (solid.minX < -half - 30 || solid.maxX > half + 30) wide += 1;
  }
  if (wide > 0) fail(`${wide} solid(s) sit well outside the valley they are in`);
  else pass('no stage geometry pokes through a valley wall');
}

console.log('respawn');
{
  const inCamp =
    SPAWN_POSITION.z > COURSE.campStartZ &&
    SPAWN_POSITION.z < COURSE.campEndZ &&
    Math.abs(SPAWN_POSITION.x) < COURSE.campHalfWidth;
  if (!inCamp) fail('the spawn point is not inside the expedition camp');
  else if (pitAt(SPAWN_POSITION.x, SPAWN_POSITION.y, SPAWN_POSITION.z)) {
    fail('the spawn point is inside a kill volume');
  } else if (STAGES.some((s) => s.startZ <= SPAWN_POSITION.z && s.endZ >= SPAWN_POSITION.z)) {
    fail('the spawn point is inside a stage');
  } else {
    pass(`one spawn, at z=${SPAWN_POSITION.z}, in the camp and clear of every stage`);
  }
}

console.log('the camp');
{
  let found = 0;
  for (const tier of TREADMILLS) {
    if (treadmillAt(TRAINING.centerX, TREADMILL_BELT_Y, treadmillZ(tier.index)) === tier.index) {
      found += 1;
    }
  }
  if (found !== TREADMILLS.length) fail(`only ${found}/${TREADMILLS.length} belts detect`);
  else pass(`${TREADMILLS.length} belts, all detected from their centres`);
  if (treadmillAt(0, 0, 0) !== 0) fail('a belt is detected in the middle of the camp');

  let pads = 0;
  for (const upgrade of SPEED_UPGRADES) {
    if (upgradeSlotAt(upgradeX(upgrade.slot), upgradeZ(upgrade.slot)) === upgrade.slot) pads += 1;
  }
  if (pads !== SPEED_UPGRADES.length) fail(`only ${pads}/${SPEED_UPGRADES.length} pads detect`);
  else pass(`${SPEED_UPGRADES.length} pads, all detected from their centres`);

  let overlaps = 0;
  for (let a = 0; a < SPEED_UPGRADES.length; a += 1) {
    for (let b = a + 1; b < SPEED_UPGRADES.length; b += 1) {
      const sa = SPEED_UPGRADES[a].slot;
      const sb = SPEED_UPGRADES[b].slot;
      if (
        Math.abs(upgradeX(sa) - upgradeX(sb)) < UPGRADE_ROW.claimRadius * 2 &&
        Math.abs(upgradeZ(sa) - upgradeZ(sb)) < UPGRADE_ROW.claimRadius * 2
      ) {
        overlaps += 1;
        fail(`upgrade pads ${sa} and ${sb} have overlapping claim squares`);
      }
    }
  }
  if (overlaps === 0) pass('no two pads can be claimed from one position');

  for (const shop of SHOPS) {
    if (shopNear(shop.x, shop.z)?.id !== shop.id) fail(`the ${shop.title} is not found from its own counter`);
  }
  if (shopNear(SPAWN_POSITION.x, SPAWN_POSITION.z) !== null) {
    fail('a trader prompt reaches the spawn point');
  } else {
    pass(`${SHOPS.length} traders, each found from their own counter and none from spawn`);
  }
}

console.log('camp geometry');
{
  /*
   * Z-FIGHTING, found rather than looked for.
   *
   * Two axis-aligned boxes whose top faces sit at the same height and whose
   * footprints overlap are two surfaces competing for the same pixels: the
   * depth buffer cannot separate them and the result flickers as the camera
   * moves. Abutting boxes are fine - they share an edge, not an area - so a
   * positive overlap is required on both of the other two axes.
   *
   * Scoped to the CAMP, which is the one place in this world built by hand
   * from overlapping furniture rather than emitted by the route cursor.
   */
  const EPS = 1e-6;
  const MIN_AREA = 0.5;
  const camp = COURSE_SOLIDS.filter((solid) => solid.stage === -1);
  const span = (aMin, aMax, bMin, bMax) => Math.min(aMax, bMax) - Math.max(aMin, bMin);

  const FACES = [
    { name: 'top', key: 'maxY', u: ['minX', 'maxX'], v: ['minZ', 'maxZ'] },
    { name: 'bottom', key: 'minY', u: ['minX', 'maxX'], v: ['minZ', 'maxZ'] },
    { name: '+X', key: 'maxX', u: ['minY', 'maxY'], v: ['minZ', 'maxZ'] },
    { name: '-X', key: 'minX', u: ['minY', 'maxY'], v: ['minZ', 'maxZ'] },
    { name: '+Z', key: 'maxZ', u: ['minX', 'maxX'], v: ['minY', 'maxY'] },
    { name: '-Z', key: 'minZ', u: ['minX', 'maxX'], v: ['minY', 'maxY'] },
  ];

  let coplanar = 0;
  let buried = 0;
  let intersecting = 0;

  for (let i = 0; i < camp.length; i += 1) {
    for (let j = i + 1; j < camp.length; j += 1) {
      const a = camp[i];
      const b = camp[j];

      for (const face of FACES) {
        if (Math.abs(a[face.key] - b[face.key]) > EPS) continue;
        const du = span(a[face.u[0]], a[face.u[1]], b[face.u[0]], b[face.u[1]]);
        const dv = span(a[face.v[0]], a[face.v[1]], b[face.v[0]], b[face.v[1]]);
        if (du <= 0 || dv <= 0 || du * dv < MIN_AREA) continue;
        coplanar += 1;
        fail(
          `${a.kind} and ${b.kind} share a ${face.name} face at ${a[face.key]} ` +
            `over ${(du * dv).toFixed(0)} sq units`,
        );
      }

      const dx = span(a.minX, a.maxX, b.minX, b.maxX);
      const dy = span(a.minY, a.maxY, b.minY, b.maxY);
      const dz = span(a.minZ, a.maxZ, b.minZ, b.maxZ);
      if (dx <= 0 || dy <= 0 || dz <= 0) continue;
      /*
       * A structure FOUNDED in the clearing's earth is not two platforms
       * fighting: the terrace, the training deck and the traders' counters are
       * all deliberately sunk below `floorY` so that no face of theirs shares a
       * plane with the floor's. Only an overlap that reaches above the ground
       * is something a player can see.
       */
      if (Math.min(a.maxY, b.maxY) <= COURSE.floorY + EPS) {
        buried += 1;
        continue;
      }
      if (dx * dy * dz < 12) continue;
      intersecting += 1;
      fail(
        `${a.kind} and ${b.kind} interpenetrate above ground by ` +
          `${(dx * dy * dz).toFixed(0)} cubic units`,
      );
    }
  }

  if (coplanar === 0) pass(`no coplanar faces among ${camp.length} camp solids`);
  if (intersecting === 0) pass(`nothing interpenetrates above ground (${buried} buried footings)`);

  // The two tiers must be far enough apart to READ as two tiers. Seven units
  // is taller than the mount; anything under a step height is a kerb, which is
  // what the back row used to be.
  const tierGap = upgradeY(UPGRADE_ROW.perRow + 1) - upgradeY(1);
  if (tierGap < 4) fail(`the upgrade rows are only ${tierGap} apart`);
  else pass(`the upgrade rows are ${tierGap.toFixed(1)} apart, a real tier`);

  // Every pad must be reachable: the front row off the clearing floor, the
  // back row off the terrace it stands on.
  for (const upgrade of SPEED_UPGRADES) {
    const x = upgradeX(upgrade.slot);
    const z = upgradeZ(upgrade.slot);
    const top = upgradeY(upgrade.slot);
    if (upgradePadAt(x, top, z) !== upgrade.slot) {
      fail(`pad ${upgrade.slot} is not claimable from its own surface`);
    }
    // And standing UNDER the terrace must not claim the pad on top of it.
    if (upgrade.slot > UPGRADE_ROW.perRow && upgradePadAt(x, COURSE.floorY, z) !== null) {
      fail(`pad ${upgrade.slot} can be claimed from the ground below it`);
    }
  }
  pass('every pad is claimable from its own tier and no other');

  /*
   * And the upper tier has to be REACHABLE.
   *
   * A terrace seven units up is only a good idea if a mount can ride onto it,
   * so both stairs are walked the way the simulation walks them: each sample
   * asks what ground is within reach of the last one, which is exactly the
   * test `surfaceYAt` applies during a step. A tread taller than
   * `MOVEMENT.stepHeight` is a tread the player has to jump, and a bank you
   * have to jump into is an obstacle course.
   */
  const collision = new WorldCollision();
  /*
   * And a flight must not stand ON a plate.
   *
   * The stairs share the front row's X - they climb across it to reach the
   * terrace behind - so the only thing keeping them off a plate is the Z they
   * are built at, and for a while nothing checked it: a fourteen-wide flight
   * sat seven units inside each end of the terrace, which put treads squarely
   * over the first and the twelfth upgrade. Both were still claimable, because
   * a pad is claimed by standing in its square, and you could not get to the
   * square.
   */
  for (const z of UPGRADE_STAIR_Z) {
    for (const upgrade of SPEED_UPGRADES) {
      const gap =
        Math.abs(upgradeZ(upgrade.slot) - z) -
        (UPGRADE_STAIR_WIDTH + UPGRADE_ROW.size) / 2;
      if (gap < 0) {
        fail(
          `the stair at z ${z} overlaps pad ${upgrade.slot} by ${(-gap).toFixed(1)}`,
        );
      }
    }
  }
  pass('neither stair stands over a plate');

  const stairs = [
    ['back', UPGRADE_STAIR_Z[0]],
    ['front', UPGRADE_STAIR_Z[1]],
  ];
  for (const [name, z] of stairs) {
    let feet = COURSE.floorY;
    let worst = 0;
    for (let x = UPGRADE_ROW.terraceMinX - 20; x <= UPGRADE_ROW.terraceMaxX; x += 0.5) {
      const y = collision.surfaceYAt(x, z, feet);
      if (y === null) continue;
      worst = Math.max(worst, y - feet);
      feet = y;
    }
    if (feet < UPGRADE_ROW.terraceY) {
      fail(`the ${name} stair does not reach the terrace (stops at ${feet.toFixed(1)})`);
    } else if (worst > MOVEMENT.stepHeight) {
      fail(`the ${name} stair has a ${worst.toFixed(2)} tread, over the ${MOVEMENT.stepHeight} step height`);
    } else {
      pass(`the ${name} stair rides up to the terrace, worst tread ${worst.toFixed(2)}`);
    }
  }
}

console.log('camp layout');
{
  /*
   * WHERE things stand relative to each other, measured from the solids the
   * camp actually laid rather than from the constants that placed them.
   *
   * The traders have been moved four times, and three of those times they
   * ended up in somebody else's way - last of all in a column between the
   * spawn and the treadmills. These are the rules that layout broke.
   */
  const camp = COURSE_SOLIDS.filter((solid) => solid.stage === -1);
  const bounds = (solids) => ({
    minX: Math.min(...solids.map((s) => s.minX)),
    maxX: Math.max(...solids.map((s) => s.maxX)),
    minZ: Math.min(...solids.map((s) => s.minZ)),
    maxZ: Math.max(...solids.map((s) => s.maxZ)),
  });
  const gap = (a, b) =>
    Math.max(a.minX - b.maxX, b.minX - a.maxX, a.minZ - b.maxZ, b.minZ - a.maxZ);
  const overlaps = (a, b) =>
    a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;

  const huts = camp.filter((s) => s.kind === 'shop');
  const deck = bounds(camp.filter((s) => s.kind === 'training'));
  // The bank is its plates plus the terrace and the stairs up to it.
  const bank = bounds(camp.filter((s) => s.kind === 'pad' || s.kind === 'camp'));

  if (huts.length !== SHOPS.length) fail(`expected ${SHOPS.length} trader counters, found ${huts.length}`);

  // 1. Nothing between the open middle and the treadmills. The deck is ridden
  //    onto from its camp-side face, so that whole strip is its approach.
  const deckApproach = { minX: deck.maxX, maxX: 0, minZ: deck.minZ, maxZ: deck.maxZ };
  const blocking = huts.filter((hut) => overlaps(hut, deckApproach));
  if (blocking.length) fail(`${blocking.length} trader(s) stand between the middle and the treadmills`);
  else pass('the treadmill deck has a clear approach from the middle');

  // 2. Not in the gateway. The arch's inner faces are the gate's width.
  const gate = { minX: -15, maxX: 15, minZ: -60, maxZ: 0 };
  if (huts.some((hut) => overlaps(hut, gate))) fail('a trader stands in the way to the gate');
  else pass('the way out is clear of traders');

  // 3. Well clear of the upgrade bank, stairs included.
  const nearestBank = Math.min(...huts.map((hut) => gap(hut, bank)));
  if (nearestBank < 20) fail(`a trader is only ${nearestBank.toFixed(1)} from the upgrade bank`);
  else pass(`every trader is ${nearestBank.toFixed(1)}+ units clear of the upgrade bank`);

  // 4. A hut's length of open ground between any two huts.
  let tightest = Infinity;
  for (let i = 0; i < huts.length; i += 1) {
    for (let j = i + 1; j < huts.length; j += 1) tightest = Math.min(tightest, gap(huts[i], huts[j]));
  }
  if (tightest < SHOP_ROW.width) fail(`two traders are only ${tightest.toFixed(1)} apart`);
  else pass(`traders stand ${tightest.toFixed(1)} apart`);

  // 5. At the FRONT, beside the gate - the first thing passed on the way out.
  const deepest = Math.min(...huts.map((hut) => hut.minZ));
  if (deepest < -60) fail(`a trader stands ${(-deepest).toFixed(0)} units back from the gate`);
  else pass('all three traders stand at the front, beside the gate');

  // 6. And the spawn is in open ground, with no prompt reaching it.
  const spawnSpot = { minX: SPAWN_POSITION.x - 12, maxX: SPAWN_POSITION.x + 12, minZ: SPAWN_POSITION.z - 12, maxZ: SPAWN_POSITION.z + 12 };
  if ([...huts, deck, bank].some((thing) => overlaps(thing, spawnSpot))) fail('something stands within 12 of the spawn');
  else pass('the spawn is in open ground');
}

console.log('');
if (failures > 0) {
  console.error(`${failures} problem(s) found`);
  process.exit(1);
}
console.log('course OK');
