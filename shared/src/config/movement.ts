/**
 * Movement tuning for a RIDDEN MOUNT.
 *
 * The client predicts with these numbers and the server simulates with them,
 * so they must not diverge - which is why there is one copy, here.
 *
 * The mount is the movement character: it accelerates harder and turns slower
 * than a person, and it is what the collision body belongs to. The rider is
 * carried and has no physics of their own.
 */
export interface MovementConfig {
  /**
   * THE ground speed, in world units per second, before every multiplier.
   *
   * One figure, because there is one gait. There used to be a `walkSpeed` of
   * 14 beside it and a Shift key that chose between them, which was a second
   * speed system competing with the one the whole progression ladder feeds:
   * a player's level bought them a multiplier on whichever of two numbers a
   * modifier key happened to select. The multiplier is the game; the key was
   * a way of turning most of it off.
   */
  readonly runSpeed: number;
  /** Ground acceleration, world units per second squared. */
  readonly acceleration: number;
  /** Ground deceleration when the stick is released. */
  readonly deceleration: number;
  /** Fraction of ground acceleration retained while airborne (0..1). */
  readonly airControl: number;
  /** Downward acceleration, world units per second squared. */
  readonly gravity: number;
  /** Upward velocity applied on jump, world units per second. */
  readonly jumpVelocity: number;
  /**
   * Turn rate toward the movement direction, radians per second.
   *
   * Slower than a person on foot on purpose: an animal leans into a turn, and
   * an instant snap is what makes a mount read as a floating camera.
   */
  readonly turnSpeed: number;
  /**
   * Largest distance the simulation will integrate in one substep.
   *
   * THE reason this game has no speed cap. Late-game movement runs at
   * hundreds of units a second, and a single 1/60s step at that speed would
   * step clean over a plank, a pillar and the gap beyond it - so the old
   * answer was always to cap the speed. `stepPlayer` subdivides its own step
   * until every substep moves less than this, which makes collision exactly as
   * reliable at 400 u/s as at 20.
   */
  readonly maxSubstepDistance: number;
  /** Most substeps one step may take, so a pathological speed cannot hang. */
  readonly maxSubsteps: number;
  /**
   * Height the mount steps up without jumping.
   *
   * A block edge, a plank lip, an upgrade pad and the 0.55-unit kerbs are all
   * below this, so the course never needs a hop for something that reads as a
   * kerb. It is deliberately the same number as `LANDING_TOLERANCE`.
   */
  readonly stepHeight: number;
}

export const MOVEMENT: MovementConfig = {
  runSpeed: 24,
  acceleration: 85,
  deceleration: 60,
  airControl: 0.42,
  gravity: 62,
  jumpVelocity: 25,
  turnSpeed: 7.5,
  maxSubstepDistance: 0.8,
  maxSubsteps: 48,
  stepHeight: 0.9,
};

/**
 * How level turns into a movement profile.
 *
 * This is the single evaluator: nothing else may compute a movement speed. The
 * server resolves it and replicates the multiplier; the client multiplies the
 * base speeds above by exactly that and never derives its own.
 *
 * Note what is NOT an input here, and how deliberate that is. The rebirth
 * multiplier, the mount's multiplier, the trail's and the aura's all belong to
 * the SPEED-GAIN formula in `speed.ts` and none of them appears in this one.
 * Physical speed comes from LEVEL alone. A 400x trail multiplying how fast the
 * rider travels would put them through a thirty-stage obby faster than its
 * platforms could be drawn, let alone read; multiplying how fast they EARN is
 * the reward the player actually wants, and it reaches movement anyway - by
 * buying levels, which is the long way round on purpose.
 */
export interface MovementProfile {
  /** Multiplier on `runSpeed`. */
  readonly multiplier: number;
  /** Resolved ground speed in world units per second. */
  readonly runSpeed: number;
  /** Resolved jump velocity. */
  readonly jumpVelocity: number;
}

/** Speed added per level, as a fraction of the base. */
const SPEED_PER_LEVEL = 0.06;

/**
 * Levels over which the per-level gain decays to half its value.
 *
 * `steps / (1 + steps / LEVEL_SOFT_CAP)` rises quickly at first, so the first
 * twenty levels feel like genuinely getting faster, and converges on
 * `SPEED_PER_LEVEL * LEVEL_SOFT_CAP` - a ceiling of about x8 however long
 * anyone grinds. A LINEAR term is what made the previous game's mount
 * unmanageable: every level added the same slab of speed for ever, and the end
 * of the ladder was far past the point where a platform can be seen, judged
 * and landed on.
 *
 * The soft cap is high (120) because this game's levels are cheap and its
 * ladder is long: stage 30 is built for level 160, and a curve that had
 * flattened by level 25 would make the last ten stages identical to the first.
 */
const LEVEL_SOFT_CAP = 120;

/**
 * Resolve the profile a player actually moves at.
 *
 * @param level current level, 1-based
 */
export const resolveMovementProfile = (level: number): MovementProfile => {
  const steps = Math.max(0, Math.floor(level) - 1);

  // Diminishing returns, so a very high level is faster than a high one
  // without being a different game.
  const levelGain = (steps / (1 + steps / LEVEL_SOFT_CAP)) * SPEED_PER_LEVEL;
  const multiplier = 1 + levelGain;

  return {
    multiplier,
    runSpeed: MOVEMENT.runSpeed * multiplier,
    // Jump velocity scales far more gently than travel speed. A jump that grew
    // with the multiplier would put a late-game player over the side walls;
    // distance is meant to come from APPROACH SPEED, which it already does.
    jumpVelocity: MOVEMENT.jumpVelocity * (1 + Math.min(multiplier - 1, 6) * 0.08),
  };
};
