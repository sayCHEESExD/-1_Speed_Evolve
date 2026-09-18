import {
  AURA_TIERS,
  ITEM_TIERS,
  TRAIL_TIERS,
  formatSpeed,
  isCosmeticOwned,
  type CosmeticTier,
  type ShopId,
} from '@evolve/shared';
import { ICONS } from './hudStyles.js';
import { Panel } from './Panel.js';

/** What the panel may ask the server for. It never grants anything. */
export interface ShopActions {
  buy(shop: ShopId, slot: number): void;
  equip(shop: ShopId, slot: number): void;
}

/** One ladder's replicated state: what is owned and what is worn. */
export interface ShopInventory {
  owned: number;
  equipped: number;
}

/** One rendered row, kept so a state change is a few writes, not a rebuild. */
interface Row {
  readonly shop: ShopId;
  readonly tier: CosmeticTier;
  readonly element: HTMLDivElement;
  readonly button: HTMLButtonElement;
  readonly price: HTMLSpanElement;
}

/**
 * How each ladder is presented. The ONE place a shop's identity is written.
 *
 * Keyed by the same `ShopId` the world stalls are, so the goat's stall and the
 * goat's tab cannot end up describing different shops.
 */
const TABS: readonly {
  id: ShopId;
  label: string;
  tiers: readonly CosmeticTier[];
  /** What the multiplier on a row actually multiplies. */
  effect: string;
  note: string;
}[] = [
  {
    id: 'trail',
    label: 'Trails',
    tiers: TRAIL_TIERS,
    effect: 'Speed',
    note: 'Trails multiply the Speed you earn per step.',
  },
  {
    id: 'aura',
    label: 'Auras',
    tiers: AURA_TIERS,
    effect: 'Speed',
    note: 'Auras multiply the Speed you earn per step. One aura and one trail stack.',
  },
  {
    id: 'item',
    label: 'Items',
    tiers: ITEM_TIERS,
    effect: 'Wins',
    note: 'Relics multiply the Wins every stage pays.',
  },
];

/**
 * The shop: three ladders behind one modal, with a tab rail down the side.
 *
 * ONE panel rather than three, exactly as the reference art lays it out - a
 * sidebar of shop icons on the left and the rows of the selected one filling
 * the rest. Three separate modals would be three places for a row to be
 * mis-priced and three sets of open/close accounting.
 *
 * Every row only ever ASKS. The server owns the wallet and the inventories,
 * and this renders whatever comes back. There is no cost and no multiplier in
 * any message it sends, only a shop and a slot number, so there is nothing in
 * a request to forge.
 *
 * The row states its own effect - "x1.25 Speed", "x2 Wins" - because the three
 * ladders do not multiply the same thing, and a price ladder whose reward is
 * unstated looks arbitrary.
 */
export class ShopPanel extends Panel {
  private readonly rows: Row[] = [];
  private readonly pages = new Map<ShopId, HTMLDivElement>();
  private readonly tabs = new Map<ShopId, HTMLButtonElement>();

  private wins = 0;
  private readonly inventories: Record<ShopId, ShopInventory> = {
    trail: { owned: 0, equipped: 0 },
    aura: { owned: 0, equipped: 0 },
    item: { owned: 0, equipped: 0 },
  };

  private active: ShopId = 'trail';

  constructor(parent: HTMLElement, actions: ShopActions) {
    super(parent, 'shop', 'Trails', ICONS.trail);

    const layout = document.createElement('div');
    layout.className = 'aoe-shop';

    const rail = document.createElement('div');
    rail.className = 'aoe-shop__rail';

    const pages = document.createElement('div');
    pages.className = 'aoe-shop__pages';

    for (const tab of TABS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'aoe-shop__tab aoe-font';
      button.innerHTML =
        `<span class="aoe-shop__tabicon aoe-shop__tabicon--${tab.id}"></span>` +
        `<span class="aoe-shop__tabname aoe-outline">${tab.label}</span>`;
      button.addEventListener('click', () => this.show(tab.id));
      rail.appendChild(button);
      this.tabs.set(tab.id, button);

      const page = document.createElement('div');
      page.className = 'aoe-shop__page';

      const note = document.createElement('p');
      note.className = 'aoe-panel__note';
      note.textContent = tab.note;
      page.appendChild(note);

      for (const tier of tab.tiers) {
        page.appendChild(this.buildRow(tab.id, tier, tab.effect, actions));
      }

      pages.appendChild(page);
      this.pages.set(tab.id, page);
    }

    // The rail lives BESIDE the panel, in the base class's aside slot, which
    // is where the reference art puts it: a column of ladder icons outside the
    // frame rather than a sidebar eating the width the rows need.
    this.aside.appendChild(rail);
    layout.appendChild(pages);
    this.body.appendChild(layout);

    this.show('trail');
  }

  /**
   * Open on a particular shop.
   *
   * Which stall the player used decides which tab is in front, so riding up to
   * the capybara and pressing E lands on the relics rather than on the trails
   * the goat sells.
   */
  openAt(shop: ShopId): void {
    this.show(shop);
    this.setOpen(true);
  }

  /** Mirror the replicated wallet and the three inventories. */
  setInventory(
    wins: number,
    trail: ShopInventory,
    aura: ShopInventory,
    item: ShopInventory,
  ): void {
    if (
      wins === this.wins &&
      same(this.inventories.trail, trail) &&
      same(this.inventories.aura, aura) &&
      same(this.inventories.item, item)
    ) {
      return;
    }
    this.wins = wins;
    this.inventories.trail = { ...trail };
    this.inventories.aura = { ...aura };
    this.inventories.item = { ...item };
    this.render();
  }

  /** True when anything in any of the three shops can be afforded right now. */
  get hasAffordable(): boolean {
    return TABS.some((tab) =>
      tab.tiers.some(
        (tier) =>
          !isCosmeticOwned(this.inventories[tab.id].owned, tier.slot) &&
          this.wins >= tier.cost,
      ),
    );
  }

  protected override onOpened(): void {
    this.render();
  }

  private buildRow(
    shop: ShopId,
    tier: CosmeticTier,
    effect: string,
    actions: ShopActions,
  ): HTMLDivElement {
    const element = document.createElement('div');
    element.className = `aoe-row aoe-row--${shop}`;

    const text = document.createElement('div');
    text.className = 'aoe-row__text';
    const name = document.createElement('div');
    name.className = 'aoe-row__name aoe-outline';
    name.textContent = tier.name;
    const meta = document.createElement('div');
    meta.className = 'aoe-row__meta';
    meta.textContent = `x${tier.multiplier} ${effect}`;
    text.append(name, meta);

    // The tier's own two colours ARE the product art, which is what gives
    // twelve trails twelve distinguishable looks without twelve image files.
    const swatch = document.createElement('div');
    swatch.className = 'aoe-row__swatch';
    swatch.style.background =
      `radial-gradient(circle at 34% 30%, ${hex(tier.colorB)}, ${hex(tier.color)} 72%)`;

    // The price is INSIDE the button, next to the trophy it is denominated in,
    // rather than a figure floating beside one. The reference art does the
    // same thing, and it means the row never shows a number whose currency has
    // to be inferred.
    const price = document.createElement('span');
    price.className = 'aoe-row__price';
    price.textContent = formatSpeed(tier.cost);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'aoe-row__buy aoe-font';
    button.innerHTML = ICONS.trophy;
    button.appendChild(price);
    button.addEventListener('click', () => {
      // Owned means "wear it"; not owned means "buy it". One button, because a
      // shop row with two is a shop row nobody reads.
      const inventory = this.inventories[shop];
      if (isCosmeticOwned(inventory.owned, tier.slot)) {
        actions.equip(shop, inventory.equipped === tier.slot ? 0 : tier.slot);
      } else {
        actions.buy(shop, tier.slot);
      }
    });

    element.append(text, swatch, button);
    this.rows.push({ shop, tier, element, button, price });
    return element;
  }

  private show(shop: ShopId): void {
    this.active = shop;
    // The panel is TITLED by the ladder in front, as the reference art titles
    // it "Trails" and "Auras" rather than "Shop" - the tab rail is beside the
    // panel, so the heading is the only thing saying which one is open.
    const tab = TABS.find((entry) => entry.id === shop);
    if (tab) this.setHeading(tab.label, ICON_FOR[shop]);
    for (const [id, page] of this.pages) page.hidden = id !== shop;
    for (const [id, tab] of this.tabs) {
      tab.classList.toggle('aoe-shop__tab--active', id === shop);
    }
    this.render();
  }

  private render(): void {
    for (const row of this.rows) {
      // Only the visible page is worth writing to. Thirty rows across three
      // ladders re-rendered on every patch would be the most expensive thing
      // in the HUD, for two tabs nobody is looking at.
      if (row.shop !== this.active) continue;

      const inventory = this.inventories[row.shop];
      const owned = isCosmeticOwned(inventory.owned, row.tier.slot);
      const equipped = inventory.equipped === row.tier.slot;

      row.element.classList.toggle('aoe-row--owned', owned && !equipped);
      row.element.classList.toggle('aoe-row--equipped', equipped);

      // Owned rows stop advertising a price they have already been paid and
      // say what the button does instead; the trophy goes with the price,
      // because a trophy beside the word "Worn" is a cost that is not one.
      row.price.textContent = owned
        ? equipped
          ? 'Worn'
          : 'Wear'
        : formatSpeed(row.tier.cost);
      row.button.classList.toggle('aoe-row__buy--worn', equipped);
      row.button.classList.toggle('aoe-row__buy--wear', owned && !equipped);
      const trophy = row.button.firstElementChild as HTMLElement | null;
      if (trophy && trophy !== row.price) trophy.hidden = owned;

      row.button.disabled = !owned && this.wins < row.tier.cost;
    }
  }
}

/** The header badge for each ladder, so the title and its mark agree. */
const ICON_FOR: Record<ShopId, string> = {
  trail: ICONS.trail,
  aura: ICONS.aura,
  item: ICONS.inventory,
};

const same = (a: ShopInventory, b: ShopInventory): boolean =>
  a.owned === b.owned && a.equipped === b.equipped;

const hex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;
