/**
 * What a trail and an aura have in common.
 *
 * The two shops are the same shop with different art: a ladder of tiers, each
 * bought once with Wins, each owned for ever, one equipped at a time, and each
 * contributing a factor to the shared Speed-gain formula. Writing that twice
 * would be two places for a bitmask to be off by one and two places for an
 * unowned tier to pay out, so the mechanics live here and the two data files
 * supply only their rows.
 *
 * Both multiply Speed GAIN, never movement speed. How fast the player
 * physically travels comes from LEVEL alone, and keeping the two axes apart is
 * what stops a 400x cosmetic launching a rider through an obby faster than its
 * platforms can be read.
 */

/** One rung of a cosmetic ladder. */
export interface CosmeticTier {
  /** 1-based slot, matching the shop rows top to bottom. */
  readonly slot: number;
  /** Display name, without the word "Trail" or "Aura". */
  readonly name: string;
  /** Wins deducted on purchase. Deducted exactly once, by `Wallet`. */
  readonly cost: number;
  /** Multiplier on Speed gained per step while equipped. */
  readonly multiplier: number;
  /** Base colour, as a hex integer. Presentation only. */
  readonly color: number;
  /** Second colour, for the tiers drawn as a gradient. Presentation only. */
  readonly colorB: number;
}

/**
 * Slots must fit a uint16 bitmask - so sixteen, and no more.
 *
 * Both ladders are checked against this by `verify-progression`, because a
 * seventeenth tier would silently fail to be ownable rather than fail to
 * compile.
 */
export const MAX_COSMETIC_SLOTS = 16;

/** Nothing equipped. Both ladders use 0 for the bare look. */
export const NO_COSMETIC = 0;

/** One bit per slot, so a whole inventory is a single replicated integer. */
export const cosmeticMask = (slot: number): number => 1 << (Math.floor(slot) - 1);

/** True when the player has bought this tier. */
export const isCosmeticOwned = (owned: number, slot: number): boolean =>
  (owned & cosmeticMask(slot)) !== 0;

/** Look up a tier in a ladder by its slot. */
export const cosmeticBySlot = (
  tiers: readonly CosmeticTier[],
  slot: number,
): CosmeticTier | undefined =>
  tiers.find((tier) => tier.slot === Math.floor(slot));

/**
 * Speed-gain multiplier from an equipped tier.
 *
 * Returns 1 for "none equipped" and for any slot that is not owned, so an
 * unowned or forged slot can only ever mean "no bonus" - never a bonus.
 */
export const cosmeticMultiplier = (
  tiers: readonly CosmeticTier[],
  slot: number,
  owned: number,
): number => {
  const tier = cosmeticBySlot(tiers, slot);
  if (!tier) return 1;
  return isCosmeticOwned(owned, tier.slot) ? tier.multiplier : 1;
};
