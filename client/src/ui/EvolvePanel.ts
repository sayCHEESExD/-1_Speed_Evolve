import {
  MOUNTS,
  formatSpeed,
  isMountUnlocked,
  mountForSlot,
  nextMount,
  qualifiesForMount,
  type MountDefinition,
} from '@evolve/shared';
import { ICONS } from './hudStyles.js';
import { mountThumbnail } from './MountThumbnails.js';
import { Panel } from './Panel.js';

/**
 * The Evolve menu.
 *
 * Laid out as a BEFORE and AFTER pair, exactly as the reference art frames it:
 * the mount being ridden, an arrow, and the one it becomes, with each one's
 * multiplier under it and the two requirements - a level and a number of Wins -
 * underneath as progress bars.
 *
 * The button is DELIBERATELY not a button that does anything, and saying so is
 * the whole design of this panel. Evolution is automatic: the server unlocks
 * and equips the next mount the instant the player qualifies, so by the time
 * anyone could press a button it would already have happened. What the control
 * shows instead is the STATE - how far off the requirement is, or that it has
 * been met and the mount has changed - which is the question the player
 * actually opened the menu to ask.
 *
 * Every figure here is replicated state read through the SAME predicate the
 * server decides with (`qualifiesForMount`), so this panel cannot promise an
 * evolution that does not then happen.
 */
export class EvolvePanel extends Panel {
  private readonly beforeName: HTMLSpanElement;
  private readonly beforeMult: HTMLSpanElement;
  private readonly beforeArt: HTMLDivElement;
  private readonly afterName: HTMLSpanElement;
  private readonly afterMult: HTMLSpanElement;
  private readonly afterArt: HTMLDivElement;

  private readonly levelFill: HTMLDivElement;
  private readonly levelLabel: HTMLSpanElement;
  private readonly winsLabel: HTMLDivElement;
  private readonly action: HTMLButtonElement;
  private readonly chain: HTMLDivElement;

  private level = 1;
  private wins = 0;
  private mountSlot = 1;
  private unlocked = 0;

  constructor(parent: HTMLElement) {
    super(parent, 'evolve', 'Evolve', ICONS.evolve);

    const grid = document.createElement('div');
    grid.className = 'aoe-evo';

    const before = this.card(grid, 'Before');
    // The arrow sits BETWEEN the two cards in the middle column of the grid,
    // so it is appended between them rather than moved afterwards - reaching
    // for `lastElementChild` put it before the FIRST card instead, which is
    // why it used to render off at the left edge of the panel.
    const arrow = document.createElement('div');
    arrow.className = 'aoe-evo__arrow';
    arrow.setAttribute('aria-hidden', 'true');
    grid.appendChild(arrow);
    const after = this.card(grid, 'After');

    this.beforeArt = before.art;
    this.beforeName = before.name;
    this.beforeMult = before.mult;
    this.afterArt = after.art;
    this.afterName = after.name;
    this.afterMult = after.mult;

    // ONE bar, for the LEVEL, exactly as the reference frames it. The Wins
    // requirement is a line of text under it rather than a second gauge:
    // two identical bars stacked read as one quantity measured twice.
    const level = document.createElement('div');
    level.className = 'aoe-gauge aoe-evo__gauge';
    this.levelFill = document.createElement('div');
    this.levelFill.className = 'aoe-gauge__fill';
    this.levelLabel = document.createElement('span');
    this.levelLabel.className = 'aoe-gauge__label aoe-font aoe-outline';
    level.append(this.levelFill, this.levelLabel);

    this.winsLabel = document.createElement('div');
    this.winsLabel.className = 'aoe-evo__wins aoe-font';

    /*
     * The two buttons the reference art shows.
     *
     * "Skip" closes the menu, which is a real action. "Evolve" is the STATE:
     * evolution is automatic, so by the time anyone could press a button the
     * server has already done it. Rather than ship a control that lies, it is
     * disabled while the requirement is unmet and says what is happening once
     * it is met - the same information a button would claim to offer, without
     * pretending the player is the one causing it.
     */
    const buttons = document.createElement('div');
    buttons.className = 'aoe-btn--row aoe-evo__buttons';
    this.action = document.createElement('button');
    this.action.type = 'button';
    this.action.className = 'aoe-btn aoe-btn--green aoe-font';
    this.action.disabled = true;
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'aoe-btn aoe-btn--orange aoe-font';
    skip.textContent = 'Skip';
    skip.addEventListener('click', () => this.setOpen(false));
    buttons.append(this.action, skip);

    // The whole chain as a strip of pips, so a player can see where they are
    // on a fourteen-rung ladder rather than only the rung in front of them.
    this.chain = document.createElement('div');
    this.chain.className = 'aoe-evo__chain';
    for (const mount of MOUNTS) {
      const pip = document.createElement('span');
      pip.className = 'aoe-evo__pip';
      pip.title = `${mount.name} · x${mount.multiplier} Speed`;
      this.chain.appendChild(pip);
    }

    this.body.append(grid, level, this.winsLabel, buttons, this.chain);
    this.render();
  }

  /** Mirror the replicated progression. Display only; the server decides. */
  setState(level: number, wins: number, mountSlot: number, unlocked: number): void {
    if (
      level === this.level &&
      wins === this.wins &&
      mountSlot === this.mountSlot &&
      unlocked === this.unlocked
    ) {
      return;
    }
    this.level = level;
    this.wins = wins;
    this.mountSlot = mountSlot;
    this.unlocked = unlocked;
    this.render();
  }

  protected override onOpened(): void {
    this.render();
  }

  private render(): void {
    const current = mountForSlot(this.mountSlot);
    const upcoming = nextMount(this.mountSlot);

    this.beforeName.textContent = current.name;
    this.beforeMult.textContent = `x${current.multiplier} Speed`;
    paint(this.beforeArt, current);

    if (!upcoming) {
      // The end of the chain. Saying so plainly beats an empty card and a bar
      // that can never fill.
      this.afterName.textContent = 'Fully Evolved';
      this.afterMult.textContent = '';
      this.afterArt.style.backgroundImage = '';
      this.afterArt.style.background = 'rgba(255,255,255,0.08)';
      this.afterArt.textContent = '★';
      this.levelFill.style.width = '100%';
      this.levelLabel.textContent = `Level ${this.level}`;
      this.winsLabel.textContent = 'Final Evolution Reached';
      this.winsLabel.className = 'aoe-evo__wins aoe-font aoe-evo__wins--done';
      this.action.textContent = 'Evolved';
      this.action.disabled = true;
      this.paintChain();
      return;
    }

    this.afterName.textContent = upcoming.name;
    this.afterMult.textContent = `x${upcoming.multiplier} Speed`;
    paint(this.afterArt, upcoming);

    // "have / needed" rather than "needed" alone: a bar that says 6 tells the
    // player nothing about whether they are nearly there.
    const levelFraction = clamp01(this.level / Math.max(1, upcoming.requiredLevel));
    this.levelFill.style.width = `${levelFraction * 100}%`;
    this.levelLabel.textContent = `Level ${this.level}/${upcoming.requiredLevel}`;

    this.winsLabel.textContent =
      `${formatSpeed(this.wins)}/${formatSpeed(upcoming.requiredWins)} Wins Required`;

    // THE shared predicate, not a comparison written here.
    const qualifies = qualifiesForMount(upcoming.slot, this.level, this.wins);
    this.winsLabel.className = qualifies
      ? 'aoe-evo__wins aoe-font aoe-evo__wins--done'
      : 'aoe-evo__wins aoe-font';
    this.action.textContent = qualifies ? 'Evolving…' : 'Evolve';
    this.action.disabled = !qualifies;

    this.paintChain();
  }

  private paintChain(): void {
    const pips = this.chain.children;
    for (let i = 0; i < MOUNTS.length; i += 1) {
      const mount = MOUNTS[i] as MountDefinition;
      const pip = pips[i] as HTMLElement | undefined;
      if (!pip) continue;
      const unlocked = isMountUnlocked(this.unlocked, mount.slot);
      pip.classList.toggle('aoe-evo__pip--on', unlocked);
      pip.classList.toggle('aoe-evo__pip--now', mount.slot === this.mountSlot);
    }
  }

  /** One of the two cards: a colour block, a name and a multiplier. */
  private card(
    parent: HTMLElement,
    heading: string,
  ): { art: HTMLDivElement; name: HTMLSpanElement; mult: HTMLSpanElement } {
    const wrap = document.createElement('div');
    wrap.className = 'aoe-evo__card';

    const head = document.createElement('span');
    head.className = 'aoe-evo__head aoe-font aoe-outline';
    head.textContent = heading;

    const art = document.createElement('div');
    art.className = 'aoe-evo__art';

    const name = document.createElement('span');
    name.className = 'aoe-evo__name aoe-font aoe-outline';

    // The pill carries the running-shoe mark the Speed popups use, so
    // "x1.25 Speed" means the same thing here as it does when it floats off
    // the player's head.
    const mult = document.createElement('span');
    mult.className = 'aoe-evo__mult aoe-font';

    wrap.append(head, art, name, mult);
    parent.appendChild(wrap);
    return { art, name, mult };
  }
}

/**
 * Put a mount in a card.
 *
 * A real PORTRAIT where one could be rendered - see `MountThumbnails`, which
 * draws the actual model once into a data URL - over a gradient of the
 * species' own palette. The gradient is not merely a backdrop: it is the
 * fallback for a browser that refused the offscreen context, and it is why a
 * card is never empty.
 */
const paint = (art: HTMLDivElement, mount: MountDefinition): void => {
  art.style.background =
    `linear-gradient(150deg, ${hex(mount.palette.body)}, ${hex(mount.palette.accent)})`;

  const portrait = mountThumbnail(mount.slot);
  if (portrait) {
    art.textContent = '';
    art.style.backgroundImage =
      `url(${portrait}), linear-gradient(150deg, ${hex(mount.palette.body)}, ${hex(mount.palette.accent)})`;
    art.style.backgroundSize = 'contain, cover';
    art.style.backgroundPosition = 'center';
    art.style.backgroundRepeat = 'no-repeat';
    return;
  }
  art.style.backgroundImage = '';
  art.textContent = mount.name.slice(0, 1);
};

const hex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

const clamp01 = (value: number): number =>
  !Number.isFinite(value) ? 0 : value < 0 ? 0 : value > 1 ? 1 : value;
