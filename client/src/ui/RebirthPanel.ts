import {
  formatSpeed,
  maxLevelForRebirth,
  nextRebirthTier,
  rebirthMultiplier,
} from '@evolve/shared';
import { ICONS } from './hudStyles.js';
import { Panel } from './Panel.js';

/**
 * The rebirth confirmation.
 *
 * Laid out as a BEFORE and AFTER pair, as the reference art frames it: the two
 * things a rebirth changes shown side by side with an arrow between them, so
 * what is being traded is legible at a glance rather than buried in a
 * paragraph. It is the one irreversible button in the game, and the cost - the
 * level reset - is stated in red under the swap rather than left to be
 * inferred.
 *
 * The button only ever ASKS. Eligibility is decided by the server from its own
 * level and rebirth count, and this panel's enabled state is a mirror of the
 * replicated figures rather than a second opinion about them.
 */
export class RebirthPanel extends Panel {
  private readonly beforeSpeed: HTMLSpanElement;
  private readonly afterSpeed: HTMLSpanElement;
  private readonly beforeLevel: HTMLSpanElement;
  private readonly afterLevel: HTMLSpanElement;
  private readonly barFill: HTMLDivElement;
  private readonly barLabel: HTMLSpanElement;
  private readonly action: HTMLButtonElement;

  private level = 1;
  private rebirths = 0;

  constructor(parent: HTMLElement, onRebirth: () => void) {
    super(parent, 'rebirth', 'Rebirth', ICONS.rebirth);

    const grid = document.createElement('div');
    grid.className = 'aoe-rb';
    grid.innerHTML =
      '<span class="aoe-rb__head aoe-font aoe-outline">Before</span>' +
      '<span></span>' +
      '<span class="aoe-rb__head aoe-font aoe-outline">After</span>';

    // Two rows, each a card, an arrow and a card. Built once and only ever
    // re-labelled, so a redraw never touches the layout.
    const speedRow = this.row(grid, 'speed');
    const levelRow = this.row(grid, 'level');
    this.beforeSpeed = speedRow[0];
    this.afterSpeed = speedRow[1];
    this.beforeLevel = levelRow[0];
    this.afterLevel = levelRow[1];

    const warning = document.createElement('p');
    warning.className = 'aoe-rb__warn aoe-font';
    warning.textContent = 'Rebirth resets your levels!';

    const bar = document.createElement('div');
    bar.className = 'aoe-gauge aoe-rb__bar';
    this.barFill = document.createElement('div');
    this.barFill.className = 'aoe-gauge__fill';
    this.barLabel = document.createElement('span');
    this.barLabel.className = 'aoe-gauge__label aoe-font aoe-outline';
    bar.append(this.barFill, this.barLabel);

    // The Rebirth button alone. Backing out of the one irreversible button in
    // the game is the panel's own close square, or Escape.
    const buttons = document.createElement('div');
    buttons.className = 'aoe-btn--row aoe-rb__buttons';
    this.action = document.createElement('button');
    this.action.type = 'button';
    this.action.className = 'aoe-btn aoe-btn--green aoe-rb__go aoe-font';
    this.action.textContent = 'Rebirth';
    this.action.addEventListener('click', () => {
      if (this.action.disabled) return;
      onRebirth();
      this.setOpen(false);
    });
    buttons.append(this.action);

    this.body.append(grid, warning, bar, buttons);
    this.render();
  }

  /** Mirror the replicated progression. */
  setProgress(level: number, rebirths: number): void {
    if (level === this.level && rebirths === this.rebirths) return;
    this.level = level;
    this.rebirths = rebirths;
    this.render();
  }

  /** True when the server would accept a rebirth right now. */
  get isEligible(): boolean {
    return this.level >= maxLevelForRebirth(this.rebirths);
  }

  protected override onOpened(): void {
    this.render();
  }

  /**
   * One before / arrow / after row, appended to the three-column grid.
   *
   * Returns the two value spans, which are the only parts a redraw touches.
   */
  private row(grid: HTMLDivElement, variant: string): [HTMLSpanElement, HTMLSpanElement] {
    const card = (): HTMLSpanElement => {
      const box = document.createElement('div');
      box.className = `aoe-rb__card aoe-rb__card--${variant}`;
      const value = document.createElement('span');
      value.className = 'aoe-font aoe-outline';
      box.appendChild(value);
      grid.appendChild(box);
      return value;
    };

    const before = card();

    const arrow = document.createElement('span');
    arrow.className = 'aoe-rb__arrow';
    arrow.setAttribute('aria-hidden', 'true');
    grid.appendChild(arrow);

    return [before, card()];
  }

  private render(): void {
    const tier = nextRebirthTier(this.rebirths);
    const eligible = this.isEligible;
    const cap = maxLevelForRebirth(this.rebirths);

    // "Speed: x2", matching the reference art's wording exactly - the colon is
    // what makes the card read as a reading rather than as a product name.
    this.beforeSpeed.textContent = `Speed: x${figure(rebirthMultiplier(this.rebirths))}`;
    this.afterSpeed.textContent = `Speed: x${figure(tier.multiplier)}`;
    // `(rebirths + 1) x 25` on both sides, for as many rebirths as anybody
    // performs: 25 -> 50, then +25 a rebirth for ever.
    this.beforeLevel.textContent = `Max Level ${figure(cap)}`;
    this.afterLevel.textContent = `Max Level ${figure(maxLevelForRebirth(this.rebirths + 1))}`;

    const shown = Math.min(this.level, cap);
    this.barFill.style.width = `${Math.min(Math.max(shown / cap, 0), 1) * 100}%`;
    this.barLabel.textContent = `Level ${figure(shown)}/${figure(tier.requiredLevel)}`;

    this.action.disabled = !eligible;
    this.action.textContent = eligible ? 'Rebirth' : `Level ${figure(tier.requiredLevel)} required`;
  }
}

/**
 * A level or multiplier as the cards print it: every digit while it fits the
 * card - "Max Level 10025" is a fact, "10K" would be a rounding of one - and
 * the game's one compact form past that. Neither figure has a maximum, so a
 * long enough ladder always reaches the point where the digits stop fitting.
 */
const figure = (value: number): string =>
  value < EXACT_BELOW ? String(value) : formatSpeed(value);

/** Five digits is the widest figure the before and after cards hold. */
const EXACT_BELOW = 100_000;
