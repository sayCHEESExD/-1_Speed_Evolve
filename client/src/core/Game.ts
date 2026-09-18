import {
  STARTER_MOUNT_SLOT,
  caveDepthAt,
  nextMount,
  qualifiesForMount,
  shopNear,
  type RespawnMessage,
  type ShopId,
  type StageAwardedMessage,
} from '@evolve/shared';
import { AudioManager } from '../audio/AudioManager.js';
import { Bloxity } from '../bloxity/Bloxity.js';
import { AvatarDresser } from '../bloxity/AvatarDresser.js';
import { identityFromLegion } from '../bloxity/identity.js';
import { Nameplates } from '../ui/Nameplates.js';
import { lookFromLegion } from '../bloxity/avatarLook.js';
import { PlayerAudio } from '../audio/PlayerAudio.js';
import { Vector3 } from 'three';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';
import { clientConfig } from '../config/clientConfig.js';
import { InputManager } from '../input/InputManager.js';
import { NetworkClient } from '../net/NetworkClient.js';
import type { ConnectionStatus, NetPlayerState } from '../net/netTypes.js';
import { LocalPlayer } from '../player/LocalPlayer.js';
import { playerModelLoader, type PlayerModelReport } from '../player/PlayerModelLoader.js';
import { RemotePlayerManager } from '../player/RemotePlayerManager.js';
import { RunController } from '../progression/RunController.js';
import { RendererManager } from '../rendering/RendererManager.js';
import { SceneManager } from '../rendering/SceneManager.js';
import { Panel, anyPanelOpen } from '../ui/Panel.js';
import { RailButton } from '../ui/RailButton.js';
import { RebirthPanel } from '../ui/RebirthPanel.js';
import { SpeedHud } from '../ui/SpeedHud.js';
import { SpeedPopups } from '../ui/SpeedPopups.js';
import { ShopPanel } from '../ui/ShopPanel.js';
import { EvolvePanel } from '../ui/EvolvePanel.js';
import { InteractPrompt } from '../ui/InteractPrompt.js';
import { BloxityPanel } from '../ui/BloxityPanel.js';
import { WinFlight } from '../ui/WinFlight.js';
import { TreadmillNotice } from '../ui/TreadmillNotice.js';
import { WinsCounter } from '../ui/WinsCounter.js';
import { ICONS, injectHudStyles } from '../ui/hudStyles.js';
import { logger } from '../util/logger.js';
import { CourseWorld } from '../world/CourseWorld.js';

const SCOPE = 'Game';

/**
 * Which shortcut a key event means, or '' for none.
 *
 * Reads `code` FIRST and falls back to `key`, and that fallback is the whole
 * point of this function. `code` is the physical key and is the right thing to
 * bind to, but it is not always populated: on-screen keyboards, remote-input
 * and automation paths, and some IME states all deliver a perfectly ordinary
 * keystroke with `code` set to the empty string. Matching on `code` alone
 * meant those keystrokes silently did nothing - the shortcuts looked
 * implemented and were not, which is exactly how they shipped broken.
 *
 * Returns a lower-case name so the two sources collapse to one value and the
 * caller has a single thing to switch on.
 */
const shortcutOf = (event: KeyboardEvent): string => {
  const code = event.code;
  if (code.startsWith('Key') && code.length === 4) return code.slice(3).toLowerCase();
  if (code) return code.toLowerCase();
  // No physical code. The typed character is what is left, and for these
  // shortcuts - single letters and Escape - it says the same thing.
  return (event.key || '').toLowerCase();
};

/**
 * True if the keystroke belongs to a field the player is typing in.
 *
 * Covers every element that takes text, not just `<input>`: a shortcut that
 * fired while someone typed in a textarea would be just as wrong.
 */
const isTyping = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

/** Scratch for projecting the mount to the screen. One award allocates nothing. */
const WIN_FLIGHT_ORIGIN = new Vector3();

/**
 * Composition root.
 *
 * Owns every subsystem and defines the per-frame update order, and holds no
 * gameplay rules of its own. The order below is the only thing here that
 * matters, and it is deliberate: input, then prediction, then triggers, then
 * the camera, then the network, then the render.
 */
export class Game {
  private readonly renderer: RendererManager;
  private readonly sceneManager = new SceneManager();
  private readonly camera = new ThirdPersonCamera();
  private readonly input = new InputManager();
  private readonly remotePlayers: RemotePlayerManager;
  private readonly hud: SpeedHud;
  private readonly pops: SpeedPopups;
  private readonly wins: WinsCounter;
  private readonly treadmillNotice: TreadmillNotice;
  private readonly winFlight: WinFlight;
  /** Name chips over every rider, positioned after each render. */
  private readonly nameplates: Nameplates;
  private readonly rail: HTMLDivElement;
  private readonly evolveButton: RailButton;
  private readonly rebirthButton: RailButton;
  private readonly shopButton: RailButton;
  private readonly audioButton: RailButton;
  private readonly audio = new AudioManager();
  private readonly bloxity: Bloxity;
  private readonly bloxityPanel: BloxityPanel;
  private readonly fpsReadout: HTMLDivElement;
  /** Cosmetics on the local rider. Built once the model exists. */
  private dresser: AvatarDresser | null = null;
  /** Latest equipped/proportions, held until the rider is built. */
  private pendingAvatar: (() => void) | null = null;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private readonly playerAudio: PlayerAudio;
  private readonly rebirthPanel: RebirthPanel;
  private readonly shopPanel: ShopPanel;
  private readonly evolvePanel: EvolvePanel;
  /** The "E to Interact" chip beside a stall. Proximity only; it decides nothing. */
  private readonly prompt: InteractPrompt;
  private readonly network: NetworkClient;
  private readonly world = new CourseWorld();
  private readonly run: RunController;

  private localPlayer: LocalPlayer | null = null;
  private localSessionId: string | null = null;

  /** Replicated figures the audio reacts to, so it reacts to CHANGES. */
  private lastLevel = -1;
  private lastRebirths = -1;
  private modelReport: PlayerModelReport | null = null;

  /**
   * The client's estimate of the server's clock.
   *
   * Advanced by the frame delta and re-based whenever a fresher `elapsed`
   * arrives. Freezing it between patches would make the sinking platforms and
   * the rolling balls stutter at the patch rate rather than run smoothly.
   */
  private worldTime = 0;
  private lastServerTime = -1;

  /** Authoritative respawn waiting for the death animation to finish. */
  private pendingRespawn: RespawnMessage | null = null;

  /** Last replicated unlocked-mount mask, so the fanfare fires on the edge. */
  private lastUnlockedMounts = -1;

  /** The local player's name and portrait AS THE SERVER REPLICATED THEM. */
  private localName = '';
  private localPfp = '';
  /** The identity last sent, so an unchanged login event sends nothing. */
  private lastIdentity = '';

  constructor(container: HTMLElement) {
    injectHudStyles();
    this.renderer = new RendererManager(container);
    this.remotePlayers = new RemotePlayerManager(this.sceneManager.scene);
    this.hud = new SpeedHud(container);
    this.pops = new SpeedPopups(container);
    this.winFlight = new WinFlight(container);
    this.nameplates = new Nameplates(container);
    this.treadmillNotice = new TreadmillNotice(container);

    // The left rail: a TWO-COLUMN grid, as the reference art arranges it, so
    // a fifth and sixth tile fill the next row rather than lengthening a
    // column that already reaches the bottom of a phone screen.
    this.rail = document.createElement('div');
    this.rail.className = 'aoe-rail';
    container.appendChild(this.rail);

    this.rebirthPanel = new RebirthPanel(container, () => this.network.requestRebirth());
    this.evolvePanel = new EvolvePanel(container);
    // ONE shop panel for all three ladders. Which stall the player used picks
    // the tab; the buy and equip calls are routed by shop id, so there is one
    // set of handlers rather than three near-identical ones.
    this.shopPanel = new ShopPanel(container, {
      buy: (shop, slot) => {
        if (shop === 'trail') this.network.buyTrail(slot);
        else if (shop === 'aura') this.network.buyAura(slot);
        else this.network.buyItem(slot);
      },
      equip: (shop, slot) => {
        if (shop === 'trail') this.network.equipTrail(slot);
        else if (shop === 'aura') this.network.equipAura(slot);
        else this.network.equipItem(slot);
      },
    });

    // Tapping the prompt is the touch equivalent of pressing E, and it runs
    // the SAME opener - so a phone and a desktop cannot end up opening
    // different shops from the same stall.
    this.prompt = new InteractPrompt(container, (shop) => this.openShop(shop.id));

    this.evolveButton = new RailButton(this.rail, {
      variant: 'evolve',
      label: 'Evolve',
      icon: ICONS.evolve,
      hotkey: 'V',
      onClick: () => this.openOnly(this.evolvePanel),
    });
    this.rebirthButton = new RailButton(this.rail, {
      variant: 'rebirth',
      label: 'Rebirth',
      icon: ICONS.rebirth,
      hotkey: 'R',
      onClick: () => this.openOnly(this.rebirthPanel),
    });
    this.shopButton = new RailButton(this.rail, {
      variant: 'trail',
      label: 'Shop',
      icon: ICONS.shop,
      hotkey: 'T',
      onClick: () => this.openOnly(this.shopPanel),
    });
    this.audioButton = new RailButton(this.rail, {
      variant: 'audio',
      label: 'Sound',
      icon: ICONS.audio,
      hotkey: 'M',
      onClick: () => {
        // The ONE place muting happens, whether it was a click or the M key.
        const muted = this.audio.toggleMuted();
        this.audioButton.root.classList.toggle('aoe-tile--off', muted);
      },
    });

    // The lifetime tallies go INSIDE the rail, as its last row - so they sit
    // under the tiles whatever the tile count is, which a separately
    // positioned block could only manage by hard-coding today's. Built AFTER
    // the tiles for the same reason: the rail is a grid in document order.
    this.wins = new WinsCounter(this.rail);

    this.playerAudio = new PlayerAudio(this.audio);

    /*
     * The portal bridge.
     *
     * Everything Bloxity can change about this game arrives through the host
     * object below, and nothing else in the codebase imports the SDK. The
     * renderer, the audio and the input layer are handed plain values and
     * never learn that a portal exists - which is what makes the whole
     * integration removable, and what keeps it working when the SDK script
     * simply is not there.
     */
    this.bloxity = new Bloxity({
      setMasterVolume: (level) => this.audio.setMasterVolume(level),
      setMusicVolume: (level) => this.audio.setMusicVolume(level),
      setGraphicsQuality: (level) => this.renderer.setQuality(level),
      setShowFps: (show) => {
        this.fpsReadout.hidden = !show;
      },
      setCameraSensitivity: (scale) => this.input.look.setSensitivityScale(scale),
      // The portal asks; the SERVER still decides where anyone is placed.
      respawn: () => this.network.requestRespawn(),
      pointerLockChanged: (locked) => this.input.look.setCursorFree(!locked),
      avatarChanged: (equipped, proportions) => {
        const look = lookFromLegion(equipped, proportions);
        // Everyone else has to see it too, so it goes on the wire as well as
        // onto the local rider. Sanitising is the SERVER's job; this sends
        // what the portal reported.
        this.network.sendAvatar(look);
        // A guest's portrait IS a render of their avatar, so it moves with it.
        this.syncIdentity();

        const apply = (): void => this.dresser?.setLook(look.appearance, look.proportions);
        // The avatar can arrive before the bundled model has finished loading.
        if (this.dresser) apply();
        else this.pendingAvatar = apply;
      },
    });

    this.fpsReadout = document.createElement('div');
    this.fpsReadout.className = 'aoe-fps aoe-font';
    this.fpsReadout.hidden = true;
    container.appendChild(this.fpsReadout);

    this.bloxityPanel = new BloxityPanel(container, this.bloxity);

    /*
     * There is no on-screen hint line any more.
     *
     * It existed to tell a desktop player that the rail was clickable and
     * which keys opened what. The tiles now carry their own key caps, so the
     * line was saying a second time what the buttons already say - and it was
     * the last piece of keyboard text that showed on a phone.
     */

    window.addEventListener('keydown', this.onHotkey);
    // Audio can only start on a real gesture, and no single one of them is
    // guaranteed to be the one the browser accepts - so every gesture asks,
    // and `resume` is written to be safe to call repeatedly.
    window.addEventListener('keydown', this.onGesture);
    window.addEventListener('mousedown', this.onGesture);
    window.addEventListener('touchstart', this.onGesture, { passive: true });

    this.renderer.onResize((width, height) => {
      this.camera.setViewport(width, height);
      this.nameplates.setViewport(width, height);
    });

    this.network = new NetworkClient({
      onStatusChange: (status) => this.onStatusChange(status),
      onSelfJoined: (sessionId) => {
        this.localSessionId = sessionId;
        // The room a friend would be invited INTO. Published as soon as it is
        // joinable, which is what makes an invite land beside the player
        // rather than merely in the game.
        const roomId = this.network.roomId;
        this.bloxity.updateRoom(roomId);
        this.bloxityPanel.setRoom(roomId);
      },
      onPlayerAdded: (sessionId, player) => this.onPlayerAdded(sessionId, player),
      onPlayerChanged: (sessionId, player) => this.onPlayerChanged(sessionId, player),
      onPlayerRemoved: (sessionId) => this.remotePlayers.remove(sessionId),
      onRespawn: (message) => {
        // The server's authoritative respawn. HELD rather than applied at once:
        // the client is usually mid-animation, and the whole point of the death
        // transition is that nothing moves the mount until it ends.
        // `acknowledgeRespawn` lifts the reconciliation barrier here, because
        // every patch the server sends after this message is post-respawn.
        this.pendingRespawn = message;
        this.localPlayer?.acknowledgeRespawn();
        this.applyPendingRespawn();
      },
      onStageAwarded: (message) => this.onStageAwarded(message),
      // The ONLY source of the "+N" popups: what the server says it paid.
      onSpeedAwarded: (message) => this.pops.award(message.steps, message.perStep),
    });

    // The room needs to know which Bloxity account this is, or a purchase
    // fulfilled by webhook has no profile to land in.
    this.network.setIdentityProvider(() => this.bloxity.getUser()?._id ?? null);
    // Asked for at JOIN time rather than pushed after it, so the room has this
    // player's appearance in the very first patch everyone else receives.
    this.network.setLookProvider(() =>
      lookFromLegion(this.bloxity.getEquipped(), this.bloxity.getProportions()),
    );
    // The public half of the identity - a name and a portrait - asked for at
    // JOIN time for the same reason the look is.
    this.network.setProfileProvider(() => identityFromLegion(this.bloxity.getUser()));
    // A login or a logout mid-session re-labels the player for everyone. The
    // server re-derives the fallback handle on a sign-out.
    this.bloxity.onUserChanged(() => this.syncIdentity());

    this.run = new RunController(this.world.collision, {
      claimStage: (index) => {
        // Flush the pending input first: the server validates the claim against
        // the last position it has SIMULATED, so the movement that carried the
        // player onto the pad must be consumed before the request arrives.
        this.flushInput();
        this.network.claimStage(index);
      },
      claimUpgrade: (slot) => {
        this.flushInput();
        this.network.claimUpgrade(slot);
      },
    });
  }

  /**
   * Keys that open the menus.
   *
   * Point 12's other half: a panel that can only be reached by clicking a
   * button the cursor cannot reach is not reachable, so there is a key for
   * each one as well. Ignored while the player is typing, and ignored with a
   * modifier held, so browser shortcuts still work.
   */
  private readonly onHotkey = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.repeat) return;
    if (isTyping(event.target)) return;

    /*
     * A key PRESSES THE BUTTON. It does not do the same thing as the button.
     *
     * `RailButton.press()` dispatches the tile's own click, so the key path and
     * the mouse path run one handler between them - and a key can never drift
     * into doing almost-but-not-quite what the tile it stands for does. The
     * mute key used to toggle the audio itself and repaint the tile by hand,
     * which is two copies of one action waiting to disagree.
     */
    switch (shortcutOf(event)) {
      case 'r':
        this.rebirthButton.press();
        break;
      case 't':
        this.shopButton.press();
        break;
      case 'v':
        this.evolveButton.press();
        break;
      case 'e':
        // The stall prompt. Only ever acts on a stall that is actually in
        // range, so E anywhere else in the world does nothing at all.
        if (this.prompt.target) this.openShop(this.prompt.target.id);
        break;
      case 'm':
        this.audioButton.press();
        break;
      case 'escape':
        // The browser releases the lock on Escape whatever the page wants, so
        // this only closes whatever was open - `MouseLook` handles the cursor.
        for (const panel of this.panels) panel.setOpen(false);
        this.input.look.setCursorFree(true);
        // And hand ESC to the portal, which owns the pause menu when the game
        // is embedded. Standalone this is a no-op.
        this.bloxity.showPortalMenu(true);
        break;
      default:
        break;
    }
  };

  /**
   * The frame counter behind the portal's `show_fps` setting.
   *
   * Averaged over half a second rather than shown per frame: a number that
   * changes sixty times a second is a number nobody can read, and the point of
   * the readout is to be readable.
   */
  private tickFps(delta: number): void {
    if (this.fpsReadout.hidden) return;
    this.fpsAccum += delta;
    this.fpsFrames += 1;
    if (this.fpsAccum < 0.5) return;
    const fps = Math.round(this.fpsFrames / this.fpsAccum);
    this.fpsReadout.textContent = `${fps} FPS`;
    this.fpsAccum = 0;
    this.fpsFrames = 0;
  }

  /** Any real gesture is permission to start audio. */
  private readonly onGesture = (): void => {
    this.audio.resume();
  };

  /**
   * Every modal, in one list.
   *
   * A getter rather than a stored array so it cannot fall out of step with the
   * fields: a panel added to the class and forgotten here would be one Escape
   * could not close and one that two-modals-deep could stack under.
   */
  private get panels(): readonly Panel[] {
    return [this.rebirthPanel, this.shopPanel, this.evolvePanel];
  }

  /**
   * Open a stall's shop, with its own tab in front.
   *
   * The ONE opener, shared by the E key and by tapping the prompt, so the two
   * input paths cannot open different shops from the same stall.
   */
  private openShop(shop: ShopId): void {
    for (const other of this.panels) {
      if (other !== this.shopPanel) other.setOpen(false);
    }
    this.shopPanel.openAt(shop);
    this.input.look.setCursorFree(true);
  }

  /**
   * Open one panel and close the others.
   *
   * Two modals over each other is a state with no way back to the game, and
   * the rail makes it one click away.
   */
  private openOnly(panel: Panel): void {
    for (const other of this.panels) {
      if (other !== panel) other.setOpen(false);
    }
    panel.toggle();
  }

  /**
   * Bring the portal up.
   *
   * Called before anything else loads, because the loading REPORT is one of
   * the things it provides: a portal that learned about this game only once
   * the game had finished loading would have nothing to show while it did.
   */
  startBloxity(): void {
    this.bloxity.start();
    // Inside the portal, its logo and menu pill are drawn over our top-left
    // corner from the parent page. The stylesheet keeps the HUD clear of it,
    // but only while this is true - standalone there is nothing there.
    document.body.classList.toggle('aoe-portal-embedded', this.bloxity.embedded);
  }

  /** Progress, for the portal's loading screen. */
  loadingStep(text: string): void {
    this.bloxity.loadingStep(text);
  }

  /** Load assets and build the world. Networking is started separately. */
  async initialise(): Promise<PlayerModelReport> {
    this.world.addTo(this.sceneManager.scene);

    this.modelReport = await playerModelLoader.load();

    this.localPlayer = new LocalPlayer(this.world.collision, STARTER_MOUNT_SLOT);

    // The local rider's appearance. Remote riders are dressed by the same
    // class from their replicated look, so both sides of the wire build a
    // player out of exactly one code path.
    this.dresser = new AvatarDresser(this.localPlayer.mount);
    // Anything that arrived while the bundled model was still loading.
    this.pendingAvatar?.();
    this.pendingAvatar = null;

    this.sceneManager.scene.add(this.localPlayer.mount.root);
    // The trail lives in world space, so it is added beside the mount.
    this.sceneManager.scene.add(this.localPlayer.mount.worldRoot);
    this.camera.snapTo(this.localPlayer.position);

    logger.info(SCOPE, 'world ready');
    return this.modelReport;
  }

  /** Join the Colyseus room. Rendering continues even if this fails. */
  async connect(): Promise<void> {
    await this.network.connect();
  }

  start(): void {
    this.input.attach(this.renderer.renderer.domElement);
    // The loading screen comes down and the session begins. Both are the
    // portal's to draw; this only says when.
    this.bloxity.loadingEnd();
    this.bloxity.gameplayStart();
  }

  stop(): void {
    this.input.detach();
    this.bloxity.gameplayEnd();
    // Out of the room, so a friend is not invited into a game nobody is in.
    this.bloxity.updateRoom('');
    void this.network.disconnect();
  }

  /** One simulation and render step. Called by GameLoop. */
  update(delta: number, _now: number): void {
    // A panel owns the input while it is up; closing it hands control straight
    // back on the next frame.
    this.input.setSuppressed(anyPanelOpen());
    const input = this.input.sample();
    const player = this.localPlayer;

    // The MOUSE aims the camera, and the camera defines forward. Nothing the
    // player presses rotates the view.
    this.camera.setOrbit(this.input.look.yaw, this.input.look.pitch);
    this.camera.setZoom(this.input.look.zoom);

    // The world clock, advanced locally between patches. Sinking platforms and
    // rolling balls are pure functions of it on BOTH sides, so the client has
    // to keep its own estimate rather than freezing between server updates.
    this.worldTime =
      this.network.elapsed > this.lastServerTime
        ? this.network.elapsed
        : this.worldTime + delta;
    this.lastServerTime = this.network.elapsed;
    const elapsed = this.worldTime;

    // Every guardian the room replicates, matched to its renderer by INDEX.
    // Both lists are sized from the same course data, so a third guardian in a
    // stage needs no change on either side.
    const guardians = this.network.guardians;
    for (let i = 0; i < guardians.length; i += 1) {
      const beast = guardians[i];
      if (!beast) continue;
      this.world.guardians.apply(
        i,
        beast.x,
        beast.y,
        beast.z,
        beast.rotationY,
        beast.charging,
      );
    }

    if (player) {
      player.setWorldTime(elapsed);
      // Camera-relative movement: forward is whichever way the camera faces.
      // The animal's own facing then follows where it actually moves, which
      // the shared simulation does identically on both sides.
      player.update(delta, input, this.input.look.yaw);

      // Triggers are sampled after the mount has moved, so a finish pad or a
      // hazard is detected at the position actually reached this frame.
      this.run.update(delta, player, elapsed);

      // The death animation has run its course; place the player, preferring
      // the server's own transform when it has already arrived.
      if (player.deathComplete) this.applyPendingRespawn();

      // Still not placed. The prediction and the server disagreed about the
      // death, so ASK for a placement rather than sit frozen waiting for one
      // that was never coming. The server answers this the same way it answers
      // any other death - by putting the player at the spawn.
      if (player.consumeRespawnNudge()) {
        logger.warn(SCOPE, 'death was not acknowledged; requesting a respawn');
        this.network.requestRespawn();
      }

      // The stall prompt. A proximity test against the SAME shared function
      // the world places the stalls with, so a prompt can never appear beside
      // a counter that is not there. `show` compares before it writes, so a
      // player parked at a counter touches the DOM not at all.
      this.prompt.show(
        anyPanelOpen() ? null : shopNear(player.position.x, player.position.z),
      );

      // And the locked-belt notice. `lockedTreadmill` is non-zero only while
      // the mount is standing on a machine the simulation has refused to run,
      // so this is the one state where the player is owed an explanation.
      this.treadmillNotice.show(anyPanelOpen() ? 0 : player.lockedTreadmill);

      // The mount's own height, so a dragon is framed the way a cockroach is.
      // Handed over every frame rather than on an evolution event: it is one
      // number and a comparison, and it cannot then be missed.
      this.camera.setSubjectHeight(player.mount.height);

      // How far underground the player is. Course data drives the lighting, so
      // the tunnel that darkens is exactly the tunnel the route declared.
      this.sceneManager.setCaveDepth(caveDepthAt(player.position.z), delta);

      this.snapCameraIfPlaced();
      this.camera.setTarget(player.position);
      this.sceneManager.followShadow(
        player.position.x,
        player.position.y,
        player.position.z,
      );
      this.flushInput();
    }

    this.tickFps(delta);
    if (player) this.playerAudio.update(delta, player);
    // The boards redraw only when the standings actually move, so handing them
    // the snapshot every frame costs a string compare.
    this.world.scoreboard.update(this.network.leaderboard);
    this.pops.update(delta);
    this.world.update(delta, elapsed);
    this.remotePlayers.advance(delta);
    this.camera.update(delta, player?.horizontalSpeed ?? 0);

    this.renderer.renderer.render(this.sceneManager.scene, this.camera.camera);
    // After the render, from the matrices it just computed - see Nameplates.
    this.updateNameplates();
  }

  /**
   * Hand every simulated input to the network.
   *
   * Every one must be sent: the server advances only by the inputs it
   * receives, so a dropped input is authoritative movement that never happens.
   */
  private flushInput(): void {
    const player = this.localPlayer;
    if (!player) return;
    for (const message of player.drainOutgoing()) this.network.sendInput(message);
  }

  /**
   * Apply the server's respawn, once the death animation has finished.
   *
   * Held until then on purpose: applying it mid-animation would teleport the
   * mount away from the fall the player is watching.
   */
  private applyPendingRespawn(): void {
    const player = this.localPlayer;
    const message = this.pendingRespawn;
    if (!player || !message) return;
    if (player.isDying && !player.deathComplete) return;

    this.pendingRespawn = null;
    player.teleport(message.x, message.y, message.z, message.rotationY);
  }

  /** Arrive rather than ease whenever the player was PLACED, not moved. */
  private snapCameraIfPlaced(): void {
    const player = this.localPlayer;
    if (!player) return;
    const placement = player.consumePlacement();
    if (placement === 'none') return;
    // Only a respawn is allowed to be seen. A network correction must arrive
    // invisibly, or ordinary packet loss would fire the dolly.
    this.camera.snapTo(player.position, placement === 'respawn');
  }

  /** Send the portal identity if it differs from what was last sent. */
  private syncIdentity(): void {
    const identity = identityFromLegion(this.bloxity.getUser());
    const key = `${identity.name}
${identity.pfp}`;
    if (key === this.lastIdentity) return;
    this.lastIdentity = key;
    this.network.sendIdentity(identity);
  }

  /** Every rider's plate, local included, from replicated names only. */
  private updateNameplates(): void {
    const plates = this.nameplates;
    plates.begin(this.camera.camera);
    const player = this.localPlayer;
    if (player && this.localName) {
      plates.put('local', player.mount, this.localName, this.localPfp);
    }
    for (const [sessionId, remote] of this.remotePlayers.entries()) {
      if (remote.displayName) plates.put(sessionId, remote.mount, remote.displayName, remote.pfp);
    }
    plates.end();
  }

  private onPlayerAdded(sessionId: string, state: NetPlayerState): void {
    if (sessionId === this.localSessionId) {
      this.applyLocalState(state);
      return;
    }
    this.remotePlayers.add(sessionId, state);
    // The portal draws the "your friend just joined" toast, matching the name
    // it is handed against the friends list - so it needs the player's Bloxity
    // name, which the room now replicates. A signed-out player's derived handle
    // simply matches nobody, which is the correct outcome.
    const name = state.displayName || sessionId;
    this.bloxity.playerJoined(name);
    this.bloxity.playerInRoom(name);
  }

  private onPlayerChanged(sessionId: string, state: NetPlayerState): void {
    if (sessionId === this.localSessionId) {
      this.applyLocalState(state);
      return;
    }
    this.remotePlayers.update(sessionId, state);
  }

  /**
   * Everything the server says about the local player.
   *
   * The client reconciles its prediction against the transform, adopts the
   * authoritative movement profile, shows the animal it is told to show and
   * renders the progression it is told to render. It derives none of it.
   */
  private applyLocalState(state: NetPlayerState): void {
    const player = this.localPlayer;
    if (!player) return;

    player.setMovementProfile(state.moveMultiplier, state.jumpVelocity);
    // The prediction needs the rebirth count to know whether the belt under
    // the mount is running, so a locked treadmill never briefly appears to.
    player.setRebirths(state.rebirths);
    player.setMountSlot(state.mountSlot);

    if (state.ready) {
      player.reconcile({
        x: state.x,
        y: state.y,
        z: state.z,
        rotationY: state.rotationY,
        velocityX: state.velocityX,
        velocityY: state.velocityY,
        velocityZ: state.velocityZ,
        grounded: state.grounded,
        jumpCount: state.jumpCount,
        lastInputSeq: state.lastInputSeq,
        jumpLatched: state.jumpLatched,
        coyote: state.coyote,
      });
    }

    player.setTrailSlot(state.trailSlot);
    player.setAuraSlot(state.auraSlot);
    // The server's version, sanitised and with the fallback applied, so the
    // local plate says exactly what everyone else's screen says.
    this.localName = state.displayName ?? '';
    this.localPfp = state.pfp ?? '';

    // The multiplier is REPLICATED, not recomputed: it is the product of five
    // separate ladders, and a HUD that assembled its own copy would be a
    // second place for one of them to be applied twice.
    this.hud.update(state.totalSpeed, state.maxLevel, state.totalMultiplier);
    this.wins.update(state.wins, state.rebirths);
    this.run.setInventory(state.wins, state.upgradeSlot);

    // The rail mirrors replicated state and decides nothing. A tile is "ready"
    // when the server would accept the request behind it right now.
    // Milestone sounds fire on the CHANGE, never on the value: a level is
    // re-sent on every patch, and playing on the level would be a fanfare
    // twenty times a second for as long as the player stayed at it.
    if (this.lastLevel >= 0 && state.level > this.lastLevel) this.audio.play('level');
    if (this.lastRebirths >= 0 && state.rebirths > this.lastRebirths) {
      this.audio.play('rebirth');
    }
    this.lastLevel = state.level;
    this.lastRebirths = state.rebirths;

    this.rebirthPanel.setProgress(state.level, state.rebirths);
    this.rebirthButton.setState(this.rebirthPanel.isEligible, !this.rebirthPanel.isEligible);

    this.shopPanel.setInventory(
      state.wins,
      { owned: state.ownedTrails, equipped: state.trailSlot },
      { owned: state.ownedAuras, equipped: state.auraSlot },
      { owned: state.ownedItems, equipped: state.itemSlot },
    );
    this.shopButton.setState(this.shopPanel.hasAffordable);

    this.evolvePanel.setState(
      state.level,
      state.wins,
      state.mountSlot,
      state.unlockedMounts,
    );
    // The tile lights when the NEXT mount is within reach, which is the same
    // predicate the server evolves on - so a lit tile is always a mount that
    // is about to arrive rather than one that merely might.
    const upcoming = nextMount(state.mountSlot);
    this.evolveButton.setState(
      upcoming !== null && qualifiesForMount(upcoming.slot, state.level, state.wins),
    );

    // The pads relight from the wallet, and the belts from the rebirth count.
    this.world.pads.setState(state.wins, state.upgradeSlot);
    this.world.training.setRebirths(state.rebirths);

    if (state.unlockedMounts !== this.lastUnlockedMounts) {
      // Not on the FIRST reading: a returning player's whole unlocked chain
      // arrives in their first patch, and a fanfare on join would celebrate
      // an evolution that happened days ago.
      if (this.lastUnlockedMounts !== 0) this.audio.play('claim');
      this.lastUnlockedMounts = state.unlockedMounts;
    }
  }

  private onStageAwarded(message: StageAwardedMessage): void {
    // The counter pops from the replicated total on the next patch anyway;
    // applying it here means the reward lands on the frame it was earned
    // rather than up to a patch later.
    // Trophies first, then the figure. They are launched from where the mount
    // actually is on screen, projected once here rather than tracked per
    // frame - the flight is half a second and the player does not move during
    // it, because banking a stage has already returned them to the arena.
    this.launchWinFlight();
    this.wins.update(message.total, Math.max(0, this.lastRebirths));
    this.audio.play('win');
    logger.info(SCOPE, `stage ${message.stageIndex} banked: +${message.wins} wins`);
  }

  /**
   * Project the mount to the screen and send the trophies from there.
   *
   * Falls back to the middle of the screen if there is no player yet, so the
   * effect can never be the thing that throws during an award.
   */
  private launchWinFlight(): void {
    const canvas = this.renderer.renderer.domElement;
    const box = canvas.getBoundingClientRect();
    let x = box.left + box.width / 2;
    let y = box.top + box.height / 2;

    const player = this.localPlayer;
    if (player) {
      WIN_FLIGHT_ORIGIN.copy(player.position);
      WIN_FLIGHT_ORIGIN.y += 2;
      WIN_FLIGHT_ORIGIN.project(this.camera.camera);
      // Behind the camera projects to a mirrored point in front of it, which
      // would fling the trophies off the wrong edge.
      if (WIN_FLIGHT_ORIGIN.z < 1) {
        x = box.left + ((WIN_FLIGHT_ORIGIN.x + 1) / 2) * box.width;
        y = box.top + ((1 - WIN_FLIGHT_ORIGIN.y) / 2) * box.height;
      }
    }

    this.winFlight.play(x, y);
  }

  private onStatusChange(status: ConnectionStatus): void {
    if (clientConfig.debug) logger.info(SCOPE, `connection: ${status}`);
  }

  dispose(): void {
    this.stop();
    this.hud.dispose();
    this.pops.dispose();
    this.wins.dispose();
    this.winFlight.dispose();
    window.removeEventListener('keydown', this.onHotkey);
    window.removeEventListener('keydown', this.onGesture);
    window.removeEventListener('mousedown', this.onGesture);
    window.removeEventListener('touchstart', this.onGesture);
    this.bloxity.dispose();
    this.bloxityPanel.dispose();
    this.dresser?.dispose();
    this.nameplates.dispose();
    this.fpsReadout.remove();
    this.audio.dispose();
    this.evolveButton.dispose();
    this.rebirthButton.dispose();
    this.shopButton.dispose();
    this.audioButton.dispose();
    this.rebirthPanel.dispose();
    this.shopPanel.dispose();
    this.evolvePanel.dispose();
    this.prompt.dispose();
    this.treadmillNotice.dispose();
    this.rail.remove();
    this.remotePlayers.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }
}
