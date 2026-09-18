/**
 * Authority tests for the server's progression rules.
 *
 * These are the rules a cheating client would most like to break: awarding
 * itself a stage, banking the same stage twice, equipping a speed-upgrade pad
 * it has not earned, wearing a trail it has not bought, or farming a treadmill
 * tier its rebirth count does not reach. Each is exercised here against the
 * REAL services, including the rejection paths - a test that only checks the
 * happy path proves nothing about authority.
 *
 * Run with `npm run verify:progression` (builds the server first).
 */
import {
  AURA_TIERS,
  auraMultiplier,
  calculateSpeedGain,
  describeSpeedGain,
  formatSpeedGain,
  FOOTFALL_DISTANCE,
  footfallSpeedGain,
  mountMultiplier,
  rebirthMultiplier,
  trailMultiplier,
  treadmillBeltSpeed,
  treadmillMultiplier,
  upgradePerStep,
  createMotion,
  createMovementInput,
  createSimEvents,
  DISPLAY_NAME_MAX,
  formatSpeed,
  highestEarnedMount,
  isMountUnlocked,
  ITEM_TIERS,
  MAX_CURVE_LEVEL,
  MAX_WINS,
  mountForSlot,
  MOUNTS,
  MOVING_SOLIDS,
  nextRebirthTier,
  platformOffsetAt,
  qualifiesForMount,
  resolveLevel,
  resolveMovementProfile,
  sanitizeDisplayName,
  sanitizePfpUrl,
  SPEED,
  SPEED_UPGRADES,
  speedForNextLevel,
  speedPerStep,
  STAGES,
  stepPlayer,
  totalMultiplier,
  totalSpeedToReach,
  TRAIL_TIERS,
  TRAINING,
  TREADMILL_BELT_Y,
  TREADMILLS,
  treadmillZ,
  upgradeX,
  upgradeZ,
  WorldCollision,
} from '../shared/dist/index.js';
import { StageService } from '../server/dist/progression/StageService.js';
import { EvolveService } from '../server/dist/progression/EvolveService.js';
import { RebirthService } from '../server/dist/progression/RebirthService.js';
import { SpeedService } from '../server/dist/progression/SpeedService.js';
import { UpgradeService } from '../server/dist/progression/UpgradeService.js';
import { MovementService } from '../server/dist/movement/MovementService.js';
import {
  createAuraService,
  createItemService,
  createTrailService,
} from '../server/dist/progression/CosmeticService.js';
import { PlayerState } from '../server/dist/rooms/state/PlayerState.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let failures = 0;
const check = (label, actual, expected) => {
  const ok = Object.is(actual, expected);
  if (!ok) {
    failures += 1;
    console.error(`  FAIL  ${label}: got ${actual}, expected ${expected}`);
  } else {
    console.log(`  ok    ${label}`);
  }
};

/** Close enough, for the figures that come out of a float32 schema field. */
const near = (label, actual, expected, tolerance = 1e-4) => {
  const ok = Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected));
  if (!ok) {
    failures += 1;
    console.error(`  FAIL  ${label}: got ${actual}, expected about ${expected}`);
  } else {
    console.log(`  ok    ${label}`);
  }
};

/** A fresh player, initialised exactly as the room does on join. */
const newPlayer = (speeds, upgrades = new UpgradeService()) => {
  const player = new PlayerState();
  player.sessionId = 'test';
  upgrades.initialise(player);
  speeds.initialise(player);
  return player;
};

/** Put a player at a level by giving them the Speed that level costs. */
const setLevel = (player, speeds, level) => {
  player.totalSpeed = totalSpeedToReach(level);
  speeds.syncDerived(player);
};

console.log('stage rewards');
{
  const speeds = new SpeedService();
  const stages = new StageService();
  const player = newPlayer(speeds);
  stages.initialise('test');

  const stage = STAGES[0];

  // Nowhere near the pad. The server checks the position IT simulated.
  player.x = 0;
  player.y = 0;
  player.z = stage.winPadZ - 400;
  check('claim from far away is refused', stages.claim('test', player, stage.index).reason, 'not-on-pad');
  check('  wins unchanged', player.wins, 0);

  // Standing on the dais. It is a small square at the RIGHT of the stage's
  // end, so X matters as much as Z - and so does Y, because the route climbs:
  // a player passing under stage 21's dais forty units below has not finished
  // stage 21.
  player.x = stage.winPadX;
  player.y = stage.winPadY;
  player.z = stage.winPadZ;
  const first = stages.claim('test', player, stage.index);
  check('claim on the pad is granted', first.granted, true);
  check('  wins credited', player.wins, stage.winReward);
  check('  best stage recorded', player.bestStage, stage.index);

  // Immediately again, from the same spot.
  check('immediate re-claim is refused', stages.claim('test', player, stage.index).granted, false);

  // A stage that does not exist.
  check('unknown stage is refused', stages.claim('test', player, 999).reason, 'unknown-stage');

  // Banking a stage RETURNS the player to the arena, and running it again pays
  // again - that is how a player grinds toward the next evolution.
  await sleep(500);
  const third = stages.claim('test', player, stage.index);
  check('a second run of the same stage pays again', third.granted, true);
  check('  wins credited twice', player.wins, stage.winReward * 2);

  // The specified head of the ladder: 1, 3, 9, and on by threes.
  const expected = [1, 3, 9, 27, 81, 243, 729, 2187];
  let rewardsOk = true;
  for (let i = 0; i < expected.length; i += 1) {
    if (STAGES[i].winReward !== expected[i]) rewardsOk = false;
  }
  check('stage rewards are 1/3/9/27/81/243/729/2187', rewardsOk, true);
}

console.log('evolution');
{
  const speeds = new SpeedService();
  const evolve = new EvolveService();
  const player = newPlayer(speeds);

  const cockroach = mountForSlot(1);
  const spider = mountForSlot(2);
  const chick = mountForSlot(3);

  // The specified head of the chain, checked against literals rather than
  // against the roster's own numbers - a test that reads its expectation out
  // of the thing it is testing tests nothing.
  check('mount 1 is the Cockroach', cockroach.name, 'Cockroach');
  check('  and multiplies Speed by 1.04', cockroach.multiplier, 1.04);
  check('mount 2 is the Spider', spider.name, 'Spider');
  check('  x1.10, at level 3 with 3 wins', spider.multiplier, 1.1);
  check('  required level', spider.requiredLevel, 3);
  check('  required wins', spider.requiredWins, 3);
  check('mount 3 is the Chick', chick.name, 'Chick');
  check('  x1.25, at level 6 with 9 wins', chick.multiplier, 1.25);
  check('  required level', chick.requiredLevel, 6);
  check('  required wins', chick.requiredWins, 9);

  check('starts on the Cockroach', player.mountSlot, 1);
  check('  and has unlocked only it', player.unlockedMounts, 1);

  // The level alone is not enough.
  setLevel(player, speeds, 3);
  player.wins = 0;
  check('level 3 with no wins does not evolve', evolve.refresh(player).evolved, false);
  check('  still the Cockroach', player.mountSlot, 1);

  // The wins alone are not enough either.
  setLevel(player, speeds, 1);
  player.wins = 500;
  check('500 wins at level 1 does not evolve', evolve.refresh(player).evolved, false);
  check('  still the Cockroach', player.mountSlot, 1);

  // Both, and it happens by itself.
  setLevel(player, speeds, 3);
  player.wins = 3;
  const grown = evolve.refresh(player);
  check('level 3 AND 3 wins evolves', grown.evolved, true);
  check('  into the Spider', player.mountSlot, 2);
  check('  wins are NOT deducted', player.wins, 3);
  check('  and it is unlocked in the mask', isMountUnlocked(player.unlockedMounts, 2), true);

  // Idempotent: asking again when nothing has changed does nothing.
  check('refreshing again does not re-evolve', evolve.refresh(player).evolved, false);

  // Spending back below the threshold must NOT take the mount away.
  player.wins = 0;
  evolve.refresh(player);
  check('spending below the requirement keeps the Spider', player.mountSlot, 2);

  // The chain is walked in order: qualifying for a late mount without having
  // met an earlier requirement stops at the earlier one.
  const fresh = newPlayer(new SpeedService());
  check('the chain stops at the first unmet rung', highestEarnedMount(200, 0), 1);
  check('  and a late mount alone does not qualify', qualifiesForMount(5, 200, 0), false);
  check('  fresh players start unevolved', fresh.mountSlot, 1);

  // Both ladders strictly increasing, and both ceilings respected.
  let ladder = true;
  for (let i = 1; i < MOUNTS.length; i += 1) {
    if (MOUNTS[i].multiplier <= MOUNTS[i - 1].multiplier) ladder = false;
    if (MOUNTS[i].requiredLevel <= MOUNTS[i - 1].requiredLevel) ladder = false;
    if (MOUNTS[i].requiredWins <= MOUNTS[i - 1].requiredWins) ladder = false;
  }
  check('every mount is better and harder than the last', ladder, true);
  check('slots are contiguous from 1', MOUNTS.every((m, i) => m.slot === i + 1), true);
  check('every slot fits the uint32 unlocked mask', MOUNTS.every((m) => m.slot >= 1 && m.slot <= 31), true);
  check('every requirement fits the Wins field', MOUNTS.every((m) => m.requiredWins <= MAX_WINS), true);
}

console.log('speed upgrades');
{
  const speeds = new SpeedService();
  const upgrades = new UpgradeService();
  const player = newPlayer(speeds, upgrades);

  const second = SPEED_UPGRADES[1];

  // The specified table, checked against literals.
  check('pad 1 is +1 per step at 0 wins', SPEED_UPGRADES[0].perStep, 1);
  check('  free', SPEED_UPGRADES[0].winsRequired, 0);
  check('pad 12 is +2000 per step', SPEED_UPGRADES[11].perStep, 2000);
  check('  at 350,000 wins', SPEED_UPGRADES[11].winsRequired, 350_000);
  check('twelve pads', SPEED_UPGRADES.length, 12);

  check('starts on the free pad', player.upgradeSlot, 1);

  // On the pad, but short of the requirement.
  player.x = upgradeX(second.slot);
  player.y = 0;
  player.z = upgradeZ(second.slot);
  player.wins = second.winsRequired - 1;
  check('one win short is refused', upgrades.claim(player, second.slot).reason, 'locked');
  check('  still on the free pad', player.upgradeSlot, 1);

  // Enough wins, but standing somewhere else entirely.
  player.wins = 1_000_000;
  player.x = 0;
  player.z = 0;
  check('claim away from the pad is refused', upgrades.claim(player, second.slot).reason, 'not-on-pad');
  check('  still on the free pad', player.upgradeSlot, 1);

  // Both.
  player.x = upgradeX(second.slot);
  player.z = upgradeZ(second.slot);
  const equipped = upgrades.claim(player, second.slot);
  check('on the pad with the wins is granted', equipped.granted, true);
  check('  equipped', player.upgradeSlot, second.slot);
  check('  wins are NOT deducted', player.wins, 1_000_000);

  await sleep(250);
  check('re-claiming the equipped pad is refused', upgrades.claim(player, second.slot).reason, 'already-equipped');
  check('an unknown pad is refused', upgrades.claim(player, 99).reason, 'unknown-slot');

  // Spending back below the requirement drops the player to what they can
  // still reach - otherwise the shop would be a way to keep a pad for free.
  player.upgradeSlot = 12;
  player.wins = 0;
  upgrades.clampToWallet(player);
  check('spending below a pad drops back to the free one', player.upgradeSlot, 1);

  // And it only ever moves DOWN: riding onto a pad is how a player moves up.
  player.upgradeSlot = 1;
  player.wins = 1_000_000;
  upgrades.clampToWallet(player);
  check('a full wallet does not promote by itself', player.upgradeSlot, 1);
}

console.log('the gain formula');
{
  const speeds = new SpeedService();
  const player = newPlayer(speeds);

  // The BASE is the pad and nothing else.
  near('a fresh player earns the cockroach rate', player.speedPerStep, 1 * 1.04);
  near('  and their total multiplier is the cockroach', player.totalMultiplier, 1.04);

  // Each factor, applied once and only once. The product is asserted against
  // a literal chain rather than against `totalMultiplier` - the point of this
  // test is that no bonus is counted twice, and re-using the implementation's
  // own product would make that impossible to catch.
  player.upgradeSlot = 4; // +8 per step
  player.rebirths = 1; // x2
  player.mountSlot = 3; // Chick, x1.25
  player.ownedTrails = 0b1;
  player.trailSlot = 1; // Orange, x1.25
  player.ownedAuras = 0b1;
  player.auraSlot = 1; // Yellow, x1.25
  player.treadmill = 0;
  speeds.syncDerived(player);

  const expectedMultiplier = 2 * 1.25 * 1.25 * 1.25;
  near('every multiplier is applied exactly once', player.totalMultiplier, expectedMultiplier, 1e-3);
  near('  and the base is the pad', player.speedPerStep, 8 * expectedMultiplier, 1e-3);

  // An unowned trail pays nothing, however it got into the slot.
  player.ownedTrails = 0;
  speeds.syncDerived(player);
  near('an unowned trail pays no bonus', player.totalMultiplier, expectedMultiplier / 1.25, 1e-3);
  player.ownedTrails = 0b1;

  // The treadmill multiplies too, and its rebirth gate is honoured.
  player.treadmill = 6; // x3, needs 5 rebirths; this player has 1
  speeds.syncDerived(player);
  near('a locked belt adds no multiplier', player.totalMultiplier, expectedMultiplier, 1e-3);
  // Rebirth 5 is x6, not x5: the ladder is x2 at rebirth 1, x3 at 2, and then
  // +1 a rung. Writing 5 here was the test assuming the count WAS the
  // multiplier, which is exactly the kind of thing this file exists to catch.
  player.rebirths = 5;
  speeds.syncDerived(player);
  const at5 = 6 * 1.25 * 1.25 * 1.25;
  near('an unlocked belt multiplies', player.totalMultiplier, at5 * 3, 1e-3);

  // And the shared helpers agree with the replicated figures, which is what
  // lets the HUD print the server's own numbers.
  const inputs = {
    upgradeSlot: player.upgradeSlot,
    rebirths: player.rebirths,
    mountSlot: player.mountSlot,
    trailSlot: player.trailSlot,
    ownedTrails: player.ownedTrails,
    auraSlot: player.auraSlot,
    ownedAuras: player.ownedAuras,
    treadmill: player.treadmill,
  };
  near('the shared helper agrees', totalMultiplier(inputs), player.totalMultiplier, 1e-3);
  near('  and so does the per-step figure', speedPerStep(inputs), player.speedPerStep, 1e-3);
}

console.log('treadmills');
{
  const speeds = new SpeedService();
  const player = newPlayer(speeds);
  speeds.reset('test', player);

  check('six machines', TREADMILLS.length, 6);
  check('two open belts', TREADMILLS.filter((t) => t.rebirthsRequired === 0).length, 2);
  check('two at rebirth 1', TREADMILLS.filter((t) => t.rebirthsRequired === 1).length, 2);
  check('one at rebirth 3', TREADMILLS.filter((t) => t.rebirthsRequired === 3).length, 1);
  check('one at rebirth 5', TREADMILLS.filter((t) => t.rebirthsRequired === 5).length, 1);
  check('the open belts are x1', TREADMILLS[0].multiplier, 1);
  check('the rebirth-1 belts are x1.5', TREADMILLS[2].multiplier, 1.5);
  check('the rebirth-3 belt is x2', TREADMILLS[4].multiplier, 2);
  check('the rebirth-5 belt is x3', TREADMILLS[5].multiplier, 3);

  // Standing perfectly still ON a belt still farms: the belt supplies the
  // distance, which is the whole point of an AFK trainer.
  player.treadmill = 1;
  const before = player.totalSpeed;
  for (let i = 0; i < 60; i += 1) speeds.credit('test', player, 1 / 60);
  check('a still player on a belt farms Speed', player.totalSpeed > before, true);

  // Stepping off stops it dead.
  player.treadmill = 0;
  const parked = player.totalSpeed;
  for (let i = 0; i < 60; i += 1) speeds.credit('test', player, 1 / 60);
  check('a still player off a belt farms nothing', player.totalSpeed, parked);

  /*
   * A LOCKED tier pays NOTHING AT ALL.
   *
   * This assertion used to say the opposite - that a locked belt paid the
   * ordinary rate - and the reasoning was that a machine paying zero would
   * leave a player silently earning nothing. It is the wrong trade: a belt
   * gated behind five rebirths that hands a brand-new player the full belt
   * distance at the ordinary rate is free progression from a tier nobody
   * earned, and the treadmills are the one place in this game where standing
   * still is supposed to pay. The player is told why instead.
   *
   * The rebirth count is held CONSTANT across the a/b comparison and the BELT
   * is what varies. Varying the rebirths instead would fold the prestige
   * multiplier into the ratio and measure x18 for a x3 belt, which is what the
   * first version of this test did.
   */
  const locked = new SpeedService();
  const a = newPlayer(locked);
  a.rebirths = 5;
  a.treadmill = 1; // x1, open to everyone
  locked.reset('test', a);
  for (let i = 0; i < 60; i += 1) locked.credit('test', a, 1 / 60);

  const unlocked = new SpeedService();
  const b = newPlayer(unlocked);
  b.rebirths = 5;
  b.treadmill = 6; // x3, and this player has the five rebirths for it
  unlocked.reset('test', b);
  for (let i = 0; i < 60; i += 1) unlocked.credit('test', b, 1 / 60);

  const denied = new SpeedService();
  const c = newPlayer(denied);
  c.rebirths = 0;
  c.treadmill = 6; // the same x3 belt, without the rebirths
  denied.reset('test', c);
  for (let i = 0; i < 60; i += 1) denied.credit('test', c, 1 / 60);

  check('a locked belt pays NOTHING', c.totalSpeed, 0);
  near('  the x3 belt pays three times the x1 belt', b.totalSpeed / a.totalSpeed, 3, 1e-6);

  // Every tier, against the rebirth count exactly on and exactly under its
  // own requirement. A ladder is worth testing rung by rung: an off-by-one in
  // a single gate is invisible in a spot check of the top one.
  for (const tier of TREADMILLS) {
    const need = tier.rebirthsRequired;

    const on = new SpeedService();
    const yes = newPlayer(on);
    yes.rebirths = need;
    yes.treadmill = tier.index;
    on.reset('test', yes);
    // Two seconds: long enough for the slowest belt to complete a footfall.
    for (let i = 0; i < 120; i += 1) on.credit('test', yes, 1 / 60);
    check(`  belt ${tier.index} (x${tier.multiplier}) pays at ${need} rebirths`, yes.totalSpeed > 0, true);

    if (need === 0) continue;
    const off = new SpeedService();
    const no = newPlayer(off);
    no.rebirths = need - 1;
    no.treadmill = tier.index;
    off.reset('test', no);
    for (let i = 0; i < 30; i += 1) off.credit('test', no, 1 / 60);
    check(`  and pays nothing at ${need - 1}`, no.totalSpeed, 0);
  }

  /*
   * And the gate the SIMULATION applies, which is the one that matters: a
   * locked belt must not even report as a belt.
   *
   * Driven through `stepPlayer` from a standing start on each machine, so
   * this is the same code path a live player takes rather than a direct call
   * to the predicate. `treadmillUnder` says the mount is on the machine;
   * `treadmill` says whether it is running.
   */
  for (const tier of TREADMILLS) {
    const need = tier.rebirthsRequired;
    const onBelt = createMotion();
    onBelt.x = TRAINING.centerX;
    onBelt.z = treadmillZ(tier.index);
    onBelt.y = TREADMILL_BELT_Y;

    const drive = (rebirths) => {
      const motion = createMotion();
      Object.assign(motion, onBelt);
      const input = createMovementInput();
      const events = createSimEvents();
      const collision = new WorldCollision();
      for (let i = 0; i < 20; i += 1) {
        stepPlayer(
          motion,
          input,
          { moveMultiplier: 1, jumpVelocity: 18, rebirths, time: i / 60 },
          1 / 60,
          collision,
          events,
        );
      }
      return motion;
    };

    const open = drive(need);
    check(`  the simulation runs belt ${tier.index} at ${need} rebirths`, open.treadmill, tier.index);
    check(`    and knows the mount is on it`, open.treadmillUnder, tier.index);

    if (need === 0) continue;
    const shut = drive(need - 1);
    check(`  the simulation stops belt ${tier.index} at ${need - 1}`, shut.treadmill, 0);
    check(`    but still knows the mount is standing on it`, shut.treadmillUnder, tier.index);
  }
}

console.log('rebirth');
{
  const speeds = new SpeedService();
  const upgrades = new UpgradeService();
  const rebirths = new RebirthService();
  const player = newPlayer(speeds, upgrades);
  rebirths.sync(player);

  check('rebirth 1 needs level 25', nextRebirthTier(0).requiredLevel, 25);
  check('rebirth 2 needs level 50', nextRebirthTier(1).requiredLevel, 50);
  check('level cap is the next rebirth requirement', player.maxLevel, 25);
  check('a level-1 player may not rebirth', rebirths.isEligible(player), false);
  check('  and the request is refused', rebirths.rebirth(player, speeds).ok, false);

  // Earn the cap. Everything outside the level curve must survive.
  player.wins = 137;
  player.unlockedMounts = 0b111;
  player.ownedTrails = 0b11;
  player.trailSlot = 2;
  player.ownedAuras = 0b1;
  player.auraSlot = 1;
  player.upgradeSlot = 5;
  player.totalSpeed = 1e9;
  speeds.syncDerived(player);
  check('capped at level 25', player.level, 25);
  check('now eligible', rebirths.isEligible(player), true);

  const done = rebirths.rebirth(player, speeds);
  check('rebirth is granted', done.ok, true);
  check('  level reset to 1', player.level, 1);
  check('  Speed reset to 0', player.totalSpeed, 0);
  check('  rebirth count is 1', player.rebirths, 1);
  check('  cap raised to 50', player.maxLevel, 50);
  check('  the gain multiplier includes x2', done.multiplier, 2);
  check('  Wins survived', player.wins, 137);
  check('  mounts survived', player.unlockedMounts, 0b111);
  check('  trails survived', player.ownedTrails, 0b11);
  check('  the worn trail survived', player.trailSlot, 2);
  check('  auras survived', player.ownedAuras, 0b1);
  // The one deliberate cost, and the one the arena is laid out to make cheap.
  check('  the upgrade pad is reset to the free one', player.upgradeSlot, 1);
  // Movement comes from LEVEL alone now, so a rebirth genuinely makes the
  // player slower on foot - and faster at earning, which is the trade.
  check('  movement is back to the level-1 speed', player.moveMultiplier, 1);
}

console.log('the three shops');
{
  for (const [name, create, tiers, ownedField, slotField] of [
    ['trails', createTrailService, TRAIL_TIERS, 'ownedTrails', 'trailSlot'],
    ['auras', createAuraService, AURA_TIERS, 'ownedAuras', 'auraSlot'],
    ['items', createItemService, ITEM_TIERS, 'ownedItems', 'itemSlot'],
  ]) {
    const speeds = new SpeedService();
    const shop = create();
    const player = newPlayer(speeds);
    shop.initialise(player);

    const first = tiers[0];
    check(`${name}: starts wearing none`, player[slotField], 0);
    check(`${name}: and owns none`, player[ownedField], 0);
    check(`${name}: buying with no Wins is refused`, shop.buy(player, first.slot, speeds).reason, 'too-poor');
    check(`${name}: equipping an unowned tier is refused`, shop.equip(player, first.slot, speeds).reason, 'not-owned');
    check(`${name}: an unknown slot is refused`, shop.buy(player, 999, speeds).reason, 'unknown-slot');

    player.wins = first.cost;
    const bought = shop.buy(player, first.slot, speeds);
    check(`${name}: buying with the Wins is granted`, bought.ok, true);
    check(`${name}: exact price deducted`, player.wins, 0);
    check(`${name}: equipped on purchase`, player[slotField], first.slot);

    await sleep(400);
    check(`${name}: re-buying is refused`, shop.buy(player, first.slot, speeds).reason, 'already-owned');
    check(`${name}: taking it off is allowed`, shop.equip(player, 0, speeds).ok, true);
    check(`${name}: and it is off`, player[slotField], 0);

    // Both ladders strictly increasing, and every slot inside the uint16 mask.
    let ladder = true;
    for (let i = 1; i < tiers.length; i += 1) {
      if (tiers[i].cost <= tiers[i - 1].cost) ladder = false;
      if (tiers[i].multiplier <= tiers[i - 1].multiplier) ladder = false;
    }
    check(`${name}: every tier costs and gives more than the last`, ladder, true);
    check(`${name}: every slot fits the uint16 mask`, tiers.every((t) => t.slot >= 1 && t.slot <= 16), true);
    check(`${name}: every price fits the Wins field`, tiers.every((t) => t.cost <= MAX_WINS), true);
  }

  // The specified tables, spot-checked against literals.
  check('the Orange trail is x1.25 for 250 wins', TRAIL_TIERS[0].multiplier, 1.25);
  check('  cost', TRAIL_TIERS[0].cost, 250);
  check('the Sun trail is x400 for 250T wins', TRAIL_TIERS[11].multiplier, 400);
  check('  cost', TRAIL_TIERS[11].cost, 250_000_000_000_000);
  check('twelve trails', TRAIL_TIERS.length, 12);
  check('the Yellow aura is x1.25 for 10K wins', AURA_TIERS[0].multiplier, 1.25);
  check('  cost', AURA_TIERS[0].cost, 10_000);
  check('the Rainbow aura is x300 for 100T wins', AURA_TIERS[10].multiplier, 300);
  check('  cost', AURA_TIERS[10].cost, 100_000_000_000_000);
  check('eleven auras', AURA_TIERS.length, 11);
}

console.log('items multiply the WINS a stage pays');
{
  const speeds = new SpeedService();
  const stages = new StageService();
  const items = createItemService();
  const player = newPlayer(speeds);
  stages.initialise('test');
  items.initialise(player);

  const stage = STAGES[3]; // pays 27
  player.x = stage.winPadX;
  player.y = stage.winPadY;
  player.z = stage.winPadZ;

  const plain = stages.claim('test', player, stage.index);
  check('a stage pays its base reward', plain.wins, stage.winReward);

  player.ownedItems = 0b1;
  player.itemSlot = 1; // Lucky Charm, x1.5
  await sleep(500);
  const boosted = stages.claim('test', player, stage.index);
  // ROUNDED, not floored: see `StageService`. 27 x 1.5 is 40.5, which pays 41.
  check('  and x1.5 with the Lucky Charm', boosted.wins, Math.round(stage.winReward * 1.5));

  // An unowned item pays nothing extra, however it got into the slot.
  player.ownedItems = 0;
  await sleep(500);
  const forged = stages.claim('test', player, stage.index);
  check('  an unowned item gives no bonus', forged.wins, stage.winReward);
}

console.log('moving platforms carry their rider');
{
  /*
   * The single most important thing the new world added, and the one most
   * likely to break silently: a platform that moves and a rider who does not
   * is a platform the player slides off, and it looks like nothing at all
   * until someone tries to ride it.
   */
  const collision = new WorldCollision();
  const input = createMovementInput();
  const events = createSimEvents();
  const params = { moveMultiplier: 1, jumpVelocity: 25, time: 0 };
  const ride = (motion, seconds) => {
    for (let i = 0; i < seconds * 60; i += 1) {
      params.time = 4 + i / 60;
      stepPlayer(motion, input, params, 1 / 60, collision, events);
    }
  };

  const shuttle = MOVING_SOLIDS.find((m) => m.motion === 'shuttle' && m.amount > 10);
  check('the world has a shuttle platform', !!shuttle, true);
  if (shuttle) {
    // Started where the platform IS at the first step, not where it was
    // authored: a raft on a long run can be a whole gap away from its
    // authored centre at any given instant.
    const at = platformOffsetAt(shuttle, 4, { x: 0, y: 0, z: 0 });
    const motion = createMotion();
    motion.x = (shuttle.minX + shuttle.maxX) / 2 + at.x;
    motion.y = shuttle.maxY + at.y;
    motion.z = (shuttle.minZ + shuttle.maxZ) / 2 + at.z;
    motion.grounded = true;
    const fromX = motion.x;
    const fromZ = motion.z;
    ride(motion, 2);
    const carried = Math.hypot(motion.x - fromX, motion.z - fromZ);
    check('a still rider is carried by it', carried > 4, true);
    check('  and is still standing on it', Math.abs(motion.y - shuttle.maxY) < 1.5, true);
  }

  const carousel = MOVING_SOLIDS.find((m) => m.motion === 'orbit');
  check('the world has an orbiting platform', !!carousel, true);
  if (carousel) {
    // Placed where the platform ACTUALLY is at the instant the ride starts.
    // An orbiting platform is only at its authored centre plus its radius when
    // its angle happens to be zero, and at t=4 it is not - which is how the
    // first version of this test managed to stand the rider in mid-air and
    // conclude that carousels do not carry.
    const at = { x: 0, y: 0, z: 0 };
    platformOffsetAt(carousel, 4, at);
    const motion = createMotion();
    motion.x = (carousel.minX + carousel.maxX) / 2 + at.x;
    motion.y = carousel.maxY + at.y;
    motion.z = (carousel.minZ + carousel.maxZ) / 2 + at.z;
    motion.grounded = true;
    const fromX = motion.x;
    const fromZ = motion.z;
    ride(motion, 1.5);
    check(
      'a still rider is carried round by it',
      Math.hypot(motion.x - fromX, motion.z - fromZ) > 2,
      true,
    );
  }

  // And the thing that must NOT happen: ordinary ground carrying anybody. A
  // carry that leaked onto static solids would slide every player in the camp.
  const onGround = createMotion();
  onGround.grounded = true;
  const groundX = onGround.x;
  const groundZ = onGround.z;
  ride(onGround, 2);
  near('a still rider on ordinary ground does not move', Math.hypot(onGround.x - groundX, onGround.z - groundZ), 0, 1e-6);
}

console.log('identity');
{
  check('a plain username survives', sanitizeDisplayName('chicken456'), 'chicken456');
  check('markup is stripped from a name', sanitizeDisplayName('<b>x</b>'), 'bxb');
  check('names are bounded', Array.from(sanitizeDisplayName('a'.repeat(80))).length, DISPLAY_NAME_MAX);
  check('a non-string name is empty', sanitizeDisplayName(42), '');
  const portrait = 'https://static.bloxity.io/img/pfps/s0.png?width=128&quality=85&v=2';
  check('a Bloxity portrait is kept', sanitizePfpUrl(portrait), portrait);
  check('another host is refused', sanitizePfpUrl('https://example.com/a.png'), '');
  check('a look-alike host is refused', sanitizePfpUrl('https://static.bloxity.io.example.com/a.png'), '');
  check('a quote in a portrait URL is refused', sanitizePfpUrl('https://static.bloxity.io/a".png'), '');
}

console.log('speed and levels');
{
  const speeds = new SpeedService();
  const player = newPlayer(speeds);

  check('starts at level 1', player.level, 1);

  // The level curve reproduces the reference art exactly. A player at level 8
  // with 24 into the level shows "24.00 / 40.00" and a lifetime "Speed:
  // 164.00", and 5*(1+..+7) + 24 is 164.
  check('level 8 costs 40', resolveLevel(164, 100).required, 40);
  check('  and 164 lifetime Speed is 24 into it', resolveLevel(164, 100).into, 24);
  check('  at level 8', resolveLevel(164, 100).level, 8);
  check('level 9 costs 45', resolveLevel(216, 100).required, 45);
  check('  and 216 lifetime Speed is 36 into it', resolveLevel(216, 100).into, 36);
  check('  at level 9', resolveLevel(216, 100).level, 9);

  /* ---------------------------------------------------------------------
   * The curve COMPOUNDS
   * ------------------------------------------------------------------ */

  // Every level must cost meaningfully more than the one before it. The curve
  // this replaced was purely linear - level 100 cost 500 and level 101 cost
  // 505 - and a one percent step is not progression once the multiplier stack
  // reaches the millions.
  {
    let worstRatio = Infinity;
    let worstAt = 0;
    for (let level = 1; level < 300; level += 1) {
      const here = speedForNextLevel(level);
      const next = speedForNextLevel(level + 1);
      if (next <= here) {
        fail(`level ${level + 1} costs no more than level ${level}`);
        break;
      }
      if (level >= SPEED.levelKnee && next / here < worstRatio) {
        worstRatio = next / here;
        worstAt = level;
      }
    }
    check('every level costs more than the last, to 300', true, true);
    // Past the knee the growth converges on the compounding rate from above,
    // so the WORST step in the whole curve is the asymptote itself.
    check(
      `  and past the knee never by less than ${SPEED.levelGrowth}x ` +
        `(worst ${worstRatio.toFixed(4)} at ${worstAt})`,
      worstRatio >= SPEED.levelGrowth - 1e-9,
      true,
    );
  }

  // The points the brief named, and what they cost relative to the linear
  // curve they replaced. This is the table to read when retuning
  // `SPEED.levelGrowth`: it is the only thing that moves these numbers.
  {
    const linearTotal = (level) => (SPEED.levelStep * (level - 1) * level) / 2;
    const expected = [
      // level, at least this many times harder to REACH than the old curve
      [10, 1],
      [25, 1.5],
      [50, 4],
      [100, 40],
      [150, 500],
      [200, 5000],
    ];
    for (const [level, factor] of expected) {
      const now = totalSpeedToReach(level);
      const before = linearTotal(level);
      const ratio = now / before;
      check(
        `reaching level ${level} costs ${formatSpeed(now)} ` +
          `(${ratio.toFixed(0)}x the old curve, needed ${factor}x)`,
        ratio >= factor,
        true,
      );
    }
  }

  // The reference art is UNTOUCHED, and that is the point of the knee: the
  // first nine levels are still exactly `levelStep * L`, so every figure the
  // screenshots pin still reads the way they show it.
  for (const level of [5, 8, 9]) {
    check(`level ${level} still costs ${5 * level}`, speedForNextLevel(level), 5 * level);
  }
  check('and level 10 no longer does', speedForNextLevel(10) > 50, true);

  // The bar and the level agree with the curve at every boundary. A cumulative
  // table read one way by `totalSpeedToReach` and another by `resolveLevel`
  // would show a player a full bar that does not level them up.
  {
    let mismatches = 0;
    for (let level = 1; level <= 250; level += 1) {
      const at = totalSpeedToReach(level);
      const exact = resolveLevel(at, 100000);
      if (exact.level !== level || exact.into !== 0) mismatches += 1;
      if (level > 1) {
        const under = resolveLevel(at - 1, 100000);
        if (under.level !== level - 1) mismatches += 1;
      }
    }
    check('every level boundary resolves to that exact level, 1-250', mismatches, 0);
  }

  // And the curve stays inside a float64 for every level the rebirth ladder
  // could ever gate. "Demanding" and "impossible" are different things.
  {
    const top = totalSpeedToReach(MAX_CURVE_LEVEL);
    check('the curve never overflows', Number.isFinite(top), true);
    check(`  and expresses ${MAX_CURVE_LEVEL} levels before it saturates`, MAX_CURVE_LEVEL > 400, true);
  }

  // Credit honest movement: sixty 1/60-second steps at a plausible run.
  // The per-step distance has to be one the server would actually observe -
  // anything larger is a teleport by definition and pays nothing.
  let z = 0;
  player.z = z;
  speeds.reset('test', player);
  // The first credit after a reset only establishes the baseline.
  speeds.credit('test', player, 1 / 60);
  const perStep = 24 / 60;
  for (let i = 0; i < 60; i += 1) {
    z += perStep;
    player.z = z;
    speeds.credit('test', player, 1 / 60);
  }
  check('honest movement pays', player.totalSpeed > 0, true);
  // One second at 24 u/s is 24 units: EXACTLY 12 whole steps of 2 units, each
  // worth exactly the cockroach's 1.04 - asserted as 12 x 1.04, not "about".
  near('  exactly 12 steps at the rate the formula says', player.totalSpeed, 12 * 1.04, 1e-12);

  // A teleport must pay nothing at all.
  const beforeTeleport = player.totalSpeed;
  player.z = z + 5000;
  speeds.credit('test', player, 1 / 60);
  check('a teleport pays nothing', player.totalSpeed, beforeTeleport);

  // Movement speed rises with LEVEL and with nothing else. The cap before any
  // rebirth is level 25, so that is where a huge Speed total lands - getting
  // past it is what the rebirth ladder is FOR.
  player.totalSpeed = 1e9;
  speeds.syncDerived(player);
  check('a huge Speed total caps at the pre-rebirth level', player.level, 25);

  const atLevel1 = resolveMovementProfile(1).multiplier;
  const atCap = resolveMovementProfile(25).multiplier;
  const higher = resolveMovementProfile(160).multiplier;
  check('level drives the replicated multiplier', player.moveMultiplier > atLevel1, true);
  check('  and it is the level cap that is driving it', player.moveMultiplier, atCap);
  check('  and a higher level is still faster', higher > atCap, true);
  check('  level 1 is exactly the base speed', atLevel1, 1);

  // The thing that must NOT be true: a cosmetic must not make the player
  // physically faster, or a 400x trail would launch a rider through a
  // thirty-stage obby faster than its platforms could be read.
  const before = player.moveMultiplier;
  player.ownedTrails = 0xffff;
  player.trailSlot = 12; // Sun, x400
  player.ownedAuras = 0xffff;
  player.auraSlot = 11; // Rainbow, x300
  player.rebirths = 9;
  speeds.syncDerived(player);
  check('a 400x trail does not change movement speed', player.moveMultiplier > before, true);
  // (It rose only because the rebirth raised the level CAP, which raised the
  // level. Pinning the level proves the cosmetics contribute nothing.)
  const pinned = resolveMovementProfile(player.level).multiplier;
  check('  movement is a pure function of level', player.moveMultiplier, pinned);
  check('  but the gain multiplier is enormous', player.totalMultiplier > 1e6, true);
}

/* -------------------------------------------------------------------------
 * The roster is ANATOMY, not a colour swap
 * ---------------------------------------------------------------------- */

{
  console.log('');
  console.log('the animals');

  const plans = new Set();
  const feet = new Set();
  let worstEye = 0;
  let flattest = Infinity;

  for (const mount of MOUNTS) {
    const s = mount.shape;
    plans.add(s.plan);
    feet.add(s.foot);

    // Every limb has THREE segments. A two-segment leg cannot put a foot on
    // the ground at a natural angle, which is what made the first roster's
    // animals stand on tiptoe.
    check(
      `  ${mount.name}: three leg segments`,
      s.legUpper > 0 && s.legLower > 0 && s.legFoot > 0,
      true,
    );

    /*
     * The EYE RULE, and it is the single most load-bearing number in the
     * roster: one googly eye on the face undoes any amount of good anatomy
     * underneath it, which is exactly how the first version of this roster
     * read as fourteen toys.
     *
     * The limit is per PLAN, because the thing being prevented is a cartoon
     * convention rather than a ratio. A wolf's eye really is a tenth of its
     * skull and anything near a fifth is a caricature; an ostrich's eye
     * genuinely is a third of its tiny head, and a roach's compound eyes
     * genuinely do wrap most of its face. Holding those two to a mammal's
     * number would make them LESS like the animal, not more.
     */
    const eyeShare = s.eyeSize / s.headW;
    const eyeLimit = s.plan === 'quadruped' ? 0.2 : 0.32;
    worstEye = Math.max(worstEye, eyeShare);
    check(`  ${mount.name}: eyes are an animal's, not a cartoon's`, eyeShare < eyeLimit, true);

    // The torso has to TAPER. A profile that is 1 everywhere is a box, which
    // is exactly what the previous builder emitted for all fourteen.
    const tapers =
      s.waist !== 1 || s.chestW !== 1 || s.rumpW !== 1 || s.chestH !== 1 || s.rumpH !== 1;
    check(`  ${mount.name}: the barrel tapers`, tapers, true);
    flattest = Math.min(flattest, Math.abs(1 - s.waist));

    // The seat is measured from the BACKLINE, so a lift is a small positive
    // number. A big one is a rider hovering; a negative one is a rider inside
    // the animal.
    check(
      `  ${mount.name}: the rider sits on the animal`,
      mount.seat.lift > 0 && mount.seat.lift < 0.5,
      true,
    );

    // Six related tones rather than one swatch. A palette whose entries are
    // all the same colour is a flat toy however good the geometry is.
    const tones = new Set([
      mount.palette.body,
      mount.palette.dark,
      mount.palette.belly,
      mount.palette.hoof,
      mount.palette.hair,
      mount.palette.accent,
    ]);
    check(`  ${mount.name}: a palette, not a swatch`, tones.size >= 4, true);
  }

  // The four body plans all have to be in USE. A plan nothing is built on is
  // a branch nobody has looked at.
  check('every body plan is used', plans.size, 4);
  check('at least four kinds of foot', feet.size >= 4, true);

  // The one animal the brief called out by name.
  const spider = MOUNTS.find((m) => m.id === 'spider');
  check('the spider is an arachnid', spider.shape.plan, 'arachnid');
  check('  eight legs', spider.shape.legPairs * 2, 8);
  check('  a pinched waist between two masses', spider.shape.waist < 0.4, true);
  check('  legs that radiate rather than hang', spider.shape.legFan > 0.5, true);
  check('  and reach out past the body', spider.shape.legSplay > 0.4, true);
  check('  no tail', spider.shape.tailLen, 0);

  // And the one that must NOT be a mammal with extra legs.
  const roach = MOUNTS.find((m) => m.id === 'cockroach');
  check('the cockroach is an insect', roach.shape.plan, 'insect');
  check('  six legs', roach.shape.legPairs * 2, 6);
  check('  and is FLAT', roach.shape.bodyH / roach.shape.bodyL < 0.3, true);
}

console.log('deterministic Speed gain');
{
  /*
   * ONE valid step = ONE gain, and the same setup always pays the same gain.
   *
   * Each setup is ridden through the real SpeedService with deliberately
   * IRREGULAR movement - uneven distances per tick and four different frame
   * times, the way a real client arrives - and every single payment is checked
   * against `calculateSpeedGain`. The old service paid a fraction of a step
   * per tick, so exactly this input came out as a different figure every time.
   */
  const ALL = 0xffff;
  const SETUPS = [
    { name: 'fresh player', upgradeSlot: 1, mountSlot: 1, trailSlot: 0, auraSlot: 0, rebirths: 0, treadmill: 0 },
    { name: 'pad 8 (+125), spider', upgradeSlot: 8, mountSlot: 2, trailSlot: 0, auraSlot: 0, rebirths: 0, treadmill: 0 },
    { name: 'mid game', upgradeSlot: 6, mountSlot: 7, trailSlot: 4, auraSlot: 3, rebirths: 3, treadmill: 0 },
    { name: 'late game', upgradeSlot: 12, mountSlot: 14, trailSlot: 12, auraSlot: 11, rebirths: 10, treadmill: 0 },
    { name: 'on the x2 belt', upgradeSlot: 4, mountSlot: 5, trailSlot: 2, auraSlot: 1, rebirths: 5, treadmill: 5 },
  ];
  // Travel per tick: uneven, like real frames, and all inside the honest cap.
  const TRAVEL = [0.37, 0.41, 0.12, 0.46, 0.4, 0.05, 0.49, 0.28, 0.4, 0.31];
  const FRAMES = [1 / 60, 1 / 30, 1 / 45, 1 / 120];

  for (const setup of SETUPS) {
    const speeds = new SpeedService();
    const player = newPlayer(speeds);
    Object.assign(player, {
      upgradeSlot: setup.upgradeSlot,
      mountSlot: setup.mountSlot,
      trailSlot: setup.trailSlot,
      ownedTrails: ALL,
      auraSlot: setup.auraSlot,
      ownedAuras: ALL,
      rebirths: setup.rebirths,
      treadmill: setup.treadmill,
    });
    speeds.syncDerived(player);
    const b = speeds.breakdown(player);
    console.log(`        ${setup.name}: ${describeSpeedGain(b)}`);

    // The breakdown is the CONFIGURED values, multiplied in the fixed order.
    const hand =
      upgradePerStep(setup.upgradeSlot) *
      mountMultiplier(setup.mountSlot) *
      treadmillMultiplier(setup.treadmill, setup.rebirths) *
      1 *
      trailMultiplier(setup.trailSlot, ALL) *
      auraMultiplier(setup.auraSlot, ALL) *
      rebirthMultiplier(setup.rebirths);
    check(`  ${setup.name}: the gain is the configured values, bit for bit`, b.gain, hand);
    check('  and the replicated per-step figure is that same number', player.speedPerStep, b.gain);
    check('  and items never touch Speed', b.items, 1);

    // Ride it.
    player.z = 0;
    speeds.reset('test', player);
    speeds.credit('test', player, 1 / 60);
    const start = player.totalSpeed;
    let distance = 0;
    let steps = 0;
    let wrong = 0;
    const rates = new Set();
    for (let i = 0; i < 400; i += 1) {
      const dt = FRAMES[i % FRAMES.length];
      if (setup.treadmill) {
        distance += treadmillBeltSpeed(setup.treadmill, setup.rebirths) * dt;
      } else {
        const d = TRAVEL[i % TRAVEL.length];
        player.z += d;
        distance += d;
      }
      const g = speeds.credit('test', player, dt);
      for (const award of g.awards) {
        rates.add(award.gain);
        steps += 1;
        // Every award is ONE footfall's gain, bit for bit.
        if (!Object.is(award.gain, footfallSpeedGain(b))) wrong += 1;
      }
    }
    check('  every award is exactly one footfall of the calculated gain', wrong, 0);
    check(
      '  and every one of them paid the same figure',
      rates.size === 1 && rates.has(footfallSpeedGain(b)),
      true,
    );
    check(
      '  footfalls paid = distance / footfall, rounded down',
      steps,
      Math.floor(distance / FOOTFALL_DISTANCE + 1e-6),
    );
    near(
      '  the total rose by exactly footfalls x steps-per-footfall x step gain',
      player.totalSpeed - start,
      steps * SPEED.footfallSteps * b.gain,
      1e-12,
    );
    check(
      '  and the level is read off that accumulated total',
      player.level,
      resolveLevel(player.totalSpeed, player.maxLevel).level,
    );
  }

  // The SAME distance pays the SAME Speed at any frame rate.
  {
    const payFor = (ticks) => {
      const speeds = new SpeedService();
      const player = newPlayer(speeds);
      player.upgradeSlot = 8;
      speeds.syncDerived(player);
      player.z = 0;
      speeds.reset('test', player);
      speeds.credit('test', player, 1 / 60);
      const before = player.totalSpeed;
      for (let i = 1; i <= ticks; i += 1) {
        player.z = (24 * i) / ticks;
        speeds.credit('test', player, 1 / ticks);
      }
      return player.totalSpeed - before;
    };
    const at30 = payFor(30);
    const at60 = payFor(60);
    const at144 = payFor(144);
    check('24 units pay the same at 30, 60 and 144 ticks a second', at30 === at60 && at60 === at144, true);
    near('  which is exactly 12 steps', at60, 12 * 125 * 1.04, 1e-12);
  }

  // ONE FOOTFALL, ONE AWARD. The popup flood: every two-unit step was paid
  // and announced on its own, so one stride of the legs was a dozen "+1"s.
  {
    check('a footfall is a whole number of steps', Number.isInteger(SPEED.footfallSteps) && SPEED.footfallSteps > 1, true);
    check('  and its distance is that many strides', FOOTFALL_DISTANCE, SPEED.strideDistance * SPEED.footfallSteps);

    // Ride exactly one footfall in sixty-a-second inputs, at the TOP of the
    // speed curve and at the bottom: exactly one award, of the whole sum.
    for (const level of [1, 12, 160]) {
      const speeds = new SpeedService();
      const player = newPlayer(speeds);
      player.upgradeSlot = 3;
      // Really AT that level, so the server's own anti-teleport cap - which
      // is the player's own run speed - allows that level's honest step.
      player.rebirths = 6;
      player.totalSpeed = totalSpeedToReach(level);
      speeds.syncDerived(player);
      check(`  the rider is at level ${level}`, player.level, level);
      const b = speeds.breakdown(player);
      const perInput = resolveMovementProfile(level).runSpeed / 60;
      player.z = 0;
      speeds.reset('test', player);
      speeds.credit('test', player, 1 / 60);
      const awards = [];
      let maxPerInput = 0;
      let travelled = 0;
      while (travelled + perInput <= FOOTFALL_DISTANCE + 1e-9) {
        player.z += perInput;
        travelled += perInput;
        const got = speeds.credit('test', player, 1 / 60).awards;
        maxPerInput = Math.max(maxPerInput, got.length);
        awards.push(...got);
      }
      // Finish the footfall exactly.
      player.z += FOOTFALL_DISTANCE - travelled;
      const last = speeds.credit('test', player, 1 / 60).awards;
      maxPerInput = Math.max(maxPerInput, last.length);
      awards.push(...last);
      check(`  level ${level}: one footfall is ONE award`, awards.length, 1);
      check(`  level ${level}: no input ever carries two`, maxPerInput, 1);
      check(
        `  level ${level}: and it is the whole footfall's Speed, as one figure`,
        awards[0]?.gain,
        b.gain * SPEED.footfallSteps,
      );
    }

    // A death does not eat the part-footfall already ridden.
    const speeds = new SpeedService();
    const player = newPlayer(speeds);
    speeds.syncDerived(player);
    player.z = 0;
    speeds.reset('test', player);
    speeds.credit('test', player, 1 / 60);
    // Moves of a twentieth of a footfall: an honest input for a level-one rider.
    for (let i = 0; i < 10; i += 1) {
      player.z += FOOTFALL_DISTANCE / 20;
      speeds.credit('test', player, 1 / 60);
    }
    player.z = -500;
    speeds.reset('test', player);
    speeds.credit('test', player, 1 / 60);
    let paid = 0;
    for (let i = 0; i < 10; i += 1) {
      player.z += FOOTFALL_DISTANCE / 20;
      paid += speeds.credit('test', player, 1 / 60).awards.length;
    }
    check('  half a footfall, a respawn and the other half pay one award', paid, 1);
  }

  // Leaving the ground pays NOTHING extra. The jump bonus was a second,
  // occasional source of Speed beside the one every step pays.
  {
    const speeds = new SpeedService();
    const player = newPlayer(speeds);
    player.upgradeSlot = 8;
    speeds.syncDerived(player);
    speeds.reset('test', player);
    speeds.credit('test', player, 1 / 60);
    player.grounded = false;
    const jump = speeds.credit('test', player, 1 / 60);
    check('leaving the ground pays no bonus', jump.awards.length, 0);
    check('  and the config has no jump bonus to pay', 'jumpBonusSteps' in SPEED, false);
  }

  // A long run at one setup: every single award is the identical number, and
  // the total is exactly awards x that number.
  {
    const speeds = new SpeedService();
    const player = newPlayer(speeds);
    player.upgradeSlot = 5;
    player.mountSlot = 3;
    speeds.syncDerived(player);
    const expected = footfallSpeedGain(speeds.breakdown(player));
    player.z = 0;
    speeds.reset('test', player);
    speeds.credit('test', player, 1 / 60);
    const gains = [];
    for (let i = 1; i <= 600; i += 1) {
      // Uneven movement, with jumps in it.
      player.z += 0.2 + ((i * 37) % 11) / 20;
      player.grounded = i % 45 > 20;
      for (const award of speeds.credit('test', player, 1 / 60).awards) gains.push(award.gain);
    }
    check(`${gains.length} consecutive awards at one setup are all ${expected}`, gains.every((g) => Object.is(g, expected)), true);
  }

  // A movement message the server has already seen is refused before any
  // Speed could be paid for it.
  {
    const movement = new MovementService();
    const player = new PlayerState();
    player.sessionId = 'dup';
    movement.initialise(player);
    const message = { ...createMovementInput(), seq: 1, dt: 1 / 60, moveZ: 1 };
    const first = movement.applyInput('dup', player, message, 0);
    const again = movement.applyInput('dup', player, message, 0);
    check('a movement message is simulated once', first, true);
    check('  and a duplicate of it is refused, so it cannot pay twice', again, false);
  }

  // What a popup prints is the per-step figure, exactly.
  check('a 1.04 gain prints as 1.04, not 1', formatSpeedGain(1.04), '1.04');
  check('  125 as 125', formatSpeedGain(125), '125');
  check('  2.5 as 2.5', formatSpeedGain(2.5), '2.5');
  check('  1,300 compactly', formatSpeedGain(1300), '1.3K');
  check('  and float dust never shows', formatSpeedGain(1.04 * 1.5 * 1.25), '1.95');
}

console.log('');
if (failures > 0) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log('progression OK');
