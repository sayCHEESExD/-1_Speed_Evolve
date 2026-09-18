import { injectHudStyles } from './hudStyles.js';

/**
 * How many panels are open.
 *
 * The input layer polls this to suppress movement while a panel owns the
 * screen. A COUNT rather than a boolean, so two panels closing in the wrong
 * order cannot leave the game permanently suppressed.
 */
let openCount = 0;

export const anyPanelOpen = (): boolean => openCount > 0;

/**
 * A modal panel: the reference art's green plate over a dimmed backdrop.
 *
 * The header is a fixed grid - ICON, TITLE, a rule that stretches, then the
 * red close square - so every panel in the game presents itself the same way
 * and a new one cannot invent its own heading. The rule is what does it: it
 * takes the slack, so a one-word title and a three-word title still put the
 * close button in exactly the same place.
 *
 * Shared by the evolve menu, the rebirth confirmation and the shop, so the
 * three cannot drift apart visually and the open/close accounting exists once.
 */
export class Panel {
  protected readonly root: HTMLDivElement;
  protected readonly body: HTMLDivElement;

  /**
   * A column BESIDE the panel, outside its frame.
   *
   * Empty on every panel but the shop, which hangs its ladder tabs there
   * exactly as the reference art does. It exists on the base class rather than
   * being assembled by the shop so that the two stay vertically centred on
   * each other - a rail positioned by the shop would have to know the panel's
   * height, which changes with the ladder in front of it.
   */
  protected readonly aside: HTMLDivElement;

  private readonly heading: HTMLSpanElement;
  private readonly badge: HTMLSpanElement;

  private open = false;

  /**
   * @param icon inline SVG or an `<img>` for the header's badge. The panels
   *             that have supplied art use it; the rest draw their own, and a
   *             panel with none simply has no badge rather than a placeholder.
   */
  constructor(parent: HTMLElement, variant: string, title: string, icon = '') {
    injectHudStyles();

    this.root = document.createElement('div');
    this.root.className = `aoe-panel aoe-panel--${variant}`;
    this.root.hidden = true;

    const stage = document.createElement('div');
    stage.className = 'aoe-panel__stage';

    this.aside = document.createElement('div');
    this.aside.className = 'aoe-panel__aside';

    const box = document.createElement('div');
    box.className = 'aoe-panel__box';

    const head = document.createElement('div');
    head.className = 'aoe-panel__head';

    this.badge = document.createElement('span');
    this.badge.className = 'aoe-panel__icon';
    this.badge.innerHTML = icon;
    this.badge.hidden = icon === '';
    head.appendChild(this.badge);

    const heading = document.createElement('span');
    heading.className = 'aoe-panel__title aoe-font aoe-outline';
    heading.textContent = title;
    this.heading = heading;

    const rule = document.createElement('span');
    rule.className = 'aoe-panel__rule';
    rule.setAttribute('aria-hidden', 'true');

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'aoe-panel__close aoe-font';
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => this.setOpen(false));
    head.append(heading, rule, close);

    this.body = document.createElement('div');
    this.body.className = 'aoe-panel__body';

    box.append(head, this.body);
    stage.append(this.aside, box);
    this.root.appendChild(stage);

    // Clicking the dimmed backdrop closes; clicking the panel or the rail
    // beside it must not. The stage fills the backdrop, so it has to be
    // treated as backdrop too - testing only for `root` let a click on the
    // empty space beside the panel fall through as a miss.
    const backdrop = (event: MouseEvent): void => {
      if (event.target === this.root || event.target === stage) this.setOpen(false);
    };
    this.root.addEventListener('click', backdrop);
    box.addEventListener('click', (event) => event.stopPropagation());
    this.aside.addEventListener('click', (event) => event.stopPropagation());

    parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  setOpen(open: boolean): void {
    if (open === this.open) return;
    this.open = open;
    this.root.hidden = !open;
    openCount += open ? 1 : -1;
    if (openCount < 0) openCount = 0;
    if (open) this.onOpened();
  }

  /**
   * Re-label the header.
   *
   * For a panel that is more than one thing - the shop is three ladders behind
   * one frame - so the heading says which one is in front rather than a
   * generic word that is true of all three.
   */
  protected setHeading(title: string, icon?: string): void {
    this.heading.textContent = title;
    if (icon !== undefined) {
      this.badge.innerHTML = icon;
      this.badge.hidden = icon === '';
    }
  }

  /** Hook for a subclass that needs to refresh its contents when shown. */
  protected onOpened(): void {
    /* nothing by default */
  }

  dispose(): void {
    if (this.open) this.setOpen(false);
    this.root.remove();
  }
}
