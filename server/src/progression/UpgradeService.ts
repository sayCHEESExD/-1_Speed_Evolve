import {
  bestUpgradeFor,
  SPEED_UPGRADES,
  type SpeedUpgrade,
  upgradeForSlot,
  upgradePadAt,
  upgradeUnlocked,
} from '@evolve/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';

/** How a pad claim was resolved. */
export interface UpgradeClaim {
  readonly granted: boolean;
  readonly upgrade: SpeedUpgrade | null;
  readonly reason?: 'unknown-slot' | 'not-on-pad' | 'locked' | 'already-equipped' | 'cooldown';
}

/**
 * Milliseconds between two accepted claims from one player.
 *
 * Spam protection ONLY, which is why it is short and why it is checked last.
 * A locked pad or a player who is not on it is refused on its own merits, and
 * neither should ever be reported as a cooldown.
 */
const CLAIM_COOLDOWN_MS = 200;

/**
 * Server authority over which speed-upgrade pad a player has equipped.
 *
 * The pad sets the BASE Speed per step - the one term in the gain formula that
 * is not a multiplier - so this is the single largest lever on a player's
 * income, and it is therefore the one the server is strictest about.
 *
 * A pad is a GATE, not a purchase: `winsRequired` must be HELD, and nothing is
 * deducted. That keeps the income ladder and the cosmetic ladder from
 * competing for one wallet, which would otherwise punish a player for buying
 * the trail the shop exists to sell them.
 *
 * Equipping is a DELIBERATE ACT: the player rides onto the pad. Reaching the
 * Wins total alone does nothing, which is what makes the left side of the
 * arena a place rather than a menu - with ONE exception, `syncToWallet`, which
 * exists for a reason the comment there explains.
 */
export class UpgradeService {
  private readonly lastClaimAt = new Map<string, number>();

  initialise(player: PlayerState): void {
    this.lastClaimAt.set(player.sessionId, 0);
    this.clampToWallet(player);
  }

  forget(sessionId: string): void {
    this.lastClaimAt.delete(sessionId);
  }

  /**
   * Slot of the pad the player is standing on, or null.
   *
   * A pure position test against the authoritative transform. The footprint
   * test is shared with the client, so the pad a player asks about and the pad
   * the server grants cannot disagree - and moving the bank is one definition
   * to change rather than two.
   */
  padAt(x: number, y: number, z: number): number | null {
    // The height test belongs to the layout, not here. The two rows are seven
    // units apart now, so a single band covering both would let a mount on the
    // ground claim the pad on the terrace above it.
    return upgradePadAt(x, y, z);
  }

  /** Resolve a claim. The server decides; the client only asked. */
  claim(player: PlayerState, slot: number): UpgradeClaim {
    const requested = Math.floor(slot);
    const upgrade = SPEED_UPGRADES.find((entry) => entry.slot === requested);
    if (!upgrade) return { granted: false, upgrade: null, reason: 'unknown-slot' };

    // THE position check, against the transform the server itself simulated.
    if (this.padAt(player.x, player.y, player.z) !== upgrade.slot) {
      return { granted: false, upgrade, reason: 'not-on-pad' };
    }

    if (!upgradeUnlocked(upgrade.slot, player.wins)) {
      return { granted: false, upgrade, reason: 'locked' };
    }

    if (player.upgradeSlot === upgrade.slot) {
      return { granted: false, upgrade, reason: 'already-equipped' };
    }

    // Checked LAST, so the deterministic reasons above are always the ones
    // reported and a burst of requests cannot mask a real refusal.
    const now = Date.now();
    if (now - (this.lastClaimAt.get(player.sessionId) ?? 0) < CLAIM_COOLDOWN_MS) {
      return { granted: false, upgrade, reason: 'cooldown' };
    }

    this.lastClaimAt.set(player.sessionId, now);
    player.upgradeSlot = upgrade.slot;
    return { granted: true, upgrade };
  }

  /**
   * Drop the player to the best pad their Wins still reach.
   *
   * Called after anything that SPENDS Wins. A pad is gated on Wins HELD rather
   * than Wins ever earned, so buying the Sun trail genuinely can take a player
   * back below the +2K pad's threshold - and leaving them earning at a rate
   * they no longer qualify for would make the shop a way to keep an upgrade
   * for free.
   *
   * It only ever moves DOWN. Riding onto a pad is how a player moves up, and
   * quietly promoting them on a stage reward would empty the left half of the
   * arena of any reason to visit it.
   */
  clampToWallet(player: PlayerState): void {
    const affordable = bestUpgradeFor(player.wins);
    if (player.upgradeSlot > affordable) player.upgradeSlot = affordable;
    // A slot that resolves to nothing - a corrupt save, a roster that shrank -
    // falls back to the free starter rather than to zero income.
    player.upgradeSlot = upgradeForSlot(player.upgradeSlot).slot;
  }
}
