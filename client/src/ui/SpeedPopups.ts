import { formatSpeedGain } from '@evolve/shared';
import { injectHudStyles } from './hudStyles.js';

/**
 * Most popups on screen at once.
 *
 * A memory ceiling, not a limit on what is shown: awards arrive one per
 * footfall - about ten a second at the very top of the speed curve, so a
 * dozen on screen - and this is headroom above that. The pool is allocated
 * once and reused for ever; a spawn that finds nothing free retires the
 * oldest instead of growing.
 */
const POOL_SIZE = 24;

/** Seconds one popup stays on screen. Must match the CSS animation. */
const LIFETIME = 1.15;

/**
 * The floating "+N" a player sees when they earn Speed.
 *
 * ONE POPUP PER AWARD, printing that award's own amount and nothing else. The
 * server sends one message per FOOTFALL of the mount, carrying exactly
 * `footfallSpeedGain` - the Speed that footfall earned, already summed - so a
 * player on a given setup sees the same "+6 Speed" on every popup.
 *
 * This class listens to nothing and computes nothing: `Game` hands it each
 * `SpeedAwarded` message once, and the figure printed is the one in it.
 *
 * Two earlier versions got this wrong from the other end. One merged each
 * quarter-second of awards into "+1.04 x6", and the count read as a multiplier
 * that kept changing. The next paid and announced every two-unit STEP on its
 * own, and one stride of the legs came out as twenty "+1" popups.
 *
 * Every position is randomised inside a band that deliberately avoids the
 * three things already on screen - the Wins counter at the top, the rail down
 * the left and the Speed/Level bar along the bottom - so a popup can never
 * cover the HUD at any window shape.
 */
export class SpeedPopups {
  private readonly root: HTMLDivElement;
  private readonly pool: HTMLDivElement[] = [];

  /** Indices of nodes currently free, used as a stack. */
  private readonly free: number[] = [];
  /** Nodes in flight, oldest first, so the pool can always make room. */
  private readonly live: { index: number; timer: number }[] = [];

  /**
   * Where the last few popups went, in percent.
   *
   * Purely so a new one can be nudged off the last one. Two popups landing on
   * exactly the same spot is the one way a random placement reads as a bug
   * rather than as variety.
   */
  private readonly recent: { x: number; y: number }[] = [];

  constructor(parent: HTMLElement) {
    injectHudStyles();

    this.root = document.createElement('div');
    this.root.className = 'aoe-pops';
    parent.appendChild(this.root);

    for (let i = 0; i < POOL_SIZE; i += 1) {
      const node = document.createElement('div');
      node.className = 'aoe-pop aoe-font';
      node.innerHTML =
        // The supplied running shoe, used as it is. Its CSS drives the HEIGHT
        // and leaves the width automatic, so its real 415x410 aspect survives -
        // setting both is how an icon gets squashed.
        '<img class="aoe-pop__icon" src="/ui/shoe.png" alt="" draggable="false">' +
        '<span class="aoe-pop__value"></span>';
      node.hidden = true;
      this.root.appendChild(node);
      this.pool.push(node);
      this.free.push(i);
    }
  }

  /**
   * The server paid ONE footfall, worth `gain`. It is shown as it arrives.
   *
   * Nothing is computed here and nothing is combined: the number printed is
   * the number in the message.
   */
  award(gain: number): void {
    if (!Number.isFinite(gain) || gain <= 0) return;
    this.spawn(gain);
  }

  /** Popups run on CSS timers; nothing to advance per frame. */
  update(_delta: number): void {}

  dispose(): void {
    for (const entry of this.live) window.clearTimeout(entry.timer);
    this.live.length = 0;
    this.root.remove();
  }

  private spawn(gain: number): void {
    // Nothing free: retire the oldest rather than allocate. The ceiling is the
    // point of the pool.
    if (this.free.length === 0) {
      const oldest = this.live.shift();
      if (!oldest) return;
      window.clearTimeout(oldest.timer);
      this.release(oldest.index);
    }

    const index = this.free.pop();
    if (index === undefined) return;
    const node = this.pool[index];
    if (!node) return;

    const value = node.querySelector('.aoe-pop__value');
    // Exactly the award, and nothing beside it: never a count, a multiplier
    // or a part of the sum.
    if (value) value.textContent = `+${formatSpeedGain(gain)} Speed`;

    // A random spot inside the band that misses every HUD element. Expressed
    // in percentages, so it holds at any aspect ratio.
    //
    // Re-rolled a few times if it lands on top of a popup that is still on
    // screen: perfectly overlapping figures are unreadable, and are the one
    // way a random placement reads as a bug rather than as variety.
    let x = 0;
    let y = 0;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      x = 26 + Math.random() * 56;
      y = 26 + Math.random() * 34;
      const clash = this.recent.some(
        (at) => Math.abs(at.x - x) < 11 && Math.abs(at.y - y) < 9,
      );
      if (!clash) break;
    }
    this.recent.push({ x, y });
    if (this.recent.length > 5) this.recent.shift();

    node.style.left = `${x}%`;
    node.style.top = `${y}%`;
    // A little rotation, so two popups never look stamped. NOT a random size:
    // the same figure drawn at a different scale each time reads as a
    // different amount, which is exactly the impression this must not give.
    node.style.setProperty('--aoe-pop-tilt', `${(Math.random() * 2 - 1) * 7}deg`);

    node.hidden = false;
    // Restart the animation: removing the class, forcing a reflow and adding
    // it back is the only reliable way to replay a CSS animation on a reused
    // node.
    node.classList.remove('aoe-pop--run');
    void node.offsetWidth;
    node.classList.add('aoe-pop--run');

    const timer = window.setTimeout(() => {
      const at = this.live.findIndex((entry) => entry.index === index);
      if (at >= 0) this.live.splice(at, 1);
      this.release(index);
    }, LIFETIME * 1000);

    this.live.push({ index, timer });
  }

  private release(index: number): void {
    const node = this.pool[index];
    if (!node) return;
    node.hidden = true;
    node.classList.remove('aoe-pop--run');
    this.free.push(index);
  }
}
