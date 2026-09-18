import { STAGES, itemMultiplier, winPadAt, type StageDefinition } from '@evolve/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import { wallet } from './Wallet.js';

/** How a claim was resolved, for logging and for the award message. */
export interface StageAward {
  readonly granted: boolean;
  readonly stage: StageDefinition | null;
  readonly wins: number;
  readonly reason?: 'unknown-stage' | 'not-on-pad' | 'cooldown';
}

/**
 * Milliseconds between two accepted claims from one player.
 *
 * Spam protection ONLY, which is why it is short and why it is checked last.
 * Double payment is prevented by the TELEPORT: banking a stage sends the
 * player back to the starting arena, so the pad they were standing on is
 * hundreds of units behind them before a second request could arrive.
 */
const CLAIM_COOLDOWN_MS = 400;

/**
 * Server authority over stage rewards.
 *
 * Wins are granted in exactly one place: here. A claim is validated against
 * the stage index and the position the SERVER simulated, and only then does
 * `wallet.add` run. The client only ever asks.
 *
 * The equipped ITEM's multiplier is applied here too, and only here - it is
 * the one multiplier in the game that scales Wins rather than Speed, so this
 * is the single point at which it can act. `itemMultiplier` returns 1 for an
 * unowned or forged slot, so the worst a bad slot can do is pay the base
 * reward.
 */
export class StageService {
  /** Wall clock of the last accepted claim, per session. */
  private readonly lastClaimAt = new Map<string, number>();

  initialise(sessionId: string): void {
    this.lastClaimAt.set(sessionId, 0);
  }

  forget(sessionId: string): void {
    this.lastClaimAt.delete(sessionId);
  }

  /**
   * Resolve a claim. The server decides; the client only asked.
   *
   * Validation order is deliberate - the deterministic checks first and the
   * payment last, so nothing is granted before every test has passed and a
   * burst of requests can never mask a real refusal.
   */
  claim(sessionId: string, player: PlayerState, stageIndex: number): StageAward {
    const stage = STAGES[Math.floor(stageIndex) - 1];
    if (!stage || stage.index !== Math.floor(stageIndex)) {
      return { granted: false, stage: null, wins: 0, reason: 'unknown-stage' };
    }

    // THE position check, against the transform the server itself simulated.
    // A client that claims a stage it is nowhere near is simply refused.
    const standing = winPadAt(player.x, player.y, player.z);
    if (!standing || standing.index !== stage.index) {
      return { granted: false, stage, wins: 0, reason: 'not-on-pad' };
    }

    const now = Date.now();
    if (now - (this.lastClaimAt.get(sessionId) ?? 0) < CLAIM_COOLDOWN_MS) {
      return { granted: false, stage, wins: 0, reason: 'cooldown' };
    }

    // ROUNDED here, not floored by the wallet. `wallet.add` floors the running
    // total, so handing it 40.5 would quietly pay 40 - and on the early stages,
    // where the base reward is 1 or 3, flooring would make a x1.5 relic pay
    // nothing at all and look broken to exactly the players most likely to own
    // it. Rounding at the point the multiplier is applied costs at most half a
    // Win and is unbiased.
    const reward = Math.round(
      stage.winReward * itemMultiplier(player.itemSlot, player.ownedItems),
    );
    const granted = wallet.add(player, reward);
    this.lastClaimAt.set(sessionId, now);
    if (stage.index > player.bestStage) player.bestStage = stage.index;

    return { granted: true, stage, wins: granted };
  }
}
