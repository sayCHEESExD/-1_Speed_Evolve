import { treadmillTier } from '@evolve/shared';
import { injectHudStyles } from './hudStyles.js';

/**
 * "Requires 3 Rebirths", shown while standing on a belt that is not running.
 *
 * A STATE, not an interaction, which is why it is a `<div>` and not the stall
 * prompt's `<button>`: there is nothing to press. The player has ridden onto a
 * machine that is doing nothing for them, and the one thing they need is to be
 * told why rather than left to wonder whether the treadmill is broken.
 *
 * It is driven by the difference between the two figures the simulation
 * derives - the belt underfoot and the belt that is paying - so it appears
 * exactly when, and only when, the gate is the reason nothing is happening.
 */
export class TreadmillNotice {
  private readonly root: HTMLDivElement;
  private readonly label: HTMLSpanElement;

  /** The belt being refused, so a redraw only happens when it changes. */
  private current = 0;

  constructor(parent: HTMLElement) {
    injectHudStyles();

    this.root = document.createElement('div');
    this.root.className = 'aoe-prompt aoe-prompt--locked aoe-font';
    this.root.hidden = true;
    this.root.setAttribute('role', 'status');

    const lock = document.createElement('span');
    lock.className = 'aoe-prompt__key aoe-prompt__key--locked';
    lock.textContent = '🔒';
    lock.setAttribute('aria-hidden', 'true');

    this.label = document.createElement('span');
    this.label.className = 'aoe-prompt__label';

    this.root.append(lock, this.label);
    parent.appendChild(this.root);
  }

  /**
   * @param index the belt underfoot that this player has NOT unlocked, or 0
   */
  show(index: number): void {
    if (index === this.current) return;
    this.current = index;

    const tier = index > 0 ? treadmillTier(index) : undefined;
    if (!tier) {
      this.root.hidden = true;
      return;
    }
    const plural = tier.rebirthsRequired === 1 ? 'Rebirth' : 'Rebirths';
    // Both halves matter: what it would be worth, and what it costs. A notice
    // that only says "locked" tells the player to go away; one that says what
    // they are looking at tells them what to come back for.
    this.label.textContent =
      `x${tier.multiplier} Steps · Requires ${tier.rebirthsRequired} ${plural}`;
    this.root.hidden = false;
  }

  dispose(): void {
    this.root.remove();
  }
}
