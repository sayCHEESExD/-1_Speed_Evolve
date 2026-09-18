import {
  COMPACT_ABOVE,
  formatSpeed,
  resolveLevel,
  formatSpeedExact,
  type LevelProgress,
} from '@evolve/shared';

/**
 * The Speed and Level HUD.
 *
 * The bottom-centre block: the total multiplier on the left, the headline
 * Speed figure in the middle, and the level bar under both.
 *
 * Everything it shows is SERVER-AUTHORITATIVE state. It renders the replicated
 * lifetime Speed total, the replicated multiplier, and the level that follows
 * from the total through the shared formula - it never awards, predicts or
 * derives progress of its own. The multiplier in particular is REPLICATED
 * rather than recomputed: it is the product of five separate ladders, and a
 * HUD that assembled its own copy would be a second place for one of them to
 * be applied twice.
 *
 * Laid out to match the reference art: heavy white display type with a thick
 * dark rim, a dark green studded track with a flat blue fill, the level name
 * at the left of the fill and the "into / required" figures at the right.
 *
 * Built as three independent rows so a fourth can be added later - a Wins
 * counter, the buy buttons - without re-laying out what is already here.
 */
export class SpeedHud {
  private readonly root: HTMLDivElement;
  private readonly speedLabel: HTMLDivElement;
  private readonly multiLabel: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly levelLabel: HTMLDivElement;
  private readonly amountLabel: HTMLDivElement;

  private lastTotal = -1;
  private lastLevel = -1;
  private lastMultiplier = -1;

  constructor(parent: HTMLElement) {
    injectStyles();

    this.root = el('div', 'aoe-hud');

    const speedRow = el('div', 'aoe-hud__speed-row');
    this.multiLabel = el('div', 'aoe-hud__multi');
    this.multiLabel.textContent = 'Total Multiplier: x1';
    this.speedLabel = el('div', 'aoe-hud__speed');
    this.speedLabel.textContent = 'Speed: 0.00';
    // Multiplier first in the DOM, so it sits at the LEFT of the row exactly
    // as the reference art places it.
    speedRow.append(this.multiLabel, this.speedLabel);

    const bar = el('div', 'aoe-hud__bar');
    this.fill = el('div', 'aoe-hud__fill');
    this.levelLabel = el('div', 'aoe-hud__level');
    this.levelLabel.textContent = 'Level 1';
    this.amountLabel = el('div', 'aoe-hud__amount');
    this.amountLabel.textContent = '0/0';
    bar.append(this.fill, this.levelLabel, this.amountLabel);

    this.root.append(speedRow, bar);
    parent.appendChild(this.root);
  }

  /**
   * @param totalSpeed lifetime Speed farmed, replicated from the server
   * @param multiplier the replicated product of every multiplier the player has
   */
  update(totalSpeed: number, multiplier: number): void {
    if (totalSpeed !== this.lastTotal) {
      this.lastTotal = totalSpeed;
      // Two decimal places, as the art shows it - "Speed: 76.00" is a literal
      // total rather than an abbreviation until the digits stop fitting.
      this.speedLabel.textContent = `Speed: ${formatSpeedExact(totalSpeed)}`;
      this.renderBar(resolveLevel(totalSpeed));
    }

    const level = resolveLevel(totalSpeed).level;
    if (level !== this.lastLevel) {
      this.lastLevel = level;
      this.levelLabel.textContent = `Level ${level}`;
      // A brief pop marks the moment a level - and a permanent speed rise - is
      // gained. Restarting the animation needs the reflow in between.
      this.root.classList.remove('aoe-hud--levelup');
      void this.root.offsetWidth;
      this.root.classList.add('aoe-hud--levelup');
    }

    if (multiplier !== this.lastMultiplier) {
      this.lastMultiplier = multiplier;
      // Two decimals, and the trailing zeros kept: "x2.20" reads as a figure
      // that moves, where "x2.2" reads as a round number that does not.
      this.multiLabel.textContent = `Total Multiplier: x${multiplier.toFixed(2)}`;
    }
  }

  dispose(): void {
    this.root.remove();
  }

  private renderBar(progress: LevelProgress): void {
    this.fill.style.width = `${(progress.fraction * 100).toFixed(2)}%`;
    /*
     * "16.00/25.00", exactly as the art shows it, until the level costs more
     * than the bar can carry - at which point the compact form takes over.
     *
     * BOTH halves switch together, on the REQUIREMENT, because they are one
     * reading. Deciding per side would print "940.00/1.2K" for most of every
     * level past the threshold, which reads as two different quantities rather
     * than as a fraction of one.
     */
    const show = progress.required < COMPACT_ABOVE ? formatSpeedExact : formatSpeed;
    this.amountLabel.textContent = `${show(progress.into)}/${show(progress.required)}`;
  }
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  return node;
};

let stylesInjected = false;

/** One stylesheet for the HUD, injected on first construction. */
const injectStyles = (): void => {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement('style');
  style.textContent = `
.aoe-hud {
  position: fixed;
  /* BOTTOM-CENTRE, and never closer to the edge than 20px (or the device's own
   * safe area, where it has one). */
  left: 50%;
  bottom: max(20px, 3.5vh, calc(env(safe-area-inset-bottom, 0px) + 12px));
  transform: translateX(-50%);
  width: min(720px, 74vw);
  pointer-events: none;
  user-select: none;
  /*
   * A heavy grotesque with a real black weight. The reference art uses a
   * rounded display face; Arial Black is the closest thing every platform
   * already has, and shipping a font file would be the single largest asset in
   * a build that currently has none.
   */
  font-family: "Arial Black", "Arial Bold", Arial, system-ui, sans-serif;
  z-index: 20;
}

/*
 * The chunky dark rim on every figure. Eight offsets plus a soft drop: a
 * -webkit-text-stroke would be one declaration, but it thins badly at small
 * sizes on some platforms and this reads identically everywhere.
 */
.aoe-hud__speed,
.aoe-hud__level,
.aoe-hud__amount {
  color: #ffffff;
  text-shadow:
    3px 0 0 #12181f, -3px 0 0 #12181f, 0 3px 0 #12181f, 0 -3px 0 #12181f,
    2px 2px 0 #12181f, -2px 2px 0 #12181f, 2px -2px 0 #12181f, -2px -2px 0 #12181f,
    0 5px 9px rgba(0, 0, 0, 0.45);
}

.aoe-hud__speed-row {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 10px;
  margin-bottom: 8px;
}
.aoe-hud__speed {
  font-size: clamp(24px, 3.5vw, 46px);
  letter-spacing: 0.01em;
  line-height: 1.05;
  white-space: nowrap;
}
/*
 * The total multiplier: gold, smaller, and ABSOLUTELY positioned at the left
 * of the row rather than laid out beside the Speed figure.
 *
 * Absolute on purpose. The Speed figure is meant to be centred under the
 * player, and a flex row containing both would centre the PAIR - so the Speed
 * reading would drift sideways every time the multiplier gained a digit.
 */
.aoe-hud__multi {
  position: absolute;
  left: 0;
  bottom: 0.3em;
  font-size: clamp(11px, 1.35vw, 17px);
  color: #ffd21f;
  white-space: nowrap;
  text-shadow:
    2px 0 0 #3a2a06, -2px 0 0 #3a2a06, 0 2px 0 #3a2a06, 0 -2px 0 #3a2a06,
    0 3px 6px rgba(0, 0, 0, 0.4);
}

/*
 * The track.
 *
 * A ROUNDED RECTANGLE, not a pill, and dark green rather than white - both
 * straight off the reference art, and both load-bearing. A white track reads
 * as the filled state, so a bar at 5% looked 95% full at a glance; a dark
 * track means every pixel of blue is progress.
 *
 * The stud grid is the same one the world's brick surfaces carry, drawn with
 * two crossed gradients rather than an image.
 */
.aoe-hud__bar {
  position: relative;
  height: clamp(34px, 4.6vw, 58px);
  border-radius: 14px;
  border: 5px solid #12181f;
  box-shadow: 0 5px 12px rgba(0, 0, 0, 0.45), inset 0 3px 0 rgba(0, 0, 0, 0.3);
  overflow: hidden;
  background-color: #1e4a1a;
  background-image:
    linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    linear-gradient(0deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  background-size: 16px 16px;
}
/*
 * The fill, and the level name sits ON it - so the bar reads as one object
 * filling up rather than as a chip beside a gauge.
 *
 * Flat blue with a lighter band across the top, which is how every plate in
 * the reference art is shaded. The rainbow that used to be here was pretty and
 * meant nothing: its colour changed as the bar grew, so the same level looked
 * like a different state at 40% and at 90%.
 */
.aoe-hud__fill {
  position: absolute;
  inset: 0 auto 0 0;
  width: 0%;
  border-radius: 9px 5px 5px 9px;
  background:
    linear-gradient(180deg,
      #8fd0fb 0%, #8fd0fb 26%,
      #5aa9e8 27%, #5aa9e8 74%,
      #3d86c9 75%, #3d86c9 100%);
  box-shadow: inset -3px 0 0 rgba(0, 0, 0, 0.18);
  transition: width 130ms linear;
}
.aoe-hud__level,
.aoe-hud__amount {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  font-size: clamp(15px, 1.95vw, 25px);
  white-space: nowrap;
}
.aoe-hud__level { left: 18px; }
.aoe-hud__amount { right: 18px; }

.aoe-hud--levelup .aoe-hud__bar {
  animation: aoe-hud-pop 460ms ease-out;
}
@keyframes aoe-hud-pop {
  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 226, 120, 0.9); }
  35% { transform: scale(1.03); box-shadow: 0 0 0 9px rgba(255, 226, 120, 0); }
  100% { transform: scale(1); box-shadow: 0 5px 12px rgba(0, 0, 0, 0.4); }
}

/* Touch controls own the bottom corners, so the HUD lifts clear of them. */
body.aoe-touch-mode .aoe-hud {
  /*
   * Clear of the movement stick, measured against the stick's OWN size.
   *
   * The stick is sized in vmin and sits a fixed inset off the bottom-left
   * corner, so a constant here is a number that happens to work on one phone.
   * Lifting the bar by the stick's own height plus its inset is what keeps
   * the two apart on every screen - at 375x812 the old constant left the bar's
   * bottom edge fourteen pixels inside the stick's top arc.
   */
  bottom: calc(env(safe-area-inset-bottom, 0px) + 30vmin + 34px);
  width: min(560px, 62vw);
}

/*
 * A NARROW screen cannot hold the multiplier beside the Speed figure.
 *
 * The multiplier is absolutely positioned at the left of the row so the Speed
 * reading stays centred under the player whatever digits the multiplier gains.
 * On a phone in portrait there is no room to the left of a centred figure, so
 * the two overlap - and the fix is not a smaller font, it is a second LINE.
 * Returning it to the flow above the row is what gives both their own space.
 */
@media (max-width: 560px) {
  .aoe-hud__speed-row {
    flex-direction: column;
    align-items: center;
    gap: 0;
  }
  .aoe-hud__multi {
    position: static;
    order: -1;
    margin-bottom: 2px;
  }
}

/*
 * A phone on its side is SHORT: lifting the bar 96px clear of the thumbs put it
 * across the middle of the screen, right over the rider. In landscape the stick
 * and the jump button sit side by side rather than stacked above the bar, so it
 * drops back to the bottom edge and narrows to the gap BETWEEN them - measured
 * from the same vmin the stick is sized by, so the two cannot drift apart.
 */
@media (orientation: landscape) and (max-height: 500px) {
  body.aoe-touch-mode .aoe-hud {
    /* Clearly above the bottom edge, and above the home indicator. */
    bottom: max(12px, calc(env(safe-area-inset-bottom, 0px) + 6px));
    /* The channel between the stick and the jump button, measured from the
     * stick's own radius formula - 2 x clamp(46px, 15vmin, 84px) wide, 26px
     * off the edge - plus a margin, on both sides so the bar stays centred. */
    width: max(
      200px,
      min(
        440px,
        calc(
          100vw - 2 * (44px + 2 * clamp(46px, 15vmin, 84px))
            - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)
        )
      )
    );
  }
  /* In landscape there IS room beside the figure again, so the multiplier
   * goes back to the left of the row rather than costing a whole line of a
   * screen that has very few. */
  body.aoe-touch-mode .aoe-hud__speed-row {
    flex-direction: row;
    margin-bottom: 3px;
    gap: 6px;
  }
  body.aoe-touch-mode .aoe-hud__multi { position: absolute; margin-bottom: 0; }
  body.aoe-touch-mode .aoe-hud__speed { font-size: clamp(17px, 6.4vh, 28px); }
  body.aoe-touch-mode .aoe-hud__multi { font-size: clamp(9px, 3vh, 13px); }
  body.aoe-touch-mode .aoe-hud__bar { height: clamp(22px, 8.5vh, 34px); border-width: 3px; border-radius: 10px; }
  body.aoe-touch-mode .aoe-hud__level,
  body.aoe-touch-mode .aoe-hud__amount { font-size: clamp(11px, 4vh, 16px); }
  body.aoe-touch-mode .aoe-hud__level { left: 12px; }
  body.aoe-touch-mode .aoe-hud__amount { right: 12px; }
}

@media (prefers-reduced-motion: reduce) {
  .aoe-hud__fill { transition: none; }
  .aoe-hud--levelup .aoe-hud__bar { animation: none; }
}
`;
  document.head.appendChild(style);
};
