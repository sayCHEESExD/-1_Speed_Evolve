import { formatSpeed } from '@evolve/shared';
import { ICONS, injectHudStyles } from './hudStyles.js';

/**
 * The two lifetime tallies, under the rail.
 *
 * A trophy over a rebirth swirl, each with its figure beside it, exactly where
 * the reference art puts them - at the foot of the left rail rather than in
 * the top centre, which in this game belongs to nothing and in the reference
 * belongs to the world's own event banner.
 *
 * Both figures are replicated server state: Wins are granted by `StageService`
 * and rebirths by `RebirthService`, and neither is derived here.
 *
 * The Wins line pops when the total RISES. Wins only ever go up through an
 * award, so an increase is the one honest signal that something was earned; a
 * patch that merely repeats the same total changes nothing, which is what
 * stops the effect firing twice for one stage.
 */
export class WinsCounter {
  private readonly root: HTMLDivElement;
  private readonly value: HTMLDivElement;
  private readonly rebirthRow: HTMLDivElement;
  private readonly rebirthValue: HTMLDivElement;

  private last = -1;
  private lastRebirths = -1;
  private popTimer = 0;

  constructor(parent: HTMLElement) {
    injectHudStyles();

    this.root = document.createElement('div');
    this.root.className = 'aoe-wins aoe-font';

    const winRow = document.createElement('div');
    winRow.className = 'aoe-wins__row';
    const icon = document.createElement('div');
    icon.className = 'aoe-wins__icon';
    icon.innerHTML = ICONS.trophy;
    this.value = document.createElement('div');
    this.value.className = 'aoe-wins__value';
    this.value.textContent = '0';
    winRow.append(icon, this.value);

    // The rebirth tally is HIDDEN until the first one is earned. A player who
    // has never rebirthed has no use for a zero, and the reference art only
    // shows the line on an account that has one.
    this.rebirthRow = document.createElement('div');
    this.rebirthRow.className = 'aoe-wins__row';
    this.rebirthRow.hidden = true;
    const rebirthIcon = document.createElement('div');
    rebirthIcon.className = 'aoe-wins__icon';
    rebirthIcon.innerHTML = ICONS.rebirth;
    this.rebirthValue = document.createElement('div');
    this.rebirthValue.className = 'aoe-wins__value aoe-wins__value--rebirth';
    this.rebirthValue.textContent = '0';
    this.rebirthRow.append(rebirthIcon, this.rebirthValue);

    this.root.append(winRow, this.rebirthRow);
    parent.appendChild(this.root);
  }

  /**
   * @param wins     the replicated total
   * @param rebirths the replicated count, shown only once it is above zero
   */
  update(wins: number, rebirths = 0): void {
    if (rebirths !== this.lastRebirths) {
      this.lastRebirths = rebirths;
      this.rebirthValue.textContent = formatSpeed(rebirths);
      this.rebirthRow.hidden = rebirths <= 0;
    }

    if (wins === this.last) return;
    const rose = wins > this.last && this.last >= 0;
    this.last = wins;
    this.value.textContent = formatSpeed(wins);

    if (!rose) return;
    // Restarting the animation needs the class off, a reflow, then on.
    this.root.classList.remove('aoe-wins--pop');
    void this.root.offsetWidth;
    this.root.classList.add('aoe-wins--pop');
    window.clearTimeout(this.popTimer);
    this.popTimer = window.setTimeout(
      () => this.root.classList.remove('aoe-wins--pop'),
      560,
    );
  }

  dispose(): void {
    window.clearTimeout(this.popTimer);
    this.root.remove();
  }
}
