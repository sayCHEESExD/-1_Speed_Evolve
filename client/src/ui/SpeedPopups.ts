import { formatSpeedGain } from '@evolve/shared';
import { injectHudStyles } from './hudStyles.js';

/**
 * Most popups on screen at once.
 *
 * A hard ceiling rather than a hope. Speed arrives on every state patch - the
 * server sends twenty a second - and a system that made one node per patch
 * would put hundreds of elements in the document inside a minute. The pool is
 * allocated once at construction and reused for ever; a spawn that finds
 * nothing free retires the oldest instead of growing.
 */
const POOL_SIZE = 14;

/** Seconds one popup stays on screen. Must match the CSS animation. */
const LIFETIME = 1.15;

/**
 * The floating "+N" a player sees when they earn Speed.
 *
 * Fed ONLY by what the server says it paid (`SpeedAwarded`): a whole number of
 * steps at one per-step value. Every popup prints that per-step value - the
 * figure `calculateSpeedGain` produced - so a player on a given setup sees the
 * same number on every popup, and a count when one popup stands for several
 * steps: "+125", "+125 x3".
 *
 * It used to diff the replicated Speed total between patches and release
 * whatever had piled up every quarter of a second, rounded down. The amount
 * in each popup then depended on how many patches landed in the window and on
 * how far the mount happened to move in them, which is what turned one
 * constant rate into "+14", "+15", "+17", "+8".
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
   * Steps paid but not yet shown, grouped by their per-step value in the
   * order they arrived. Consecutive awards at the same rate merge; a new rate
   * starts a new group, so no popup ever mixes two rates.
   */
  private readonly queue: { perStep: number; steps: number }[] = [];
  /** Seconds until the next release. */
  private cooldown = 0;

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
   * The server paid `steps` whole steps at `perStep` each.
   *
   * Nothing is computed here: both numbers are printed as they arrived.
   */
  award(steps: number, perStep: number): void {
    const count = Math.floor(steps);
    if (!(count > 0) || !Number.isFinite(perStep) || perStep <= 0) return;
    const last = this.queue[this.queue.length - 1];
    if (last && last.perStep === perStep) last.steps += count;
    else this.queue.push({ perStep, steps: count });
  }

  update(delta: number): void {
    this.cooldown -= Math.max(0, delta);
    if (this.cooldown > 0) return;

    // A fixed cadence, so the number of popups on screen is bounded no matter
    // how fast steps come in. Each release shows ONE rate group: the per-step
    // figure, and how many steps it stands for.
    const next = this.queue.shift();
    if (!next) return;
    this.cooldown = 0.26;
    this.spawn(next.perStep, next.steps);
  }

  dispose(): void {
    for (const entry of this.live) window.clearTimeout(entry.timer);
    this.live.length = 0;
    this.root.remove();
  }

  private spawn(perStep: number, steps: number): void {
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
    // Always the per-step figure, never a sum: every step at this rate was
    // worth exactly this, and the count says how many there were.
    if (value) value.textContent = `+${formatSpeedGain(perStep)}${steps > 1 ? ` x${steps}` : ''}`;

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
