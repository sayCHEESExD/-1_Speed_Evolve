/**
 * The world's fixed dimensions, and the table that tunes the expedition.
 *
 * NOTHING here describes a layout. Every platform, path and hazard in the game
 * is emitted by an act's builder walking a `Route`; this file only says how
 * big the valley is and what each stage is called.
 */

/**
 * Global world metrics.
 *
 * Explicitly typed rather than `as const`, because every one of these is a
 * MEASUREMENT that arithmetic is done with. Literal types on a number that is
 * only ever added to make every caller that adds to it an error.
 */
export interface CourseMetrics {
  readonly halfWidth: number;
  readonly floorY: number;
  readonly slabThickness: number;
  readonly valleyFloorY: number;
  readonly wallHeight: number;
  readonly campHalfWidth: number;
  readonly campStartZ: number;
  readonly campEndZ: number;
  readonly stageGap: number;
  readonly stageCount: number;
  readonly fallDepth: number;
}

export const COURSE: CourseMetrics = {
  /**
   * Half-width of the VALLEY, not of a corridor.
   *
   * The previous game in this series ran down a 64-wide corridor with a solid
   * floor under every inch of it, and lateral positions were written as
   * fractions of that width. This world has no such floor: the player is on
   * paths, ledges and bridges strung across a wide valley, and what is beside
   * the path is a drop rather than a wall. The valley is therefore far wider
   * than the route through it ever is, and how far the route wanders inside it
   * is the act builder's business.
   */
  halfWidth: 78,

  /** The elevation everything is measured from: the camp's floor. */
  floorY: 0,
  /** Thickness of a path slab, so every surface has an underside. */
  slabThickness: 3,

  /**
   * The valley floor, far below the paths.
   *
   * A REAL surface, drawn under the whole world. Without it a fall shows the
   * underside of the course and an infinite void, which is what makes a world
   * look unfinished; with it, falling reads as dropping into a valley that was
   * always there.
   */
  valleyFloorY: -46,

  /** Height of the valley's rock walls. Visual; the X clamp is what holds. */
  wallHeight: 92,

  /*
   * The expedition camp's footprint.
   *
   * TWO HUNDRED AND FORTY-EIGHT WIDE and two hundred and twenty-four deep -
   * about seventy percent more ground than the 184 x 172 it replaced. The camp
   * holds four things a player has to be able to tell apart at a glance -
   * twelve pads in two tiers, six treadmills, three traders and three
   * leaderboards - and at the old size the traders ended up standing in front
   * of the treadmills because there was nowhere else for them to go.
   *
   * It grew SIDEWAYS and BACKWARD, never forward: `campEndZ` is where the
   * course cursor starts, and moving it would move every stage in the game.
   *
   * It is WIDER than `halfWidth`, which is allowed: `buildCamp` declares the
   * clearing as a wide area, so the corridor clamp and the valley walls both
   * follow it out. The extra width is not for the four working zones - they
   * fit comfortably without it - but for the band of jungle OUTSIDE them. A
   * clearing whose furniture reaches its own walls has no perimeter to be
   * lush, and the result is a brown room.
   */
  campHalfWidth: 124,
  campStartZ: -224,
  campEndZ: 0,

  /**
   * Distance between the end of one stage and the start of the next.
   *
   * Real ground, not a gap: an expedition walks from one landmark to the next,
   * and the link is where the stage marker, the abandoned camp and the change
   * of scenery live.
   */
  stageGap: 34,

  /** How many stages the expedition has. */
  stageCount: 30,

  /**
   * How far under a walkable surface its kill volume is laid.
   *
   * Every stretch of route lays one automatically (see `Route.carve`), so
   * there is no such thing in this world as a fall with no bottom and no
   * consequence - and, because it follows the route's own elevation, a miss on
   * a path forty units up kills as promptly as a miss on the valley floor.
   */
  fallDepth: 13,
};

/**
 * How quicksand swallows a mount.
 *
 * Read by the simulation, which sinks the mount, and by the route builder,
 * which lays the lethal mud pool at exactly the depth these numbers drown a
 * mount at - so the two cannot disagree about how long a player may stand
 * still.
 */
export interface QuicksandTuning {
  /** Units a second the mount sinks while standing on it. */
  readonly sinkRate: number;
  /** Units a second it works its way back out on firm ground. */
  readonly recoverRate: number;
  /**
   * Depth at which it is under, measured from the quicksand's top.
   *
   * The mud pool under every quicksand patch is laid so its kill line sits
   * exactly here, and the existing fall test does the drowning. `sinkRate`
   * into this is the grace a player has for stopping: about a second and a
   * half.
   */
  readonly drownDepth: number;
  /** Fraction of the mount's ground speed it keeps while bogged. */
  readonly speed: number;
}

export const QUICKSAND: QuicksandTuning = {
  sinkRate: 1.6,
  recoverRate: 6,
  drownDepth: 2.3,
  speed: 0.6,
};

/** One act: five stages that share an environment. */
export interface ActTheme {
  readonly index: number;
  readonly name: string;
  /** Which stage it begins at. */
  readonly firstStage: number;
}

/**
 * The six acts, in order.
 *
 * The expedition travels from the camp at the valley mouth to the summit
 * temple, and the player should be able to tell how far in they are by looking
 * around rather than by reading a number.
 */
export const ACTS: readonly ActTheme[] = [
  { index: 1, name: 'Jungle Entrance', firstStage: 1 },
  { index: 2, name: 'Deep Jungle', firstStage: 6 },
  { index: 3, name: 'Ancient Ruins', firstStage: 11 },
  { index: 4, name: 'Danger Zone', firstStage: 16 },
  { index: 5, name: 'Lost Temple', firstStage: 21 },
  { index: 6, name: 'Final Expedition', firstStage: 26 },
];

/** The act a 1-based stage index belongs to. */
export const actOf = (stage: number): number =>
  Math.min(6, Math.max(1, Math.floor((Math.max(1, stage) - 1) / 5) + 1));

interface StageTuning {
  readonly name: string;
  readonly difficulty: string;
  /**
   * Level the stage is built around.
   *
   * The ladder respects the rebirth cap of 25 levels per rebirth: stage 5 at
   * 15 is inside a first run, stage 10 at 47 wants two, and stage 30 at 160
   * wants six - a real ask for a final expedition, and one the ladder actually
   * reaches.
   */
  readonly recommendedLevel: number;
}

/**
 * Every stage, in one table.
 *
 * The name is what the marker at the stage's entrance is carved with, and it
 * is the only place a stage is named.
 */
export const STAGE_TUNING: readonly StageTuning[] = [
  // Act 1 - Jungle Entrance. Wide dirt trails, shallow creeks, first logs.
  { name: 'Riverside Trail', difficulty: 'EASY', recommendedLevel: 1 },
  { name: 'Fallen Timber', difficulty: 'EASY', recommendedLevel: 3 },
  { name: 'Creekstones', difficulty: 'EASY', recommendedLevel: 6 },
  { name: 'Canopy Steps', difficulty: 'EASY', recommendedLevel: 10 },
  { name: 'Overgrown Gate', difficulty: 'NORMAL', recommendedLevel: 15 },

  // Act 2 - Deep Jungle. Rivers, rope bridges, cliff shelves, the first falls.
  { name: 'Rapids Crossing', difficulty: 'NORMAL', recommendedLevel: 21 },
  { name: 'The Ropewalk', difficulty: 'NORMAL', recommendedLevel: 27 },
  { name: 'Waterfall Ledge', difficulty: 'NORMAL', recommendedLevel: 33 },
  { name: 'Rootwood Climb', difficulty: 'HARD', recommendedLevel: 40 },
  { name: 'The Broken Span', difficulty: 'HARD', recommendedLevel: 47 },

  // Act 3 - Ancient Ruins. Masonry, statues, turning stones, dart traps.
  { name: 'Temple Approach', difficulty: 'HARD', recommendedLevel: 55 },
  { name: 'Hall of Statues', difficulty: 'HARD', recommendedLevel: 63 },
  { name: 'Turning Stones', difficulty: 'HARD', recommendedLevel: 71 },
  { name: 'The Dart Corridor', difficulty: 'INSANE', recommendedLevel: 79 },
  { name: 'Collapsing Court', difficulty: 'INSANE', recommendedLevel: 87 },

  // Act 4 - Danger Zone. Boulders, gales, the guardian, crumbling shelves.
  { name: 'Boulder Run', difficulty: 'INSANE', recommendedLevel: 95 },
  { name: 'Cliffside Gale', difficulty: 'INSANE', recommendedLevel: 103 },
  { name: "The Guardian's Grove", difficulty: 'INSANE', recommendedLevel: 110 },
  { name: 'Crumbling Shelf', difficulty: 'INSANE', recommendedLevel: 116 },
  { name: 'Cataract Leap', difficulty: 'NIGHTMARE', recommendedLevel: 121 },

  // Act 5 - Lost Temple. The great stair, the vault, fire, the deep cavern.
  { name: 'The Great Stair', difficulty: 'NIGHTMARE', recommendedLevel: 126 },
  { name: 'Sunken Vault', difficulty: 'NIGHTMARE', recommendedLevel: 131 },
  { name: 'The Emberway', difficulty: 'NIGHTMARE', recommendedLevel: 136 },
  { name: 'Carousel Court', difficulty: 'NIGHTMARE', recommendedLevel: 141 },
  { name: 'The Deep Cavern', difficulty: 'NIGHTMARE', recommendedLevel: 146 },

  // Act 6 - Final Expedition. Everything at once, at scale.
  { name: 'Valley of Roots', difficulty: 'NIGHTMARE', recommendedLevel: 150 },
  { name: 'Thunder Falls', difficulty: 'NIGHTMARE', recommendedLevel: 153 },
  { name: 'The Skybridge', difficulty: 'NIGHTMARE', recommendedLevel: 156 },
  { name: "Guardian's Run", difficulty: 'NIGHTMARE', recommendedLevel: 158 },
  { name: 'Summit Temple', difficulty: 'NIGHTMARE', recommendedLevel: 160 },
];

/**
 * Wins per stage: 1, 3, 9, and on by threes.
 *
 * A pure geometric ladder rather than an authored table - the specification
 * asks for "the same rapidly increasing progression", and three-to-the-power-of
 * is exactly that. Thirty authored rows would only be thirty chances to make
 * one worth less than the stage before it.
 */
export const stageReward = (index: number): number => 3 ** (Math.max(1, Math.floor(index)) - 1);

/**
 * The win pad at a stage's end: a long studded plate on a spur beside the
 * path, running OUT from it - `width` is across the route, which is the way
 * the spur goes - so it reads as a platform to ride onto rather than a tile.
 */
export const WIN_PAD: { readonly width: number; readonly length: number; readonly height: number } = {
  width: 24,
  length: 12,
  /** How far it stands proud of whatever it sits on. */
  height: 0.4,
};
