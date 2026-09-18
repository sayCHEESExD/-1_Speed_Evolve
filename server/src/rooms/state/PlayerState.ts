import { Schema, type } from '@colyseus/schema';
import { AvatarState } from './AvatarState.js';
import {
  INITIAL_UNLOCKED_MOUNTS,
  MountAnimationState,
  SPAWN_POSITION,
  SPAWN_ROTATION_Y,
  STARTER_MOUNT_SLOT,
  STARTER_UPGRADE_SLOT,
} from '@evolve/shared';

/**
 * Replicated per-player state.
 *
 * Every field here is written by the SERVER. Transform and motion come out of
 * the authoritative simulation; progression, Wins, the evolution chain and the
 * two cosmetic ladders are written only by their own service. Nothing is ever
 * copied from a client message.
 *
 * Note what is NOT here: bone rotations, mount part transforms, gait timers.
 * Clients reconstruct the whole animation from the compact motion fields.
 */
export class PlayerState extends Schema {
  @type('string') sessionId = '';

  /** The transform of the MOUNT. The rider is carried and has none. */
  @type('float32') x: number = SPAWN_POSITION.x;
  @type('float32') y: number = SPAWN_POSITION.y;
  @type('float32') z: number = SPAWN_POSITION.z;
  @type('float32') rotationY: number = SPAWN_ROTATION_Y;

  /** Horizontal speed, drives the remote gait blend. */
  @type('float32') speed = 0;
  /** Vertical velocity, distinguishes the rising and falling poses. */
  @type('float32') verticalVelocity = 0;
  @type('boolean') grounded = true;

  /** Authoritative velocity, needed by the client to reconcile prediction. */
  @type('float32') velocityX = 0;
  @type('float32') velocityY = 0;
  @type('float32') velocityZ = 0;
  /** Highest input sequence the server has simulated for this player. */
  @type('uint32') lastInputSeq = 0;

  /**
   * LATCHED simulation state, replicated so client reconciliation can restore
   * the FULL authoritative motion before it replays unacknowledged input.
   *
   * Neither is a transform and neither is ever read back from a client. Replay
   * is only correct when it resumes from exactly the state the server was in:
   * `jumpLatched` decides whether the next input counts as a fresh press, and
   * `coyote` decides whether a jump just off a plank lip is still allowed.
   * Restoring position and velocity but not these makes replay derive
   * different jump EDGES than the server took.
   */
  @type('boolean') jumpLatched = false;
  @type('float32') coyote = 0;

  /** Monotonic counts, so a remote client can trigger one-shot animations. */
  @type('uint32') jumpCount = 0;
  @type('uint32') deathCount = 0;

  /**
   * Treadmill the player is standing on, or 0.
   *
   * DERIVED by the simulation from the position the server itself computed.
   * There is no treadmill message, so a client can neither claim a belt it is
   * not on nor keep the bonus after stepping off. The rebirth gate on the
   * better belts is applied where the Speed is granted, not here: this is a
   * statement about where the mount IS.
   */
  @type('uint8') treadmill = 0;

  @type('string') animation: MountAnimationState = MountAnimationState.Idle;

  /**
   * How this player looks in the Bloxity portal.
   *
   * The ONE part of this schema that originates with a client, and the comment
   * at the top of this file still holds everywhere it matters: this decides
   * nothing. It is sanitised on arrival, it is cosmetic, and no service reads
   * it. See `AvatarState`.
   */
  @type(AvatarState) avatar = new AvatarState();

  /**
   * The name drawn over this player's head and on the boards.
   *
   * Always filled in by the SERVER: the player's Bloxity name when they sent
   * one, and otherwise the handle derived from their id - so no nameplate is
   * ever blank and no id ever reaches a client. Like `avatar`, it is sanitised
   * on arrival, cosmetic, and read by nothing that decides an outcome.
   */
  @type('string') displayName = '';
  /** Their Bloxity portrait, pinned to Bloxity's own image host. '' for none. */
  @type('string') pfp = '';

  /**
   * The Bloxity name alone, WITHOUT the fallback handle.
   *
   * Deliberately NOT decorated, so it is never replicated. It is what gets
   * persisted: a stored profile keeps a real name for the boards, while a
   * handle is re-derived from the id on every read - storing one would only be
   * a copy that could drift from the rule that makes it.
   */
  accountName = '';

  /** Server-authoritative progression. */
  @type('uint32') level = 1;
  /**
   * Rebirths performed. `uint32`, not `uint16`: the ladder has no end, and at
   * `uint16` rebirth 65536 would wrap to zero and take the level cap with it.
   */
  @type('uint32') rebirths = 0;
  /**
   * Stage wins. Awarded by StageService and spent by the two shops, always
   * through `Wallet`. Never read from a client.
   *
   * `float64`, not the previous game's `uint32`, and it had to change: the Sun
   * trail costs 250 TRILLION Wins and a uint32 stops at 4.3 billion, so the
   * top half of both shops would have been unbuyable by construction.
   */
  @type('float64') wins = 0;
  /** Lifetime farmed Speed. Awarded by SpeedService only. Drives level. */
  @type('float64') totalSpeed = 0;

  /**
   * Equipped mount - the highest one evolved into. Written by EvolveService.
   *
   * Every player is always riding something: there is no "no mount" state, and
   * slot 1 is free and unlocked from the first frame.
   */
  @type('uint8') mountSlot = STARTER_MOUNT_SLOT;
  /** Bitmask of mounts unlocked. Written by EvolveService only. */
  @type('uint32') unlockedMounts = INITIAL_UNLOCKED_MOUNTS;

  /**
   * Equipped speed-upgrade pad. Written by UpgradeService only.
   *
   * Sets the BASE Speed per step - the one term in the gain formula that is
   * not a multiplier - so it is the largest single lever on a player's income.
   */
  @type('uint8') upgradeSlot = STARTER_UPGRADE_SLOT;

  /**
   * What one step is actually worth, and the product of the multipliers alone.
   *
   * Both are RESOLVED by the one shared gain formula and replicated, so the
   * HUD's "+N" popups and its "Total Multiplier: x2.20" readout show exactly
   * what the server paid rather than a figure the client worked out for
   * itself. `float32` is fine for both: they are read, never accumulated.
   */
  @type('float32') speedPerStep = 1;
  @type('float32') totalMultiplier = 1;

  /**
   * Authoritative movement multiplier and jump velocity, resolved from LEVEL
   * by the one shared formula. The client moves at exactly these - it never
   * derives its own.
   */
  @type('float32') moveMultiplier = 1;
  @type('float32') jumpVelocity = 25;

  /**
   * Level cap for the current rebirth. `uint32`, for the same reason as
   * `rebirths`.
   */
  @type('uint32') maxLevel = 25;

  /** Highest stage (1-based) ever banked. 0 before the first finish. */
  @type('uint32') bestStage = 0;

  /**
   * The two cosmetic ladders. Written ONLY by their `CosmeticService`; a
   * client sends a slot number to buy or equip and never a cost or a
   * multiplier, so there is no figure in a message to forge.
   *
   * Both multiply SPEED GAIN through the one shared formula - never movement
   * speed, and never a calculation of their own.
   */
  @type('uint16') ownedTrails = 0;
  @type('uint8') trailSlot = 0;
  @type('uint16') ownedAuras = 0;
  @type('uint8') auraSlot = 0;
  /**
   * The third ladder, and the one that multiplies something else.
   *
   * An item scales the WINS a stage pays rather than the Speed a step earns,
   * which is what stops the third shop being the first two at a worse price.
   */
  @type('uint16') ownedItems = 0;
  @type('uint8') itemSlot = 0;

  /** True once the server has simulated at least one input for this player. */
  @type('boolean') ready = false;
}
