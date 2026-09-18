/**
 * Speed upgrades: the twelve pads on the LEFT of the spawn arena.
 *
 * An upgrade sets how much raw Speed one step is worth before any multiplier
 * touches it. It is the BASE of the gain formula, and the only term in it that
 * is not a multiplier - which is why a bigger pad is a step change in income
 * rather than another fractional bonus stacked on the pile.
 *
 * A pad is a GATE, not a purchase. `winsRequired` is a threshold the player
 * must have reached; nothing is deducted, and riding onto a pad they qualify
 * for simply equips it. That is deliberate: Wins are the currency the trail
 * and aura shops spend, and an economy where the income upgrade competes with
 * the cosmetics for the same wallet punishes the player for progressing.
 *
 * Riding onto a pad they do NOT qualify for does nothing at all - the server
 * checks the requirement itself, from the Wins it holds, so the pad cannot be
 * claimed by a client that simply asks.
 */

export interface SpeedUpgrade {
  /**
   * 1-based, in ladder order.
   *
   * The replicated `upgradeSlot` is indexed by this, so it is the wire
   * identity. Pads are laid out in two rows of six from it (see `course.ts`),
   * which is why the ladder is exactly twelve long.
   */
  readonly slot: number;
  /** Raw Speed one step is worth while this pad is equipped. */
  readonly perStep: number;
  /** Wins the player must HOLD to stand on it. Nothing is deducted. */
  readonly winsRequired: number;
}

/**
 * The twelve pads, exactly as specified.
 *
 * The values double cleanly to +32 and then move onto round figures - 125,
 * 250, 500, 1K, 2K - which is what the reference art shows, and the
 * requirement curve steepens far faster than the reward does, so a later pad
 * is a genuine target rather than the next thing that happens.
 */
export const SPEED_UPGRADES: readonly SpeedUpgrade[] = [
  { slot: 1, perStep: 1, winsRequired: 0 },
  { slot: 2, perStep: 2, winsRequired: 3 },
  { slot: 3, perStep: 4, winsRequired: 15 },
  { slot: 4, perStep: 8, winsRequired: 75 },
  { slot: 5, perStep: 16, winsRequired: 400 },
  { slot: 6, perStep: 32, winsRequired: 1_000 },
  { slot: 7, perStep: 64, winsRequired: 3_000 },
  { slot: 8, perStep: 125, winsRequired: 10_000 },
  { slot: 9, perStep: 250, winsRequired: 30_000 },
  { slot: 10, perStep: 500, winsRequired: 100_000 },
  { slot: 11, perStep: 1_000, winsRequired: 250_000 },
  { slot: 12, perStep: 2_000, winsRequired: 350_000 },
];

/** The pad every player starts on. Free, and the reason nobody earns nothing. */
export const STARTER_UPGRADE_SLOT = 1;

/** How many pads there are, so the arena layout needs no second count. */
export const UPGRADE_COUNT = SPEED_UPGRADES.length;

/** Look up a pad by slot. Falls back to the starter, never throws. */
export const upgradeForSlot = (slot: number): SpeedUpgrade => {
  const found = SPEED_UPGRADES.find((entry) => entry.slot === Math.floor(slot));
  return found ?? (SPEED_UPGRADES[STARTER_UPGRADE_SLOT - 1] as SpeedUpgrade);
};

/**
 * Raw Speed per step for an equipped pad.
 *
 * Never returns zero: an unresolvable slot falls back to the starter's +1, so
 * the worst a corrupt save can do is under-pay by one rung rather than stop
 * the player earning at all.
 */
export const upgradePerStep = (slot: number): number =>
  upgradeForSlot(slot).perStep;

/** True when the player holds enough Wins to stand on this pad. */
export const upgradeUnlocked = (slot: number, wins: number): boolean => {
  const upgrade = SPEED_UPGRADES.find((entry) => entry.slot === Math.floor(slot));
  if (!upgrade) return false;
  return wins >= upgrade.winsRequired;
};

/**
 * The best pad this player's Wins reach.
 *
 * Used on load and after a stage reward, so a returning player is never left
 * standing on a pad they have long outgrown - and, equally, so nothing has to
 * remember to "re-check the upgrades" in five different places.
 */
export const bestUpgradeFor = (wins: number): number => {
  let best = STARTER_UPGRADE_SLOT;
  for (const upgrade of SPEED_UPGRADES) {
    if (wins >= upgrade.winsRequired) best = upgrade.slot;
  }
  return best;
};
