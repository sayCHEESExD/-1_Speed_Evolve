/**
 * One stylesheet for the whole HUD, injected on first use.
 *
 * Every panel and button in the game shares these rules, so the rail, the win
 * counter and the two shop panels cannot drift apart visually. The look is
 * taken from the reference art: heavy white display type with a thick dark
 * rim, saturated gradient tiles with a chunky border, and a red badge when
 * something is waiting to be collected.
 */
let injected = false;

export const injectHudStyles = (): void => {
  if (injected) return;
  injected = true;

  const style = document.createElement('style');
  style.textContent = `
:root {
  /* ONE number scales the whole left rail, so the column grows together. */
  --aoe-rail: 78px;
  --aoe-ink: #12181f;
}

.aoe-font {
  font-family: "Arial Black", "Arial Bold", Arial, system-ui, sans-serif;
}

/*
 * The chunky dark rim on every figure. Eight offsets plus a soft drop: a
 * -webkit-text-stroke would be one declaration, but it thins badly at small
 * sizes on some platforms and this reads identically everywhere.
 */
.aoe-outline {
  color: #fff;
  text-shadow:
    3px 0 0 var(--aoe-ink), -3px 0 0 var(--aoe-ink),
    0 3px 0 var(--aoe-ink), 0 -3px 0 var(--aoe-ink),
    2px 2px 0 var(--aoe-ink), -2px 2px 0 var(--aoe-ink),
    2px -2px 0 var(--aoe-ink), -2px -2px 0 var(--aoe-ink),
    0 5px 9px rgba(0, 0, 0, 0.45);
}

/* ---- The two tallies, at the foot of the rail ---------------------------
 * A row inside the rail's own grid rather than a separately positioned block,
 * so they sit under the tiles however many tiles there are - a fixed offset
 * would be a number that happens to be right for four.
 */
.aoe-wins {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  pointer-events: none;
  user-select: none;
}
.aoe-wins__row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.aoe-wins__row[hidden] { display: none; }
.aoe-wins__icon {
  width: clamp(28px, 3.2vw, 44px);
  height: clamp(28px, 3.2vw, 44px);
  flex: none;
}
.aoe-wins__icon .aoe-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.45));
}
.aoe-wins__value {
  font-size: clamp(18px, 2.4vw, 32px);
  line-height: 1;
  /* Orange, as the reference art has it - the one warm figure on screen. */
  color: #ff9d1f;
  text-shadow:
    3px 0 0 var(--aoe-ink), -3px 0 0 var(--aoe-ink),
    0 3px 0 var(--aoe-ink), 0 -3px 0 var(--aoe-ink),
    2px 2px 0 var(--aoe-ink), -2px 2px 0 var(--aoe-ink),
    2px -2px 0 var(--aoe-ink), -2px -2px 0 var(--aoe-ink),
    0 6px 10px rgba(0, 0, 0, 0.5);
}
/* Rebirths are white rather than orange, so the two tallies under the rail
 * never read as one number split over two lines. */
.aoe-wins__value--rebirth { color: #ffffff; }
.aoe-wins--pop .aoe-wins__value { animation: aoe-pop 520ms ease-out; }
@keyframes aoe-pop {
  0% { transform: scale(1); }
  35% { transform: scale(1.22); }
  100% { transform: scale(1); }
}

/* ---- Left rail -----------------------------------------------------------
 * TWO COLUMNS anchored to the top left, as the reference art arranges it, with
 * the lifetime tallies as a final row under them. A single centred column was
 * a perfectly reasonable thing to build and is not what this game looks like.
 *
 * Inside the Bloxity portal the top-left corner belongs to the portal's own
 * logo and menu, drawn over our page from the parent frame - so the rail
 * starts below whatever height it declares.
 */
.aoe-rail {
  position: fixed;
  left: max(12px, env(safe-area-inset-left, 0px));
  top: calc(max(14px, env(safe-area-inset-top, 0px)) + var(--aoe-portal-top, 0px));
  display: grid;
  grid-template-columns: repeat(2, var(--aoe-rail));
  gap: 16px 12px;
  z-index: 21;
  user-select: none;
}
.aoe-tile {
  position: relative;
  width: var(--aoe-rail);
  height: var(--aoe-rail);
  border: 4px solid var(--aoe-ink);
  border-radius: 20px;
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.38);
  transition: transform 110ms ease;
}
.aoe-tile:hover { transform: scale(1.06); }
.aoe-tile:active { transform: scale(0.97); }
.aoe-tile .aoe-icon {
  width: 74%;
  height: 74%;
  object-fit: contain;
  /* The art carries its own outline, so it needs a drop shadow rather than a
   * stroke to lift it off the gradient behind it. */
  filter: drop-shadow(0 3px 3px rgba(0, 0, 0, 0.35));
  pointer-events: none;
}
/* The label sits UNDER the tile, overlapping its bottom edge, as in the art. */
.aoe-tile__label {
  position: absolute;
  left: 50%;
  bottom: -9px;
  transform: translateX(-50%);
  font-size: clamp(11px, 1.15vw, 15px);
  white-space: nowrap;
  pointer-events: none;
}
/* The PC key cap, top-left, as in the reference art.
 *
 * Top LEFT because the red "!" badge already owns the bottom right and the
 * label owns the bottom edge - the corner is the only place it can sit without
 * covering something that was there first.
 */
.aoe-tile__key {
  position: absolute;
  left: -7px;
  top: -7px;
  min-width: 22px;
  height: 22px;
  padding: 0 4px;
  box-sizing: border-box;
  border: 3px solid var(--aoe-ink);
  border-radius: 7px;
  background: #ffffff;
  color: var(--aoe-ink);
  font-size: 13px;
  line-height: 16px;
  text-align: center;
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.28);
  pointer-events: none;
}
/* Touch has no keyboard, so the mobile layout keeps exactly what it had. */
body.aoe-touch-mode .aoe-tile__key { display: none; }

/* The red "!" badge: something is available. */
.aoe-tile__badge {
  position: absolute;
  right: -8px;
  bottom: -8px;
  width: 24px;
  height: 24px;
  border: 3px solid var(--aoe-ink);
  border-radius: 50%;
  background: #f5363f;
  color: #fff;
  font-size: 15px;
  line-height: 18px;
  text-align: center;
  display: none;
}
.aoe-tile--ready .aoe-tile__badge { display: block; }
.aoe-tile--locked { filter: saturate(0.45) brightness(0.78); }

/* Each tile's own colour, straight off the reference art's rail. */
.aoe-tile--evolve {
  background: linear-gradient(160deg, #a8f06a 0%, #7ed957 50%, #4aa832 100%);
}
.aoe-tile--rebirth {
  background: linear-gradient(160deg, #ff9ae8 0%, #f25ac8 50%, #c42f96 100%);
}
.aoe-tile--trail {
  background: linear-gradient(160deg, #6de6ff 0%, #2aa8f5 55%, #1670d0 100%);
}
.aoe-tile--audio {
  background: linear-gradient(160deg, #ffd76b 0%, #ffa32b 55%, #d97708 100%);
}
/* Muted: the tile stays lit enough to find, and plainly off. */
.aoe-tile--off { filter: saturate(0.25) brightness(0.7); }
.aoe-tile--off .aoe-icon { opacity: 0.55; }

/* ---- Trophies flying to the Wins counter --------------------------------
 * Above the HUD, unlike the Speed popups: these are meant to arrive AT the
 * counter, so passing behind it would hide the moment they exist for. They
 * last about half a second and nothing can be clicked through them.
 */
.aoe-flight {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 30;
}
.aoe-flight__cup {
  position: absolute;
  left: 0;
  top: 0;
  width: clamp(26px, 3vw, 40px);
  height: auto;
  opacity: 0;
  will-change: transform, opacity;
  filter: drop-shadow(0 3px 5px rgba(0, 0, 0, 0.45));
}
.aoe-flight__cup[hidden] { display: none; }
.aoe-flight__cup--run { animation: aoe-flight 620ms cubic-bezier(0.4, 0, 0.5, 1) forwards; }
@keyframes aoe-flight {
  0% {
    opacity: 0;
    transform: translate(calc(var(--aoe-fx) - 50%), calc(var(--aoe-fy) - 50%)) scale(0.4) rotate(0deg);
  }
  18% {
    opacity: 1;
    transform: translate(calc(var(--aoe-fx) - 50%), calc(var(--aoe-fy) - 50%)) scale(1.1) rotate(-20deg);
  }
  60% {
    opacity: 1;
    transform: translate(calc(var(--aoe-mx) - 50%), calc(var(--aoe-my) - 50%)) scale(0.95) rotate(140deg);
  }
  100% {
    opacity: 0;
    transform: translate(calc(var(--aoe-tx) - 50%), calc(var(--aoe-ty) - 50%)) scale(0.35) rotate(340deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  /* Still travels - that is the information - but without the tumble. */
  .aoe-flight__cup--run { animation: aoe-flight-plain 620ms ease-out forwards; }
  @keyframes aoe-flight-plain {
    0% { opacity: 0; transform: translate(calc(var(--aoe-fx) - 50%), calc(var(--aoe-fy) - 50%)); }
    20%, 70% { opacity: 1; }
    100% { opacity: 0; transform: translate(calc(var(--aoe-tx) - 50%), calc(var(--aoe-ty) - 50%)); }
  }
}

/* ---- The Rebirth panel ---------------------------------------------------
 * A BEFORE and AFTER pair with an arrow between them, as the reference art
 * frames it: the two things a rebirth changes, side by side, so the trade is
 * legible at a glance instead of buried in a paragraph.
 */
.aoe-rb {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px clamp(6px, 1.4vw, 16px);
  margin-bottom: 14px;
}
.aoe-rb__head {
  text-align: center;
  font-size: clamp(15px, 2.2vw, 26px);
}
.aoe-rb__card {
  display: grid;
  place-items: center;
  padding: 10px 8px;
  border-radius: 12px;
  border: 5px solid var(--aoe-ink);
  box-shadow:
    inset 0 -5px 0 rgba(0, 0, 0, 0.18),
    inset 0 4px 0 rgba(255, 255, 255, 0.22);
  font-size: clamp(13px, 1.9vw, 22px);
  /* The figure is the point of the card, so it never wraps and never clips:
   * it shrinks to fit instead, the same rule the world signs follow. */
  white-space: nowrap;
  overflow: hidden;
  background-image:
    linear-gradient(90deg, rgba(255, 255, 255, 0.13) 2px, transparent 2px),
    linear-gradient(0deg, rgba(0, 0, 0, 0.08) 2px, transparent 2px);
  background-size: 17px 17px;
}
.aoe-rb__card--speed { background-color: #4b9ff0; }
.aoe-rb__card--level { background-color: #f5a623; }
/*
 * The arrow, and it is the SAME arrow the evolve menu uses - white, chunky and
 * drawn with a clip path rather than typed as a glyph, because the two panels
 * ask the same question and an arrow that differed between them would be the
 * one thing on screen saying they are unrelated.
 */
.aoe-rb__arrow {
  justify-self: center;
  width: clamp(20px, 2.6vw, 34px);
  height: clamp(16px, 2.1vw, 28px);
  background: #fff;
  filter: drop-shadow(2px 0 0 var(--aoe-ink)) drop-shadow(-2px 0 0 var(--aoe-ink))
    drop-shadow(0 2px 0 var(--aoe-ink)) drop-shadow(0 -2px 0 var(--aoe-ink));
  clip-path: polygon(0% 30%, 58% 30%, 58% 4%, 100% 50%, 58% 96%, 58% 70%, 0% 70%);
}
/*
 * The one warning in the game, and it is RED on the panel's own dark ground.
 * The pale plate this panel used to sit on existed to keep white card text
 * legible; the cards now carry their own outline, so the panel can be the same
 * green as every other one instead of the only light thing in the HUD.
 */
.aoe-rb__warn {
  margin: 0 0 12px;
  text-align: center;
  font-size: clamp(14px, 2vw, 22px);
  color: #ff5c5c;
  text-shadow:
    2px 0 0 var(--aoe-ink), -2px 0 0 var(--aoe-ink),
    0 2px 0 var(--aoe-ink), 0 -2px 0 var(--aoe-ink);
}
.aoe-rb__bar { margin-bottom: 14px; }
.aoe-rb__go { font-size: clamp(15px, 2vw, 22px); }

/* ---- The Bloxity account chip -------------------------------------------
 * Top RIGHT: the Wins counter owns the top centre and the rail owns the left,
 * and this is the only corner left that a player is not already reading.
 */
.aoe-account {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 23;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}
.aoe-account__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px 4px 4px;
  border: 3px solid var(--aoe-ink);
  border-radius: 999px;
  background: rgba(18, 24, 38, 0.82);
}
.aoe-account__pfp {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 2px solid var(--aoe-ink);
  object-fit: cover;
}
.aoe-account__name {
  font-size: clamp(12px, 1.2vw, 15px);
  color: #ffffff;
  max-width: 22vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.aoe-account__note {
  font-size: clamp(10px, 1vw, 13px);
  color: #ffffff;
  opacity: 0.6;
}
.aoe-account__actions {
  display: flex;
  gap: 6px;
}
.aoe-account__btn,
.aoe-account__login {
  cursor: pointer;
  border: 3px solid var(--aoe-ink);
  border-radius: 10px;
  padding: 5px 10px;
  font-size: clamp(11px, 1.1vw, 14px);
  color: #ffffff;
  background: linear-gradient(180deg, #6de6ff 0%, #2aa8f5 55%, #1670d0 100%);
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.3);
}
.aoe-account__login {
  background: linear-gradient(180deg, #ffd76b 0%, #ffa32b 55%, #d97708 100%);
  padding: 7px 14px;
}
.aoe-account__btn:hover,
.aoe-account__login:hover { filter: brightness(1.1); }
/* Touch keeps the chip but drops the row of buttons to a single tap target's
 * worth of width, so it never crowds the jump button. */
body.aoe-touch-mode .aoe-account__name { max-width: 30vw; }

/* ---- Friends and Bux rows ----------------------------------------------- */
.aoe-friend {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 4px;
  border-bottom: 2px solid rgba(43, 60, 88, 0.16);
}
.aoe-friend:last-of-type { border-bottom: none; }
.aoe-friend__pfp {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 2px solid var(--aoe-ink);
  object-fit: cover;
  flex: none;
}
.aoe-friend__name {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  flex: 1 1 auto;
  min-width: 0;
}
.aoe-friend__name b,
.aoe-friend__name small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.aoe-friend__name small { opacity: 0.6; }
.aoe-friend__status {
  font-size: 12px;
  opacity: 0.75;
  flex: none;
}
.aoe-friend__invite,
.aoe-bux__buy {
  cursor: pointer;
  flex: none;
  border: 3px solid var(--aoe-ink);
  border-radius: 9px;
  padding: 5px 11px;
  color: #ffffff;
  font: inherit;
  font-size: 13px;
  background: linear-gradient(180deg, #9bf06a 0%, #4fce2e 60%, #37a81f 100%);
}
.aoe-friend__invite:disabled,
.aoe-bux__buy:disabled { filter: saturate(0.3) brightness(0.85); cursor: default; }

.aoe-bux {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 4px;
  border-bottom: 2px solid rgba(43, 60, 88, 0.16);
}
.aoe-bux:last-of-type { border-bottom: none; }
.aoe-bux__text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  flex: 1 1 auto;
}
.aoe-bux__text small { opacity: 0.65; }
.aoe-bux__buy {
  background: linear-gradient(180deg, #ffd76b 0%, #ffa32b 55%, #d97708 100%);
}

.aoe-panel--friends .aoe-panel__head,
.aoe-panel--bux .aoe-panel__head {
  background: linear-gradient(160deg, #6de6ff 0%, #2aa8f5 55%, #1670d0 100%);
}

/* ---- The FPS readout, from the portal's show_fps setting ----------------- */
.aoe-fps {
  position: fixed;
  left: 12px;
  top: 12px;
  z-index: 23;
  font-size: 13px;
  color: #9bf06a;
  text-shadow:
    2px 0 0 var(--aoe-ink), -2px 0 0 var(--aoe-ink),
    0 2px 0 var(--aoe-ink), 0 -2px 0 var(--aoe-ink);
  pointer-events: none;
}
.aoe-fps[hidden] { display: none; }

/* ---- Panels --------------------------------------------------------------
 * The reference art's panel, and it is a specific object rather than a generic
 * modal: a DARK GREEN plate behind a black frame, with the title sitting on
 * the frame's top edge beside its own icon, a rule running to a red close
 * square, and everything inside it built out of the same brick-faced plates
 * the world is.
 *
 * The light card with a coloured title bar that used to be here was a
 * perfectly good web dialog and looked nothing like this game.
 */
.aoe-panel {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(6, 10, 18, 0.5);
  z-index: 40;
}
.aoe-panel[hidden] { display: none; }
.aoe-panel__box {
  position: relative;
  width: min(600px, 92vw);
  max-height: 84vh;
  display: flex;
  flex-direction: column;
  padding: 14px 16px 16px;
  border: 6px solid var(--aoe-ink);
  border-radius: 20px;
  /* Deep green, and translucent enough that the jungle behind stays legible -
   * a solid panel over a running game reads as a page, not as an overlay. */
  background:
    linear-gradient(180deg, rgba(31, 66, 24, 0.97), rgba(20, 45, 15, 0.97));
  box-shadow:
    0 20px 46px rgba(0, 0, 0, 0.55),
    inset 0 0 0 3px rgba(255, 255, 255, 0.05);
}

/* The header: icon, title, a rule to the close button. */
.aoe-panel__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex: none;
}
.aoe-panel__icon {
  width: clamp(26px, 4vw, 38px);
  height: clamp(26px, 4vw, 38px);
  flex: none;
  display: grid;
  place-items: center;
}
.aoe-panel__icon .aoe-icon,
.aoe-panel__icon img {
  width: 100%;
  height: auto;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.5));
}
.aoe-panel__title {
  font-size: clamp(20px, 3vw, 32px);
  line-height: 1;
  white-space: nowrap;
}
/*
 * The rule. It EXPANDS, so the title sits hard left and the close button hard
 * right however long the title is - which is what keeps the six panels'
 * headers on one grid instead of each centring its own words.
 */
.aoe-panel__rule {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.28);
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.35);
}
.aoe-panel__close {
  flex: none;
  width: clamp(30px, 4.4vw, 42px);
  height: clamp(30px, 4.4vw, 42px);
  border: 4px solid var(--aoe-ink);
  border-radius: 10px;
  background: linear-gradient(180deg, #ff5c5c 0%, #ff5c5c 40%, #d8232b 41%, #d8232b 100%);
  color: #fff;
  font-size: clamp(14px, 2vw, 20px);
  cursor: pointer;
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.45);
}
.aoe-panel__close:hover { filter: brightness(1.12); }
.aoe-panel__close:active { transform: translateY(2px); }

.aoe-panel__body {
  /* The inner well: a darker plate inside the frame, which is what gives the
   * panel its depth in the reference art rather than one flat field. */
  padding: 14px;
  border-radius: 12px;
  overflow-y: auto;
  background: rgba(8, 24, 6, 0.55);
  box-shadow: inset 0 3px 10px rgba(0, 0, 0, 0.45);
  color: #eaf3e6;
  font-family: "Arial Black", "Arial Bold", Arial, system-ui, sans-serif;
  font-size: 14px;
}
.aoe-panel__note {
  margin: 0 0 12px;
  line-height: 1.45;
  font-family: system-ui, "Segoe UI", Roboto, sans-serif;
  font-weight: 600;
  font-size: 13px;
  color: rgba(234, 243, 230, 0.75);
}
.aoe-panel__note b { font-size: 15px; }

/* ---- The game button -----------------------------------------------------
 * One plate, four colours, used by every button in every panel: a chunky dark
 * frame, a two-tone face split across the middle, a brick pattern over it and
 * outlined display type. Every button in the reference art is this object, so
 * it is one class here rather than a gradient re-typed per panel.
 */
.aoe-btn {
  position: relative;
  padding: 11px 20px;
  border: 5px solid var(--aoe-ink);
  border-radius: 14px;
  color: #fff;
  font-family: "Arial Black", "Arial Bold", Arial, system-ui, sans-serif;
  font-size: clamp(14px, 2vw, 20px);
  cursor: pointer;
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.45), -1px -1px 0 rgba(0, 0, 0, 0.35);
  background-image:
    linear-gradient(90deg, rgba(255, 255, 255, 0.12) 2px, transparent 2px),
    linear-gradient(0deg, rgba(0, 0, 0, 0.1) 2px, transparent 2px);
  background-size: 18px 18px;
  background-color: #4ad44a;
  box-shadow: inset 0 -6px 0 rgba(0, 0, 0, 0.22), inset 0 5px 0 rgba(255, 255, 255, 0.2);
  transition: filter 90ms ease-out, transform 90ms ease-out;
}
.aoe-btn:hover:not(:disabled) { filter: brightness(1.1); }
.aoe-btn:active:not(:disabled) { transform: translateY(3px); }
.aoe-btn:disabled { filter: saturate(0.25) brightness(0.72); cursor: not-allowed; }
.aoe-btn--green { background-color: #4ad44a; }
.aoe-btn--orange { background-color: #f5a623; }
.aoe-btn--blue { background-color: #3aa8ff; }
.aoe-btn--pink { background-color: #f25a9e; }
.aoe-btn--row { display: flex; gap: 12px; }
.aoe-btn--row > .aoe-btn { flex: 1; }

/* Kept as an alias so anything still asking for the old class gets the new
 * plate rather than a rule that no longer exists. */
.aoe-action {
  width: 100%;
  composes: aoe-btn;
  padding: 12px;
  border: 5px solid var(--aoe-ink);
  border-radius: 14px;
  background-color: #4ad44a;
  background-image:
    linear-gradient(90deg, rgba(255, 255, 255, 0.12) 2px, transparent 2px),
    linear-gradient(0deg, rgba(0, 0, 0, 0.1) 2px, transparent 2px);
  background-size: 18px 18px;
  color: #fff;
  font-size: 19px;
  cursor: pointer;
  box-shadow: inset 0 -6px 0 rgba(0, 0, 0, 0.22), inset 0 5px 0 rgba(255, 255, 255, 0.2);
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.45);
}
.aoe-action:disabled { filter: saturate(0.25) brightness(0.72); cursor: not-allowed; }

/* ---- The requirement bar -------------------------------------------------
 * The orange brick bar under every Before/After pair in the reference art:
 * a filled portion, a pale studded track and one outlined figure centred over
 * the whole thing rather than over either half.
 */
.aoe-gauge {
  position: relative;
  height: clamp(28px, 4vw, 38px);
  border: 5px solid var(--aoe-ink);
  border-radius: 12px;
  overflow: hidden;
  background-color: #cfd4cd;
  background-image:
    linear-gradient(90deg, rgba(0, 0, 0, 0.08) 2px, transparent 2px),
    linear-gradient(0deg, rgba(0, 0, 0, 0.08) 2px, transparent 2px);
  background-size: 15px 15px;
  box-shadow: inset 0 3px 0 rgba(0, 0, 0, 0.2);
}
.aoe-gauge__fill {
  position: absolute;
  inset: 0 auto 0 0;
  width: 0%;
  background-color: #f5a623;
  background-image:
    linear-gradient(90deg, rgba(255, 255, 255, 0.16) 2px, transparent 2px),
    linear-gradient(0deg, rgba(0, 0, 0, 0.1) 2px, transparent 2px);
  background-size: 15px 15px;
  box-shadow: inset 0 5px 0 rgba(255, 255, 255, 0.24), inset 0 -5px 0 rgba(0, 0, 0, 0.16);
  transition: width 0.25s ease-out;
}
.aoe-gauge__label {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: clamp(12px, 1.8vw, 18px);
}
@media (prefers-reduced-motion: reduce) {
  .aoe-gauge__fill { transition: none; }
}

/* ---- Shop rows -----------------------------------------------------------
 * One row per tier, and it is the reference art's row: a saturated plate with
 * the name and what it multiplies stacked at the left, the item's own art in
 * the middle and the price as a button at the right.
 */
.aoe-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  margin-bottom: 9px;
  border: 5px solid var(--aoe-ink);
  border-radius: 14px;
  background-color: #6cc4f5;
  background-image:
    linear-gradient(90deg, rgba(255, 255, 255, 0.14) 2px, transparent 2px),
    linear-gradient(0deg, rgba(0, 0, 0, 0.07) 2px, transparent 2px);
  background-size: 17px 17px;
  box-shadow: inset 0 -5px 0 rgba(0, 0, 0, 0.14), inset 0 4px 0 rgba(255, 255, 255, 0.16);
}
.aoe-row--trail { background-color: #d97ae8; }
.aoe-row--aura { background-color: #6cc4f5; }
.aoe-row--item { background-color: #f0b44a; }
.aoe-row--owned { box-shadow: inset 0 0 0 4px rgba(255, 255, 255, 0.4); }
.aoe-row--equipped { box-shadow: inset 0 0 0 4px #ffd21f; }
.aoe-row__text { flex: 1; min-width: 0; }
.aoe-row__name {
  font-size: clamp(14px, 1.9vw, 21px);
  line-height: 1.1;
}
/* What the tier multiplies, in the reference's gold. Its own line under the
 * name rather than beside it, because the name is the thing being scanned for
 * and a figure on the same line competes with it. */
.aoe-row__meta {
  margin-top: 4px;
  font-size: clamp(11px, 1.5vw, 16px);
  color: #ffd21f;
  text-shadow:
    2px 0 0 var(--aoe-ink), -2px 0 0 var(--aoe-ink),
    0 2px 0 var(--aoe-ink), 0 -2px 0 var(--aoe-ink);
}
/* The tier's own colours, as the thing being sold. A gradient rather than an
 * image: twelve trails get twelve looks and the build gains no files. */
.aoe-row__swatch {
  width: clamp(38px, 5vw, 52px);
  height: clamp(38px, 5vw, 52px);
  border: 4px solid var(--aoe-ink);
  border-radius: 50%;
  flex: none;
  box-shadow: inset 0 -4px 6px rgba(0, 0, 0, 0.25), 0 3px 6px rgba(0, 0, 0, 0.3);
}
.aoe-row__buy {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: clamp(84px, 11vw, 124px);
  justify-content: center;
  padding: 9px 12px;
  border: 5px solid var(--aoe-ink);
  border-radius: 12px;
  background-color: #7ed957;
  background-image:
    linear-gradient(90deg, rgba(255, 255, 255, 0.14) 2px, transparent 2px),
    linear-gradient(0deg, rgba(0, 0, 0, 0.08) 2px, transparent 2px);
  background-size: 15px 15px;
  box-shadow: inset 0 -5px 0 rgba(0, 0, 0, 0.16), inset 0 4px 0 rgba(255, 255, 255, 0.2);
  color: #fff;
  font-family: "Arial Black", "Arial Bold", Arial, system-ui, sans-serif;
  font-size: clamp(12px, 1.6vw, 17px);
  cursor: pointer;
  white-space: nowrap;
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.4);
}
.aoe-row__buy img {
  height: clamp(15px, 1.9vw, 21px);
  width: auto;
}
.aoe-row__buy:hover:not(:disabled) { filter: brightness(1.1); }
.aoe-row__buy:active:not(:disabled) { transform: translateY(2px); }
/*
 * Unaffordable, not disabled-looking.
 *
 * A tier the player cannot yet afford is the thing they are working TOWARD,
 * so it stays readable and keeps its colour: crushing it to grey made the top
 * half of every ladder look broken rather than expensive.
 */
.aoe-row__buy:disabled { filter: saturate(0.55) brightness(0.82); cursor: not-allowed; }
.aoe-row__buy--worn { background-color: #ffd21f; }
.aoe-row__buy--wear { background-color: #3aa8ff; }

/* ---- Nameplates -----------------------------------------------------------
 * A small chip over every rider: portrait and name, Roblox-sized.
 * BELOW every piece of HUD in the stacking order (the popups are 19), so a
 * crowd of riders can never cover a figure the player needs to read. The
 * script writes only the transform; everything else lives here.
 */
.aoe-plates {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 18;
}
.aoe-plate {
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px 2px 2px;
  border-radius: 999px;
  background: rgba(14, 20, 32, 0.6);
  /* Scaled toward the head it hangs over, not away from it. */
  transform-origin: 50% 100%;
  white-space: nowrap;
  will-change: transform;
}
.aoe-plate[hidden] { display: none; }
.aoe-plate--bare { padding: 3px 10px; }
.aoe-plate__pfp {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.16);
  flex: none;
}
.aoe-plate__pfp[hidden] { display: none; }
.aoe-plate__name {
  font-family: system-ui, "Segoe UI", Roboto, sans-serif;
  font-weight: 700;
  font-size: 13px;
  line-height: 1.25;
  color: #ffffff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}
body.aoe-touch-mode .aoe-plate__name { font-size: 12px; }

/* ---- Speed-gain popups -------------------------------------------------- */
/*
 * Deliberately BELOW the HUD in the stacking order (the bar is 20, the rail 21,
 * the Wins counter 22). Popups are spawned inside a band that already misses
 * all three, and sitting under them means even a mis-tuned band can never
 * cover a figure the player needs to read.
 */
.aoe-pops {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 19;
}
.aoe-pop {
  --aoe-pop-tilt: 0deg;
  --aoe-pop-scale: 1;
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  opacity: 0;
  will-change: transform, opacity;
}
.aoe-pop[hidden] { display: none; }
.aoe-pop__icon {
  /* shoe.png is 415x410. Driving the HEIGHT and leaving the width automatic
   * is what keeps that ratio exact at every clamp step. */
  height: clamp(36px, 4.2vw, 60px);
  width: auto;
  filter: drop-shadow(0 3px 5px rgba(0, 0, 0, 0.45));
}
.aoe-pop__value {
  font-size: clamp(16px, 2vw, 29px);
  line-height: 1;
  /* "+6 Speed" is one reading; a popup near the right of its band must not
   * fold it into two lines. */
  white-space: nowrap;
  color: #fff;
  text-shadow:
    3px 0 0 var(--aoe-ink), -3px 0 0 var(--aoe-ink),
    0 3px 0 var(--aoe-ink), 0 -3px 0 var(--aoe-ink),
    2px 2px 0 var(--aoe-ink), -2px 2px 0 var(--aoe-ink),
    2px -2px 0 var(--aoe-ink), -2px -2px 0 var(--aoe-ink),
    0 4px 8px rgba(0, 0, 0, 0.5);
}
.aoe-pop--run { animation: aoe-pop-float 1150ms ease-out forwards; }
@keyframes aoe-pop-float {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) rotate(var(--aoe-pop-tilt))
      scale(calc(var(--aoe-pop-scale) * 0.6));
  }
  16% {
    opacity: 1;
    transform: translate(-50%, -54%) rotate(var(--aoe-pop-tilt))
      scale(calc(var(--aoe-pop-scale) * 1.1));
  }
  30% {
    opacity: 1;
    transform: translate(-50%, -62%) rotate(var(--aoe-pop-tilt))
      scale(var(--aoe-pop-scale));
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -125%) rotate(var(--aoe-pop-tilt))
      scale(var(--aoe-pop-scale));
  }
}

/* Touch controls own the bottom corners; the rail lifts clear of them. */
body.aoe-touch-mode .aoe-rail { --aoe-rail: 62px; }

@media (prefers-reduced-motion: reduce) {
  .aoe-tile, .aoe-wins--pop .aoe-wins__value { transition: none; animation: none; }
  /* The popup still has to appear and go away, so it fades in place rather
   * than not animating at all. */
  .aoe-pop--run { animation: aoe-pop-fade 1150ms ease-out forwards; }
  @keyframes aoe-pop-fade {
    0% { opacity: 0; transform: translate(-50%, -50%); }
    15%, 65% { opacity: 1; transform: translate(-50%, -50%); }
    100% { opacity: 0; transform: translate(-50%, -50%); }
  }
}

/* A narrow window has less room either side, so the band tightens with it. */
@media (max-width: 760px) {
  .aoe-pop__icon { height: clamp(30px, 6vw, 44px); }
  .aoe-pop__value { font-size: clamp(14px, 3vw, 22px); }
}

/* ---- A phone on its side ---------------------------------------------------
 * Short landscape is the one shape the rules above were not drawn for. The
 * rail is centred vertically, which on a 360px-tall screen parks the Sound tile
 * on top of the movement stick, and panels sized in vh ran off the bottom.
 * Everything here is scoped to that shape, so the desktop and portrait layouts
 * are exactly what they were. The notch is on a SIDE in landscape, which is why
 * the safe-area insets finally matter here.
 */
@media (orientation: landscape) and (max-height: 500px) {
  .aoe-wins { top: max(6px, env(safe-area-inset-top, 0px)); }
  .aoe-account {
    top: max(6px, env(safe-area-inset-top, 0px));
    right: max(8px, env(safe-area-inset-right, 0px));
  }

  .aoe-panel {
    padding:
      max(6px, env(safe-area-inset-top, 0px))
      max(8px, env(safe-area-inset-right, 0px))
      max(6px, env(safe-area-inset-bottom, 0px))
      max(8px, env(safe-area-inset-left, 0px));
  }
  .aoe-panel__box {
    width: min(560px, 86vw);
    max-height: calc(100vh - 12px);
    max-height: calc(100dvh - 12px);
    border-width: 4px;
    border-radius: 16px;
  }
  .aoe-panel__head { padding: 6px 12px; font-size: 17px; }
  .aoe-panel__close { width: 28px; height: 28px; font-size: 14px; border-radius: 9px; }
  .aoe-panel__body { padding: 10px 12px 12px; }

  /* The rail becomes a ROW across the top-left. A column, however small its
   * tiles, still runs down the left edge toward the stick on a screen this
   * short; a row is one tile tall and cannot reach it at any height.
   * Inside the Bloxity portal the portal draws its own logo and menu pill
   * over that same corner - on top of our page, where nothing in it can be
   * measured or clicked through - so the row drops below it there. */
  body.aoe-touch-mode .aoe-rail {
    --aoe-rail: clamp(40px, 12.5vh, 52px);
    flex-direction: row;
    top: calc(max(8px, env(safe-area-inset-top, 0px)) + var(--aoe-portal-top, 0px));
    left: max(10px, env(safe-area-inset-left, 0px));
    transform: none;
    gap: 12px;
  }
  body.aoe-touch-mode .aoe-tile { border-width: 3px; border-radius: 13px; }
  body.aoe-touch-mode .aoe-tile__label { font-size: 10px; bottom: -7px; }
  body.aoe-touch-mode .aoe-tile__badge {
    width: 18px;
    height: 18px;
    right: -6px;
    bottom: -6px;
    border-width: 2px;
    font-size: 11px;
    line-height: 14px;
  }
  body.aoe-touch-mode .aoe-account__name { max-width: 22vw; }
  /* The FPS readout shared the rail's corner; it moves under the row. */
  body.aoe-touch-mode .aoe-fps {
    top: calc(max(8px, env(safe-area-inset-top, 0px)) + var(--aoe-portal-top, 0px) + 66px);
  }
}


/* ---- The shop: three ladders behind one frame ---------------------------
 * A rail of ladder icons BESIDE the panel and the selected ladder's rows
 * inside it, exactly as the reference art lays it out. Only the visible page
 * is rendered to, so thirty rows across three ladders cost one page's worth
 * of writes.
 */
.aoe-panel__stage {
  display: flex;
  align-items: center;
  gap: clamp(8px, 1.6vw, 18px);
  max-width: 100%;
}
/*
 * On a narrow window a centred panel - and especially the shop's rail beside
 * it - reaches back under the HUD's own left rail. Widescreen has room for
 * both and the panel stays centred, as the reference frames it; below that the
 * whole stage is pushed clear by exactly the rail's own width, which is one
 * variable rather than a guess.
 */
@media (max-width: 1180px) {
  .aoe-panel { padding-left: calc(var(--aoe-rail) + 34px); }
}
.aoe-panel__aside {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: clamp(8px, 1.4vw, 16px);
}
.aoe-panel__aside:empty { display: none; }

.aoe-shop { display: flex; min-width: 0; }
.aoe-shop__rail {
  display: flex;
  flex-direction: column;
  gap: clamp(8px, 1.4vw, 16px);
}
/*
 * A tab is an ICON over a name, with no plate under it - the reference art's
 * rail is art floating on the backdrop, and a button chrome around each one
 * would make the rail compete with the panel it belongs to.
 */
.aoe-shop__tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  width: clamp(54px, 7vw, 76px);
  padding: 0;
  border: none;
  background: none;
  color: #fff;
  font-size: clamp(11px, 1.4vw, 15px);
  cursor: pointer;
  opacity: 0.72;
  transition: opacity 110ms ease-out, transform 110ms ease-out;
}
.aoe-shop__tab:hover { opacity: 1; }
.aoe-shop__tab--active { opacity: 1; transform: scale(1.06); }
.aoe-shop__tabicon {
  width: clamp(38px, 5vw, 58px);
  height: clamp(38px, 5vw, 58px);
  border: 4px solid var(--aoe-ink);
  border-radius: 14px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.45), inset 0 -4px 0 rgba(0, 0, 0, 0.2);
}
.aoe-shop__tab--active .aoe-shop__tabicon {
  box-shadow: 0 0 0 3px #ffd21f, 0 4px 8px rgba(0, 0, 0, 0.45);
}
.aoe-shop__tabname { line-height: 1.1; }
/* Each tab's swatch is its shop's own accent, which is also the colour of that
 * stall's awning in the world - so the tab and the stall are recognisably the
 * same shop rather than two things with the same name.
 *
 * The Relics tab carries the supplied backpack over its accent rather than
 * instead of it: the relics are the one ladder you CARRY, the backpack is art
 * this project was given, and an asset that ships in the build without being
 * drawn anywhere is eighty kilobytes bought for nothing. */
.aoe-shop__tabicon--trail {
  background:
    url('/ui/trail.png') center / 76% no-repeat,
    linear-gradient(140deg, #f25a9e, #ffb0d4);
}
.aoe-shop__tabicon--aura {
  background:
    url('/ui/aura.png') center / 70% no-repeat,
    linear-gradient(140deg, #3aa8ff, #c4e8ff);
}
.aoe-shop__tabicon--item {
  background:
    url('/ui/inventory.png') center / 72% no-repeat,
    linear-gradient(140deg, #f2a53a, #ffe066);
}
.aoe-shop__pages { flex: 1; min-width: 0; }
.aoe-row__price { white-space: nowrap; }

/* ---- The Evolve menu ----------------------------------------------------
 * Before and After side by side with an arrow between them, the level as one
 * brick gauge, the Wins requirement as a line of gold under it, and the pair
 * of buttons the reference art ends on.
 */
.aoe-evo {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: clamp(6px, 1.4vw, 16px);
  margin-bottom: 14px;
}
.aoe-evo__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.aoe-evo__head { font-size: clamp(14px, 2vw, 22px); }
.aoe-evo__art {
  width: clamp(76px, 11vw, 124px);
  height: clamp(76px, 11vw, 124px);
  border: 4px solid var(--aoe-ink);
  border-radius: 12px;
  display: grid;
  place-items: center;
  font-family: "Arial Black", Arial, sans-serif;
  font-size: 38px;
  color: rgba(255, 255, 255, 0.85);
  box-shadow: inset 0 0 0 3px rgba(255, 255, 255, 0.22), 0 5px 10px rgba(0, 0, 0, 0.4);
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.35);
}
.aoe-evo__name { font-size: clamp(14px, 2vw, 22px); }
/*
 * The multiplier pill: light blue with a dark frame, exactly as the reference
 * art badges it, with the running shoe standing in for the word "Speed" the
 * way it does everywhere else in this HUD.
 */
.aoe-evo__mult {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: clamp(11px, 1.5vw, 16px);
  color: #fff;
  background: linear-gradient(180deg, #6cc4f5 0%, #6cc4f5 48%, #4aa3dd 49%, #4aa3dd 100%);
  border: 4px solid var(--aoe-ink);
  border-radius: 10px;
  padding: 3px 10px;
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.4);
}
.aoe-evo__mult::after {
  content: '';
  width: clamp(12px, 1.6vw, 17px);
  height: clamp(12px, 1.6vw, 17px);
  background: url('/ui/shoe.png') center / contain no-repeat;
}
.aoe-evo__mult:empty { display: none; }
/*
 * The arrow is DRAWN, not typed. A glyph is whatever the platform's fallback
 * font decides it is, and the two machines this was checked on rendered the
 * same character at different weights and different baselines.
 */
.aoe-evo__arrow {
  width: clamp(22px, 3vw, 40px);
  height: clamp(18px, 2.4vw, 32px);
  background: #fff;
  filter: drop-shadow(2px 0 0 var(--aoe-ink)) drop-shadow(-2px 0 0 var(--aoe-ink))
    drop-shadow(0 2px 0 var(--aoe-ink)) drop-shadow(0 -2px 0 var(--aoe-ink));
  clip-path: polygon(0% 30%, 58% 30%, 58% 4%, 100% 50%, 58% 96%, 58% 70%, 0% 70%);
}
.aoe-evo__gauge { margin-bottom: 10px; }
.aoe-evo__wins {
  margin-bottom: 14px;
  text-align: center;
  font-size: clamp(13px, 1.9vw, 21px);
  color: #ffb02e;
  text-shadow:
    2px 0 0 var(--aoe-ink), -2px 0 0 var(--aoe-ink),
    0 2px 0 var(--aoe-ink), 0 -2px 0 var(--aoe-ink);
}
.aoe-evo__wins--done { color: #7ed957; }
.aoe-evo__buttons { margin-bottom: 12px; }
/* The whole chain as pips, so a player can see where they are on a fourteen
 * rung ladder rather than only the rung in front of them. */
.aoe-evo__chain {
  display: flex;
  gap: 4px;
  justify-content: center;
}
.aoe-evo__pip {
  width: 12px;
  height: 12px;
  border: 2px solid var(--aoe-ink);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.2);
}
.aoe-evo__pip--on { background: #7ed957; }
.aoe-evo__pip--now { background: #ffd21f; transform: scale(1.35); }

/* ---- The shop-stall prompt ---------------------------------------------
 * A real button, because on a phone this IS the control: there is no E key,
 * and a duplicate on-screen control would be a second thing to keep in step
 * with the same proximity test.
 */
.aoe-prompt {
  position: fixed;
  left: 50%;
  bottom: 22vh;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 16px;
  border: 4px solid var(--aoe-ink);
  border-radius: 16px;
  background: rgba(18, 24, 31, 0.86);
  color: #fff;
  font-size: 16px;
  cursor: pointer;
  z-index: 19;
}
/*
 * The rule above sets display:flex, which beats the user agent's own
 * [hidden] { display: none } - a class selector outranks an attribute one. So
 * without this line the prompt is on screen from the first frame of every
 * session, offering a shop a hundred units away. The panels avoid the same
 * trap only because their own default happens to be display:none.
 */
.aoe-prompt[hidden] { display: none; }
.aoe-prompt__key {
  display: grid;
  place-items: center;
  min-width: 30px;
  height: 30px;
  padding: 0 7px;
  border: 3px solid var(--aoe-ink);
  border-radius: 9px;
  background: linear-gradient(180deg, #ffd54a, #f0a91f);
  color: #2a1d02;
  font-size: 14px;
}
/*
 * The locked-treadmill notice: the same plate, in red, and NOT a button.
 *
 * Deliberately the same shape as the stall prompt so it reads as the same kind
 * of message, and deliberately a different colour so it is obvious at a glance
 * that this one is telling rather than offering. It sits a little higher, so a
 * player standing on a locked belt beside a trader sees both.
 */
.aoe-prompt--locked {
  bottom: 30vh;
  cursor: default;
  border-color: var(--aoe-ink);
  background: rgba(38, 14, 14, 0.9);
}
.aoe-prompt--locked .aoe-prompt__key--locked {
  background: linear-gradient(180deg, #ff6b6b, #d8232b);
  color: #fff;
}
@media (max-width: 720px) {
  .aoe-shop { flex-direction: column; }
  .aoe-shop__rail { flex-direction: row; }
  .aoe-shop__tab { flex: 1; width: auto; }
  .aoe-evo__art { width: 62px; height: 62px; font-size: 28px; }
  .aoe-prompt { bottom: 30vh; font-size: 14px; }
}
/* A phone on its side: the prompt would sit on the jump button at 22vh, so it
 * moves up into the band between the thumbs and the level bar. */
@media (orientation: landscape) and (max-height: 500px) {
  .aoe-prompt { bottom: 38vh; padding: 6px 12px; font-size: 13px; }
  .aoe-prompt__key { min-width: 24px; height: 24px; font-size: 12px; }
}

/*
 * The height of the portal's own overlay, as measured on a phone in landscape:
 * its logo and menu pill run from 7px to about 50px down the top-left corner.
 * Set only while embedded - standalone there is no overlay to clear.
 */
body.aoe-portal-embedded { --aoe-portal-top: 52px; }
`;
  document.head.appendChild(style);
};

/**
 * The HUD icons, as supplied in `assets/ui/`.
 *
 * Served straight from the repo-level assets folder through Vite's publicDir,
 * exactly as the player model is - so there is no duplicate copy inside the
 * client workspace. They are the artwork from the reference screenshots, which
 * is why they are images rather than the hand-drawn SVGs they replaced: a
 * traced approximation of a piece of art you already have is a worse version
 * of it.
 *
 * `alt` is deliberately empty - each one sits inside a control that already
 * carries its own accessible name.
 */
const icon = (file: string): string =>
  `<img class="aoe-icon" src="/ui/${file}" alt="" draggable="false">`;

/*
 * Everything the supplied art does not cover is DRAWN.
 *
 * `assets/ui/` ships seven images - a trophy, a backpack, a shop front, a
 * rebirth swirl, a running shoe, a trail ribbon and an aura flame - and every
 * one of them is used exactly as it is. Only the evolve chevron and the
 * speaker are inline SVG, because tracing an approximation of art nobody
 * supplied is how a build acquires files that each buy nothing.
 *
 * The trail and the aura were drawn by hand here for a while, which was worse
 * twice over: the approximations did not match the reference screenshots, and
 * the real art was being copied into the build by `publicDir` and never
 * referenced - seventy kilobytes shipped to every player to be ignored.
 *
 * SUPPLIED ART IS NEVER REGENERATED, and never has BOTH dimensions set in CSS
 * - drive one and leave the other automatic, so the real aspect ratio
 * survives.
 */
const SPEAKER =
  '<svg class="aoe-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="currentColor" d="M4 9h3.2L12 4.6v14.8L7.2 15H4z"/>' +
  '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
  'd="M15.6 8.6a4.6 4.6 0 0 1 0 6.8M18.4 5.8a8.4 8.4 0 0 1 0 12.4"/>' +
  '</svg>';

/** A chevron stack: the Evolve tile, matching the reference art's green icon. */
const EVOLVE =
  '<svg class="aoe-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" ' +
  'stroke-linejoin="round" d="M4 13.5 12 6l8 7.5M4 19l8-7.5 8 7.5"/>' +
  '</svg>';

export const ICONS = {
  trophy: icon('trophy.png'),
  shop: icon('shop.png'),
  inventory: icon('inventory.png'),
  rebirth: icon('rebirth.png'),
  trail: icon('trail.png'),
  aura: icon('aura.png'),
  evolve: EVOLVE,
  audio: SPEAKER,
} as const;
