import {
  cosmeticBySlot,
  cosmeticMultiplier,
  type CosmeticTier,
} from './cosmetics.js';

/**
 * Trails: the ribbon that streams off the mount, bought with Wins from the
 * goat in the Trail Shop.
 *
 * A trail multiplies SPEED GAIN through the one shared formula's trail factor,
 * and never a calculation of its own. Ownership and the equipped slot are
 * server state: the client asks to buy and to equip by SLOT NUMBER only - it
 * never sends a cost or a multiplier - and renders whatever comes back.
 *
 * `style` is how the client draws it and nothing else. No gameplay code may
 * read it, which is what keeps the twelve tiers one mechanic with twelve
 * looks.
 */

/** How the client draws a trail. Presentation only; never gameplay. */
export type TrailStyle =
  /** A flat ribbon in one colour. */
  | 'solid'
  /** Hue cycling along the ribbon's length. */
  | 'rainbow'
  /** Twinkling points along the ribbon. */
  | 'sparkle'
  /** A two-colour gradient down the ribbon. */
  | 'gradient';

export interface TrailTier extends CosmeticTier {
  readonly style: TrailStyle;
}

/**
 * Twelve tiers, exactly as specified.
 *
 * The cost ladder climbs by roughly ten a rung and the multiplier by rather
 * less, which is the shape that makes the late tiers a long-term goal instead
 * of an inevitability - and it is why the Sun trail's 250T price is written as
 * a plain number here rather than derived: a specified figure that a formula
 * reproduced only approximately would be a different game from the one on the
 * shop sign.
 */
export const TRAIL_TIERS: readonly TrailTier[] = [
  {
    slot: 1,
    name: 'Orange',
    cost: 250,
    multiplier: 1.25,
    color: 0xff8a1f,
    colorB: 0xffc46b,
    style: 'solid',
  },
  {
    slot: 2,
    name: 'Green',
    cost: 2_500,
    multiplier: 1.5,
    color: 0x3ce06a,
    colorB: 0xa8f7bd,
    style: 'solid',
  },
  {
    slot: 3,
    name: 'Blue',
    cost: 25_000,
    multiplier: 2,
    color: 0x3aa8ff,
    colorB: 0xa8dcff,
    style: 'solid',
  },
  {
    slot: 4,
    name: 'Purple',
    cost: 250_000,
    multiplier: 3,
    color: 0xa855f7,
    colorB: 0xdcb4ff,
    style: 'solid',
  },
  {
    slot: 5,
    name: 'Rainbow',
    cost: 2_500_000,
    multiplier: 5,
    color: 0xff3b6b,
    colorB: 0x3affd2,
    style: 'rainbow',
  },
  {
    slot: 6,
    name: 'Galaxy',
    cost: 25_000_000,
    multiplier: 10,
    color: 0x2a1a5e,
    colorB: 0x9a5bff,
    style: 'sparkle',
  },
  {
    slot: 7,
    name: 'Snow',
    cost: 250_000_000,
    multiplier: 25,
    color: 0xd8f4ff,
    colorB: 0x7cc8ff,
    style: 'sparkle',
  },
  {
    slot: 8,
    name: 'Fire',
    cost: 2_500_000_000,
    multiplier: 50,
    color: 0xff5a1f,
    colorB: 0xffd24a,
    style: 'gradient',
  },
  {
    slot: 9,
    name: 'Star',
    cost: 25_000_000_000,
    multiplier: 100,
    color: 0xffe066,
    colorB: 0xfff7cc,
    style: 'sparkle',
  },
  {
    slot: 10,
    name: 'Jupiter',
    cost: 250_000_000_000,
    multiplier: 200,
    color: 0xd9a066,
    colorB: 0xf7e0c0,
    style: 'gradient',
  },
  {
    slot: 11,
    name: 'Saturn',
    cost: 2_500_000_000_000,
    multiplier: 300,
    color: 0xf0d27a,
    colorB: 0xb98a4a,
    style: 'gradient',
  },
  {
    slot: 12,
    name: 'Sun',
    cost: 250_000_000_000_000,
    multiplier: 400,
    color: 0xffd21f,
    colorB: 0xff6a1f,
    style: 'gradient',
  },
];

/** Nothing equipped. */
export const NO_TRAIL = 0;

/** Look up a tier by its slot. */
export const trailBySlot = (slot: number): TrailTier | undefined =>
  cosmeticBySlot(TRAIL_TIERS, slot) as TrailTier | undefined;

/** Speed-gain multiplier from the equipped trail. 1 when none or unowned. */
export const trailMultiplier = (slot: number, owned: number): number =>
  cosmeticMultiplier(TRAIL_TIERS, slot, owned);
