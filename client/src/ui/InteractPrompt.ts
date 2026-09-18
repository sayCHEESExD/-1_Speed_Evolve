import type { ShopStall } from '@evolve/shared';
import { isTouchPrimary } from '../config/device.js';
import { injectHudStyles } from './hudStyles.js';

/**
 * The "E to Interact" prompt that appears beside a shop stall.
 *
 * Proximity shows it and distance hides it; pressing the key - or, on a phone,
 * TAPPING THE PROMPT ITSELF - opens the shop. Nothing opens on contact: an
 * obby is full of players sprinting across the arena, and a trigger volume
 * that opened a modal would fire every time somebody crossed the plaza at four
 * hundred units a second.
 *
 * On a touch device the prompt IS the button, which is why it is a real
 * `<button>` rather than a label: a phone has no E key, and an on-screen
 * control that duplicated this one somewhere else would be a second thing to
 * keep in step with the same proximity test.
 */
export class InteractPrompt {
  private readonly root: HTMLButtonElement;
  private readonly label: HTMLSpanElement;

  /** Which stall the prompt is currently offering, or null when hidden. */
  private current: ShopStall | null = null;

  constructor(parent: HTMLElement, onActivate: (shop: ShopStall) => void) {
    injectHudStyles();

    this.root = document.createElement('button');
    this.root.type = 'button';
    this.root.className = 'aoe-prompt aoe-font';
    this.root.hidden = true;

    const key = document.createElement('span');
    key.className = 'aoe-prompt__key';
    // The key cap is meaningless on a phone, where the prompt is tapped.
    key.textContent = isTouchPrimary() ? 'TAP' : 'E';

    this.label = document.createElement('span');
    this.label.className = 'aoe-prompt__label';

    this.root.append(key, this.label);
    this.root.addEventListener('click', () => {
      if (this.current) onActivate(this.current);
    });

    parent.appendChild(this.root);
  }

  /** The stall in range, or null. Cheap to call every frame. */
  get target(): ShopStall | null {
    return this.current;
  }

  /**
   * Show the prompt for a stall, or hide it.
   *
   * Compared before it is written, so the common case - a player standing
   * still at a counter, sixty frames a second - touches the DOM not at all.
   */
  show(shop: ShopStall | null): void {
    if (shop?.id === this.current?.id) return;
    this.current = shop;
    if (!shop) {
      this.root.hidden = true;
      return;
    }
    this.label.textContent = `${isTouchPrimary() ? '' : 'to '}Interact · ${shop.title}`;
    this.root.hidden = false;
  }

  dispose(): void {
    this.root.remove();
  }
}
