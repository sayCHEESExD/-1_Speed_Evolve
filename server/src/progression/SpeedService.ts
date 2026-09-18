import {
  MAX_SIM_DELTA,
  SPEED,
  calculateSpeedGain,
  clampSpeed,
  describeSpeedGain,
  maxLevelForRebirth,
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

/** Float dust forgiven when deciding whether a stride is complete. World units. */
const STRIDE_EPSILON = 1e-6;

/** What the server remembers between two simulated steps for one player. */
interface Tracker {
  x: number;
  z: number;
  grounded: boolean;
  /** True until the first step is credited, so spawning pays nothing. */
  fresh: boolean;
  /**
   * Distance travelled toward the NEXT step, always under one stride.
   *
   * The remainder a tick leaves behind is kept here rather than paid out as a
   * fraction of a step. That is the whole fix: a tick that covered 7.3 units
   * pays three whole steps and banks 1.3 toward the fourth, instead of paying
   * "3.65 steps" - which is how a constant rate came out as +14, +15, +17.
   */
  carry: number;
}

/** Outcome of crediting one movement step. */
export interface SpeedGain {
  /** Whole steps paid, the jump bonus included. Every one is worth `perStep`. */
  readonly steps: number;
  /** Of `steps`, how many were the leave-the-ground bonus. */
  readonly jumpSteps: number;
  /** What each step was worth: `calculateSpeedGain(...).gain`. */
  readonly perStep: number;
  /** Speed added: exactly `steps x perStep`. */
  readonly gained: number;
  /** Levels crossed, if any. */
  readonly levelsGained: number;
}

/**
 * Server authority over Speed farming and levelling.
 *
 * Speed is DERIVED from movement the server actually observes, and it is paid
 * in WHOLE STEPS. Travel accumulates toward the next step; every time it
 * crosses `SPEED.strideDistance` the player is paid one step, and every step
 * is worth exactly `calculateSpeedGain(...).gain` - the single calculation in
 * `shared/src/config/speed.ts`. Leaving the ground pays the configured
 * `jumpBonusSteps` more steps at that same rate. There is no other way Speed
 * is earned, and no fraction of a step is ever paid.
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
    player.maxLevel = this.levelCap(player);
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
   * delta that must never be credited as distance travelled. The part-step in
   * `carry` goes too - it was travel on a run that has ended.
   */
  reset(sessionId: string, player: PlayerState): void {
    this.trackers.set(sessionId, {
      x: player.x,
      z: player.z,
      grounded: true,
      fresh: true,
      carry: 0,
    });
  }

  /**
   * Credit one simulated step and apply any level-ups.
   *
   * Call AFTER the transform has been updated, so the tracker advances to the
   * position the server just simulated.
   */
  credit(sessionId: string, player: PlayerState, stepSeconds: number): SpeedGain {
    const tracker = this.trackers.get(sessionId);
    if (!tracker) {
      this.reset(sessionId, player);
      return { steps: 0, jumpSteps: 0, perStep: 0, gained: 0, levelsGained: 0 };
    }

    // THE rate. One call; nothing is multiplied in below this line.
    const perStep = calculateSpeedGain(this.gainInputs(player)).gain;

    let strideSteps = 0;
    let jumpSteps = 0;

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

        // Leaving the ground: the configured number of extra steps, at the
        // same per-step rate as travel, so it scales with every multiplier.
        if (tracker.grounded && !player.grounded) jumpSteps = SPEED.jumpBonusSteps;
      }

      // Whole steps only. The remainder waits for the next tick.
      //
      // STRIDE_EPSILON forgives float dust, nothing more: sixty honest moves
      // of 0.4 add up to 23.9999999999 rather than 24, and without it the
      // twelfth stride would sit one ten-billionth short until the next tick.
      tracker.carry += distance;
      strideSteps = Math.floor((tracker.carry + STRIDE_EPSILON) / SPEED.strideDistance);
      tracker.carry = Math.max(0, tracker.carry - strideSteps * SPEED.strideDistance);
    }

    tracker.x = player.x;
    tracker.z = player.z;
    tracker.grounded = player.grounded;
    tracker.fresh = false;

    const steps = strideSteps + jumpSteps;
    const gained = steps * perStep;
    const beforeLevel = player.level;
    if (steps > 0) player.totalSpeed = clampSpeed(player.totalSpeed + gained);

    this.syncDerived(player);

    if (steps > 0 && serverConfig.logSpeedAwards) {
      logger.info(
        SCOPE,
        `${player.displayName || sessionId} paid ${steps} step(s)` +
          (jumpSteps ? ` (${jumpSteps} jump)` : '') +
          ` x ${perStep} = +${gained} -> total ${player.totalSpeed}`,
      );
    }

    return { steps, jumpSteps, perStep, gained, levelsGained: player.level - beforeLevel };
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
    player.maxLevel = this.levelCap(player);
    player.level = resolveLevel(player.totalSpeed, player.maxLevel).level;

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

  private levelCap(player: PlayerState): number {
    return maxLevelForRebirth(player.rebirths);
  }
}
