import type { AvatarAppearance, AvatarProportions } from './avatar.js';

/**
 * Client -> server input (MessageType.Move).
 *
 * INPUT ONLY. There is deliberately no position, velocity or rotation here:
 * the server simulates movement from intent and owns the result, so a client
 * has no channel through which to assert where it is.
 *
 * `seq` lets the server tell the client which inputs it has consumed, which is
 * what makes client-side prediction reconcilable.
 */
export interface MoveMessage {
  /** Monotonically increasing input sequence number. */
  seq: number;
  /** Seconds this input covers. Clamped and rate-limited server-side. */
  dt: number;
  /** -1..1, camera-relative. */
  moveX: number;
  /** -1..1, camera-relative. */
  moveZ: number;
  jump: boolean;
  /** Yaw the camera faced, so movement is camera-relative. */
  cameraYaw: number;
}

/** Why a run ended. */
export type RespawnReason =
  /** Fell out of the world, or into quicksand. */
  | 'fell'
  /** Hit a boulder, a sweeper or the elephant. */
  | 'hazard'
  /** Asked to be put back. */
  | 'manual'
  /** Just joined. */
  | 'join'
  /** Banked a stage and was returned to the arena. */
  | 'stage'
  /** Rebirthed, which resets the run as well as the level curve. */
  | 'rebirth';

/** Server -> client authoritative respawn (MessageType.Respawn). */
export interface RespawnMessage {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  reason: RespawnReason;
}

/**
 * Client -> server: "I reached this stage's finish pad."
 *
 * A request, never a grant. The server checks the stage index, the position it
 * has itself simulated, and whether this stage is already banked for the
 * current visit, then awards the Wins itself.
 */
export interface ClaimStageMessage {
  stageIndex: number;
}

/**
 * Client -> server: "I rode onto this speed-upgrade pad, equip it."
 *
 * A request, never a grant. The server checks the slot, the player's Wins and
 * that they are actually standing on that pad. Nothing is deducted - an
 * upgrade pad is a threshold, not a purchase - so the worst a forged slot can
 * do is be refused.
 */
export interface ClaimUpgradeMessage {
  slot: number;
}

/** Server -> client: a stage reward landed. Presentation only. */
export interface StageAwardedMessage {
  stageIndex: number;
  wins: number;
  /** Wins the player now holds, so the HUD can pop without waiting a patch. */
  total: number;
}

/**
 * Server -> client: ONE step's worth of Speed, already credited.
 *
 * One message is one award is one step. `gain` is exactly
 * `calculateSpeedGain(...).gain` for the player at that moment - never a sum
 * of several steps, and never multiplied by a count. The message used to
 * carry a batch (`steps` x `perStep`), and the step count - how many strides
 * happened to complete inside one server tick - is what players read as a
 * changing multiplier: "1.06 x 5", "1.06 x 8".
 */
export interface SpeedAwardedMessage {
  /** The Speed this one step paid. Identical for every step at one setup. */
  gain: number;
  /** The input (its sequence number) whose movement completed the step. */
  seq: number;
  /** What completed the step: riding, or a treadmill belt. */
  source: 'stride' | 'belt';
  /** The authoritative lifetime total once this step had been added. */
  total: number;
}

/**
 * Client -> server: "rebirth me".
 *
 * Deliberately empty. The server knows the level and the rebirth count, and it
 * is the only thing allowed to decide whether the requirement is met - so
 * there is nothing in this message that could be wrong.
 */
export type RebirthMessage = Record<string, never>;

/** Client -> server: buy the trail in this slot. A request, never a grant. */
export interface BuyTrailMessage {
  slot: number;
}

/** Client -> server: wear an owned trail, or 0 to take it off. */
export interface EquipTrailMessage {
  slot: number;
}

/** Client -> server: buy the aura in this slot. A request, never a grant. */
export interface BuyAuraMessage {
  slot: number;
}

/** Client -> server: wear an owned aura, or 0 to take it off. */
export interface EquipAuraMessage {
  slot: number;
}

/** Client -> server: buy the item in this slot. A request, never a grant. */
export interface BuyItemMessage {
  slot: number;
}

/** Client -> server: carry an owned item, or 0 to put it away. */
export interface EquipItemMessage {
  slot: number;
}

/**
 * Server -> client: the mount evolved into a new species.
 *
 * Presentation only. The evolution is already in replicated state when this
 * arrives, so a client that never receives it simply does not play the
 * fanfare - it does not end up riding the wrong creature.
 */
export interface EvolvedMessage {
  /** The slot evolved INTO. */
  slot: number;
  /** Its display name, so the banner needs no roster lookup of its own. */
  name: string;
}

/**
 * Client -> server: the player's Bloxity appearance.
 *
 * Sent on join and again whenever the portal reports a change, so a player who
 * re-dresses mid-run is re-drawn for everyone without a reload.
 */
export interface SetAvatarMessage {
  appearance: AvatarAppearance;
  proportions: AvatarProportions;
}
