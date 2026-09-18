import {
  upgradePadAt,
  upgradeUnlocked,
  winPadAt,
  type WorldCollision,
} from '@evolve/shared';
import type { LocalPlayer } from '../player/LocalPlayer.js';

/** Seconds between two requests of the same kind. */
const REQUEST_COOLDOWN = 0.5;

/** What the controller may ask the server for. It never grants anything. */
export interface RunActions {
  claimStage(stageIndex: number): void;
  claimUpgrade(slot: number): void;
}

/**
 * Turns the player's position into REQUESTS.
 *
 * The one job: notice that the mount has entered a trigger volume and ask the
 * server about it. Every actual decision - whether the stage pays, whether the
 * pad is unlocked, whether the player is really standing there - is made
 * server-side against the transform the server itself simulated. Nothing here
 * awards anything, and nothing here can.
 *
 * Note what is NOT here: evolution. A mount is never claimed, so there is no
 * trigger volume to notice and no request to make - the server evolves the
 * player the moment they qualify, and the client finds out through replicated
 * state like everything else.
 *
 * The single exception to "ask, do not decide" is DEATH, and it is a
 * prediction rather than a decision: the client starts the fall-over animation
 * the moment it can see the mount is doomed, because waiting a round trip for
 * the server's confirmation means the mount keeps running through thin air for
 * a tenth of a second. The server still decides; this only decides when to
 * start drawing.
 */
export class RunController {
  private readonly collision: WorldCollision;
  private readonly actions: RunActions;

  private stageCooldown = 0;
  private upgradeCooldown = 0;

  /** Replicated wallet and equipped pad, so nothing is re-requested. */
  private wins = 0;
  private upgradeSlot = 0;

  constructor(collision: WorldCollision, actions: RunActions) {
    this.collision = collision;
    this.actions = actions;
  }

  /** Mirror the replicated wallet and equipped pad. Gating only. */
  setInventory(wins: number, upgradeSlot: number): void {
    this.wins = wins;
    this.upgradeSlot = upgradeSlot;
  }

  /**
   * @param elapsed the server's clock, for the hazard prediction. Hazards are
   *                a pure function of it on both sides.
   */
  update(delta: number, player: LocalPlayer, elapsed: number): void {
    this.stageCooldown = Math.max(0, this.stageCooldown - delta);
    this.upgradeCooldown = Math.max(0, this.upgradeCooldown - delta);

    // A mount already dying is not in any trigger volume that matters.
    if (player.isDying) return;

    const { x, y, z } = player.position;

    // Death prediction. The server confirms it with a Respawn; this is only
    // about starting the animation on the frame the player can see it happen.
    // `hasFallen` covers the death plane AND the quicksand pits, so the two
    // cannot get different answers here and on the server.
    if (this.collision.hasFallen(x, y, z) || this.collision.touchesHazard(x, y, z, elapsed)) {
      player.beginDeath();
      return;
    }

    const stage = winPadAt(x, y, z);
    if (stage && this.stageCooldown === 0) {
      this.stageCooldown = REQUEST_COOLDOWN;
      this.actions.claimStage(stage.index);
    }

    const slot = this.padAt(x, y, z);
    if (slot !== null && this.upgradeCooldown === 0) {
      // Asking for the pad already equipped, or one the player plainly cannot
      // reach, would be a request the server refuses on every frame the mount
      // spends parked on it. The server still checks both - this only keeps
      // the wire quiet.
      if (slot !== this.upgradeSlot && upgradeUnlocked(slot, this.wins)) {
        this.upgradeCooldown = REQUEST_COOLDOWN;
        this.actions.claimUpgrade(slot);
      }
    }
  }

  /**
   * Slot of the upgrade pad the player is on, or null.
   *
   * The same test the server runs, deliberately: a prediction that used
   * different bounds would ask for pads the server refuses.
   */
  private padAt(x: number, y: number, z: number): number | null {
    return upgradePadAt(x, y, z);
  }
}
