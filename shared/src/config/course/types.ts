import type { Aabb } from '../../types/math.js';

/**
 * The world's data model.
 *
 * Everything the player can stand on, bump into, be carried by or be killed by
 * is one of these, and BOTH the renderer and the authoritative server read the
 * same arrays. A platform the client draws but the server does not know about
 * is the one bug this model exists to make impossible.
 *
 * Every moving thing here is a PURE FUNCTION OF TIME. The server evaluates it
 * against its own clock to decide a death or a carry, and the client evaluates
 * the identical function against the replicated clock to draw it - so there is
 * no world state on the wire at all, and nothing for a client to forge. The one
 * exception is the guardian, which chases, and therefore is replicated.
 */

/**
 * What a solid is made of.
 *
 * Presentation reads this; the simulation does not. The list is the material
 * vocabulary of a tropical expedition - packed dirt, lashed planks, cut stone,
 * living wood - rather than a set of colours, because a surface that reads as
 * a thing tells the player what to expect from it.
 */
export type SolidKind =
  /** Packed earth: the cut trails of the first act. */
  | 'dirt'
  /**
   * Undergrowth: the forest floor either side of a trail.
   *
   * Its own kind rather than a shade of `dirt`, because the whole point of a
   * cut trail is that it reads APART from what it was cut through. Two
   * materials is what makes the route legible at three hundred units a second.
   */
  | 'jungle'
  /** Wet mud at a river's edge. Drawn darker, and it handles differently. */
  | 'mud'
  /**
   * Quicksand: ground that SWALLOWS whoever stops on it.
   *
   * The one surface in the world with a memory, and the memory is the
   * player's rather than the world's: `PlayerMotion.sink` grows while the
   * mount stands on it and the surface is that far lower FOR THAT PLAYER.
   * Stop for a second and a half and the mount is under the mud pool laid
   * just beneath it. Keep moving - or jump - and it is only slow going.
   */
  | 'quicksand'
  /**
   * A timed gate: timber or carved stone across the whole route, too tall to
   * jump, that lifts out of the way on a cycle. Always a `gate` mover.
   */
  | 'gate'
  /** Mossy rock: the valley shelves and cliff ledges. */
  | 'rock'
  /** Cut and fitted masonry: the ruins and the temple floors. */
  | 'stone'
  /** Weathered, overgrown masonry: the older ruins. */
  | 'ruin'
  /** Sawn planks: expedition walkways and camp decking. */
  | 'plank'
  /** A felled trunk laid as a crossing, or a living root arching out of a bank. */
  | 'log'
  /** A rope bridge's slat. Narrow, and drawn with its ropes. */
  | 'rope'
  /** Cave rock: the underground sections, and the tunnel linings. */
  | 'cave'
  /** Gold-veined temple stone: the final complex. */
  | 'gilded'
  /** The spawn camp's decking. */
  | 'camp'
  /** The arena floor. */
  | 'lobby'
  /** The raised deck of the training area. */
  | 'training'
  /** A speed-upgrade pad, and the deck the back row stands on. */
  | 'pad'
  /** A shop stall's counter. */
  | 'shop'
  /** A leaderboard's frame. */
  | 'board'
  /** The win pad at a stage's end. */
  | 'winPad';

/** One axis-aligned solid. */
export interface CourseSolid extends Aabb {
  readonly kind: SolidKind;
  /** Stage this belongs to; -1 for the expedition camp. */
  readonly stage: number;
}

/**
 * How a platform moves.
 *
 * The previous game had ONE motion - a platform that sank and returned - and
 * every "moving" obstacle in it was really a hazard orbiting past a static
 * floor. These are platforms the player RIDES, which is a different thing and
 * needs the mount to be carried by them. See `platformOffsetAt`.
 */
export type PlatformMotion =
  /** Slides back and forth along one axis. The workhorse. */
  | 'shuttle'
  /**
   * Travels a circle in the horizontal plane, staying axis-aligned.
   *
   * Drawn as a temple carousel arm. A platform that actually ROTATED would
   * need a rotating collision box, which against an axis-aligned world is a
   * solver rather than a radius - orbiting reads the same and collides
   * exactly.
   */
  | 'orbit'
  /** Rises and falls on the spot: temple lifts and tidal stones. */
  | 'lift'
  /**
   * Holds, drops away, and returns.
   *
   * The collapsing bridge and the crumbling temple floor. Unlike `lift` it
   * spends most of its cycle STILL, so the warning shake is a real warning.
   */
  | 'collapse'
  /**
   * Shut, lifts clear, stays open, drops shut again.
   *
   * The timed gate. `hold` is the fraction of the cycle it is SHUT and
   * `amount` how far it lifts - more than a mount is tall, so an open gate is
   * a doorway rather than a ceiling to crawl under.
   */
  | 'gate';

/**
 * A platform that moves, and carries whoever is standing on it.
 *
 * `CourseSolid` gives its shape at rest; `platformOffsetAt` gives where that
 * shape actually is at an instant.
 */
export interface MovingSolid extends CourseSolid {
  readonly motion: PlatformMotion;
  /** Axis a `shuttle` slides along. Ignored by the others. */
  readonly axis: 'x' | 'z';
  /**
   * Shuttle: half the travel, in world units.
   * Orbit: the radius of the circle.
   * Lift: half the rise.
   * Collapse: how far it drops out of the way.
   */
  readonly amount: number;
  /** Radians per second for an orbit, cycles per second for the rest. */
  readonly rate: number;
  /** Offset, so a row of platforms is never in lockstep. */
  readonly phase: number;
  /**
   * Collapse only: the fraction of the cycle it stays SOLID.
   *
   * High on purpose. A bridge that is gone half the time is a timing puzzle;
   * a bridge that is gone for a fifth of its cycle is a bridge that gives way,
   * which is the set piece this is for.
   */
  readonly hold: number;
}

/**
 * A volume that kills, and the thing it looks like.
 *
 * Rivers, ravines, mud pools and the temple's fire pits are all this. They
 * kill identically and by the same rule; only the look and the height of the
 * surface differ, which is what lets a dozen crossings share one mechanic
 * without reading as one crossing built a dozen times.
 */
export interface PitRegion {
  readonly stage: number;
  readonly surface: 'water' | 'rapids' | 'mud' | 'fire' | 'void';
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** Where the surface is drawn. */
  readonly surfaceY: number;
  /** Below this, the player has drowned or fallen in. */
  readonly deathY: number;
  /** Rapids and rivers flow; used to animate the surface. 0 for still. */
  readonly flow: number;
}

/** How a hazard moves. */
export type HazardKind =
  /**
   * Rolls down the path toward the player and recycles to the top.
   *
   * The boulder chase. Unlike the previous game's roller it can descend as it
   * travels, because the paths it runs down are sloped - a boulder that stayed
   * level while the ground fell away under it read as a hovering ball.
   */
  | 'boulder'
  /**
   * Swings on a pendulum across the path.
   *
   * Vine-hung logs and temple censers: the arc is vertical, so it is low in
   * the middle of its swing and high at the ends, and the timing is about when
   * rather than about where.
   */
  | 'swing'
  /**
   * Orbits a centre in the horizontal plane.
   *
   * Rotating temple stones and sweeping ruin arms. Several at one centre with
   * stepped radii make a BAR rather than a ball.
   */
  | 'spinner'
  /** Falls onto a spot, rests, and rises. Falling debris and temple crushers. */
  | 'faller'
  /** Fires straight across the path on a cycle: the ruin dart traps. */
  | 'dart'
  /** A column of falling water. Lethal to stand under, and drawn as a curtain. */
  | 'cascade'
  /**
   * A thorn vine hanging from the canopy, swinging across the path.
   *
   * A COLUMN like a cascade - from `y` down to `fromY` - that moves like a
   * swing. It reaches the ground, so it is dodged or timed, never jumped.
   */
  | 'vine';

/**
 * A killer whose position is a pure function of TIME.
 *
 * There is no hazard state on the wire and therefore nothing a client can
 * forge: the server checks this against its own clock and its own
 * authoritative position, and the client's identical check is only ever a
 * prediction of a death the server will confirm.
 */
export interface CourseHazard {
  readonly kind: HazardKind;
  readonly stage: number;
  /** Centre of the motion, or the lane a boulder runs down. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  /**
   * Boulder: unused.
   * Swing: the arc's half-width in X.
   * Spinner: orbit radius about (`x`, `z`).
   * Faller: how far above `y` it hovers before it drops.
   * Dart: how far it travels across the path.
   * Cascade: the height of the column.
   */
  readonly sweep: number;
  /**
   * Boulder: units per second down the path.
   * Swing / spinner: radians per second.
   * Faller / dart: seconds for one complete cycle.
   */
  readonly rate: number;
  /** Offset, so a row of hazards is never in lockstep. */
  readonly phase: number;
  /**
   * Boulder: the Z it starts from and rolls toward, and the Y at each end.
   * Vine: `fromY` is the bottom of the column, `y` its top.
   */
  readonly fromZ: number;
  readonly toZ: number;
  readonly fromY: number;
  readonly toY: number;
  /**
   * Boulder: how far it travels in X across its run. Small for one rolling
   * down a curving path; the whole width of the route for one rolling ACROSS
   * it, whose `fromZ` and `toZ` are then the same.
   */
  readonly driftX: number;
  /**
   * Extra half-length in X, beyond `radius`.
   *
   * Zero for a ball. A LOG is a hazard long in X and round in section: a
   * trunk rolling down a slope at the player, floating across a ford, or
   * hung from vines across the path. The kill test reaches `radius + spanX`
   * either side of centre in X and `radius` in Z, so one log is one hazard
   * rather than a dozen balls in a row.
   */
  readonly spanX: number;
}

/** Scenery the client draws and the simulation ignores entirely. */
export type DecorationKind =
  /** A broadleaf jungle tree: trunk plus stacked canopy plates. */
  | 'tree'
  /** A palm: a bare leaning trunk with a crown of fronds. */
  | 'palm'
  /** A low fern cluster. The ground cover that makes a jungle floor. */
  | 'fern'
  /** A flowering bush. */
  | 'bush'
  /** A vine hanging from something above. */
  | 'vine'
  /** A buttress root arching out of the ground. */
  | 'root'
  /** A blocky boulder. */
  | 'rock'
  /** A cluster of mushrooms, for the cave floors. */
  | 'mushroom'
  /** A fallen, moss-covered trunk lying beside the path. */
  | 'fallenLog'
  /** A sheet of falling water down a cliff face. Scenery; `cascade` kills. */
  | 'waterfall'
  /** A ruined arch: two uprights and a lintel. */
  | 'arch'
  /** A weathered statue of an ancient guardian, usually overgrown. */
  | 'statue'
  /** A carved stele: the ancient civilisation's writing. */
  | 'stele'
  /** A lit brazier on a post: the temple corridors. */
  | 'torch'
  /** An expedition tent. */
  | 'tent'
  /** A stack of crates and a lantern: an abandoned camp. */
  | 'crates'
  /** A signpost with a stage number burned into it. */
  | 'marker'
  /** A blocky cloud cluster, high above the valley. */
  | 'cloud';

export interface Decoration {
  readonly kind: DecorationKind;
  readonly stage: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
  readonly rotationY: number;
  /** Palette variant, so a treeline is mottled rather than uniform. */
  readonly tone: number;
}

/**
 * A patch of ground that changes how the mount HANDLES on it.
 *
 * Read inside `stepPlayer` itself, so the server's simulation and the client's
 * prediction cannot handle differently - which for a surface whose whole point
 * is the feel of the controls is the difference between a stage and a
 * rubber-banding mess.
 */
export interface SurfaceRegion {
  readonly stage: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /**
   * Multiplier on ground acceleration AND braking, 1 being normal ground.
   *
   * Below 1 is wet stone or slick mud: slower to speed up, far slower to stop
   * or turn. It scales both deliberately - lowering only the braking would
   * make it a place where the mount is simply harder to stop, rather than one
   * where it is harder to steer.
   */
  readonly grip: number;
  /** Constant sideways push: the wind off a waterfall, the pull of a current. */
  readonly windX: number;
  /** Constant push along the course. Negative holds the player back. */
  readonly windZ: number;
}

/**
 * A stretch of world that is WIDER than the default valley.
 *
 * The camp is one; every arena and courtyard is another. Movement clamps to
 * whatever this says and the renderer builds its valley walls from the same
 * list, so a wide area cannot end up with a boundary the two disagree about.
 */
export interface WideArea {
  readonly minZ: number;
  readonly maxZ: number;
  readonly halfWidth: number;
}

/**
 * A stretch the player travels UNDERGROUND.
 *
 * Read by the renderer alone - it darkens the fog, drops the sun and lights
 * the tunnel - and by nothing in the simulation. A cave is a roof and a
 * lighting change; the roof is ordinary solids like any other.
 */
export interface CaveRegion {
  readonly stage: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** How dark it gets at the deepest point, 0..1. */
  readonly depth: number;
}

/**
 * Ground a guardian hunts over.
 *
 * Every other moving thing in this world is a pure function of time; a
 * guardian is not, because it reacts to where the players are. It is therefore
 * simulated by the server and replicated, and the trample is decided on the
 * server tick from the server's own position for it.
 */
export interface GuardianTerritory {
  readonly stage: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly halfWidth: number;
  /** The elevation of the arena floor it walks on. */
  readonly floorY: number;
}

/** One stage of the expedition. */
export interface StageDefinition {
  /** 1-based, as the marker at its entrance shows it. */
  readonly index: number;
  readonly name: string;
  readonly difficulty: string;
  /** Which act it belongs to, for the environment's palette and scenery. */
  readonly act: number;
  /** Advisory only - shown on the marker, never enforced. */
  readonly recommendedLevel: number;
  /** Lifetime Speed the recommended level corresponds to. DERIVED, never authored. */
  readonly recommendedSpeed: number;
  readonly startZ: number;
  readonly endZ: number;
  /** Centre of the win pad at the stage's end. */
  readonly winPadX: number;
  readonly winPadY: number;
  readonly winPadZ: number;
  /** Wins awarded for reaching it. */
  readonly winReward: number;
}
