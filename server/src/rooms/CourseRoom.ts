import { Client, Room, ServerError } from '@colyseus/core';
import {
  MountAnimationState,
  MAX_PLAYERS_PER_ROOM,
  MessageType,
  SPAWN_POSITION,
  SPAWN_ROTATION_Y,
  createMotion,
  type BuyAuraMessage,
  type BuyItemMessage,
  type BuyTrailMessage,
  type ClaimStageMessage,
  type ClaimUpgradeMessage,
  type EquipAuraMessage,
  type EquipItemMessage,
  type EquipTrailMessage,
  type EvolvedMessage,
  type MoveMessage,
  type PlayerMotion,
  type RespawnMessage,
  type RespawnReason,
  type SpeedAwardedMessage,
  type StageAwardedMessage,
  sanitizeAppearance,
  sanitizeProportions,
  type SetAvatarMessage,
} from '@evolve/shared';
import { serverConfig } from '../config/serverConfig.js';
import { MovementService } from '../movement/MovementService.js';
import { EvolveService } from '../progression/EvolveService.js';
import { buxGrants } from '../progression/BuxGrants.js';
import { leaderboardService } from '../progression/LeaderboardService.js';
import { profileStore } from '../progression/ProfileStore.js';
import { RebirthService } from '../progression/RebirthService.js';
import { SpeedService } from '../progression/SpeedService.js';
import { StageService } from '../progression/StageService.js';
import { wallet } from '../progression/Wallet.js';
import { UpgradeService } from '../progression/UpgradeService.js';
import {
  createAuraService,
  createItemService,
  createTrailService,
} from '../progression/CosmeticService.js';
import { GuardianService } from '../world/GuardianService.js';
import { logger } from '../util/logger.js';
import { CourseState } from './state/CourseState.js';
import { PlayerState } from './state/PlayerState.js';
import {
  handleFor,
  sanitizeDisplayName,
  sanitizePfpUrl,
  type SetIdentityMessage,
} from '@evolve/shared';

const SCOPE = 'CourseRoom';

/** Seconds between autosaves of every connected player. */
const AUTOSAVE_SECONDS = 15;

/** Options a client may pass on join. Both are cosmetic or identity only. */
interface JoinOptions {
  playerId?: string;
  /** The player's Bloxity display name. Public text only - never the account id. */
  name?: string;
  /** Their Bloxity portrait URL. Pinned to Bloxity's image host on arrival. */
  pfp?: string;
  /** The Bloxity account id, when the player is signed in to the portal. */
  bloxityId?: string;
  /**
   * The player's Bloxity appearance, so they are drawn correctly by everyone
   * already in the room from their very first patch rather than after a
   * follow-up message has made the round trip.
   */
  avatar?: SetAvatarMessage;
}

/**
 * The authoritative room.
 *
 * Composition only: every rule lives in a service, and this decides the order
 * they run in. What it owns outright is the CLOCK - `state.elapsed` is what
 * the moving hazards are a pure function of, so a hazard death is decided
 * against the server's own time and never against a client's.
 *
 * The one hard rule: nothing a client sends is ever copied into state. A Move
 * is simulated, a claim is validated, and both produce a result the server
 * writes itself.
 */
export class CourseRoom extends Room<CourseState> {
  /**
   * Capacity, and the matchmaker's cue to open another room.
   *
   * Colyseus locks a room the moment this is reached and `joinOrCreate` sends
   * the next player to a fresh one, so a full server routes rather than
   * refuses. The figure is shared with the client so the two can never hold
   * different ideas of how big a room is.
   */
  override maxClients = MAX_PLAYERS_PER_ROOM;

  private readonly movement = new MovementService();
  private readonly speeds = new SpeedService();
  private readonly stages = new StageService();
  private readonly evolve = new EvolveService();
  private readonly upgrades = new UpgradeService();
  private readonly rebirths = new RebirthService();
  private readonly trails = createTrailService();
  private readonly auras = createAuraService();
  private readonly items = createItemService();
  private readonly guardians = new GuardianService();

  /** Browser-stored player id per session, for persistence. */
  private readonly playerIds = new Map<string, string>();

  /**
   * Speed paid but not yet announced, per player.
   *
   * Movement arrives at the client's input rate and each accepted input can
   * pay a few whole steps; announcing every one would be a message per input.
   * They are batched here and sent once per tick instead - and a batch only
   * ever holds ONE per-step rate, so it can always be printed as exactly
   * `steps x perStep`.
   */
  private readonly speedAwards = new Map<
    string,
    { steps: number; jumpSteps: number; perStep: number; total: number }
  >();

  /**
   * Bloxity account id per session, for Bux fulfilment.
   *
   * Separate from `playerIds` because they are different identities: the
   * player id is a uuid this browser generated and the Bloxity id belongs to
   * an account that can sign in from anywhere. A purchase is made by the
   * ACCOUNT, so that is what a grant is addressed to.
   */
  private readonly bloxityIds = new Map<string, string>();

  /** Scratch motion, so the per-tick death check allocates nothing. */
  private readonly scratch: PlayerMotion = createMotion();

  private autosaveTimer = 0;

  override onCreate(): void {
    this.state = new CourseState();
    this.setPatchRate(serverConfig.patchRateMs);

    this.onMessage(MessageType.Move, (client, message: MoveMessage) =>
      this.onMove(client, message),
    );
    this.onMessage(MessageType.ClaimStage, (client, message: ClaimStageMessage) =>
      this.onClaimStage(client, message),
    );
    this.onMessage(MessageType.ClaimUpgrade, (client, message: ClaimUpgradeMessage) =>
      this.onClaimUpgrade(client, message),
    );
    this.onMessage(MessageType.RequestRespawn, (client) =>
      this.respawn(client, 'manual'),
    );
    this.onMessage(MessageType.Rebirth, (client) => this.onRebirth(client));
    this.onMessage(MessageType.BuyTrail, (client, message: BuyTrailMessage) =>
      this.onBuyTrail(client, message),
    );
    this.onMessage(MessageType.SetAvatar, (client, message: SetAvatarMessage) =>
      this.onSetAvatar(client, message),
    );
    this.onMessage(MessageType.SetIdentity, (client, message: SetIdentityMessage) =>
      this.onSetIdentity(client, message),
    );
    this.onMessage(MessageType.EquipTrail, (client, message: EquipTrailMessage) =>
      this.onEquipTrail(client, message),
    );
    this.onMessage(MessageType.BuyAura, (client, message: BuyAuraMessage) =>
      this.onBuyAura(client, message),
    );
    this.onMessage(MessageType.EquipAura, (client, message: EquipAuraMessage) =>
      this.onEquipAura(client, message),
    );
    this.onMessage(MessageType.BuyItem, (client, message: BuyItemMessage) =>
      this.onBuyItem(client, message),
    );
    this.onMessage(MessageType.EquipItem, (client, message: EquipItemMessage) =>
      this.onEquipItem(client, message),
    );

    this.guardians.reset(this.state.guardians);

    this.setSimulationInterval(
      (deltaMs) => this.tick(deltaMs / 1000),
      serverConfig.patchRateMs,
    );

    logger.info(
      SCOPE,
      `room ${this.roomId} created (capacity ${MAX_PLAYERS_PER_ROOM})`,
    );
  }

  /**
   * The capacity check that does not depend on the matchmaker.
   *
   * `maxClients` is enforced when a seat is RESERVED, which is the right place
   * and covers every normal join. This is the second line: a seat reservation
   * that is consumed late, a direct `joinById` into a room that filled while
   * the request was in flight, or any future path that reaches a room without
   * going through matchmaking would all arrive here. Refusing at the door
   * costs one comparison and makes the limit a property of the ROOM rather
   * than of the route taken to it.
   *
   * Nothing about this is client-side: a client cannot decline to call it and
   * cannot see the number it is compared against.
   */
  override onAuth(): boolean {
    if (this.clients.length >= MAX_PLAYERS_PER_ROOM) {
      logger.warn(
        SCOPE,
        `refused a join: room ${this.roomId} is full ` +
          `(${this.clients.length}/${MAX_PLAYERS_PER_ROOM})`,
      );
      throw new ServerError(4103, 'room is full');
    }
    return true;
  }

  override onJoin(client: Client, options: JoinOptions = {}): void {
    const player = new PlayerState();
    player.sessionId = client.sessionId;

    const playerId = typeof options.playerId === 'string' ? options.playerId.slice(0, 64) : '';
    if (playerId) this.playerIds.set(client.sessionId, playerId);

    // Restore BEFORE any service initialises: level, movement speed, the
    // equipped mount and the equipped upgrade pad are all derived from the
    // restored figures, so restoring afterwards would leave every one of them
    // a step out of date.
    const restored = playerId ? profileStore.restore(playerId, player) : false;

    this.state.players.set(client.sessionId, player);

    this.movement.initialise(player);
    this.upgrades.initialise(player);
    this.trails.initialise(player);
    this.auras.initialise(player);
    this.items.initialise(player);
    this.speeds.initialise(player);
    this.stages.initialise(client.sessionId);
    // AFTER `speeds.initialise`, which is what derives the level an evolution
    // is judged against. Refreshing first would judge every returning player
    // at level 1 and hand them back their starter cockroach.
    this.evolve.refresh(player);

    const bloxityId = typeof options.bloxityId === 'string' ? options.bloxityId : '';
    if (bloxityId) {
      this.bloxityIds.set(client.sessionId, bloxityId);
      // Anything bought while they were away, or in another session.
      this.applyGrants(client.sessionId, player);
    }
    if (options.avatar) this.writeAvatar(player, options.avatar);
    // Always written, even for a player who sent nothing: that is what gives a
    // signed-out rider their derived handle rather than a blank nameplate.
    this.writeIdentity(client.sessionId, player, { name: options.name, pfp: options.pfp });

    this.rebirths.sync(player);

    // A restored profile has to be re-derived from the Speed it came back
    // with, and the mount re-checked against the level that produces.
    if (restored) {
      this.speeds.syncDerived(player);
      this.evolve.refresh(player);
      this.speeds.syncDerived(player);
    }

    // Put the player at spawn through the SAME path a respawn takes, so there
    // is one definition of "where a player belongs" rather than two.
    this.placeAt(client, player, 'join');

    logger.info(
      SCOPE,
      `join ${client.sessionId} (${restored ? 'restored' : 'new'}) ` +
        `level=${player.level} wins=${player.wins} mount=${player.mountSlot} ` +
        `upgrade=${player.upgradeSlot}`,
    );
  }

  override onLeave(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    const playerId = this.playerIds.get(client.sessionId);
    if (player && playerId) profileStore.save(playerId, player);

    this.state.players.delete(client.sessionId);
    this.movement.forget(client.sessionId);
    this.speeds.forget(client.sessionId);
    this.speedAwards.delete(client.sessionId);
    this.stages.forget(client.sessionId);
    this.bloxityIds.delete(client.sessionId);
    this.upgrades.forget(client.sessionId);
    this.trails.forget(client.sessionId);
    this.auras.forget(client.sessionId);
    this.items.forget(client.sessionId);
    this.playerIds.delete(client.sessionId);

    logger.info(SCOPE, `leave ${client.sessionId}`);
  }

  override onDispose(): void {
    // Every remaining player's progression, made durable before the room dies.
    for (const [sessionId, player] of this.state.players) {
      const playerId = this.playerIds.get(sessionId);
      if (playerId) profileStore.save(playerId, player);
    }
    logger.info(SCOPE, `room ${this.roomId} disposed`);
  }

  /**
   * One input: simulate it, then pay for the movement it actually produced.
   *
   * The ORDER is the whole point. `applyInput` writes the authoritative
   * transform, and only then does `credit` measure the distance between the
   * previous authoritative position and this one. Crediting from the message
   * would be paying a client for a number it chose.
   */
  private onMove(client: Client, message: MoveMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (
      !this.movement.applyInput(client.sessionId, player, message, this.state.elapsed)
    ) {
      return;
    }

    const gain = this.speeds.credit(client.sessionId, player, this.movement.lastStep);
    if (gain.steps > 0) this.queueSpeedAward(client, gain, player.totalSpeed);
    player.animation = resolveAnimation(player);

    // A level-up is the OTHER moment an evolution threshold can be crossed
    // without the player touching anything, and unlike a stage reward it can
    // happen on any step. Gated on `levelsGained` so the common case - the
    // twenty inputs a second that change nothing - costs one comparison
    // rather than a walk of the roster.
    if (gain.levelsGained > 0) this.checkEvolution(client, player);
  }

  /**
   * Add a payment to this player's pending announcement.
   *
   * If the per-step rate has changed since the batch began - a pad claimed, a
   * trail equipped, a belt stepped onto - the old batch is sent first, so no
   * announcement ever averages two rates into a figure nobody was paid.
   */
  private queueSpeedAward(
    client: Client,
    gain: { steps: number; jumpSteps: number; perStep: number },
    total: number,
  ): void {
    const pending = this.speedAwards.get(client.sessionId);
    if (pending && pending.perStep !== gain.perStep) this.sendSpeedAward(client);
    const batch = this.speedAwards.get(client.sessionId) ?? {
      steps: 0,
      jumpSteps: 0,
      perStep: gain.perStep,
      total,
    };
    batch.steps += gain.steps;
    batch.jumpSteps += gain.jumpSteps;
    batch.total = total;
    this.speedAwards.set(client.sessionId, batch);
  }

  /** Announce whatever this player has been paid since the last send. */
  private sendSpeedAward(client: Client): void {
    const batch = this.speedAwards.get(client.sessionId);
    if (!batch) return;
    this.speedAwards.delete(client.sessionId);
    const message: SpeedAwardedMessage = {
      steps: batch.steps,
      jumpSteps: batch.jumpSteps,
      perStep: batch.perStep,
      total: batch.total,
    };
    client.send(MessageType.SpeedAwarded, message);
  }

  /** A stage claim. The server validates it against its own transform. */
  private onClaimStage(client: Client, message: ClaimStageMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const index = Number(message?.stageIndex);
    if (!Number.isFinite(index)) return;

    const award = this.stages.claim(client.sessionId, player, index);
    if (!award.granted || !award.stage) return;

    const payload: StageAwardedMessage = {
      stageIndex: award.stage.index,
      wins: award.wins,
      total: player.wins,
    };
    client.send(MessageType.StageAwarded, payload);

    // Wins just moved, so both things gated on Wins are re-checked HERE rather
    // than on a timer: a stage reward is the only moment in the game at which
    // a player can cross an evolution threshold without touching anything.
    this.checkEvolution(client, player);

    // Banking a stage RETURNS the player to the starting arena. That is the
    // loop the win pad's "Return" label promises, and it is also what makes a
    // second payment impossible: the pad is hundreds of units behind them
    // before another request could arrive.
    this.placeAt(client, player, 'stage');

    this.persist(client.sessionId, player);
    logger.info(
      SCOPE,
      `stage ${award.stage.index} banked by ${client.sessionId} (+${award.wins} wins, total ${player.wins})`,
    );
  }

  /**
   * A speed-upgrade pad claim.
   *
   * Nothing is deducted: the pad is a threshold, not a purchase, so the server
   * checks the Wins are HELD and where the mount is standing, and then simply
   * equips it. The gain figures follow from the one shared formula rather than
   * being written here.
   */
  private onClaimUpgrade(client: Client, message: ClaimUpgradeMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const slot = Number(message?.slot);
    if (!Number.isFinite(slot)) return;

    const claim = this.upgrades.claim(player, slot);
    if (!claim.granted || !claim.upgrade) return;

    this.speeds.syncDerived(player);
    this.persist(client.sessionId, player);
    logger.info(
      SCOPE,
      `${client.sessionId} equipped +${claim.upgrade.perStep}/step`,
    );
  }

  /** A rebirth request. The server alone decides whether it is allowed. */
  private onRebirth(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const result = this.rebirths.rebirth(player, this.speeds);
    if (!result.ok) return;

    // A rebirth resets the RUN as well as the curve: the player's level - and
    // therefore their speed - is no longer what carried them to wherever they
    // were standing, so they start again from the arena.
    this.placeAt(client, player, 'rebirth');
    this.persist(client.sessionId, player);
    logger.info(
      SCOPE,
      `${client.sessionId} rebirthed to ${result.rebirths} (x${result.multiplier})`,
    );
  }

  /** A trail purchase. The server takes the payment and grants the trail. */
  private onBuyTrail(client: Client, message: BuyTrailMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const result = this.trails.buy(player, message?.slot, this.speeds);
    if (!result.ok) return;

    this.afterSpending(player);
    this.persist(client.sessionId, player);
    logger.info(
      SCOPE,
      `${client.sessionId} bought the ${result.tier.name} trail ` +
        `(wins left ${result.winsAfter})`,
    );
  }

  /** An aura purchase. The same shop, a different ladder. */
  private onBuyAura(client: Client, message: BuyAuraMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const result = this.auras.buy(player, message?.slot, this.speeds);
    if (!result.ok) return;

    this.afterSpending(player);
    this.persist(client.sessionId, player);
    logger.info(
      SCOPE,
      `${client.sessionId} bought the ${result.tier.name} aura ` +
        `(wins left ${result.winsAfter})`,
    );
  }

  /** Equip an owned aura, or 0 to take it off. */
  private onEquipAura(client: Client, message: EquipAuraMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (!this.auras.equip(player, message?.slot, this.speeds).ok) return;
    this.persist(client.sessionId, player);
  }

  /** An item purchase. The capybara's ladder, on the same terms as the rest. */
  private onBuyItem(client: Client, message: BuyItemMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const result = this.items.buy(player, message?.slot, this.speeds);
    if (!result.ok) return;

    this.afterSpending(player);
    this.persist(client.sessionId, player);
    logger.info(
      SCOPE,
      `${client.sessionId} bought the ${result.tier.name} ` +
        `(wins left ${result.winsAfter})`,
    );
  }

  /** Carry an owned item, or 0 to put it away. */
  private onEquipItem(client: Client, message: EquipItemMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (!this.items.equip(player, message?.slot, this.speeds).ok) return;
    this.persist(client.sessionId, player);
  }

  /**
   * Tidy up after Wins have LEFT the wallet.
   *
   * A speed-upgrade pad is gated on Wins held rather than Wins ever earned, so
   * spending genuinely can take a player back below the pad they are standing
   * on - and leaving them earning at a rate they no longer qualify for would
   * make the shop a way to keep an upgrade for free. The mount is deliberately
   * NOT re-checked: an evolution already made is permanent, and losing a mount
   * at a shop counter would be the most confusing thing this economy could do.
   */
  private afterSpending(player: PlayerState): void {
    this.upgrades.clampToWallet(player);
    this.speeds.syncDerived(player);
  }

  /**
   * Evolve the mount if the player has just earned the next one.
   *
   * Called wherever level or Wins can have moved. The evolution itself is
   * already in replicated state when the message goes out, so a client that
   * never receives it is merely un-celebrated rather than riding the wrong
   * creature.
   */
  private checkEvolution(client: Client, player: PlayerState): void {
    const result = this.evolve.refresh(player);
    if (!result.evolved) return;

    // The mount's multiplier feeds the gain formula, so the replicated figures
    // have to be re-derived before anyone is told about it.
    this.speeds.syncDerived(player);

    const payload: EvolvedMessage = { slot: result.mount.slot, name: result.mount.name };
    client.send(MessageType.Evolved, payload);
    logger.info(SCOPE, `${client.sessionId} evolved into ${result.mount.name}`);
  }

  /** Equip an owned trail, or 0 to take it off. */
  private onEquipTrail(client: Client, message: EquipTrailMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (!this.trails.equip(player, message?.slot, this.speeds).ok) return;
    this.persist(client.sessionId, player);
  }

  /**
   * "This is what I look like."
   *
   * Accepted rather than adjudicated, which is the opposite of every other
   * client message here and is safe for one reason: the payload decides
   * nothing. The portal owns a player's appearance and this server has no way
   * to ask it, so the client is the only source of the truth - and the worst a
   * forged one achieves is wearing a hat it did not buy, on its own screen and
   * everyone else's. It is NOT persisted: the appearance lives in the player's
   * Bloxity account, and a copy in the profile would be a second one to keep
   * in step with the first.
   */
  private onSetAvatar(client: Client, message: SetAvatarMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    this.writeAvatar(player, message);
  }

  /** Sanitise, then write in place. The one path an appearance is set by. */
  private writeAvatar(player: PlayerState, message: SetAvatarMessage): void {
    player.avatar.apply(
      sanitizeAppearance(message?.appearance),
      sanitizeProportions(message?.proportions),
    );
  }

  /**
   * "This is who I am in the portal."
   *
   * Accepted on the same terms as `SetAvatar`, and for the same reason: it
   * decides nothing. The server cannot ask Bloxity who a socket belongs to, so
   * the client is the only source - and a forged name buys a label on a sign,
   * never a Win. Sent again on login, logout and a new portrait.
   */
  private onSetIdentity(client: Client, message: SetIdentityMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    this.writeIdentity(client.sessionId, player, message);
  }

  /**
   * Sanitise a name and portrait, and decide what everyone is shown.
   *
   * The ONE path either field is set by. A missing or unusable name falls back
   * to the handle derived from the player's id, so the fallback for signed-out
   * players is the rule the boards already used - and the id itself still
   * never leaves the server.
   */
  private writeIdentity(
    sessionId: string,
    player: PlayerState,
    message: Partial<SetIdentityMessage> | undefined,
  ): void {
    const name = sanitizeDisplayName(message?.name);
    const pfp = sanitizePfpUrl(message?.pfp);
    const shown = name || handleFor(this.playerIds.get(sessionId) ?? '');

    player.accountName = name;
    // Assigned only on a real change: an identical write still counts as a
    // change to the schema encoder, and a re-sent identity is common.
    if (player.displayName !== shown) player.displayName = shown;
    if (player.pfp !== pfp) player.pfp = pfp;
  }

  /**
   * The per-tick pass the client cannot influence.
   *
   * Deaths are decided HERE, from the position the server simulated and the
   * clock the server owns, rather than from a client saying it was hit. There
   * is no hazard message in this game for exactly that reason.
   */
  private tick(delta: number): void {
    this.state.elapsed += delta;
    const time = this.state.elapsed;

    // Announce the Speed paid since the last tick, one message per player.
    if (this.speedAwards.size > 0) {
      for (const client of this.clients) this.sendSpeedAward(client);
    }

    // The guardians CHASE, so they cannot be pure functions of time. The
    // server moves them from the authoritative positions it already has, and
    // the trample below is decided against those same positions.
    this.guardians.update(this.state.guardians, delta, this.state.players.values());

    // The boards on the spawn wall. Rebuilt on their own slow timer inside the
    // service - a leaderboard is not a thing anyone reads twenty times a
    // second, and sorting every profile at tick rate to feed a sign would be
    // the most expensive thing in this room.
    leaderboardService.update(delta, this.state.leaderboard, this.state.players, this.playerIds);

    /*
     * Bux bought by someone already in the room.
     *
     * Guarded on `hasPending` so the common case - nobody has bought anything
     * - is one boolean per tick rather than a walk of every player. The
     * webhook queues rather than writing, because a direct write to the stored
     * profile would be overwritten by this player's next autosave.
     */
    if (buxGrants.hasPending) {
      for (const [sessionId, player] of this.state.players) {
        this.applyGrants(sessionId, player);
      }
    }

    for (const [sessionId, player] of this.state.players) {
      if (!player.ready) continue;

      const triggers = this.movement.collision.sampleTriggers(
        player.x,
        player.y,
        player.z,
        time,
      );
      const trampled = this.guardians.hits(this.state.guardians, player);

      if (triggers.fell || triggers.hazard || trampled) {
        const client = this.clients.find((c) => c.sessionId === sessionId);
        if (client) this.respawn(client, triggers.fell ? 'fell' : 'hazard');
      }
    }

    this.autosaveTimer += delta;
    if (this.autosaveTimer >= AUTOSAVE_SECONDS) {
      this.autosaveTimer = 0;
      // Speed accrues continuously between the discrete events that otherwise
      // trigger a save, so a crash without this would cost a whole session.
      for (const [sessionId, player] of this.state.players) {
        this.persist(sessionId, player);
      }
    }
  }

  /**
   * Hand over anything this player has paid for and not yet received.
   *
   * Wins go through `wallet.add` like every other award in the game - there is
   * exactly one place they move, and a payment is not an excuse to open a
   * second one. The profile is saved immediately so a crash between the
   * webhook and the next autosave cannot lose a purchase.
   */
  private applyGrants(sessionId: string, player: PlayerState): void {
    const bloxityId = this.bloxityIds.get(sessionId);
    if (!bloxityId) return;

    const grants = buxGrants.drain(bloxityId);
    if (grants.length === 0) return;

    for (const grant of grants) {
      if (grant.wins > 0) wallet.add(player, grant.wins);
      logger.info(
        SCOPE,
        `granted ${grant.sku} to ${sessionId} (+${grant.wins} wins) [${grant.transactionId}]`,
      );
    }
    this.persist(sessionId, player);
  }

  /** Put a player back at the starting arena and tell them so. */
  private respawn(client: Client, reason: RespawnReason): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    this.placeAt(client, player, reason);
  }

  /**
   * THE one way a player is placed, and there is exactly ONE destination.
   *
   * `SPAWN_POSITION` - the starting arena - whatever the cause and whatever
   * stage the player was on. There are no checkpoints in this game and no
   * second place a player can arrive at, which is why this takes no position:
   * a placement that could land somewhere else is the bug the parameter used
   * to allow.
   *
   * Teleports the simulation, drops the Speed baseline (or the teleport itself
   * would be credited as distance travelled), and sends the authoritative
   * transform.
   */
  private placeAt(client: Client, player: PlayerState, reason: RespawnReason): void {
    this.movement.teleport(
      client.sessionId,
      player,
      SPAWN_POSITION.x,
      SPAWN_POSITION.y,
      SPAWN_POSITION.z,
      SPAWN_ROTATION_Y,
    );
    // What was earned on the way to this placement is announced before the
    // baseline goes, so the last steps of a run still get their popup.
    this.sendSpeedAward(client);
    this.speeds.reset(client.sessionId, player);
    player.animation = MountAnimationState.Idle;
    // A death plays the fall-over. Arriving, banking a stage and being reborn are
    // all PLACEMENTS rather than deaths, so none of them bumps the counter.
    if (reason === 'fell' || reason === 'hazard') player.deathCount += 1;

    const message: RespawnMessage = {
      x: SPAWN_POSITION.x,
      y: SPAWN_POSITION.y,
      z: SPAWN_POSITION.z,
      rotationY: SPAWN_ROTATION_Y,
      reason,
    };
    client.send(MessageType.Respawn, message);

    // Every placement is logged with its cause. A player who finds themselves
    // back at the arena and cannot say why is the hardest bug in this game to
    // diagnose from the outside, and one line here answers it.
    if (reason !== 'join') {
      logger.info(SCOPE, `place ${client.sessionId} -> spawn (${reason})`);
    }
  }

  private persist(sessionId: string, player: PlayerState): void {
    const playerId = this.playerIds.get(sessionId);
    if (playerId) profileStore.save(playerId, player);
  }
}

/**
 * The animation state a replicated player is in.
 *
 * Derived from motion the server already owns rather than reported by the
 * client, so a remote character can never be made to play an animation its
 * actual movement does not justify. Presentation, but presentation the server
 * is the source of.
 */
const resolveAnimation = (player: PlayerState): MountAnimationState => {
  // A player on a belt is travelling nowhere but is very much running, so the
  // replicated state has to say so - reporting `idle` would be the one field
  // on the wire that disagrees with what everybody can see.
  if (player.treadmill > 0) return MountAnimationState.Gallop;
  if (!player.grounded) {
    return player.verticalVelocity > 2
      ? MountAnimationState.JumpStart
      : MountAnimationState.Airborne;
  }
  const walkThreshold = 0.6;
  if (player.speed < walkThreshold) return MountAnimationState.Idle;
  // The gallop threshold scales with the player's own authoritative speed, so
  // a level-80 mount is not permanently "walking" at eighty units a second.
  return player.speed > player.moveMultiplier * 16
    ? MountAnimationState.Gallop
    : MountAnimationState.Walk;
};
