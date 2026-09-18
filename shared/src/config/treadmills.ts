/**
 * The treadmills on the RIGHT of the spawn arena.
 *
 * A treadmill is somewhere to farm Speed without running the obby: the belt
 * supplies the distance, so standing on one earns steps at the belt's rate
 * multiplied by its own tier. That multiplier is the ONLY thing a treadmill
 * changes - it feeds the same shared gain formula every other multiplier does,
 * and it touches movement, collision and the course not at all.
 *
 * Unlike the previous game's three identical belts, these are a LADDER: the
 * better tiers are gated behind rebirths, which gives the prestige ladder
 * something to unlock in the arena rather than only in an abstract multiplier.
 *
 * A treadmill is NOT a pinned state and needs no button. `activeTreadmillAt`
 * derives it from POSITION AND REBIRTHS every step on both sides: riding on
 * starts it, riding off stops it, and there is no treadmill message a client
 * could forge.
 *
 * THE GATE IS IN THE SIMULATION, not only in the economy. A machine the player
 * has not unlocked reports as no machine at all, so they are credited no belt
 * distance, receive no multiplier, and do not visibly run on the spot as
 * though it were working. Every one of those used to be wrong in a different
 * way: the belt paid its full distance at the ordinary rate, which is free
 * progression from a tier that had not been earned.
 */

export interface TreadmillTier {
  /**
   * 1-based, in layout order along the training deck.
   *
   * `PlayerMotion.treadmill` replicates this number, so it is the wire
   * identity of a belt as well as its position in the row.
   */
  readonly index: number;
  /** Multiplier on Speed gained per step while running on this belt. */
  readonly multiplier: number;
  /** Rebirths the player must have completed to use it. 0 is open to all. */
  readonly rebirthsRequired: number;
  /**
   * How fast the belt travels, in world units per second.
   *
   * This is the DISTANCE the runner is credited with: the Speed service bills
   * `beltSpeed * step` instead of a position delta, so a player standing still
   * on a belt earns exactly what one running the same belt earns. There is
   * deliberately no second progression path hiding in here.
   */
  readonly beltSpeed: number;
}

/**
 * Six machines, exactly as specified: two open belts, two behind the first
 * rebirth, and one each behind the third and fifth.
 *
 * The pairs at the bottom are two machines rather than one because the arena
 * is shared: a single 1x belt would be a queue on a busy server, and queuing
 * for the starter income is the worst possible first impression.
 */
export const TREADMILLS: readonly TreadmillTier[] = [
  { index: 1, multiplier: 1, rebirthsRequired: 0, beltSpeed: 22 },
  { index: 2, multiplier: 1, rebirthsRequired: 0, beltSpeed: 22 },
  { index: 3, multiplier: 1.5, rebirthsRequired: 1, beltSpeed: 22 },
  { index: 4, multiplier: 1.5, rebirthsRequired: 1, beltSpeed: 22 },
  { index: 5, multiplier: 2, rebirthsRequired: 3, beltSpeed: 22 },
  { index: 6, multiplier: 3, rebirthsRequired: 5, beltSpeed: 22 },
];

/** Not standing on any belt. */
export const NO_TREADMILL = 0;

/** How many machines there are, so the arena layout needs no second count. */
export const TREADMILL_COUNT = TREADMILLS.length;

/** Look up a machine by its replicated index, or undefined for 0. */
export const treadmillTier = (index: number): TreadmillTier | undefined =>
  TREADMILLS.find((tier) => tier.index === Math.floor(index));

/** True when this player's rebirth count opens this belt. */
export const treadmillUnlocked = (index: number, rebirths: number): boolean => {
  const tier = treadmillTier(index);
  if (!tier) return false;
  return rebirths >= tier.rebirthsRequired;
};

/**
 * Speed-gain multiplier from the belt underfoot.
 *
 * Returns 1 for "not on a belt" and for a belt this player has not unlocked.
 */
export const treadmillMultiplier = (index: number, rebirths: number): number => {
  const tier = treadmillTier(index);
  if (!tier) return 1;
  return rebirths >= tier.rebirthsRequired ? tier.multiplier : 1;
};

/**
 * Distance a belt credits per second for THIS player, or 0.
 *
 * Zero on a locked machine, and that is the important half of the gate. The
 * version of this function that took only an index returned the full belt
 * speed regardless of rebirths, and gating only the tier multiplier upstream
 * meant a player with no rebirths could stand on the 3x treadmill and be
 * credited its full distance at the ordinary rate. A machine you have not
 * unlocked must pay NOTHING, not a reduced amount.
 *
 * `activeTreadmillAt` already zeroes the belt index for a locked machine, so
 * in practice this is never reached with one. It checks anyway: these are two
 * independent gates on the same rule, and the one thing worse than a gate is a
 * gate that only works because something upstream happened to be correct.
 */
export const treadmillBeltSpeed = (index: number, rebirths: number): number => {
  const tier = treadmillTier(index);
  if (!tier) return 0;
  return rebirths >= tier.rebirthsRequired ? tier.beltSpeed : 0;
};
