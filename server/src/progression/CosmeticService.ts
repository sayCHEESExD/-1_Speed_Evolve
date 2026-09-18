import {
  AURA_TIERS,
  ITEM_TIERS,
  TRAIL_TIERS,
  cosmeticMask,
  isCosmeticOwned,
  type CosmeticTier,
} from '@evolve/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import type { SpeedService } from './SpeedService.js';
import { wallet } from './Wallet.js';

/**
 * Minimum time between two successful purchases by one player.
 *
 * The already-owned check stops one item being paid for twice; this stops a
 * burst of requests draining the wallet across several items faster than a
 * person could click. Checked LAST, so a deterministic refusal is never
 * reported as a cooldown.
 */
const PURCHASE_COOLDOWN_MS = 350;

export type BuyResult =
  | { readonly ok: true; readonly tier: CosmeticTier; readonly winsAfter: number }
  | {
      readonly ok: false;
      readonly reason: 'unknown-slot' | 'already-owned' | 'too-poor' | 'cooldown';
    };

export type EquipResult =
  | { readonly ok: true; readonly slot: number }
  | { readonly ok: false; readonly reason: 'unknown-slot' | 'not-owned' };

/**
 * Which pair of fields on `PlayerState` a ladder writes to.
 *
 * Passed in rather than branched on, so this service never learns that trails
 * and auras are different things - which is precisely what stops a fix applied
 * to one of them from being forgotten on the other.
 */
interface CosmeticSlots {
  readonly owned: 'ownedTrails' | 'ownedAuras' | 'ownedItems';
  readonly equipped: 'trailSlot' | 'auraSlot' | 'itemSlot';
}

/**
 * Server authority over a cosmetic shop.
 *
 * All three shops are the SAME shop with different art - a ladder of tiers,
 * each bought once with Wins, each owned for ever, one equipped at a time - so
 * they are one service configured three times rather than three services that
 * have to be kept in step. Three copies of this logic would be three places
 * for an unowned tier to pay out and three places to remember the wallet.
 *
 * What a tier MULTIPLIES is not this service's business and it never learns:
 * trails and auras reach the Speed-gain formula and items reach the stage
 * reward, and both of those happen a long way from here.
 *
 * Everything a client might want to assert is checked against server state:
 * the slot must exist, it must not already be owned, the Wins must be there,
 * and equipping is refused outright for anything the player does not own.
 *
 * The client sends a slot number and NOTHING else - never a cost, never a
 * multiplier - so there is no figure in the message to forge. What a tier
 * multiplies is decided by the shared config and applied by the one gain
 * formula; this only decides what is owned and what is worn.
 */
export class CosmeticService {
  private readonly lastPurchaseAt = new Map<string, number>();

  private readonly tiers: readonly CosmeticTier[];
  private readonly slots: CosmeticSlots;

  constructor(tiers: readonly CosmeticTier[], slots: CosmeticSlots) {
    this.tiers = tiers;
    this.slots = slots;
  }

  initialise(player: PlayerState): void {
    this.lastPurchaseAt.delete(player.sessionId);
    this.sanitise(player);
  }

  forget(sessionId: string): void {
    this.lastPurchaseAt.delete(sessionId);
  }

  /** Validate and, if valid, sell a tier. */
  buy(player: PlayerState, slot: unknown, speeds: SpeedService): BuyResult {
    const tier = this.tierOf(slot);
    if (!tier) return { ok: false, reason: 'unknown-slot' };

    if (isCosmeticOwned(player[this.slots.owned], tier.slot)) {
      return { ok: false, reason: 'already-owned' };
    }
    if (!wallet.canAfford(player, tier.cost)) return { ok: false, reason: 'too-poor' };

    const now = Date.now();
    if (now - (this.lastPurchaseAt.get(player.sessionId) ?? 0) < PURCHASE_COOLDOWN_MS) {
      return { ok: false, reason: 'cooldown' };
    }

    // Payment, grant and equip together. Nothing between them can fail, so the
    // wallet and the inventory cannot end up disagreeing.
    if (!wallet.spend(player, tier.cost)) return { ok: false, reason: 'too-poor' };
    this.lastPurchaseAt.set(player.sessionId, now);
    player[this.slots.owned] |= cosmeticMask(tier.slot);
    // A fresh purchase equips itself: the player asked for it, and it saves a
    // second round trip for the common case.
    player[this.slots.equipped] = tier.slot;
    speeds.syncDerived(player);

    return { ok: true, tier, winsAfter: player.wins };
  }

  /** Equip an owned tier, or slot 0 to take it off. */
  equip(player: PlayerState, slot: unknown, speeds: SpeedService): EquipResult {
    if (typeof slot !== 'number' || !Number.isInteger(slot)) {
      return { ok: false, reason: 'unknown-slot' };
    }
    if (slot === 0) {
      player[this.slots.equipped] = 0;
      speeds.syncDerived(player);
      return { ok: true, slot: 0 };
    }

    const tier = this.tierOf(slot);
    if (!tier) return { ok: false, reason: 'unknown-slot' };
    if (!isCosmeticOwned(player[this.slots.owned], tier.slot)) {
      return { ok: false, reason: 'not-owned' };
    }

    player[this.slots.equipped] = tier.slot;
    speeds.syncDerived(player);
    return { ok: true, slot: tier.slot };
  }

  /**
   * Drop an equipped tier the player turns out not to own.
   *
   * Belt and braces for a restored profile: the shared multiplier helpers
   * already return 1 for an unowned slot, so this only keeps the replicated
   * state tidy rather than guarding a payout.
   */
  sanitise(player: PlayerState): void {
    const equipped = player[this.slots.equipped];
    if (equipped === 0) return;
    if (!isCosmeticOwned(player[this.slots.owned], equipped)) {
      player[this.slots.equipped] = 0;
    }
  }

  private tierOf(slot: unknown): CosmeticTier | undefined {
    if (typeof slot !== 'number' || !Number.isInteger(slot)) return undefined;
    return this.tiers.find((tier) => tier.slot === slot);
  }
}

/** The trail shop: the goat's ladder. */
export const createTrailService = (): CosmeticService =>
  new CosmeticService(TRAIL_TIERS, { owned: 'ownedTrails', equipped: 'trailSlot' });

/** The aura shop: the horse's ladder. */
export const createAuraService = (): CosmeticService =>
  new CosmeticService(AURA_TIERS, { owned: 'ownedAuras', equipped: 'auraSlot' });

/** The item shop: the capybara's ladder. */
export const createItemService = (): CosmeticService =>
  new CosmeticService(ITEM_TIERS, { owned: 'ownedItems', equipped: 'itemSlot' });
