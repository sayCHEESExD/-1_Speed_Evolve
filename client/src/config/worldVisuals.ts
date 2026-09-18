/**
 * The palette of the tropical expedition.
 *
 * COLOUR ONLY. Every world coordinate lives in `@evolve/shared`'s course
 * package, so this file can be re-themed without moving a single collider.
 *
 * The look is toy-brick rainforest: flat saturated colour, a stud pattern on
 * packed earth, rust-red canyon rock, weathered grey masonry that turns gold
 * in the summit temple, and water that is either turquoise and still or white
 * and furious. No PBR, no roughness maps, no image files - every texture is
 * drawn on a canvas at runtime, so the whole style costs nothing against the
 * 12 MB budget.
 *
 * The acts are meant to read apart at a glance: green and brown for the
 * jungle, grey and torchlit for the ruins, and gold and black for the temple.
 * A player who cannot tell which act they are in from one screenshot is a
 * player the environment has failed.
 */
export const PALETTE = {
  /* ---- Ground the expedition walks on ---------------------------------- */

  /** Packed jungle earth: the trails of act one. */
  dirt: '#8a6039',
  dirtDark: '#6e4a2b',
  dirtSpeck: 'rgba(40,24,10,0.30)',

  /** Wet mud at a river's edge. Darker, and it handles differently. */
  mud: '#5e4526',
  mudDark: '#46331b',

  /** Mossy rock: valley shelves, cliff ledges, stepping stones. */
  rock: '#7d8a6a',
  rockDark: '#5e6a4e',

  /** Cut and fitted masonry: the ruins and the temple floors. */
  stone: '#a8a496',
  stoneDark: '#87836f',

  /** Weathered, overgrown masonry: the older ruins. */
  ruin: '#8d9382',
  ruinDark: '#6e7466',

  /** Sawn planks: expedition walkways and camp decking. */
  plank: '#9a6a3c',
  plankDark: '#7a5029',
  plankSpeck: 'rgba(38,20,8,0.34)',

  /** Felled trunks, and the living roots the route runs along. */
  log: '#7a5330',
  logDark: '#5d3d21',

  /** A rope bridge's slat, and the ropes themselves. */
  rope: '#b08750',
  ropeDark: '#8a6535',
  ropeCord: 0xd8bd88,

  /** Cave rock: the underground sections and the tunnel linings. */
  cave: '#4a4550',
  caveDark: '#332f3a',

  /** Gold-veined temple stone: the final complex. */
  gilded: '#b9a24f',
  gildedDark: '#8d7834',

  /* ---- The valley ------------------------------------------------------- */

  /** Rust-red canyon rock. Ledges cut into a bank, never a boundary wall. */
  cliff: '#a8604a',
  cliffDark: '#8a4b38',
  cliffSpeck: 'rgba(58,30,16,0.22)',

  /*
   * The rainforest floor the world is cut through.
   *
   * These two replaced the ninety-unit brick walls that used to bound the
   * valley. A boundary has to stop the eye, and a wall is the laziest way to
   * do it: what stops the eye here is a forest floor climbing away from the
   * route with trees standing on it. The bank is the wet earth at the route's
   * own edge; the floor is the leaf litter further up and further back.
   */
  forestBank: 0x5e4426,
  forestFloor: 0x3f5c28,

  /** Dense canopy capping the far ranks. */
  canopyCap: 0x2f9c28,
  canopyCapDark: 0x217a1c,

  /** The valley floor, far below everything: canopy seen from above. */
  valleyFloor: 0x27501e,

  /* ---- Water, mud and fire ---------------------------------------------- */

  /** Still water: creeks, pools, the flooded vault. */
  water: '#2f9fd6',
  waterDark: '#1d74a5',
  /** White water: rapids, cataracts, the river under the cavern. */
  rapids: '#7fd4f0',
  rapidsDark: '#3f9fc8',
  /** Shallow forest-floor water: a stream you can see the bed through. */
  streamWater: 0x63c6d8,
  /** A mud pool. */
  mudPool: '#5a4227',
  mudPoolDark: '#3f2d18',
  /** The temple's fire pits: the one thing in the world that emits light. */
  fire: '#ff6a1e',
  fireDark: '#c02f08',
  /** The bottom of a genuine drop: haze, not a surface. */
  voidHaze: '#2b3f46',

  /* ---- Vegetation -------------------------------------------------------- */

  /** Broadleaf canopy, in three tones so a treeline is mottled. */
  leafA: 0x3fbb2c,
  leafB: 0x2f9c28,
  leafC: 0x57cc3a,
  /** Palm fronds: yellower than the broadleaf. */
  frond: 0x6fc93a,
  /** Trunks. */
  trunk: 0x6f4726,
  trunkDark: 0x523318,
  /** Ground cover. */
  fern: 0x49b83a,
  fernDark: 0x2f8a26,
  bush: 0x3aa830,
  flower: 0xff6fa8,
  flowerAlt: 0xffd83d,
  /** Hanging vines. */
  vine: 0x3ab030,
  /** Moss on stone. */
  moss: 0x5aa83a,
  /** Cave fungus: the only light in the deep cavern. */
  fungus: 0x8ce0d2,
  fungusGlow: 0x4fd6c0,

  /* ---- Objects ----------------------------------------------------------- */

  /** Boulders, and the rocks that come off the cliffs. */
  boulder: 0x7d7468,
  boulderDark: 0x5e564c,
  /** Ancient statues and stelae. */
  statue: 0x9a9789,
  statueDark: 0x77746a,
  /** Carved detail and gold inlay on the temple. */
  inlay: 0xd8b43c,
  /** Torch flame. */
  flame: 0xffb32e,
  flameCore: 0xfff0a8,
  /*
   * The camp's own building materials.
   *
   * Numeric, because these are vertex colours on structures the camp BUILT -
   * the treadmill rigs, the trader huts, the training platforms - rather than
   * canvas textures on the ground. One set shared by all four, which is what
   * makes them look like one expedition's work instead of four features that
   * happen to stand near each other.
   */
  timber: 0x8a6134,
  /** Palm thatch: the one roof an expedition can build out of a rainforest. */
  thatch: 0xb4933f,
  thatchDark: 0x8d7029,
  timberDark: 0x5f4022,
  rockSolid: 0x8e9484,
  /** Expedition canvas and crates. */
  canvas: '#d8c9a8',
  canvasDark: '#b0a084',
  crate: 0x9a6a3c,

  /* ---- Hazards ----------------------------------------------------------- */

  /**
   * Lethal moving things are LAVENDER, all of them.
   *
   * A colour is a promise in this game. The previous one in the series learned
   * this the hard way with log-brown arms turning over a log-brown floor -
   * invisible until they had already hit - and the rule has been absolute
   * since: if it moves and it kills, it is this colour and no other object in
   * the world is.
   */
  hazard: 0xb3a4e6,
  hazardRim: 0x8f7ecb,
  /**
   * Boulders and falling debris: stone, but stone that has been PULLED toward
   * the lavender.
   *
   * They are rock rather than machinery, so painting them the flat hazard
   * colour would make the mountain look like it was shedding plastic. But a
   * grey boulder rolling down a grey ramp is camouflage, which is the exact
   * failure the lavender rule exists to prevent - so they meet in the middle
   * and read as danger against every surface in the game.
   */
  hazardRock: 0x9e8fbe,
  hazardRockDark: 0x7d6f9c,
  /** The warning patch under something about to land on you. */
  impactWarn: 0x2a2f36,
  /** A collapsing platform flushes toward this before it gives way. */
  collapseWarn: 0xff6b4a,

  /* ---- The camp ---------------------------------------------------------- */

  /** The clearing's floor, and the training deck over it. */
  camp: '#7d5a33',
  campDark: '#5f4325',
  deck: '#8a5f36',
  deckDark: '#6a4728',
  treadmillFrame: 0xf6c343,
  treadmillFrameDark: 0xc9971f,
  /**
   * The belt is DARK, and deliberately so. A belt the same colour as the deck
   * reads as a hole in the frame from the front; dark rubber under a bright
   * frame, with chevrons travelling over it, is what makes it a treadmill.
   */
  treadmillBelt: 0x2b3a33,
  treadmillScreen: 0x27323d,

  /** Gold chequered win dais. */
  winPad: '#ff9d1f',
  winPadAlt: '#ffc247',

  /* ---- The boards on the camp's back wall -------------------------------- */
  /*
   * Weathered stele stone: DARKER than the panel it frames.
   *
   * The surround and the face used to be within a shade of each other, so a
   * carved frame with pilasters, a stepped cap and moss on it read as one pale
   * slab. A leaderboard is a bright panel set into dark stone; getting that
   * contrast wrong wastes every piece of carving on it.
   */
  boardFrame: 0x77806a,
  boardFrameDark: 0x4f5647,
  boardPanel: '#d8d4c2',
  boardPanelEdge: '#aaa694',
  boardStripe: 'rgba(255, 255, 255, 0.24)',
  boardInk: '#2b2a20',
  boardHeading: '#3a382c',
  boardName: '#ffffff',
  boardValue: '#ffd53d',

  /* ---- Sky --------------------------------------------------------------- */
  skyTop: '#2f8fd8',
  skyBottom: '#bfe8ff',
  cloud: 0xffffff,
  cloudShade: 0xdfeefb,
  /** Daylight haze: warm green, the colour of air under a canopy. */
  fog: 0x9fd0a8,
  sky: 0x8fd0f0,
  caveFog: 0x191622,
  /** The glow a tunnel is lit by once the sun cannot reach it. */
  caveLight: 0x5a6a88,
  /**
   * The colour of the light coming DOWN through the canopy.
   *
   * Not the sky's blue: almost none of the light reaching the forest floor
   * has come straight from it, and a blue fill under a green world is what
   * makes flat colour look like plastic.
   */
  canopyLight: 0xbfe6a8,
} as const;

/**
 * How far the daylight haze reaches.
 *
 * Far, because this world has long sight lines by design - the whole point of
 * a valley crossing is that the player can see the far side of it - and near
 * enough that the treeline behind the valley walls fades rather than ending at
 * a hard edge.
 */
export const WORLD_FOG = {
  /*
   * Humid air, not a draw-distance trick.
   *
   * It starts closer and ends closer than a clear day would, because a
   * rainforest IS hazy: the far bank of trees should soften into green rather
   * than stand there in full colour. It is also what stops the last chunk of
   * forest ending in a visible edge.
   */
  near: 110,
  far: 560,
  /** What both collapse to underground, where sight lines are the point. */
  caveNear: 12,
  caveFar: 130,
} as const;

/**
 * Yaw correction for the supplied player FBX.
 *
 * player.fbx already faces +Z; the offset exists so a re-authored model can be
 * corrected without touching gameplay code.
 */
export const PLAYER_MODEL_YAW_OFFSET = 0;
