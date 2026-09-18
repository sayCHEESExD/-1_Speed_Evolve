import {
  FOOTFALL_DISTANCE,
  MAX_SIM_DELTA,
  SPEED,
  calculateSpeedGain,
  clampSpeed,
  describeSpeedGain,
  footfallSpeedGain,
  resolveLevel,
  resolveMovementProfile,
  speedForNextLevel,
  treadmillBeltSpeed,
  type GainInputs,
  type MovementProfile,
  type SpeedGainBreakdown,
} from '@evolve/shared';
import { serverConfig } from '../config/serverConfig.js';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import { logger } from '../util/logger.js';

const SCOPE = 'speed';

/** Float dust forgiven when deciding whether a footfall is complete. World units. */
const STRIDE_EPSILON = 1e-6;

/** What the server remembers between two simulated steps for one player. */
interface Tracker {
  x: number;
  z: number;
  grounded: boolean;
  /** True until the first step is credited, so spawning pays nothing. */
  fresh: boolean;
  /**
   * Distance travelled toward the NEXT footfall, always under one footfall.
   *
   * The remainder an input leaves behind is kept here rather than paid out as
   * a fraction. A footfall is paid whole or not at all, which is what keeps
   * every award the same number - paying "3.65 steps" is how a constant rate
   * once came out as +14, +15, +17.
   */
  carry: number;
}

/** One footfall's award: exactly `footfallSpeedGain(...)`, once. */
export interface SpeedAward {
  readonly gain: number;
  /** The authoritative lifetime total once this award had been added. */
  readonly total: number;
  readonly source: 'stride' | 'belt';
}

/** Outcome of crediting one movement input. */
export interface SpeedGain {
  /**
   * The footfalls this input completed, in order, each its own award.
   *
   * A LIST, and never a count times a rate. Almost always empty or one long:
   * a footfall is twelve units, and the fastest honest input at sixty a
   * second covers about two. Every entry's `gain` is the same number for the
   * same player.
   */
  readonly awards: readonly SpeedAward[];
  /** Levels crossed, if any. */
  readonly levelsGained: number;
}

/**
 * Server authority over Speed farming and levelling.
 *
 * Speed is DERIVED from movement the server actually observes, and it is paid
 * in WHOLE FOOTFALLS. Travel accumulates toward the next one; every time it
 * crosses `FOOTFALL_DISTANCE` the player is paid ONE award of exactly
 * `footfallSpeedGain` - the gain of the `SPEED.footfallSteps` steps it
 * covered, from the single calculation in `shared/src/config/speed.ts`. There
 * is no jump bonus, no combo and no other way Speed is earned, and no fraction
 * of a footfall is ever paid. Each award is added on its own and announced on
 * its own, so one footfall is one popup showing that one figure.
 *
 * It used to pay every two-unit STEP as its own award - up to sixty a second
 * at the top of the curve. The Speed was right, and the screen was a spray of
 * "+1"s for every stride of the legs.
 *
 * A client cannot ask for Speed: the distance is measured between positions
 * the server simulated itself, a single step is capped at a plausible
 * distance so a teleport pays nothing, and a movement message the server has
 * already seen is rejected before it gets here, so nothing is paid twice.
 *
 * Level then follows from the lifetime total, and level alone drives movement
 * speed - which is the loop: ride to farm Speed, gain levels, get faster.
 */
export class SpeedService {
  private readonly trackers = new Map<string, Tracker>();
  /** The last rate breakdown logged per player, so a change is logged once. */
  private readonly lastLogged = new Map<string, string>();

  initialise(player: PlayerState): void {
    this.syncDerived(player);
    this.reset(player.sessionId, player);
  }

  forget(sessionId: string): void {
    this.trackers.delete(sessionId);
    this.lastLogged.delete(sessionId);
  }

  /**
   * Drop the movement baseline.
   *
   * Called on every respawn: the teleport back to the arena is a huge position
   * delta that must never be credited as distance travelled. The part-footfall
   * in `carry` is KEPT: it is distance the server watched the player ride, and
   * at twelve units a footfall, dropping it on every death would quietly pay a
   * player who falls less per unit ridden than one who never does.
   */
  reset(sessionId: string, player: PlayerState): void {
    this.trackers.set(sessionId, {
      x: player.x,
      z: player.z,
      grounded: true,
      fresh: true,
      carry: this.trackers.get(sessionId)?.carry ?? 0,
    });
  }

  /**
   * Credit one simulated step and apply any level-ups.
   *
   * Call AFTER the transform has been updated, so the tracker advances to the
   * position the server just simulated.
   */
  credit(sessionId: string, player: PlayerState, stepSeconds: number, seq = -1): SpeedGain {
    const tracker = this.trackers.get(sessionId);
    if (!tracker) {
      this.reset(sessionId, player);
      return { awards: [], levelsGained: 0 };
    }

    // THE award. One call; nothing is multiplied in below this line.
    const breakdown = calculateSpeedGain(this.gainInputs(player));
    const perFootfall = footfallSpeedGain(breakdown);

    let footfalls = 0;
    const source = player.treadmill > 0 ? 'belt' : 'stride';

    if (!tracker.fresh) {
      let distance = 0;

      if (player.treadmill > 0) {
        // Running on a belt. There is no position delta to measure, so the
        // BELT supplies the distance, paid per simulated second of the
        // SERVER's own step - a client cannot buy steps by claiming a longer
        // frame. The rebirth gate is applied here as well as in the
        // simulation that chose the belt, so a locked belt supplies nothing.
        const step = Number.isFinite(stepSeconds)
          ? Math.max(0, Math.min(stepSeconds, MAX_SIM_DELTA))
          : 0;
        distance = treadmillBeltSpeed(player.treadmill, player.rebirths) * step;
      } else {
        const moved = Math.hypot(player.x - tracker.x, player.z - tracker.z);
        // Validated against the SAME speed the player actually moves at.
        // Anything beyond it is a teleport and pays nothing at all.
        if (moved <= this.maxCreditedStep(player, stepSeconds)) distance = moved;
        // There is NO jump bonus. Leaving the ground used to pay two extra
        // steps, which put a second, occasional source of Speed next to the
        // one every step pays.
      }

      // Whole footfalls only. The remainder waits for the next input.
      //
      // STRIDE_EPSILON forgives float dust, nothing more: sixty honest moves
      // of 0.4 add up to 23.9999999999 rather than 24, and without it the
      // second footfall would sit one ten-billionth short until the next input.
      const carryBefore = tracker.carry;
      tracker.carry += distance;
      footfalls = Math.floor((tracker.carry + STRIDE_EPSILON) / FOOTFALL_DISTANCE);
      tracker.carry = Math.max(0, tracker.carry - footfalls * FOOTFALL_DISTANCE);
      if (serverConfig.logSpeedAwards && footfalls > 0) {
        const b = breakdown;
        logger.info(
          SCOPE,
          `TRACE ${player.displayName || sessionId} input#${seq} dt=${stepSeconds.toFixed(4)} ` +
            `moved=${distance.toFixed(3)} carry ${carryBefore.toFixed(3)}->${tracker.carry.toFixed(3)} ` +
            `footfalls=${footfalls} | base ${b.base} animal x${b.animal} ` +
            `training x${b.training} items x${b.items} trail x${b.trail} aura x${b.aura} ` +
            `rebirth x${b.rebirth} = step ${b.gain} x${SPEED.footfallSteps} steps = award ${perFootfall}`,
        );
      }
    }

    tracker.x = player.x;
    tracker.z = player.z;
    tracker.grounded = player.grounded;
    tracker.fresh = false;

    // Each footfall is added ON ITS OWN, and each is exactly `perFootfall`.
    // Never `footfalls x perFootfall` in one go: a count beside a number is
    // what once read as a multiplier that changed from moment to moment.
    const beforeLevel = player.level;
    const awards: SpeedAward[] = [];
    for (let i = 0; i < footfalls; i += 1) {
      player.totalSpeed = clampSpeed(player.totalSpeed + perFootfall);
      awards.push({ gain: perFootfall, total: player.totalSpeed, source });
    }

    this.syncDerived(player);

    return { awards, levelsGained: player.level - beforeLevel };
  }

  /**
   * Re-derive level and everything downstream from the current Speed total.
   *
   * Used on join, on reconnect and whenever anything that feeds the gain
   * formula changes: the profile carries only the Speed earned, and level,
   * movement speed, jump velocity and the two replicated gain figures all
   * follow from it through the same formulas a live step uses.
   */
  syncDerived(player: PlayerState): void {
    player.level = resolveLevel(player.totalSpeed).level;

    // Replicated so the HUD prints exactly the figures the server pays, rather
    // than a client's own reconstruction of them. Both are fields of the SAME
    // breakdown, so they cannot disagree with each other or with `credit`.
    const breakdown = calculateSpeedGain(this.gainInputs(player));
    player.totalMultiplier = breakdown.multiplier;
    player.speedPerStep = breakdown.gain;
    this.logRate(player, breakdown);

    const profile = this.movementProfile(player);
    player.moveMultiplier = profile.multiplier;
    player.jumpVelocity = profile.jumpVelocity;
  }

  /** The full breakdown for a player, for tests and diagnostics. */
  breakdown(player: PlayerState): SpeedGainBreakdown {
    return calculateSpeedGain(this.gainInputs(player));
  }

  /**
   * THE player's movement profile.
   *
   * LEVEL and nothing else. Every caller that needs a speed - the replicated
   * multiplier, the anti-teleport step cap - goes through here, so what the
   * player moves at and what the server will credit cannot disagree.
   */
  movementProfile(player: PlayerState): MovementProfile {
    return resolveMovementProfile(player.level);
  }

  /** Speed still needed for the next level, for logging and diagnostics. */
  speedToNextLevel(player: PlayerState): number {
    return speedForNextLevel(player.level);
  }

  /**
   * Log the rate whenever it CHANGES: on join, and on every equip, evolution,
   * rebirth, pad claim or step onto a belt. Once per change rather than per
   * step, so it is readable - `EVOLVE_LOG_SPEED=1` adds the per-payment line.
   */
  private logRate(player: PlayerState, breakdown: SpeedGainBreakdown): void {
    const b = breakdown;
    const key = `${b.base}|${b.animal}|${b.training}|${b.items}|${b.trail}|${b.aura}|${b.rebirth}`;
    if (this.lastLogged.get(player.sessionId) === key) return;
    this.lastLogged.set(player.sessionId, key);
    logger.info(SCOPE, `${player.displayName || player.sessionId}: ${describeSpeedGain(b)}`);
  }

  /**
   * Everything the gain formula needs, read off the authoritative state.
   *
   * Assembled in ONE place so no caller can build a half-populated set and
   * quietly lose a multiplier the player has earned.
   */
  private gainInputs(player: PlayerState): GainInputs {
    return {
      upgradeSlot: player.upgradeSlot,
      rebirths: player.rebirths,
      mountSlot: player.mountSlot,
      trailSlot: player.trailSlot,
      ownedTrails: player.ownedTrails,
      auraSlot: player.auraSlot,
      ownedAuras: player.ownedAuras,
      treadmill: player.treadmill,
    };
  }

  /**
   * Largest movement the server will credit from one simulated step.
   *
   * Derived from the player's OWN authoritative run speed and the step's own
   * duration rather than a fixed constant, so movement validation and movement
   * itself can never disagree.
   */
  private maxCreditedStep(player: PlayerState, stepSeconds: number): number {
    const step = Number.isFinite(stepSeconds)
      ? Math.max(0, Math.min(stepSeconds, MAX_SIM_DELTA))
      : MAX_SIM_DELTA;
    return this.movementProfile(player).runSpeed * step * SPEED.creditSlack + 0.5;
  }
}
