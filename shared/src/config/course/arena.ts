import { NO_TREADMILL, TREADMILL_COUNT, treadmillUnlocked } from '../treadmills.js';
import { SPEED_UPGRADES, UPGRADE_COUNT } from '../upgrades.js';
import { block, box, decorate, rand, widen } from './emit.js';
import { COURSE } from './metrics.js';

/**
 * The expedition camp: where every run begins and ends.
 *
 * ZONES, and that is the whole design. The camp is a large open clearing with
 * four things arranged around its edge, each with its own footprint and its
 * own clear approach:
 *
 *      z -224  ┌───────── the ancient wall: three LEADERBOARDS ─────────┐
 *              │                                                        │
 *              │                                         ┌──────────┐   │
 *              │   treadmills                            │ 12 PADS  │   │
 *              │   ┌──────────┐        open green        │ two tiers│   │
 *              │   │ 6 belts  │                          │ on a     │   │
 *              │   │ on a     │          SPAWN           │ terrace  │   │
 *              │   │ plank    │        (0, -108)         └──────────┘   │
 *              │   │ deck     │                                         │
 *              │   └──────────┘            ┌──gate──┐  ▣ TRADERS ▣  ▣   │
 *      z    0  └─────────────────── the cut trail, and stage 1 ─────────┘
 *
 * Top-down, back wall at the top: +X is on the drawing's RIGHT, which is the
 * player's LEFT, because they face down the drawing toward the gate.
 *
 * The middle stays EMPTY. Everything functional is out at the sides where it
 * can be seen whole, the player spawns in the open with a clear sightline to
 * all of it, and the way out is the one gap in the far wall.
 *
 * This replaced a camp that had the same six things packed into two thirds of
 * the space with the traders in the middle of it. Breathing room is not
 * decoration here: a player who cannot tell the treadmills from the upgrade
 * bank at a glance has to learn the camp by bumping into it.
 */

// ---------------------------------------------------------------------------
// Speed upgrades: the player's LEFT, which is +X.
// ---------------------------------------------------------------------------

/**
 * The twelve speed-upgrade pads, in two tiers.
 *
 * That side is +X, not -X. The camera looks down +Z and its right is
 * `(-cos yaw, sin yaw)`, which at yaw 0 is world -X - so the player's left
 * hand points at +X.
 *
 * ROW ONE IS ON THE GROUND and ROW TWO IS ON A TERRACE seven units above it,
 * behind a retaining wall, reached by a stair at either end. The previous
 * version raised the back row by 0.8 - under one step height, so it could be
 * ridden straight onto - and the result was two rows that merged into one
 * band of twelve squares from every angle anybody actually looks from. A tier
 * you cannot see is not a tier.
 *
 * Seven units is chosen to be unmistakable rather than convenient: it is
 * taller than the mount, so the upper row reads as a storey above rather than
 * a step up, and it puts the upper row's signs clear of the lower row's.
 */
export const UPGRADE_ROW: {
  readonly frontX: number;
  readonly backX: number;
  readonly firstZ: number;
  readonly spacingZ: number;
  readonly perRow: number;
  readonly size: number;
  readonly height: number;
  /** Top of the upper terrace. The back row stands on this. */
  readonly terraceY: number;
  /** The terrace's footprint, so the stairs and the scenery agree with it. */
  readonly terraceMinX: number;
  readonly terraceMaxX: number;
  readonly claimRadius: number;
} = {
  /*
   * OUT toward the wall and BACK from the gate.
   *
   * Out, so the open middle between the bank and the treadmill deck is wider.
   * Back, so the bank's front stair ends thirty units short of the traders'
   * counters: the traders now stand across the front of the camp on this
   * side, and a bank that ran all the way forward would put a staircase in
   * their customers' way and the traders in front of the bank's end plates.
   */
  frontX: 48,
  backX: 70,
  firstZ: -164,
  spacingZ: 16,
  perRow: UPGRADE_COUNT / 2,
  size: 9,
  height: 0.45,
  terraceY: 7,
  terraceMinX: 60,
  /**
   * Well short of the camp's side wall, which begins at 117.
   *
   * The band between them is the jungle's. A terrace that once ran into the
   * wall left their two undersides coplanar - a hundred square units of
   * duplicate surface for a unit of width nobody could stand on.
   */
  terraceMaxX: 78,
  /**
   * How close the mount must be to equip.
   *
   * Never more than half the spacing, so two pads' claim squares cannot
   * overlap and a mount parked on one can never be credited with its
   * neighbour.
   */
  claimRadius: 4.5,
};

export const upgradeX = (slot: number): number =>
  Math.floor(slot) <= UPGRADE_ROW.perRow ? UPGRADE_ROW.frontX : UPGRADE_ROW.backX;

export const upgradeZ = (slot: number): number => {
  const within = (Math.floor(slot) - 1) % UPGRADE_ROW.perRow;
  return UPGRADE_ROW.firstZ + within * UPGRADE_ROW.spacingZ;
};

/** Ground level for the front row, the terrace top for the back. */
export const upgradeY = (slot: number): number =>
  (Math.floor(slot) <= UPGRADE_ROW.perRow ? COURSE.floorY : UPGRADE_ROW.terraceY) +
  UPGRADE_ROW.height;

/** The first and last Z the bank occupies, for laying things out beside it. */
export const UPGRADE_FIRST_Z = UPGRADE_ROW.firstZ;
export const UPGRADE_LAST_Z =
  UPGRADE_ROW.firstZ + (UPGRADE_ROW.perRow - 1) * UPGRADE_ROW.spacingZ;

/** How far the terrace runs past the outermost plate at each end. */
const TERRACE_OVERHANG = 26;
/** How wide a stair is along Z. Exported so `verify:course` can measure it. */
export const UPGRADE_STAIR_WIDTH = 14;

/**
 * Where the two stairs onto the upper terrace stand.
 *
 * BEYOND the plates at either end, and that is the whole point of the
 * constant. They used to sit seven units inside the terrace's own ends, which
 * put a fourteen-wide flight straight across the corner plate on each row -
 * the first and the twelfth upgrade were behind a staircase. Six and a half
 * units of clear ground now separate the nearest tread from the nearest plate.
 *
 * Exported so `verify:course` walks the stairs where they actually are. The
 * check used to recompute the position from its own copy of the arithmetic,
 * which is exactly how a reachability test ends up passing against a flight
 * nobody built.
 */
export const UPGRADE_STAIR_Z: readonly number[] = [
  UPGRADE_FIRST_Z - TERRACE_OVERHANG + 8,
  UPGRADE_LAST_Z + TERRACE_OVERHANG - 8,
];

/**
 * The upgrade pad a point is standing on, or null.
 *
 * ONE definition, read by the server that grants and by the client that asks.
 * Two copies of this loop is exactly the shape of bug where a layout change
 * reaches the renderer and not the authority.
 */
export const upgradeSlotAt = (x: number, z: number): number | null => {
  for (const upgrade of SPEED_UPGRADES) {
    if (
      Math.abs(x - upgradeX(upgrade.slot)) <= UPGRADE_ROW.claimRadius &&
      Math.abs(z - upgradeZ(upgrade.slot)) <= UPGRADE_ROW.claimRadius
    ) {
      return upgrade.slot;
    }
  }
  return null;
};

/**
 * The pad a mount is STANDING on, height included.
 *
 * The vertical test lives here rather than at the two call sites that used to
 * each write their own `y > deckY + 4`. With the rows now seven units apart
 * that band has to be per-row, and a band written twice is a band that will
 * eventually be written twice differently - the server refusing a pad the
 * client just asked for.
 */
export const upgradePadAt = (x: number, y: number, z: number): number | null => {
  const slot = upgradeSlotAt(x, z);
  if (slot === null) return null;
  const top = upgradeY(slot);
  // Generous enough to cover a mount's own gait bounce, tight enough that
  // standing under the terrace never claims the pad on top of it.
  return y > top - 2.5 && y < top + 4 ? slot : null;
};

// ---------------------------------------------------------------------------
// Treadmills: the player's RIGHT, which is -X.
// ---------------------------------------------------------------------------

/**
 * The training deck, built as a stilted plank platform over the camp's mud.
 *
 * Six machines, and unlike the previous game's three identical belts they are
 * a LADDER: two open, two behind the first rebirth, one behind the third and
 * one behind the fifth.
 *
 * Spaced EIGHTEEN apart for a nine-wide belt, so there is a full belt's width
 * of clear deck between any two machines. A player walking up to the third
 * treadmill should never have to thread between the second and the fourth.
 */
export const TRAINING: {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly deckY: number;
  readonly beltLength: number;
  readonly beltWidth: number;
  readonly beltHeight: number;
  readonly centerX: number;
  readonly firstZ: number;
  readonly spacingZ: number;
} = {
  minX: -68,
  maxX: -34,
  minZ: -142,
  maxZ: -28,
  /** Deck top. A shallow step, inside the simulation's landing tolerance. */
  deckY: 0.6,

  /**
   * The belt runs along X, NOT along Z.
   *
   * A treadmill faces the way its runner does, and the runner is meant to face
   * the camp in the middle of the clearing - which from this deck is +X. The
   * machines are then spaced along Z, standing in a row. Building the belt
   * along Z instead is what made the first version of this read as a row of
   * beds.
   */
  beltLength: 17,
  beltWidth: 9,
  beltHeight: 0.5,
  centerX: -51,
  firstZ: -130,
  spacingZ: 18,
};

export const treadmillZ = (index: number): number =>
  TRAINING.firstZ + (Math.floor(index) - 1) * TRAINING.spacingZ;

export const TREADMILL_BELT_Y = TRAINING.deckY + TRAINING.beltHeight;

/**
 * Which treadmill a position is standing on, or 0.
 *
 * PURE GEOMETRY: this answers "where am I", and where the player is standing
 * is not a question their rebirth count can answer. It is used by the
 * collision sampler and by the client's own prompt, both of which need to know
 * about a belt the player cannot yet use.
 *
 * Whether that belt PAYS is `activeTreadmillAt`, and the two are deliberately
 * different functions.
 */
export const treadmillAt = (x: number, y: number, z: number): number => {
  if (y < TREADMILL_BELT_Y - 1.2 || y > TREADMILL_BELT_Y + 3) return NO_TREADMILL;
  if (Math.abs(x - TRAINING.centerX) > TRAINING.beltLength / 2) return NO_TREADMILL;
  for (let i = 1; i <= TREADMILL_COUNT; i += 1) {
    if (Math.abs(z - treadmillZ(i)) <= TRAINING.beltWidth / 2) return i;
  }
  return NO_TREADMILL;
};

/**
 * The treadmill that is actually RUNNING for this player, or 0.
 *
 * The gate, and it lives in the simulation rather than only in the economy so
 * that every consumer of `PlayerMotion.treadmill` agrees about it: the Speed
 * service bills nothing, the animator does not run the mount on the spot, and
 * the replicated figure the HUD reads is zero. A locked belt is a floor.
 *
 * The previous arrangement gated only the tier MULTIPLIER, which meant a
 * player with no rebirths could stand on the 3x machine and still be credited
 * the belt's full distance at the ordinary rate - free progression from a
 * machine they had not unlocked.
 */
export const activeTreadmillAt = (
  x: number,
  y: number,
  z: number,
  rebirths: number,
): number => {
  const index = treadmillAt(x, y, z);
  if (index === NO_TREADMILL) return NO_TREADMILL;
  return treadmillUnlocked(index, rebirths) ? index : NO_TREADMILL;
};

// ---------------------------------------------------------------------------
// The three traders.
// ---------------------------------------------------------------------------

export type ShopId = 'trail' | 'aura' | 'item';

export interface ShopStall {
  readonly id: ShopId;
  readonly title: string;
  readonly x: number;
  readonly z: number;
  readonly color: number;
}

/**
 * Where the traders have pitched, and how far their prompt reaches.
 *
 * In a row ACROSS the front of the camp, beside the gate - see `SHOP_ROW.z`.
 */
export const SHOP_ROW: {
  /** The row's line, and the X of its first stall; the stalls step along +X. */
  readonly z: number;
  readonly firstX: number;
  readonly spacingX: number;
  /**
   * The way every counter faces, as a unit vector on the ground.
   *
   * THE single fact about orientation. The collision box, the prompt and
   * every mesh in `ShopStalls` are placed from it, so moving the row cannot
   * leave a hut facing one way and its counter another - which has happened
   * twice already.
   */
  readonly faceX: number;
  readonly faceZ: number;
  /** A stall's length along the row. */
  readonly width: number;
  /** A stall's depth, front to back. */
  readonly depth: number;
  readonly height: number;
  readonly promptRadius: number;
} = {
  /*
   * ACROSS THE FRONT, beside the gate: [ TRADERS ] [ GATE ], on the player's
   * left as they face the way out.
   *
   * They have stood in three wrong places. Across the middle of the clearing,
   * in front of the leaderboards; in the far back corner behind the upgrade
   * bank, where nobody reached them; and last, in a column down the open
   * ground just inboard of the treadmill deck - which put three huts between
   * the spawn and the machines, blocking both the view of the treadmills and
   * the ride to them.
   *
   * The front is the one strip neither side zone uses: the treadmills are on
   * the other side of the gate, and the upgrade bank now ends thirty units
   * behind this row. Every run leaves through here, so every player passes
   * all three traders without any of them standing in the way of anything.
   * TWENTY-SIX apart for a thirteen-long hut, so there is a whole hut's length
   * of open ground between any two.
   *
   * They face -Z, back into the camp, because that is where everybody comes
   * from; the ground behind them is the camp's front edge.
   */
  z: -24,
  firstX: 46,
  spacingX: 26,
  faceX: 0,
  faceZ: -1,
  width: 13,
  depth: 5,
  /** Counter top, under one step height so a mount can ride right up to it. */
  height: 0.85,
  /**
   * How close the player must be for the prompt to appear.
   *
   * Generous, because it is only a prompt: nothing happens until the key is
   * pressed, so the cost of showing it a moment early is nil and the cost of
   * showing it late is a player who never finds the trader.
   *
   * It must stay under half the spacing, or two stalls' circles overlap and
   * the nearest-wins tiebreak below starts doing the work that standing in
   * front of the right stall should.
   */
  promptRadius: 12,
};

export const SHOPS: readonly ShopStall[] = [
  { id: 'trail', title: 'Trail Trader', x: SHOP_ROW.firstX, z: SHOP_ROW.z, color: 0xf25a9e },
  {
    id: 'aura',
    title: 'Aura Trader',
    x: SHOP_ROW.firstX + SHOP_ROW.spacingX,
    z: SHOP_ROW.z,
    color: 0x3aa8ff,
  },
  {
    id: 'item',
    title: 'Relic Trader',
    x: SHOP_ROW.firstX + SHOP_ROW.spacingX * 2,
    z: SHOP_ROW.z,
    color: 0xf2a53a,
  },
];

/**
 * A stall's footprint in WORLD axes.
 *
 * `width` runs along the row and `depth` runs front to back, so which of the
 * two lies along X depends on which way the counter faces.
 */
const SHOP_ALONG_X = Math.abs(SHOP_ROW.faceZ) > Math.abs(SHOP_ROW.faceX);
export const SHOP_SIZE_X = SHOP_ALONG_X ? SHOP_ROW.width : SHOP_ROW.depth;
export const SHOP_SIZE_Z = SHOP_ALONG_X ? SHOP_ROW.depth : SHOP_ROW.width;

/**
 * The stall a player is close enough to use, or null.
 *
 * Returns the NEAREST rather than the first within range, so that when the
 * radii do touch it is the player's own position that decides which trader
 * they are standing at.
 */
export const shopNear = (x: number, z: number): ShopStall | null => {
  let best: ShopStall | null = null;
  let bestDistance = SHOP_ROW.promptRadius * SHOP_ROW.promptRadius;
  for (const shop of SHOPS) {
    const dx = x - shop.x;
    const dz = z - shop.z;
    const distance = dx * dx + dz * dz;
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = shop;
    }
  }
  return best;
};

// ---------------------------------------------------------------------------
// The boards.
// ---------------------------------------------------------------------------

/**
 * Three stone tablets set into the ancient wall at the back of the clearing.
 *
 * World space, not HUD: a thing you ride up to and read, and that another
 * player can be seen reading.
 *
 * They sit in the MIDDLE of the wall, because the middle is the only part of
 * it with a clear sightline from the spawn: both side strips run the whole
 * depth of the camp, so a board out at either end is a board behind a
 * treadmill or behind a trader from everywhere anybody stands.
 */
export const BOARDS = [
  { id: 'rebirths' as const, title: 'REBIRTHS', x: 22 },
  { id: 'speed' as const, title: 'SPEED', x: 0 },
  { id: 'wins' as const, title: 'WINS', x: -22 },
];

export const BOARD_ROW: {
  readonly z: number;
  readonly width: number;
  readonly height: number;
  readonly baseY: number;
} = {
  z: COURSE.campStartZ + 3,
  width: 18,
  height: 15,
  baseY: 3.5,
};

// ---------------------------------------------------------------------------
// Building it.
// ---------------------------------------------------------------------------

/** Lay the camp. Called once, by the course index, before any stage. */
export const buildCamp = (): void => {
  const S = -1;

  widen(COURSE.campStartZ - 4, COURSE.campEndZ + 8, COURSE.campHalfWidth);

  // The clearing's floor: packed jungle earth, thick enough to be a shelf at
  // the valley's mouth rather than a slab hanging in it.
  block(
    S,
    'dirt',
    -COURSE.campHalfWidth,
    COURSE.floorY - 26,
    COURSE.campStartZ,
    COURSE.campHalfWidth * 2,
    26,
    COURSE.campEndZ - COURSE.campStartZ,
  );

  // Ancient stone walls round three sides, half swallowed by the jungle. The
  // camp is pitched INSIDE a ruin somebody else found first, which is the
  // whole premise of the game stated in one piece of set dressing.
  for (const side of [-1, 1]) {
    block(
      S,
      'ruin',
      side * COURSE.campHalfWidth - (side < 0 ? 0 : 7),
      COURSE.floorY,
      COURSE.campStartZ,
      7,
      17,
      COURSE.campEndZ - COURSE.campStartZ,
    );
  }
  block(
    S,
    'ruin',
    -COURSE.campHalfWidth,
    COURSE.floorY,
    COURSE.campStartZ - 7,
    COURSE.campHalfWidth * 2,
    22,
    7,
  );

  buildUpgradeBank(S);
  buildTrainingDeck(S);
  buildTraders(S);
  dressCamp(S);
  buildTrailhead(S);
};

/**
 * The twelve pads: six on the ground and six on a terrace above them.
 *
 * The terrace is a real structure - a retaining wall with a stair at either
 * end - rather than a slab floated behind the front row. Two stairs rather
 * than one so the upper row can be reached from whichever end the player rode
 * in at; a single stair in the middle would have to cut through the wall
 * between two pads, and the gap between two pads is where their signs are.
 */
const buildUpgradeBank = (stage: number): void => {
  const terraceZ0 = UPGRADE_FIRST_Z - TERRACE_OVERHANG;
  const terraceZ1 = UPGRADE_LAST_Z + TERRACE_OVERHANG;

  // The terrace itself: a solid block from the ground up, so it reads as a cut
  // shelf rather than a platform on legs, and so nothing can be under it.
  block(
    stage,
    'camp',
    UPGRADE_ROW.terraceMinX,
    // Founded BELOW the clearing's floor rather than resting on it. A base at
    // `floorY` would put the terrace's underside in the same plane as the
    // floor's top face; buried, it has no face in common with anything.
    COURSE.floorY - 3,
    terraceZ0,
    UPGRADE_ROW.terraceMaxX - UPGRADE_ROW.terraceMinX,
    UPGRADE_ROW.terraceY + 3,
    terraceZ1 - terraceZ0,
  );

  /*
   * The stairs, one at each end.
   *
   * Every tread is 0.7 high, comfortably under `MOVEMENT.stepHeight`, so a
   * mount rides up without jumping. Each one climbs in +X, from the open
   * ground at the terrace's near edge onto its top.
   */
  const treads = Math.round(UPGRADE_ROW.terraceY / 0.7);
  const rise = UPGRADE_ROW.terraceY / treads;
  const run = 1.8;
  for (const z of UPGRADE_STAIR_Z) {
    for (let i = 0; i < treads; i += 1) {
      box(
        stage,
        'camp',
        UPGRADE_ROW.terraceMinX - (treads - i) * run + run / 2,
        COURSE.floorY + rise * (i + 1),
        z,
        run,
        UPGRADE_STAIR_WIDTH,
        rise + 0.4,
      );
    }
  }

  for (const upgrade of SPEED_UPGRADES) {
    box(
      stage,
      'pad',
      upgradeX(upgrade.slot),
      upgradeY(upgrade.slot),
      upgradeZ(upgrade.slot),
      UPGRADE_ROW.size,
      UPGRADE_ROW.size,
      UPGRADE_ROW.height,
    );
  }

  // A carved stele at the head of the bank. One landmark, at one end, well
  // clear of every pad and every sightline to one.
  decorate(
    stage,
    'stele',
    UPGRADE_ROW.frontX - 12,
    COURSE.floorY,
    terraceZ0 - 4,
    1.5,
    -Math.PI / 2,
    0,
  );

  // Two torches, at the ENDS of the bank. One per pad was the obvious thing to
  // write and the wrong thing to see: six posts stood in a line in front of
  // the bank, which from the only place anybody reads it - the open ground -
  // put a post across the sightline to half the pads.
  for (const z of [terraceZ0 - 2, terraceZ1 + 2]) {
    decorate(stage, 'torch', UPGRADE_ROW.frontX - 9, COURSE.floorY, z, 1.3, 0, 0);
  }
};

/** The stilted plank deck the six belts stand on. */
const buildTrainingDeck = (stage: number): void => {
  block(
    stage,
    'training',
    TRAINING.minX,
    COURSE.floorY - 6,
    TRAINING.minZ,
    TRAINING.maxX - TRAINING.minX,
    6 + TRAINING.deckY,
    TRAINING.maxZ - TRAINING.minZ,
  );

  for (let i = 1; i <= TREADMILL_COUNT; i += 1) {
    box(
      stage,
      'training',
      TRAINING.centerX,
      TREADMILL_BELT_Y,
      treadmillZ(i),
      TRAINING.beltLength,
      TRAINING.beltWidth,
      TRAINING.beltHeight,
    );
  }

  /*
   * Two torches, and they stand BEHIND the row rather than in front of it.
   *
   * Nothing else is on this deck. The awning that used to run along it put a
   * canvas peak over every machine, which from the camp read as a row of tents
   * with the treadmills hidden underneath; a torch at the deck's front edge
   * did the smaller version of the same thing, standing between the player and
   * the machine at the end of the row. Lighting a bank must not stand in it.
   */
  for (const z of [TRAINING.minZ + 6, TRAINING.maxZ - 6]) {
    decorate(stage, 'torch', TRAINING.minX + 4, TRAINING.deckY, z, 1.3, 0, 0);
  }
};

/** Three market stalls and their counters. */
const buildTraders = (stage: number): void => {
  for (const shop of SHOPS) {
    box(stage, 'shop', shop.x, SHOP_ROW.height, shop.z, SHOP_SIZE_X, SHOP_SIZE_Z, 2.4);
  }
};

/** Half the width of the open middle, which nothing is ever planted in. */
const MIDDLE_HALF_WIDTH = 30;

/** The traders' row as one rectangle, huts included. */
const SHOP_BOUNDS = {
  minX: Math.min(...SHOPS.map((shop) => shop.x)) - SHOP_SIZE_X / 2,
  maxX: Math.max(...SHOPS.map((shop) => shop.x)) + SHOP_SIZE_X / 2,
  minZ: Math.min(...SHOPS.map((shop) => shop.z)) - SHOP_SIZE_Z / 2,
  maxZ: Math.max(...SHOPS.map((shop) => shop.z)) + SHOP_SIZE_Z / 2,
};

/**
 * Is this spot inside a zone the player actually uses?
 *
 * The upgrade bank, the trader strip and the treadmill deck are all read from
 * across the clearing, so all three get a clear margin - nothing is planted in
 * front of a sign, behind a pad, or between two machines. So does the open
 * middle, and so does the corridor the chase camera occupies behind the spawn.
 */
const isReserved = (x: number, z: number): boolean => {
  /*
   * The APPROACH is reserved too, not just the furniture.
   *
   * Each zone gets its footprint plus the lane a player rides in along, and
   * nothing more. An earlier version padded every side by nine units, which on
   * a strip that already reached the camp wall left no perimeter at all - so
   * the jungle had nowhere legal to grow and the clearing came out bare.
   */
  const approach = 7;

  // The whole of the player's left: the plates, and the terrace and stairs
  // behind them. One rectangle, because it is one strip.
  const left =
    x > UPGRADE_ROW.frontX - UPGRADE_ROW.size / 2 - approach &&
    x < UPGRADE_ROW.terraceMaxX + approach &&
    z > UPGRADE_FIRST_Z - TERRACE_OVERHANG - approach &&
    z < UPGRADE_LAST_Z + TERRACE_OVERHANG + approach;

  // The deck, and ALL the ground between it and the open middle: the
  // treadmills are ridden onto from the camp side, so that whole face is their
  // approach rather than a seven-unit margin.
  const right =
    x > TRAINING.minX - approach &&
    x < -MIDDLE_HALF_WIDTH &&
    z > TRAINING.minZ - approach &&
    z < TRAINING.maxZ + approach;

  // The traders' row, and the ground IN FRONT of it that customers ride up
  // through - a lane the length of a hut, on the side the counters face.
  const lane = 18;
  const traders =
    x > SHOP_BOUNDS.minX - approach + Math.min(0, SHOP_ROW.faceX * lane) &&
    x < SHOP_BOUNDS.maxX + approach + Math.max(0, SHOP_ROW.faceX * lane) &&
    z > SHOP_BOUNDS.minZ - approach + Math.min(0, SHOP_ROW.faceZ * lane) &&
    z < SHOP_BOUNDS.maxZ + approach + Math.max(0, SHOP_ROW.faceZ * lane);

  // The open middle, and the strip of it the camera lives in. A prop here is a
  // prop every player steers round for ever, or one the camera looks through.
  const middle = Math.abs(x) < MIDDLE_HALF_WIDTH;

  // And the gateway, which must stay a clear run from the spawn.
  const gate = Math.abs(x) < 34 && z > -30;

  return left || right || traders || middle || gate;
};

/**
 * The jungle, arranged rather than scattered.
 *
 * A LUSH PERIMETER AND A CLEAN MIDDLE. Everything here is pushed out to the
 * clearing's edge and to the corners the four working zones do not use; the
 * open green between them carries nothing at all. The rule the previous camp
 * broke was filling every gap, which is how a clearing ends up with no clear
 * ground in it.
 */
const dressCamp = (stage: number): void => {
  /*
   * The treeline, in the band BETWEEN the working zones and the camp wall.
   *
   * That band is the reason the clearing is wider than the four zones need:
   * it is nobody's approach and nothing functional stands in it, so it can be
   * as dense as a jungle edge should be without ever being in the way. Two
   * ranks, the outer one taller, so the wall is seen through canopy rather
   * than over a hedge.
   */
  const inner = COURSE.campHalfWidth - 20;
  const outer = COURSE.campHalfWidth - 8;
  for (let i = 0; i < 70; i += 1) {
    const r = rand(i * 31 + 7);
    const r2 = rand(i * 57 + 19);
    const along = COURSE.campStartZ + 6 + r * (COURSE.campEndZ - COURSE.campStartZ - 10);
    const side = i % 2 === 0 ? 1 : -1;
    const back = i % 3 === 0;
    const x = side * (back ? outer - r2 * 4 : inner + r2 * 8);
    if (isReserved(x, along)) continue;
    decorate(
      stage,
      i % 5 === 0 ? 'palm' : 'tree',
      x,
      COURSE.floorY,
      along,
      (back ? 1.4 : 1.0) + r * 0.8,
      r2 * 6.2,
      i % 3,
    );
  }

  // Undergrowth in front of the treeline, thinning toward the open ground.
  for (let i = 0; i < 60; i += 1) {
    const r = rand(i * 71 + 13);
    const r2 = rand(i * 43 + 29);
    const along = COURSE.campStartZ + 10 + r * (COURSE.campEndZ - COURSE.campStartZ - 18);
    const side = i % 2 === 0 ? 1 : -1;
    const x = side * (inner - 3 + r2 * 12);
    if (isReserved(x, along)) continue;
    const kind = i % 4 === 0 ? 'bush' : i % 4 === 1 ? 'rock' : 'fern';
    decorate(stage, kind, x, COURSE.floorY, along, 0.85 + r * 0.6, r * 6.2, i % 2);
  }

  // Vines down the ancient wall, which is what stops seventy metres of ruin
  // reading as a painted backdrop.
  for (let i = 0; i < 14; i += 1) {
    const r = rand(i * 53 + 11);
    const side = i % 2 === 0 ? 1 : -1;
    const along = COURSE.campStartZ + 14 + r * (COURSE.campEndZ - COURSE.campStartZ - 28);
    decorate(
      stage,
      'vine',
      side * (COURSE.campHalfWidth - 7.5),
      COURSE.floorY + 9 + r * 5,
      along,
      1.1 + r * 0.5,
      0,
      i % 3,
    );
  }

  /*
   * The expedition's own camp: FOUR pieces, in the two BACK corners.
   *
   * Four rather than the dozen that used to be here. A camp is legible from a
   * tent and a stack of crates; a dozen of them is a warehouse, and every one
   * of them was something to steer round on the way to somewhere else.
   *
   * Both at the back now. The front belongs to the gate and the traders, and a
   * tent in the front corner was standing exactly where the third hut is.
   */
  const backCorner = COURSE.campStartZ + 22;
  const corner = COURSE.campHalfWidth - 24;
  decorate(stage, 'tent', -corner, COURSE.floorY, backCorner, 1.6, 0.35, 0);
  decorate(stage, 'crates', -corner + 6, COURSE.floorY, backCorner + 12, 1.2, -0.2, 0);
  decorate(stage, 'tent', corner, COURSE.floorY, backCorner + 2, 1.4, -0.35, 2);
  decorate(stage, 'crates', corner - 6, COURSE.floorY, backCorner + 14, 1.1, 0.25, 1);

  // Two overgrown guardians flanking the way out, set well back from the
  // trail's own width so the gap between them is the gate rather than an
  // obstacle to thread.
  for (const side of [-1, 1]) {
    decorate(stage, 'statue', side * 27, COURSE.floorY, -18, 1.7, side > 0 ? -0.25 : 0.25, 0);
    decorate(stage, 'vine', side * 27, COURSE.floorY + 11, -18, 1.2, 0, 1);
  }

  // Broken masonry along the foot of the back wall, BETWEEN the boards rather
  // than under them - a rock in front of a leaderboard is a leaderboard
  // nobody can read the bottom row of.
  for (let i = 0; i < 10; i += 1) {
    const r = rand(i * 97 + 3);
    const x = -(COURSE.campHalfWidth - 16) + i * ((COURSE.campHalfWidth - 16) * 2) / 9;
    if (BOARDS.some((board) => Math.abs(x - board.x) < BOARD_ROW.width * 0.7)) continue;
    if (isReserved(x, COURSE.campStartZ + 10)) continue;
    decorate(stage, 'rock', x, COURSE.floorY, COURSE.campStartZ + 10, 0.9 + r * 0.7, r * 6.2, i % 2);
  }
};

/**
 * The cut trail out of the camp, and the gateway the expedition leaves by.
 *
 * It narrows deliberately: the clearing is two hundred and fifty wide and the
 * trail is thirty, so the way on is obvious without a single arrow. The
 * environment is the signpost, which is the rule the whole course is laid out
 * under.
 */
const buildTrailhead = (stage: number): void => {
  /*
   * No slab here.
   *
   * There used to be a 30x16 patch of dirt laid at `floorY` right in the
   * gateway - on top of the camp floor, which is already dirt and already at
   * `floorY`. Two upward faces in the same plane over 450 square units is a
   * depth-buffer tie, and it flickered every time the camera moved through the
   * one place every single run passes through.
   */

  // A ruined gate arch over the trail: two piers and a lintel, with the jungle
  // growing through it.
  for (const side of [-1, 1]) {
    block(stage, 'ruin', side * 15 - (side < 0 ? 0 : -6), COURSE.floorY, -4, 6, 20, 8);
  }
  block(stage, 'ruin', -21, COURSE.floorY + 20, -4, 42, 5, 8);
  decorate(stage, 'vine', -13, COURSE.floorY + 20, -1, 1.4, 0, 0);
  decorate(stage, 'vine', 13, COURSE.floorY + 20, -1, 1.2, 0, 1);
  decorate(stage, 'stele', -23, COURSE.floorY, -18, 1.3, 0.4, 0);
};
