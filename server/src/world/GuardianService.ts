import { GUARDIANS, MOUNT_RADIUS, type GuardianConfig } from '@evolve/shared';
import type { GuardianState } from '../rooms/state/CourseState.js';
import type { PlayerState } from '../rooms/state/PlayerState.js';

/** Shortest signed angle from `from` to `to`. */
const shortestAngle = (from: number, to: number): number => {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
};

/** What the service remembers about one guardian between ticks. */
interface Brain {
  /** Seconds of charge still committed to, so it is not twitchy at the edge. */
  commit: number;
  /** Which way it is patrolling when nobody is around. */
  patrolDirection: number;
  /** Session it is currently chasing, for hysteresis. */
  target: string | null;
}

/**
 * The guardians, simulated on the server.
 *
 * They are the only things in this world that cannot be pure functions of
 * time, because they chase: their positions depend on where the players are,
 * which is state. So the SERVER owns them outright - it picks a target from
 * the authoritative positions it already has, moves each guardian, and decides
 * the trample from its own numbers. The client receives x, z, yaw and a
 * charging flag and does nothing but draw them.
 *
 * There is no guardian message. A client cannot move one, cannot claim to have
 * dodged one, and cannot avoid being hit by one.
 *
 * There are TWO of them - the act four grove and the act six run - and this
 * service drives however many the world declares rather than exactly one. A
 * second copy of this class for the second guardian would be a second place to
 * fix a chase bug.
 */
export class GuardianService {
  private readonly brains: Brain[] = GUARDIANS.map(() => ({
    commit: 0,
    patrolDirection: 1,
    target: null,
  }));

  /** How many guardians the world has. The room allocates its state from it. */
  get count(): number {
    return GUARDIANS.length;
  }

  /** Put every guardian back in the middle of its territory. */
  reset(states: readonly GuardianState[]): void {
    for (let i = 0; i < GUARDIANS.length; i += 1) {
      const config = GUARDIANS[i] as GuardianConfig;
      const state = states[i];
      const brain = this.brains[i];
      if (!state || !brain) continue;
      state.x = 0;
      state.y = config.floorY;
      state.z = (config.minZ + config.maxZ) / 2;
      state.rotationY = Math.PI;
      state.charging = false;
      brain.commit = 0;
      brain.target = null;
    }
  }

  /**
   * Advance every guardian one tick.
   *
   * @param players every connected player, as the server has them
   */
  update(
    states: readonly GuardianState[],
    delta: number,
    players: Iterable<PlayerState>,
  ): void {
    const dt = Math.max(0, Math.min(delta, 0.25));
    if (dt === 0) return;

    for (let i = 0; i < GUARDIANS.length; i += 1) {
      const config = GUARDIANS[i] as GuardianConfig;
      const state = states[i];
      const brain = this.brains[i];
      if (!state || !brain) continue;
      this.step(config, state, brain, dt, players);
    }
  }

  private step(
    config: GuardianConfig,
    state: GuardianState,
    brain: Brain,
    dt: number,
    players: Iterable<PlayerState>,
  ): void {
    const prey = this.pickTarget(config, state, brain, players);

    if (prey) {
      brain.target = prey.sessionId;
      brain.commit = config.commit;
    } else {
      brain.commit = Math.max(0, brain.commit - dt);
      if (brain.commit === 0) brain.target = null;
    }

    const charging = prey !== null || brain.commit > 0;
    state.charging = charging;

    // Where it wants to be: on the player, or pacing its patrol line.
    let goalX: number;
    let goalZ: number;
    if (prey) {
      goalX = prey.x;
      goalZ = prey.z;
    } else if (charging) {
      // Committed but out of sight: keep going the way it was already facing.
      goalX = state.x + Math.sin(state.rotationY) * 10;
      goalZ = state.z + Math.cos(state.rotationY) * 10;
    } else {
      goalX = 0;
      goalZ = brain.patrolDirection > 0 ? config.maxZ : config.minZ;
      if (Math.abs(state.z - goalZ) < 4) brain.patrolDirection *= -1;
    }

    const toX = goalX - state.x;
    const toZ = goalZ - state.z;
    const distance = Math.hypot(toX, toZ);
    if (distance > 0.01) {
      // Turn toward the goal at a fixed rate, then walk along the way it is
      // actually facing. Turning and moving independently is what makes a
      // charge readable - it has to commit to a line before it covers ground.
      const desired = Math.atan2(toX, toZ);
      const turn = shortestAngle(state.rotationY, desired);
      const step = config.turnSpeed * dt * (charging ? 1.5 : 1);
      state.rotationY += Math.abs(turn) <= step ? turn : Math.sign(turn) * step;

      const speed = charging ? config.chargeSpeed : config.patrolSpeed;
      state.x += Math.sin(state.rotationY) * speed * dt;
      state.z += Math.cos(state.rotationY) * speed * dt;
    }

    // Kept inside its own territory, so it never wanders into a neighbouring
    // stage and kills someone who never entered the grove.
    state.x = Math.max(-config.halfWidth, Math.min(config.halfWidth, state.x));
    state.z = Math.max(config.minZ, Math.min(config.maxZ, state.z));
    state.y = config.floorY;
  }

  /**
   * True when this player has been trampled by ANY guardian.
   *
   * Evaluated on the server tick against the server's own positions, so there
   * is nothing for a client to dispute.
   */
  hits(states: readonly GuardianState[], player: PlayerState): boolean {
    for (let i = 0; i < GUARDIANS.length; i += 1) {
      const config = GUARDIANS[i] as GuardianConfig;
      const state = states[i];
      if (!state) continue;
      if (!inTerritory(config, player.z)) continue;
      const reach = config.radius + MOUNT_RADIUS;
      if (Math.abs(player.z - state.z) > reach) continue;
      if (Math.abs(player.x - state.x) > reach) continue;
      // Jumping does not save you - it is a guardian, not a rope.
      if (player.y < config.floorY + 6) return true;
    }
    return false;
  }

  /** The nearest player inside this guardian's ground and within range. */
  private pickTarget(
    config: GuardianConfig,
    state: GuardianState,
    brain: Brain,
    players: Iterable<PlayerState>,
  ): PlayerState | null {
    let best: PlayerState | null = null;
    let bestDistance = config.aggroRange;

    for (const player of players) {
      if (!player.ready) continue;
      if (!inTerritory(config, player.z)) continue;
      const distance = Math.hypot(player.x - state.x, player.z - state.z);
      // Hysteresis: it keeps its current target a little past the range it
      // would have picked them up at, so two players close together do not
      // make it flip back and forth every tick.
      const range = player.sessionId === brain.target ? config.leashRange : bestDistance;
      if (distance > range) continue;
      if (best === null || distance < bestDistance) {
        best = player;
        bestDistance = distance;
      }
    }

    return best;
  }
}

const inTerritory = (config: GuardianConfig, z: number): boolean =>
  z >= config.minZ - 10 && z <= config.maxZ + 10;
