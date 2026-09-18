import { GUARDIAN_TERRITORIES, type GuardianTerritory } from './course.js';

/**
 * The guardians that hunt the groves of stages 18 and 29.
 *
 * Unlike every other moving thing in this world, a guardian is NOT a pure
 * function of time: it reacts to where the players are, and that is state
 * rather than a formula. So it is simulated by the server, replicated, and the
 * trample is decided on the server tick from the server's own position for it.
 *
 * There are TWO of them, and that is the reason this replaced the previous
 * game's single-chaser service: the act four grove is where the player learns
 * what one is, and the act six run is where one is the stage. Both territories
 * are DERIVED from the arenas those stages actually laid, rather than authored
 * beside them - a guardian whose patrol range and whose floor disagree is one
 * that walks off the edge of its own stage.
 */
export interface GuardianConfig extends GuardianTerritory {
  /** Height of its shoulder above the arena floor - it is meant to loom. */
  readonly shoulderY: number;
  /** Body radius used for the trample test. */
  readonly radius: number;
  /** Patrol speed when nobody has been noticed. */
  readonly patrolSpeed: number;
  /** Charge speed once a player is in range. */
  readonly chargeSpeed: number;
  /** How far it can notice a player. */
  readonly aggroRange: number;
  /** How far it will chase before giving up and returning to patrol. */
  readonly leashRange: number;
  /** Turn rate, radians per second. Deliberately ponderous. */
  readonly turnSpeed: number;
  /** Seconds it keeps charging after losing sight, so it is not twitchy. */
  readonly commit: number;
}

/**
 * Inset from the arena's edge, so a guardian never grinds along a wall.
 *
 * It using slightly less of the ground than the player does is what keeps a
 * corner from becoming a safe spot AND keeps the animal off the geometry.
 */
const INSET = 6;

/**
 * How each guardian behaves, by the stage it belongs to.
 *
 * The act six one is faster, notices further and commits harder: by then the
 * player is several times quicker than they were in act four, and a chase
 * tuned for act four would be a chase the player simply outruns without ever
 * looking behind them.
 */
const TUNING: Record<number, Omit<GuardianConfig, keyof GuardianTerritory>> = {
  18: {
    shoulderY: 0,
    radius: 6,
    patrolSpeed: 11,
    chargeSpeed: 34,
    aggroRange: 66,
    leashRange: 120,
    turnSpeed: 1.5,
    commit: 1.6,
  },
  29: {
    shoulderY: 0,
    radius: 6.6,
    patrolSpeed: 16,
    chargeSpeed: 62,
    aggroRange: 92,
    leashRange: 190,
    turnSpeed: 2.1,
    commit: 2.4,
  },
};

const DEFAULT_TUNING = TUNING[18] as Omit<GuardianConfig, keyof GuardianTerritory>;

/** Every guardian in the world, in stage order. */
export const GUARDIANS: readonly GuardianConfig[] = GUARDIAN_TERRITORIES.map((territory) => ({
  ...(TUNING[territory.stage] ?? DEFAULT_TUNING),
  ...territory,
  minZ: territory.minZ + INSET,
  maxZ: territory.maxZ - INSET,
  halfWidth: territory.halfWidth - INSET,
  shoulderY: territory.floorY,
}));

/** The guardian whose ground a Z is on, or null. */
export const guardianAt = (z: number): GuardianConfig | null => {
  for (const guardian of GUARDIANS) {
    if (z >= guardian.minZ - 40 && z <= guardian.maxZ + 40) return guardian;
  }
  return null;
};
