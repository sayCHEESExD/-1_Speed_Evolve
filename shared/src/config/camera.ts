/**
 * Third-person chase camera tuning.
 *
 * Lives in shared config so gameplay can reason about framing without
 * importing the renderer.
 */
export interface CameraConfig {
  /** Distance behind the mount at rest, in world units. */
  readonly distance: number;
  /** Height above the mount's feet that the camera sits at. */
  readonly height: number;
  /** Height above the hooves that the camera looks at - the rider's chest. */
  readonly lookAtHeight: number;
  /** Positional smoothing factor per second (higher = snappier). */
  readonly followLerp: number;
  /** Vertical field of view in degrees at rest. */
  readonly fov: number;
  readonly near: number;
  readonly far: number;
  /**
   * Extra distance at full speed.
   *
   * Late game runs at hundreds of units a second, and a fixed camera makes the
   * next gap arrive with no warning. Pulling back is what buys the reaction
   * time the obby needs at those speeds.
   */
  readonly speedDistance: number;
  /** Extra vertical FOV in degrees at full speed, for the sense of rush. */
  readonly speedFov: number;
  /** Speed at which the two allowances above are fully applied. */
  readonly speedReference: number;
  /** How fast the dynamic distance and FOV ease, per second. */
  readonly speedEase: number;

  /**
   * Closest the player may pull the camera, as an OFFSET on `distance`.
   *
   * An offset rather than an absolute distance, because the speed pull-back is
   * an offset too: the player's zoom and the game's framing then add, and
   * zooming in at speed still gives the shot the obby needs rather than
   * fighting it.
   */
  readonly zoomMin: number;
  /** Furthest the player may push the camera, as an offset on `distance`. */
  readonly zoomMax: number;
  /** World units of zoom per wheel notch. */
  readonly zoomStep: number;
  /**
   * How fast the zoom eases toward what the wheel asked for, per second.
   *
   * A wheel arrives as discrete notches, and applying one to the distance
   * directly is a jump. Easing turns each notch into a short glide, which is
   * the difference between a zoom that feels like a control and one that feels
   * like a stutter.
   */
  readonly zoomEase: number;

  /**
   * Height of the mount this framing was authored around.
   *
   * The roster runs from a cockroach two units at the shoulder to a dragon
   * over five, and a distance that frames one crowds the other. `subjectScale`
   * turns the difference from this reference height into extra distance, so
   * every mount is framed the way the cockroach is rather than the way the
   * biggest one happens to be.
   */
  readonly subjectHeight: number;
  /** Extra distance per world unit the mount is taller than the reference. */
  readonly subjectScale: number;
}

/**
 * Framed for the reference art: the mount and rider together fill about a
 * sixth of the frame's height, sitting low and centred, with the corridor
 * ahead visible as far as the next obstacle.
 *
 * Pulled back from the previous game's 9.6. That framing was authored for a
 * camera looking at a horse in a corridor; at this game's arena scale - twelve
 * upgrade pads down one side and six treadmills down the other - it put the
 * camera close enough to clip into the furniture and left the player unable to
 * see the bank they were riding along.
 */
export const CAMERA: CameraConfig = {
  distance: 15.5,
  height: 6.4,
  lookAtHeight: 3.4,
  followLerp: 9,
  fov: 68,
  near: 0.1,
  far: 2200,
  speedDistance: 7.5,
  speedFov: 12,
  speedReference: 140,
  speedEase: 2.2,

  // 5.6 to 21.6 units behind the mount at rest. The near limit keeps the
  // camera outside the animal - the mount is a body, not a point, and a
  // distance that reaches inside it renders the player's own head from within.
  // The far limit is roughly twice the authored framing, which is as far back
  // as the corridor still reads as a corridor.
  zoomMin: -8,
  zoomMax: 14,
  zoomStep: 1.4,
  zoomEase: 12,

  // The cockroach stands about 2.1 at the shoulder with a 3.2 rider on top.
  subjectHeight: 5.2,
  subjectScale: 1.6,
};
