import { Client, Room, ServerError, type AuthContext } from '@colyseus/core';
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
  type AuthMessage,
  type GuestIdMessage,
} from '@evolve/shared';
import { verifyToken, type AuthResult } from '../auth/BloxityAuth.js';
import { accountKey, guestKeyFrom } from '../auth/profileKeys.js';
import { serverConfig } from '../config/serverConfig.js';
import { StorageUnavailableError, type StoredProfile } from '../persistence/index.js';
import { MovementService } from '../movement/MovementService.js';
import { EvolveService } from '../progression/EvolveService.js';
import { leaderboardService } from '../progression/LeaderboardService.js';
import { profileStore, type ResolvedProfile } from '../progression/ProfileStore.js';
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

/** Seconds between checks for purchases waiting for a signed-in player. */
const GRANT_POLL_SECONDS = 5;

/** How long a switch waits for the profile being LEFT to be durable. */
const SWITCH_SAVE_TIMEOUT_MS = 6000;

/** Backoff before verifying a token again after Bloxity or storage was unavailable. */
const RETRY_FIRST_MS = 5000;
const RETRY_MAX_MS = 120_000;

/** Longest token taken from a client at all. */
const MAX_TOKEN_LENGTH = 8192;

/** Options a client may pass on join. Identity is a TOKEN, never an account id. */
interface JoinOptions {
  /** This browser's guest id, from localStorage. */
  playerId?: string;
  /**
   * The Bloxity portal token, when signed in. Verified with Bloxity before
   * anything is read under the account it names.
   */
  token?: string;
  /** The player's Bloxity display name. Public text only - never the account id. */
  name?: string;
  /** Their Bloxity portrait URL. Pinned to Bloxity's image host on arrival. */
  pfp?: string;
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

  /**
   * The profile key each session saves under, for the leaderboard and the
   * derived handle. Mirrors `sessions`; an unsaved guest is keyed by session.
   */
  private readonly playerIds = new Map<string, string>();

  /** Who each session is, and where its progress goes. */
  private readonly sessions = new Map<string, Session>();

  private grantTimer = 0;

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
    this.onMessage(MessageType.Auth, (client, message: AuthMessage) =>
      this.onAuthMessage(client, message),
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
   * The door: capacity, then WHO this is, then their progress - before a seat
   * is taken.
   *
   * Identity is a Bloxity portal TOKEN, verified with Bloxity. Only a
   * verified token names an account; anything else plays as the guest its
   * browser id names. The profile is read from storage HERE, at join time,
   * and if storage cannot be read the join is REFUSED rather than let in on an
   * empty profile the next autosave would write over the real one. Colyseus
   * hands what this returns to `onJoin`.
   *
   * `maxClients` is enforced when a seat is RESERVED; the capacity check here
   * is the second line for anything that reaches a room another way, and it
   * runs again after the awaits, because the room may have filled meanwhile.
   */
  override async onAuth(
    _client: Client,
    options: JoinOptions = {},
    _context?: AuthContext,
  ): Promise<JoinAuth> {
    this.refuseIfFull();

    const guestKey = guestKeyFrom(options.playerId);
    const token = tokenFrom(options.token);
    const auth = token ? await verifyToken(token) : null;

    let resolved: ResolvedProfile;
    let accountId: string | null = null;
    try {
      if (auth?.status === 'verified') {
        accountId = auth.accountId;
        resolved = await profileStore.resolveAccount(accountKey(auth.accountId), guestKey, null);
      } else if (guestKey) {
        resolved = await profileStore.resolveGuest(guestKey);
      } else {
        // No usable browser id - including one carrying the account prefix.
        // Let in, and nothing they do is written anywhere.
        resolved = { key: null, profile: null, rotated: false, migrated: false };
      }
    } catch (error) {
      if (error instanceof StorageUnavailableError) {
        // NEVER in on an empty profile: the next autosave would write that
        // emptiness over their real one. The client's own join backoff brings
        // them in once storage answers again.
        logger.error(SCOPE, `refused a join: progress storage is unavailable (${error.message})`);
        throw new ServerError(4503, 'progress storage is unavailable - retrying');
      }
      throw error;
    }

    // The room may have filled while this join was waiting on Bloxity or storage.
    this.refuseIfFull();

    return {
      key: resolved.key,
      accountId,
      // A migrated or rotated guest id is what guest play continues under.
      guestKey: accountId ? guestKey : resolved.key,
      profile: resolved.profile,
      rotated: resolved.rotated,
      migrated: resolved.migrated,
      token,
      auth: auth?.status ?? 'none',
    };
  }

  /** The capacity check that does not depend on the matchmaker. */
  private refuseIfFull(): void {
    if (this.clients.length >= MAX_PLAYERS_PER_ROOM) {
      logger.warn(
        SCOPE,
        `refused a join: room ${this.roomId} is full ` +
          `(${this.clients.length}/${MAX_PLAYERS_PER_ROOM})`,
      );
      throw new ServerError(4103, 'room is full');
    }
  }

  override onJoin(client: Client, options: JoinOptions = {}, joined?: JoinAuth): void {
    const auth: JoinAuth = joined ?? {
      key: null,
      accountId: null,
      guestKey: null,
      profile: null,
      rotated: false,
      migrated: false,
      token: null,
      auth: 'none',
    };
    const player = new PlayerState();
    player.sessionId = client.sessionId;

    const session: Session = {
      key: auth.key,
      accountId: auth.accountId,
      guestKey: auth.guestKey,
      appliedGrants: [...(auth.profile?.appliedGrants ?? [])],
      switching: false,
      queued: false,
      wanted: auth.token,
      retryTimer: null,
      retryDelay: 0,
      claiming: false,
    };
    this.sessions.set(client.sessionId, session);
    this.playerIds.set(client.sessionId, auth.key ?? client.sessionId);

    // Restore BEFORE any service initialises: level, movement speed, the
    // equipped mount and the equipped upgrade pad are all derived from the
    // restored figures, so restoring afterwards would leave every one of them
    // a step out of date.
    if (auth.profile) profileStore.restore(auth.profile, player);

    this.state.players.set(client.sessionId, player);
    this.movement.initialise(player);
    this.initialiseProgression(client.sessionId, player);

    if (options.avatar) this.writeAvatar(player, options.avatar);
    // Always written, even for a player who sent nothing: that is what gives a
    // signed-out rider their derived handle rather than a blank nameplate.
    this.writeIdentity(client.sessionId, player, { name: options.name, pfp: options.pfp });

    // Put the player at spawn through the SAME path a respawn takes, so there
    // is one definition of "where a player belongs" rather than two.
    this.placeAt(client, player, 'join');

    if (auth.rotated && auth.guestKey) {
      client.send(MessageType.GuestId, { playerId: auth.guestKey } satisfies GuestIdMessage);
    }
    if (session.accountId) {
      // Anything bought while they were away, or in another session.
      void this.drainGrants(client.sessionId);
    }
    if (auth.auth === 'unavailable') {
      // Bloxity could not answer. Guest for now - never permanently.
      this.scheduleRetry(client.sessionId);
    }
    if (auth.key) void profileStore.save(auth.key, player, session.appliedGrants);

    logger.info(
      SCOPE,
      `join ${client.sessionId} as ${describeIdentity(session, auth.auth)} ` +
        `(${auth.migrated ? 'migrated from guest' : auth.profile ? 'restored' : 'new'}) ` +
        `level=${player.level} wins=${player.wins} mount=${player.mountSlot} ` +
        `upgrade=${player.upgradeSlot}`,
    );
  }

  /**
   * Every service that derives something from progression, in the ONE order
   * a join uses - and a mid-session account switch re-runs it in that same
   * order, so the two can never disagree about what a profile produces.
   */
  private initialiseProgression(sessionId: string, player: PlayerState): void {
    this.upgrades.forget(sessionId);
    this.trails.forget(sessionId);
    this.auras.forget(sessionId);
    this.items.forget(sessionId);
    this.speeds.forget(sessionId);
    this.stages.forget(sessionId);

    this.upgrades.initialise(player);
    this.trails.initialise(player);
    this.auras.initialise(player);
    this.items.initialise(player);
    this.speeds.initialise(player);
    this.stages.initialise(sessionId);
    // AFTER `speeds.initialise`, which is what derives the level an evolution
    // is judged against. Refreshing first would judge every returning player
    // at level 1 and hand them back their starter cockroach.
    this.evolve.refresh(player);
    // Re-derived from the Speed the profile came back with, and the mount
    // re-checked against the level that produces.
    this.speeds.syncDerived(player);
    this.evolve.refresh(player);
    this.speeds.syncDerived(player);
  }

  override onLeave(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    const session = this.sessions.get(client.sessionId);
    // Saved even mid-switch: the key and the live state always change
    // together, so whatever key the session holds is the one this state is.
    if (player && session?.key) void profileStore.save(session.key, player, session.appliedGrants);
    if (session?.retryTimer) clearTimeout(session.retryTimer);

    this.state.players.delete(client.sessionId);
    this.movement.forget(client.sessionId);
    this.speeds.forget(client.sessionId);
    this.stages.forget(client.sessionId);
    this.upgrades.forget(client.sessionId);
    this.trails.forget(client.sessionId);
    this.auras.forget(client.sessionId);
    this.items.forget(client.sessionId);
    this.playerIds.delete(client.sessionId);
    this.sessions.delete(client.sessionId);

    logger.info(SCOPE, `leave ${client.sessionId}`);
  }

  override onDispose(): void {
    // Every remaining player's progression, queued before the room dies. The
    // shutdown path waits for the store to flush it.
    for (const [sessionId, player] of this.state.players) {
      const session = this.sessions.get(sessionId);
      if (session?.key) void profileStore.save(session.key, player, session.appliedGrants);
      if (session?.retryTimer) clearTimeout(session.retryTimer);
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

    const gain = this.speeds.credit(client.sessionId, player, this.movement.lastStep, message.seq);
    // One message per step, sent as it is earned. Nothing is batched, merged
    // or counted on the way to the client, so what the popup prints is the
    // award itself.
    for (const award of gain.awards) {
      const awarded: SpeedAwardedMessage = {
        gain: award.gain,
        seq: message.seq,
        source: award.source,
        total: award.total,
      };
      if (serverConfig.logSpeedAwards) {
        logger.info(
          'speed',
          `TRACE SEND ${client.sessionId} input#${message.seq} ${award.source} gain=${award.gain} total=${award.total}`,
        );
      }
      client.send(MessageType.SpeedAwarded, awarded);
    }
    player.animation = resolveAnimation(player);

    // A level-up is the OTHER moment an evolution threshold can be crossed
    // without the player touching anything, and unlike a stage reward it can
    // happen on any step. Gated on `levelsGained` so the common case - the
    // twenty inputs a second that change nothing - costs one comparison
    // rather than a walk of the roster.
    if (gain.levelsGained > 0) this.checkEvolution(client, player);
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
   * decides nothing. WHICH account a session is - and so whose progress it
   * holds - is decided only by a token Bloxity verifies (`onAuth`, and the
   * `Auth` message). This is just the label, and a forged name buys a label
   * on a sign, never a Win. Sent again on login, logout and a new portrait.
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
     * Bux bought by somebody already in the room, possibly on another pod's
     * webhook. Checked on a slow timer, and only for verified accounts: a
     * purchase is recorded against the account Bloxity says paid, and nothing
     * else can claim it.
     */
    this.grantTimer += delta;
    if (this.grantTimer >= GRANT_POLL_SECONDS) {
      this.grantTimer = 0;
      for (const [sessionId, session] of this.sessions) {
        if (session.accountId) void this.drainGrants(sessionId);
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
   * Hand over anything this player's ACCOUNT has paid for.
   *
   * Only a session whose account the server verified with Bloxity claims, and
   * it claims atomically in storage, so two pods can never both apply one
   * grant. Wins go through `wallet.add` like every other award. The profile -
   * which records the transaction id - is written, and only once that write is
   * durable is the grant marked applied: a crash between the two leaves a
   * claim that is retried later and recognised by the profile's own record,
   * never paid twice and never lost.
   */
  private async drainGrants(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.accountId || !session.key || session.claiming || session.switching) return;
    const key = session.key;
    session.claiming = true;
    let grants;
    try {
      grants = await profileStore.claimGrants(key, `${this.roomId}:${sessionId}`);
    } catch (error) {
      logger.warn(SCOPE, `could not check purchases for ${sessionId}: ${(error as Error).message}`);
      session.claiming = false;
      return;
    }
    session.claiming = false;
    if (grants.length === 0) return;

    const player = this.state.players.get(sessionId);
    const now = this.sessions.get(sessionId);
    // Switched or left while claiming: the claim goes stale and is retried
    // by whichever session that account is in next.
    if (!player || now !== session || session.key !== key) return;

    const done: string[] = [];
    for (const grant of grants) {
      done.push(grant.transactionId);
      if (session.appliedGrants.includes(grant.transactionId)) continue;
      session.appliedGrants.push(grant.transactionId);
      if (grant.wins > 0) wallet.add(player, grant.wins);
      logger.info(
        SCOPE,
        `granted ${grant.sku} to ${key} (+${grant.wins} wins) [${grant.transactionId}]`,
      );
    }
    // More Wins can mean a new mount.
    this.evolve.refresh(player);
    this.speeds.syncDerived(player);
    try {
      await profileStore.save(key, player, session.appliedGrants);
      await profileStore.completeGrants(done);
    } catch (error) {
      logger.warn(SCOPE, `grant bookkeeping deferred: ${(error as Error).message}`);
    }
  }

  /**
   * The portal login changed: sign-in, sign-out or a different account.
   *
   * Handled on the LIVE session rather than by reconnecting, because a
   * reconnect can land on another pod before this one's last write reaches the
   * database. Only the newest login counts; one that arrives mid-switch is run
   * as soon as the current switch finishes.
   */
  private onAuthMessage(client: Client, message: AuthMessage): void {
    const session = this.sessions.get(client.sessionId);
    if (!session) return;
    session.wanted = tokenFrom(message?.token);
    session.retryDelay = 0;
    this.requestSwitch(client.sessionId);
  }

  private requestSwitch(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (session.switching) {
      session.queued = true;
      return;
    }
    void this.runSwitches(sessionId);
  }

  private async runSwitches(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.switching = true;
    try {
      do {
        session.queued = false;
        await this.switchIdentity(sessionId, session, session.wanted);
      } while (session.queued && this.sessions.get(sessionId) === session);
    } catch (error) {
      logger.error(SCOPE, `identity switch failed for ${sessionId}`, error);
    } finally {
      session.switching = false;
    }
  }

  /**
   * Move a live session onto the profile its login names.
   *
   * While it runs the session's autosaves are blocked. The profile being LEFT
   * is saved from live state and must be durable before anything else
   * happens; the new one is read from storage, applied, pushed through the
   * same initialisation a join uses, owed purchases are re-applied, and the
   * player is placed at spawn and saved. If storage fails anywhere before the
   * apply, the session STAYS on its current profile and tries again later.
   */
  private async switchIdentity(sessionId: string, session: Session, token: string | null): Promise<void> {
    const auth: AuthResult | null = token ? await verifyToken(token) : null;
    if (this.sessions.get(sessionId) !== session) return;

    let target: { account: string | null };
    if (auth?.status === 'verified') {
      target = { account: auth.accountId };
    } else if (auth?.status === 'unavailable') {
      // Bloxity could not answer. Never a demotion: an account stays an
      // account, a guest stays a guest, and it is asked again on a backoff.
      this.scheduleRetry(sessionId);
      return;
    } else {
      target = { account: null };
    }

    if (target.account === session.accountId) return;
    if (session.retryTimer) {
      clearTimeout(session.retryTimer);
      session.retryTimer = null;
    }

    const player = this.state.players.get(sessionId);
    const client = this.clients.find((c) => c.sessionId === sessionId);
    if (!player || !client) return;

    // 1. The profile being LEFT, from live state, durably - or no switch.
    if (session.key) {
      const landed = await within(
        profileStore.save(session.key, player, session.appliedGrants),
        SWITCH_SAVE_TIMEOUT_MS,
      );
      if (this.sessions.get(sessionId) !== session) return;
      if (!landed) {
        logger.warn(SCOPE, `switch for ${sessionId} postponed: could not save ${session.key}; staying put`);
        this.scheduleRetry(sessionId);
        return;
      }
    }

    // 2. The profile being ENTERED. A sign-in from a guest session carries the
    //    LIVE state as the progress to migrate - it is newer than the save.
    let next: ResolvedProfile;
    try {
      if (target.account) {
        const live: StoredProfile | null =
          !session.accountId && session.key && session.key === session.guestKey
            ? profileStore.snapshot(player, session.appliedGrants)
            : null;
        next = await profileStore.resolveAccount(accountKey(target.account), session.guestKey, live);
      } else if (session.guestKey) {
        next = await profileStore.resolveGuest(session.guestKey);
      } else {
        next = { key: null, profile: null, rotated: false, migrated: false };
      }
    } catch (error) {
      logger.warn(
        SCOPE,
        `switch for ${sessionId} postponed: storage unavailable (${(error as Error).message}); staying put`,
      );
      this.scheduleRetry(sessionId);
      return;
    }
    if (this.sessions.get(sessionId) !== session) return;

    // Anything played while the new profile was loading, onto the old one.
    const leaving = session.key;
    if (leaving) void profileStore.save(leaving, player, session.appliedGrants);

    // 3. Apply. Synchronous from here, so the key and the state never part.
    session.key = next.key;
    session.accountId = target.account;
    if (!target.account) session.guestKey = next.key;
    session.appliedGrants = [...(next.profile?.appliedGrants ?? [])];
    this.playerIds.set(sessionId, next.key ?? sessionId);

    resetProgression(player);
    if (next.profile) profileStore.restore(next.profile, player);
    this.initialiseProgression(sessionId, player);
    this.writeIdentity(sessionId, player, { name: player.accountName, pfp: player.pfp });
    this.placeAt(client, player, 'join');
    if (next.rotated && next.key) {
      client.send(MessageType.GuestId, { playerId: next.key } satisfies GuestIdMessage);
    }
    if (next.key) void profileStore.save(next.key, player, session.appliedGrants);

    logger.info(
      SCOPE,
      `switch ${sessionId}: ${leaving ?? 'unsaved'} -> ${describeIdentity(session, auth?.status ?? 'none')} ` +
        `(${next.migrated ? 'migrated from guest' : next.profile ? 'restored' : 'new'}) ` +
        `level=${player.level} wins=${player.wins}`,
    );

    // 4. Purchases owed to the account just entered.
    if (session.accountId) {
      session.switching = false;
      await this.drainGrants(sessionId);
      session.switching = true;
    }
  }

  /** Try the wanted login again later, backing off. Never a permanent verdict. */
  private scheduleRetry(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.retryTimer) return;
    session.retryDelay = session.retryDelay === 0 ? RETRY_FIRST_MS : Math.min(RETRY_MAX_MS, session.retryDelay * 2);
    session.retryTimer = setTimeout(() => {
      session.retryTimer = null;
      if (this.sessions.get(sessionId) === session) this.requestSwitch(sessionId);
    }, session.retryDelay);
    session.retryTimer.unref?.();
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

  /**
   * Queue the player's progress. Skipped while a switch is moving the session
   * between profiles - an autosave then could write one profile's state under
   * the other's key.
   */
  private persist(sessionId: string, player: PlayerState): void {
    const session = this.sessions.get(sessionId);
    if (!session?.key || session.switching) return;
    void profileStore.save(session.key, player, session.appliedGrants);
  }
}

/** Who a session is and where its progress goes. */
interface Session {
  /** The profile key it saves under, or null for an unsaved guest. */
  key: string | null;
  /** The account Bloxity VERIFIED, or null for a guest. */
  accountId: string | null;
  /** This browser's guest id: where a sign-out returns to. */
  guestKey: string | null;
  /** Bux transactions already credited to the profile in play. */
  appliedGrants: string[];
  /** True while moving between profiles. Blocks autosaves and purchase claims. */
  switching: boolean;
  /** True when a newer login arrived mid-switch. */
  queued: boolean;
  /** The newest login the client asked for: a token, or null for signed out. */
  wanted: string | null;
  retryTimer: NodeJS.Timeout | null;
  retryDelay: number;
  claiming: boolean;
}

/** What `onAuth` resolved, handed to `onJoin` by Colyseus. */
interface JoinAuth {
  readonly key: string | null;
  readonly accountId: string | null;
  readonly guestKey: string | null;
  readonly profile: StoredProfile | null;
  readonly rotated: boolean;
  readonly migrated: boolean;
  readonly token: string | null;
  readonly auth: AuthResult['status'] | 'none';
}

/** A token from a client, or null. */
const tokenFrom = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_TOKEN_LENGTH ? value : null;

/** For the log: which profile a session is on, and how it got there. */
const describeIdentity = (session: Session, auth: string): string => {
  if (session.accountId) return `account ${session.key}`;
  const note = auth === 'unavailable' ? ', Bloxity unavailable - guest for now' : auth === 'rejected' ? ', token rejected' : '';
  return session.key ? `guest ${session.key}${note}` : `unsaved guest${note}`;
};

/** Resolve true if `promise` settles within `ms`, false if it does not. */
const within = (promise: Promise<unknown>, ms: number): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      () => {
        clearTimeout(timer);
        resolve(false);
      },
    );
  });

/** Clear every progression field back to a brand-new player's, before a restore. */
const resetProgression = (player: PlayerState): void => {
  const fresh = new PlayerState();
  player.totalSpeed = fresh.totalSpeed;
  player.wins = fresh.wins;
  player.unlockedMounts = fresh.unlockedMounts;
  player.mountSlot = fresh.mountSlot;
  player.rebirths = fresh.rebirths;
  player.ownedTrails = fresh.ownedTrails;
  player.trailSlot = fresh.trailSlot;
  player.ownedAuras = fresh.ownedAuras;
  player.auraSlot = fresh.auraSlot;
  player.ownedItems = fresh.ownedItems;
  player.itemSlot = fresh.itemSlot;
  player.upgradeSlot = fresh.upgradeSlot;
  player.bestStage = fresh.bestStage;
  player.level = fresh.level;
};

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
