import {
  MAX_SIM_DELTA,
  SPEED,
  clampSpeed,
  maxLevelForRebirth,
  resolveLevel,
  resolveMovementProfile,
  speedForNextLevel,
  speedPerStep,
  totalMultiplier,
  treadmillBeltSpeed,
  type GainInputs,
  type MovementProfile,
} from '@evolve/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';

/** What the server remembers between two simulated steps for one player. */
interface Tracker {
  x: number;
  z: number;
  grounded: boolean;
  /** True until the first step is credited, so spawning pays nothing. */
  fresh: boolean;
}

/** Outcome of crediting one movement step. */
export interface SpeedGain {
  /** Speed added by this step. */
  readonly gained: number;
  /** Levels crossed, if any. */
  readonly levelsGained: number;
}

/**
 * Server authority over Speed farming and levelling.
 *
 * Speed is DERIVED from movement the server actually observes: the distance
 * between consecutive authoritative positions, plus a bonus each time the
 * mount leaves the ground. A client cannot ask for Speed, and a single step is
 * capped at a plausible distance, so a teleport pays nothing.
 *
 * What a step is WORTH is the shared gain formula's business, not this file's.
 * `speedPerStep` multiplies the equipped upgrade pad's base by the rebirth,
 * mount, trail, aura and treadmill factors, and this service calls it rather
 * than assembling its own product. That is the whole defence against the one
 * bug this economy is most exposed to: a bonus that gets multiplied in twice.
 *
 * Level then follows from the lifetime total, and level alone drives movement
 * speed - which is the loop: ride to farm Speed, gain levels, get faster,
 * clear the gaps that were out of reach.
 */
export class SpeedService {
  private readonly trackers = new Map<string, Tracker>();

  initialise(player: PlayerState): void {
    player.maxLevel = this.levelCap(player);
    this.syncDerived(player);
    this.reset(player.sessionId, player);
  }

  forget(sessionId: string): void {
    this.trackers.delete(sessionId);
  }

  /**
   * Drop the movement baseline.
   *
   * Called on every respawn: the teleport back to the arena is a huge position
   * delta that must never be credited as distance travelled.
   */
  reset(sessionId: string, player: PlayerState): void {
    this.trackers.set(sessionId, {
      x: player.x,
      z: player.z,
      grounded: true,
      fresh: true,
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
      return { gained: 0, levelsGained: 0 };
    }

    // ONE call, and it already knows about every multiplier the player has.
    // Nothing is multiplied in below this line.
    const perStep = speedPerStep(this.gainInputs(player));

    let gained = 0;

    if (!tracker.fresh) {
      if (player.treadmill > 0) {
        // Running on a belt. There is no position delta to measure, so the
        // BELT supplies the distance: the player covers ground at the belt's
        // own speed without going anywhere, and it flows through the identical
        // per-step formula. That is why a treadmill needs no progression path
        // of its own.
        //
        // Paid per simulated second of the SERVER's own step, so a client
        // cannot buy progression by claiming a longer frame - and the belt is
        // read from `player.treadmill`, which the simulation derived from the
        // position the server itself computed and the rebirth count the server
        // owns.
        //
        // The rebirth gate is applied TWICE on purpose: once when the
        // simulation decides which belt is running, and again here on the
        // distance. Either alone would be correct today; both mean a future
        // change to one cannot quietly re-open a tier.
        const step = Number.isFinite(stepSeconds)
          ? Math.max(0, Math.min(stepSeconds, MAX_SIM_DELTA))
          : 0;
        const distance = treadmillBeltSpeed(player.treadmill, player.rebirths) * step;
        gained += (distance / SPEED.strideDistance) * perStep;
      } else {
        const distance = Math.hypot(player.x - tracker.x, player.z - tracker.z);

        // Validation uses the SAME speed the player actually moves at, so a
        // fast high-level player is never throttled by a cap tuned for a
        // beginner. Anything beyond it is a teleport and pays nothing at all.
        if (distance <= this.maxCreditedStep(player, stepSeconds)) {
          gained += (distance / SPEED.strideDistance) * perStep;
        }

        // Leaving the ground pays a flat bonus, expressed in steps so it
        // scales with every multiplier exactly as travel does.
        if (tracker.grounded && !player.grounded) {
          gained += SPEED.jumpBonusSteps * perStep;
        }
      }
    }

    tracker.x = player.x;
    tracker.z = player.z;
    tracker.grounded = player.grounded;
    tracker.fresh = false;

    const beforeLevel = player.level;
    if (gained > 0) player.totalSpeed = clampSpeed(player.totalSpeed + gained);

    this.syncDerived(player);

    return { gained, levelsGained: player.level - beforeLevel };
  }

  /**
   * Re-derive level and everything downstream from the current Speed total.
   *
   * Used on join, on reconnect and whenever anything that feeds the gain
   * formula changes: the profile carries only the Speed earned, and level,
   * movement speed, jump velocity and the two replicated gain figures all
   * follow from it through the same formulas a live step uses. That is what
   * lets a tuning change reach returning players rather than only new ones.
   */
  syncDerived(player: PlayerState): void {
    player.maxLevel = this.levelCap(player);
    player.level = resolveLevel(player.totalSpeed, player.maxLevel).level;

    // Replicated so the HUD prints exactly the figures the server pays, rather
    // than a client's own reconstruction of them. `treadmill` is part of the
    // inputs, so both move the moment the mount steps onto a belt.
    const inputs = this.gainInputs(player);
    player.totalMultiplier = totalMultiplier(inputs);
    player.speedPerStep = speedPerStep(inputs);

    const profile = this.movementProfile(player);
    player.moveMultiplier = profile.multiplier;
    player.jumpVelocity = profile.jumpVelocity;
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
