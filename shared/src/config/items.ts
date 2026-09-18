import {
  cosmeticBySlot,
  cosmeticMultiplier,
  type CosmeticTier,
} from './cosmetics.js';

/**
 * Items: the relics the capybara sells, bought with Wins.
 *
 * The third shop, and deliberately the one that multiplies a DIFFERENT thing.
 * Trails and auras both multiply Speed gain, so a second Speed ladder would
 * have made the Item Shop a place to spend the same Wins on the same effect at
 * a worse price - a shop with nothing to decide.
 *
 * An item multiplies the WINS a stage pays instead. That closes the loop the
 * rest of the economy runs on: Wins gate the upgrade pads and the evolution
 * chain and buy the other two ladders, so a relic makes everything else arrive
 * sooner rather than making one number bigger.
 *
 * Mechanically it is the same ladder as the other two - bought once, owned for
 * ever, one equipped at a time, a slot number and nothing else on the wire -
 * which is why it is a third configuration of `CosmeticService` rather than a
 * third service.
 */

/** How the client draws an item. Presentation only; never gameplay. */
export type ItemStyle = 'charm' | 'idol' | 'totem' | 'skull' | 'crown' | 'disc';

export interface ItemTier extends CosmeticTier {
  readonly style: ItemStyle;
}

/**
 * Six relics.
 *
 * The prices sit deliberately BETWEEN the trail and aura ladders at every
 * rung, so there is always something worth saving for in each of the three
 * shops rather than one obvious next purchase and two that are years away.
 */
export const ITEM_TIERS: readonly ItemTier[] = [
  {
    slot: 1,
    name: 'Lucky Charm',
    cost: 1_000,
    multiplier: 1.5,
    color: 0x4ad46a,
    colorB: 0xc4f7cf,
    style: 'charm',
  },
  {
    slot: 2,
    name: 'Golden Idol',
    cost: 25_000,
    multiplier: 2,
    color: 0xffd21f,
    colorB: 0xfff0a8,
    style: 'idol',
  },
  {
    slot: 3,
    name: 'Jade Totem',
    cost: 500_000,
    multiplier: 3,
    color: 0x2ec4a0,
    colorB: 0xa8f0e0,
    style: 'totem',
  },
  {
    slot: 4,
    name: 'Ruby Skull',
    cost: 10_000_000,
    multiplier: 5,
    color: 0xe0304a,
    colorB: 0xffb0bd,
    style: 'skull',
  },
  {
    slot: 5,
    name: 'Ancient Crown',
    cost: 500_000_000,
    multiplier: 10,
    color: 0xc9a02c,
    colorB: 0xffe98a,
    style: 'crown',
  },
  {
    slot: 6,
    name: 'Sun Disc',
    cost: 50_000_000_000,
    multiplier: 25,
    color: 0xff9a1f,
    colorB: 0xffe066,
    style: 'disc',
  },
];

/** Nothing equipped. */
export const NO_ITEM = 0;

/** Look up a tier by its slot. */
export const itemBySlot = (slot: number): ItemTier | undefined =>
  cosmeticBySlot(ITEM_TIERS, slot) as ItemTier | undefined;

/**
 * Multiplier on the Wins a stage pays. 1 when none equipped or unowned.
 *
 * Applied in exactly one place - `StageService`, where the reward is decided -
 * for the same reason every other multiplier has exactly one home.
 */
export const itemMultiplier = (slot: number, owned: number): number =>
  cosmeticMultiplier(ITEM_TIERS, slot, owned);
