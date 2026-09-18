import {
  cosmeticBySlot,
  cosmeticMultiplier,
  type CosmeticTier,
} from './cosmetics.js';

/**
 * Auras: the glow that surrounds the mount, bought with Wins from the horse in
 * the Aura Shop.
 *
 * Mechanically identical to a trail and deliberately so - same ladder, same
 * bitmask, same one shared Speed-gain formula - but a SEPARATE equipped slot,
 * which is the whole point of having two shops: a player wears one of each and
 * the two factors multiply, so the second shop is a real decision rather than
 * a second copy of the first one's decision.
 *
 * The prices start an order of magnitude above the trails' and end below them.
 * That is the shape the specification asks for and it is a good one: the first
 * aura is something to work toward AFTER a first trail, and the ladder tops
 * out sooner so the two are not simply the same grind run twice.
 */

/** How the client draws an aura. Presentation only; never gameplay. */
export type AuraStyle =
  /** A ring of orbiting motes in one colour. */
  | 'orbit'
  /** A rising column of sparks. */
  | 'rise'
  /** A pulsing shell around the mount. */
  | 'pulse'
  /** Falling flakes. */
  | 'fall';

export interface AuraTier extends CosmeticTier {
  readonly style: AuraStyle;
}

/** Eleven tiers, exactly as specified. */
export const AURA_TIERS: readonly AuraTier[] = [
  {
    slot: 1,
    name: 'Yellow',
    cost: 10_000,
    multiplier: 1.25,
    color: 0xffd83d,
    colorB: 0xfff0a8,
    style: 'orbit',
  },
  {
    slot: 2,
    name: 'Green',
    cost: 100_000,
    multiplier: 1.5,
    color: 0x3ce06a,
    colorB: 0xc4f7d4,
    style: 'orbit',
  },
  {
    slot: 3,
    name: 'Blue',
    cost: 1_000_000,
    multiplier: 2,
    color: 0x3aa8ff,
    colorB: 0xc4e8ff,
    style: 'orbit',
  },
  {
    slot: 4,
    name: 'Red',
    cost: 10_000_000,
    multiplier: 3,
    color: 0xff3b3b,
    colorB: 0xffb0b0,
    style: 'pulse',
  },
  {
    slot: 5,
    name: 'Purple',
    cost: 100_000_000,
    multiplier: 5,
    color: 0xa855f7,
    colorB: 0xe0c4ff,
    style: 'pulse',
  },
  {
    slot: 6,
    name: 'Heart',
    cost: 1_000_000_000,
    multiplier: 10,
    color: 0xff5a9e,
    colorB: 0xffc4dc,
    style: 'rise',
  },
  {
    slot: 7,
    name: 'Fire',
    cost: 10_000_000_000,
    multiplier: 25,
    color: 0xff5a1f,
    colorB: 0xffd24a,
    style: 'rise',
  },
  {
    slot: 8,
    name: 'Leaf',
    cost: 100_000_000_000,
    multiplier: 50,
    color: 0x4ac94a,
    colorB: 0xa8e87a,
    style: 'fall',
  },
  {
    slot: 9,
    name: 'Snow',
    cost: 1_000_000_000_000,
    multiplier: 100,
    color: 0xe8f7ff,
    colorB: 0x8ecfff,
    style: 'fall',
  },
  {
    slot: 10,
    name: 'Electric',
    cost: 10_000_000_000_000,
    multiplier: 200,
    color: 0x66e0ff,
    colorB: 0xffffff,
    style: 'pulse',
  },
  {
    slot: 11,
    name: 'Rainbow',
    cost: 100_000_000_000_000,
    multiplier: 300,
    color: 0xff3b6b,
    colorB: 0x3affd2,
    style: 'orbit',
  },
];

/** Nothing equipped. */
export const NO_AURA = 0;

/** Look up a tier by its slot. */
export const auraBySlot = (slot: number): AuraTier | undefined =>
  cosmeticBySlot(AURA_TIERS, slot) as AuraTier | undefined;

/** Speed-gain multiplier from the equipped aura. 1 when none or unowned. */
export const auraMultiplier = (slot: number, owned: number): number =>
  cosmeticMultiplier(AURA_TIERS, slot, owned);
