import {
  COURSE,
  COURSE_END_Z,
  COURSE_SOLIDS,
  STAGES,
  corridorHalfWidthAt,
} from '@evolve/shared';
import {
  Group,
  Mesh,
  MeshLambertMaterial,
  type BufferGeometry,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BoxGeometry } from 'three';
import { PALETTE } from '../config/worldVisuals.js';

/**
 * A box with NO UVs.
 *
 * Every material in the forest is a flat colour, so texture coordinates are
 * eight bytes a vertex bought for nothing - and across a million vertices of
 * background planting that is most of a spare megabyte of GPU buffer. An
 * attribute set that differs between parts would also make the merge fail, so
 * dropping it here means dropping it everywhere in this file.
 */
const plainBox = (w: number, h: number, d: number): BoxGeometry => {
  const geometry = new BoxGeometry(w, h, d);
  geometry.deleteAttribute('uv');
  return geometry;
};

/**
 * The rainforest the whole world stands in.
 *
 * This replaced two rust-red brick walls ninety units high that ran the entire
 * length of the valley. They did the job a boundary has to do - they stopped
 * the eye at the edge of the playable space - and they made every screenshot
 * of this game look like a corridor with green decorations in it. Three ranks
 * of trees stood behind them, drawing every frame, completely hidden.
 *
 * What is here instead is a FOREST, in layers, and the layers are the point:
 *
 *   1. a forest floor that climbs away from the route, so the path reads as
 *      cut through a hillside rather than floating in a void;
 *   2. understory - ferns, bushes, logs, mossy rock - right at the edge;
 *   3. mid trees, then a few GIANTS that rise past everything else;
 *   4. a canopy overhead with deliberate gaps for sunlight;
 *   5. vines hanging from it.
 *
 * Nothing here collides and nothing is authored against it. It is pure
 * background, which is what lets its density change with the machine rather
 * than being part of the world every client has to agree on.
 *
 * PERFORMANCE is why it is chunked. The old treeline merged four thousand
 * trees into four meshes spanning fourteen thousand units, so their bounding
 * spheres covered the whole world and the renderer drew every one of them
 * every frame. Merging per CHUNK instead lets the frustum reject all but the
 * two or three the player can actually see.
 */

/**
 * One planting slot along the route, per side.
 *
 * "Jungle" is a DENSITY before it is a palette: a treeline you can see
 * daylight between reads as a park however green it is. Fifteen units puts a
 * trunk close enough to the next that the far bank closes up.
 */
const STEP = 15;

/**
 * How much of the world one merged chunk covers.
 *
 * Bigger means fewer draw calls and worse culling; smaller is the reverse. The
 * fog reaches 620 units, so a chunk a fifth of that keeps two or three alive
 * at a time out of the thirty the world holds.
 */
const CHUNK = 1150;

/**
 * How far out the forest floor climbs from the corridor's edge.
 *
 * FIVE steps rather than four, and they keep rising: the last one tops out
 * above the canopy, so there is no line of sight from the route out to the
 * horizon. That is what a boundary has to achieve, and a hillside achieves it
 * without being a wall.
 */
const SLOPE_STEPS = 5;
const SLOPE_WIDTH = 21;

/** A deterministic 0..1 from an integer, so every client plants the same tree. */
const rand = (n: number): number => {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 15;
  x = (x * 2246822519) >>> 0;
  x ^= x >>> 13;
  return x / 4294967296;
};

/**
 * Which band of the world a Z falls in, so the forest can tell the story the
 * course is telling.
 *
 * Six acts, and the planting changes with them: bright and open at the jungle
 * entrance, dense and dripping in the deep jungle, mossy stone through the
 * ruins, storm-broken in the danger zone, monumental at the temple.
 */
const actAt = (z: number): number => {
  for (const stage of STAGES) {
    if (z >= stage.startZ && z <= stage.endZ) return stage.act;
  }
  return z < 0 ? 0 : 6;
};

/** Everything one act does differently. */
interface ActStyle {
  /** Multiplier on how much undergrowth a slot gets. */
  readonly undergrowth: number;
  /** Chance a slot carries a canopy plate over the corridor. */
  readonly canopy: number;
  /**
   * Chance a slot carries a HIGH canopy plate, the layer that closes the sky.
   *
   * Separate from `canopy` because the two do different jobs: the lower plates
   * frame the route from the sides, and this one is the roof. The camp keeps
   * it low on purpose - the one place in the world that should be bright.
   */
  readonly roof: number;
  /** Chance a slot carries a hanging vine. */
  readonly vines: number;
  /** Chance a slot carries mossy ruin stone. */
  readonly ruins: number;
  /** Chance a slot carries a boulder or a fallen trunk. */
  readonly debris: number;
  /** One in this many slots is a giant. */
  readonly giantEvery: number;
  /** Canopy tones, so each act reads as its own green. */
  readonly leaves: readonly number[];
}

const STYLES: readonly ActStyle[] = [
  // 0: the camp, and the approach to it. Open and bright - the one place in
  // the world that wants to be read at a glance rather than felt.
  { undergrowth: 0.8, roof: 0.3, canopy: 0.35, vines: 0.2, ruins: 0.05, debris: 0.1, giantEvery: 6, leaves: [PALETTE.leafA, PALETTE.leafC, PALETTE.leafB] },
  // 1: jungle entrance. Bright green, big trees, still airy.
  { undergrowth: 1, roof: 0.55, canopy: 0.55, vines: 0.25, ruins: 0, debris: 0.15, giantEvery: 7, leaves: [PALETTE.leafA, PALETTE.leafC, PALETTE.leafB] },
  // 2: deep jungle. The densest canopy in the world.
  { undergrowth: 1.35, roof: 0.9, canopy: 0.82, vines: 0.55, ruins: 0.05, debris: 0.25, giantEvery: 5, leaves: [PALETTE.leafB, PALETTE.leafA, PALETTE.leafC] },
  // 3: ancient ruins. The forest has grown through somebody's city.
  { undergrowth: 1, roof: 0.62, canopy: 0.6, vines: 0.5, ruins: 0.42, debris: 0.2, giantEvery: 6, leaves: [PALETTE.leafB, PALETTE.moss, PALETTE.leafA] },
  // 4: danger zone. Storm-broken: fewer standing trees, more down.
  { undergrowth: 0.9, roof: 0.5, canopy: 0.5, vines: 0.3, ruins: 0.12, debris: 0.55, giantEvery: 8, leaves: [PALETTE.leafB, PALETTE.leafA, PALETTE.moss] },
  // 5: lost temple. Monumental stone under a heavy canopy.
  { undergrowth: 1.1, roof: 0.86, canopy: 0.78, vines: 0.5, ruins: 0.5, debris: 0.2, giantEvery: 5, leaves: [PALETTE.leafB, PALETTE.moss, PALETTE.leafA] },
  // 6: the final expedition. The biggest trees in the world.
  { undergrowth: 1.2, roof: 0.8, canopy: 0.75, vines: 0.45, ruins: 0.3, debris: 0.2, giantEvery: 4, leaves: [PALETTE.leafA, PALETTE.leafB, PALETTE.leafC] },
];

/**
 * The height of the world at each Z, so nothing is planted in mid-air.
 *
 * The route climbs and dives over four hundred units across the expedition. A
 * treeline founded at a constant height - which is what the old one was - is a
 * treeline buried under half the course and floating over the rest.
 *
 * SMOOTHED over a window, because the raw maximum spikes at every arch, pillar
 * and temple wall, and a forest floor that jumped nine units at a doorway
 * would read as a staircase.
 */
class Elevation {
  private readonly tops: number[] = [];
  private readonly minZ: number;
  private readonly step = 24;

  constructor() {
    this.minZ = COURSE.campStartZ - 120;
    const count = Math.ceil((COURSE_END_Z + 160 - this.minZ) / this.step) + 1;
    const raw = new Array<number>(count).fill(Number.NEGATIVE_INFINITY);

    for (const solid of COURSE_SOLIDS) {
      const from = this.index(solid.minZ);
      const to = this.index(solid.maxZ);
      for (let i = from; i <= to; i += 1) {
        if (i < 0 || i >= count) continue;
        if (solid.maxY > (raw[i] as number)) raw[i] = solid.maxY;
      }
    }

    // Fill the empty buckets from their neighbours, then smooth.
    let last = COURSE.floorY;
    for (let i = 0; i < count; i += 1) {
      if ((raw[i] as number) === Number.NEGATIVE_INFINITY) raw[i] = last;
      else last = raw[i] as number;
    }
    const window = 4;
    for (let i = 0; i < count; i += 1) {
      let total = 0;
      let n = 0;
      for (let k = -window; k <= window; k += 1) {
        const j = i + k;
        if (j < 0 || j >= count) continue;
        total += raw[j] as number;
        n += 1;
      }
      this.tops.push(total / n);
    }
  }

  private index(z: number): number {
    return Math.floor((z - this.minZ) / this.step);
  }

  at(z: number): number {
    const i = Math.min(this.tops.length - 1, Math.max(0, this.index(z)));
    return this.tops[i] as number;
  }
}

/** Geometry being accumulated for one chunk, keyed by material. */
type Bucket = Map<string, BufferGeometry[]>;

export class Rainforest {
  readonly root = new Group();

  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private readonly byKey = new Map<string, Material>();

  /** How many boxes went in, for the performance report. */
  count = 0;

  constructor() {
    const elevation = new Elevation();
    const from = COURSE.campStartZ - 90;
    const to = COURSE_END_Z + 120;

    let chunk: Bucket = new Map();
    let chunkStart = from;
    let index = 0;

    for (let z = from; z < to; z += STEP) {
      if (z - chunkStart >= CHUNK) {
        this.flush(chunk);
        chunk = new Map();
        chunkStart = z;
      }

      const style = STYLES[actAt(z)] ?? (STYLES[1] as ActStyle);
      const half = corridorHalfWidthAt(z);
      const ground = elevation.at(z);

      for (const side of [-1, 1]) {
        index += 1;
        this.plant(chunk, style, index, side, z, half, ground);
      }
    }
    this.flush(chunk);
  }

  /**
   * One slot: a slice of forest floor and whatever is growing on it.
   *
   * Everything is placed from the LOCAL ground and the LOCAL corridor width,
   * so the forest follows the route up a temple stair and down into a gorge
   * without anything being authored twice.
   */
  private plant(
    chunk: Bucket,
    style: ActStyle,
    index: number,
    side: number,
    z: number,
    half: number,
    ground: number,
  ): void {
    const a = rand(index);
    const b = rand(index * 7 + 11);
    const c = rand(index * 13 + 5);
    const at = z + a * STEP;

    /* ---- The forest floor ------------------------------------------------ */

    /*
     * It climbs away from the route, GENTLY.
     *
     * The first version of this ramped up sixty units over five terraces, and
     * a smooth green mass sixty units high on both sides of the corridor is
     * the rust-red wall it replaced wearing a different colour. The vertical
     * framing in a rainforest is TREES; the ground's job is only to stop the
     * route reading as a slab floating in a void, and sixteen units of rise
     * does that without ever becoming the thing you are looking at.
     */
    const shelves: { x: number; y: number; width: number }[] = [];
    let edge = half + 1;
    for (let s = 0; s < SLOPE_STEPS; s += 1) {
      const rise = ground - 6 + s * 5.5 + rand(index * 31 + s) * 3;
      const width = SLOPE_WIDTH + rand(index * 17 + s) * 10;
      const depth = 40 + s * 10;
      this.box(chunk, s === 0 ? 'bank' : 'floor', width, depth, STEP + 2.5, [
        side * (edge + width / 2),
        rise - depth / 2,
        at,
      ]);
      // A mossy lip over each shelf's leading edge, so one earth colour grades
      // into the next instead of meeting it at a hard seam.
      if (s > 0) {
        this.mossBox(chunk, width * 0.55, 0.7, STEP + 2.5, [
          side * (edge + width * 0.28),
          rise,
          at,
        ]);
        /*
         * And something GROWING over the lip.
         *
         * The moss alone still leaves a readable step: a hard horizontal line
         * where one shelf's top meets the next one's face, repeated five times
         * up each side, which from the route reads as a staircase rather than
         * as a hillside. A fern or a bush breaking that line is the difference
         * between terrain and terracing, and it is the same trick the moss is
         * doing, done by something with a silhouette.
         */
        const r = rand(index * 149 + s * 11);
        if (r > 0.34) {
          const lip = side * (edge + 1.5 + r * 3);
          if (r > 0.68) this.bush(chunk, lip, rise, at + r * 6 - 3, 0.8 + r * 0.7);
          else this.fern(chunk, lip, rise, at + r * 6 - 3, 0.9 + r * 0.8);
        }
      }
      shelves.push({ x: edge + width / 2, y: rise, width });
      edge += width - 3;
    }

    const shelf = (i: number): { x: number; y: number; width: number } =>
      shelves[Math.min(shelves.length - 1, Math.max(0, i))] as { x: number; y: number; width: number };

    const floorY = shelf(0).y;

    /* ---- Understory, right at the player's eye ---------------------------- */

    const plants = Math.round((1 + b * 2) * style.undergrowth);
    for (let i = 0; i < plants; i += 1) {
      const r = rand(index * 101 + i * 7);
      const x = side * (half + 3 + r * 14);
      const y = floorY + 1;
      if (r < 0.45) this.fern(chunk, x, y, at + r * 8 - 4, 0.9 + r);
      else if (r < 0.75) this.bush(chunk, x, y, at + r * 8 - 4, 0.9 + r * 0.8);
      else this.box(chunk, 'stone', 3 + r * 3, 2 + r * 2, 3 + r * 3, [x, y + 1, at + r * 6 - 3]);
    }

    /*
     * A STREAM on the forest floor, at intervals.
     *
     * Water is what stops a forest floor reading as carpet: it catches the
     * light, it implies drainage, and it is the one thing in a jungle that is
     * not green or brown. It sits in a shallow channel on the first shelf with
     * wet stones along it, and it is purely decorative - the water that can
     * kill you is the course's own, drawn from the kill volumes.
     */
    if (rand(index * 211 + 17) < 0.3) {
      const r = rand(index * 83 + 41);
      const cx = side * (half + 9 + r * 16);
      this.box(chunk, 'bank', 9 + r * 5, 3, STEP + 2.5, [cx, floorY - 1.4, at]);
      this.push(
        chunk,
        'stream',
        PALETTE.streamWater,
        plainBox(7 + r * 4, 0.5, STEP + 2.5),
        [cx, floorY - 0.4, at],
        undefined,
      );
      this.box(chunk, 'stone', 2.4 + r * 2, 1.6, 2.2, [
        cx + side * (5 + r * 3),
        floorY - 0.2,
        at + r * 5 - 2,
      ]);
    }

    // Moss-covered rock and fallen timber, so the floor is not all leaves.
    if (c < style.debris) {
      const x = side * (half + 8 + c * 16);
      if (c < style.debris * 0.5) {
        this.box(chunk, 'bark', 2.6, 2.6, 13 + c * 10, [x, floorY + 1.6, at], [0, c * 2, 0.08]);
        this.mossBox(chunk, 2.2, 0.5, 9, [x, floorY + 3, at], [0, c * 2, 0.08]);
      } else {
        this.box(chunk, 'stone', 5 + c * 5, 4 + c * 3, 5 + c * 4, [x, floorY + 2, at]);
        this.mossBox(chunk, 4.6 + c * 4, 0.6, 4.6 + c * 3.4, [x, floorY + 4 + c * 3, at]);
      }
    }

    // Ruin stone, where the forest has grown through somebody's city.
    if (rand(index * 61 + 3) < style.ruins) {
      const r = rand(index * 29 + 17);
      const on = shelf(1 + Math.floor(r * 2));
      const height = 6 + r * 16;
      this.box(
        chunk,
        'ruin',
        5 + r * 4,
        height + 8,
        5 + r * 4,
        [side * on.x, on.y + height / 2 - 4, at],
        [0, r * 0.4, r * 0.09],
      );
      this.mossBox(chunk, 5.4 + r * 4, 0.7, 5.4 + r * 4, [side * on.x, on.y + height - 4, at], [0, r * 0.4, 0]);
    }

    /* ---- Trees ------------------------------------------------------------ */

    /*
     * TWO ranks of mid trees, each STANDING ON the shelf it is planted on.
     *
     * Following the terrain matters more than it sounds: a tree planted at a
     * fixed offset from the route is a tree buried to its crown on one shelf
     * and floating a storey above the next. It is also what gives the side a
     * depth read - near trunks against far trunks - rather than one flat rank.
     */
    if (b > 0.12) {
      const on = shelf(1);
      const scale = 0.85 + b * 0.8;
      this.tree(chunk, style, index, side * (on.x + (c - 0.5) * on.width * 0.5), on.y, at, (16 + c * 12) * scale, 1.7 * scale, (a - 0.5) * 0.06);
    }
    if (a > 0.35) {
      const on = shelf(2 + Math.floor(b * 2));
      const scale = 1 + a * 0.9;
      this.tree(chunk, style, index * 3 + 1, side * (on.x + (b - 0.5) * on.width * 0.6), on.y, at + 5, (20 + b * 16) * scale, 1.9 * scale, 0);
    }

    // And a GIANT every so often: a trunk that rises past everything and a
    // crown above the canopy. A rainforest has a hierarchy - a few emergents
    // over many mid trees over dense floor - and without the top rank the
    // whole thing reads as scrub.
    if (index % style.giantEvery === 0) {
      const on = shelf(2);
      this.giant(chunk, style, index, side * (on.x + (a - 0.5) * 10), on.y, at, 1.9 + a * 1.1);
    }

    /*
     * The BACKGROUND rank: a dark mass of canopy far out, behind everything.
     *
     * Deliberately low-detail - a trunk and two plates - because it is never
     * seen close. It is the layer that closes the horizon, which is the job
     * the cliff walls used to do and the reason they were there at all.
     */
    {
      const r = rand(index * 5 + 23);
      const x = side * (half + 92 + r * 80);
      const top = ground + 22 + r * 26;

      /*
       * The hillside the far rank stands on.
       *
       * Without it these trunks hang in the air over every stage the route
       * crosses on a bridge - which is most of the second half of the world.
       * It is one deep box per slot, never seen except as a dark mass behind
       * the trees, and it is what makes the horizon a forested slope rather
       * than a row of poles.
       */
      const far = shelf(SLOPE_STEPS - 1);
      this.box(chunk, 'floor', 150, 150, STEP + 3, [
        side * (far.x + far.width / 2 + 74),
        ground + 6 - 75,
        at,
      ]);

      // WIDE and OVERLAPPING. The first attempt gave each of these a slim
      // trunk and a small crown, and at this spacing that reads as a row of
      // lollipops on the skyline rather than as a forest behind a forest. They
      // are a MASS: the trunk is barely visible and the crowns run into each
      // other, and the trunk reaches DOWN to the hillside rather than stopping
      // at a height that happened to look right on flat ground.
      const trunkTop = top - 4;
      const trunkBase = ground - 30;
      /*
       * THIN trunk, BROAD crown.
       *
       * Fog washes a distant crown out long before it washes out the dark line
       * of a trunk, so a far tree drawn with the proportions of a near one
       * ends up a bare pole with a smudge on top. Weighting it the other way
       * is what keeps the horizon reading as canopy.
       */
      this.box(chunk, 'bark', 4 + r * 3, trunkTop - trunkBase, 4 + r * 3, [
        x,
        (trunkTop + trunkBase) / 2,
        at,
      ]);
      this.leafPlate(chunk, PALETTE.canopyCapDark, x, top, at, 62 + r * 40, 15);
      this.leafPlate(chunk, PALETTE.canopyCap, x, top + 12, at, 44 + r * 30, 12);
    }

    /*
     * ---- The ROOF ---------------------------------------------------------
     *
     * The layer that makes the player feel INSIDE a rainforest rather than in
     * a clearing with trees round it. Very large plates, more than fifty units
     * up, overlapping across the middle of the valley - and skipped often
     * enough that the gaps between them are real shafts of sky.
     *
     * It is this high for two reasons: nothing at fifty units can come between
     * the chase camera and the ground the player is reading, and a canopy that
     * low would be a ceiling rather than a treetop.
     */
    if (rand(index * 131 + 7) < style.roof) {
      const r = rand(index * 53 + 19);
      const size = 38 + r * 34;
      const across = (r - 0.5) * half * 1.2;
      const y = ground + 54 + r * 18;
      const leaf = style.leaves[(index + 2) % style.leaves.length] as number;
      this.leafPlate(chunk, leaf, across, y, at + (r - 0.5) * 14, size, 3);
      /*
       * A second, smaller plate slung under the first.
       *
       * The roof is seen from BELOW almost exclusively, and one slab presents
       * the player a flat green ceiling - the exact thing a canopy must not
       * be. Breaking the underside with an offset plate costs one box and
       * turns a ceiling into foliage.
       */
      this.leafPlate(
        chunk,
        style.leaves[(index + 1) % style.leaves.length] as number,
        across + (r - 0.5) * size * 0.5,
        y - 4 - r * 3,
        at + (0.5 - r) * 16,
        size * 0.55,
        2.6,
      );
    }

    /* ---- Canopy and vines -------------------------------------------------- */

    if (rand(index * 97 + 41) < style.canopy) {
      const r = rand(index * 47 + 29);
      /*
       * The canopy reaches over the route in SEVERAL plates, not one.
       *
       * A single slab spanning the reach is a ceiling: sixty units square of
       * flat green, which is a wall lying down. Three overlapping plates at
       * different heights and offsets read as foliage, and the gaps between
       * them are where the sunlight gets through.
       */
      const inner = 22 + r * 22;
      const y = ground + 32 + r * 14;
      /*
       * Every plate hangs off a BRANCH reaching in from the treeline.
       *
       * Without it the foliage over the route is a green square in the sky
       * with nothing holding it up - which in a game whose whole vocabulary is
       * floating platforms reads as one more platform. The branch costs a
       * single box and it is the difference between a canopy and a hazard.
       */
      const anchor = half + 6;
      for (let i = 0; i < 3; i += 1) {
        const t = rand(index * 71 + i * 13);
        if (t < 0.22) continue;
        const size = 15 + t * 17;
        const along = inner + ((half - inner) * (i + 0.35 + t * 0.4)) / 3;
        const lift = y + i * 4 + t * 6;
        const az = at + (t - 0.5) * 11;
        /*
         * The branch, but only when it is short enough to BE a branch.
         *
         * `along` reaches most of the way across the valley on a wide stretch,
         * and a bar a hundred and fifty units long is not a branch, it is a
         * girder - which is exactly how it read. Past this length the plate is
         * high enough and far enough in to be canopy on its own.
         */
        const reachOut = anchor - along;
        if (reachOut < 52) {
          this.box(chunk, 'bark', reachOut, 1.3, 1.3, [
            side * ((along + anchor) / 2),
            lift - 1.2,
            az,
          ]);
        }
        this.leafPlate(
          chunk,
          style.leaves[(index + i) % style.leaves.length] as number,
          side * along,
          lift,
          az,
          size,
          2.4,
        );
      }

      if (r < style.vines) {
        /*
         * A vine is a STRAND OF LEAVES, not a cable.
         *
         * Drawn as one long thin box it is a green pole hanging in mid-air,
         * and at this scale that reads as a dropped prop. Three segments with
         * a leaf tuft at each joint costs three more boxes and reads as
         * something growing.
         */
        const vx = side * (inner + r * 26);
        const segments = 3;
        const length = (7 + r * 12) / segments;
        for (let i = 0; i < segments; i += 1) {
          const vy = y - 1 - i * length;
          const drift = Math.sin((i + r) * 2.1) * 1.4;
          this.box(chunk, 'vine', 0.45, length, 0.45, [vx + drift, vy - length / 2, at + 2]);
          this.box(chunk, 'frond', 1.9, 0.45, 1.9, [vx + drift, vy - length, at + 2]);
        }
      }
    }
  }

  /** A broadleaf tree: trunk, buttress flare and three stacked plates. */
  private tree(
    chunk: Bucket,
    style: ActStyle,
    index: number,
    x: number,
    y: number,
    z: number,
    height: number,
    girth: number,
    lean: number,
  ): void {
    // Founded well below its own base: a trunk that starts exactly at the
    // ground floats the moment the ground it was measured against is not the
    // ground it lands on.
    this.box(chunk, 'trunk', girth, height + 14, girth, [x, y + height / 2 - 7, z], [0, 0, lean]);
    this.box(chunk, 'bark', girth * 1.7, 2.2, girth * 1.7, [x, y + 0.6, z]);

    const leaf = style.leaves[index % style.leaves.length] as number;
    const alt = style.leaves[(index + 1) % style.leaves.length] as number;
    const spread = girth * 5.4 + 3;
    this.leafPlate(chunk, leaf, x, y + height, z, spread, 2);
    this.leafPlate(chunk, alt, x + girth * 0.6, y + height + 2.6, z - girth * 0.4, spread * 0.76, 1.8);
    this.leafPlate(chunk, leaf, x - girth * 0.4, y + height + 5, z + girth * 0.5, spread * 0.5, 1.6);
  }

  /**
   * An emergent: the tallest thing in the rainforest.
   *
   * Buttress roots at the foot, a trunk two or three times a mid tree's, and a
   * crown that sits above the canopy layer rather than in it.
   */
  private giant(
    chunk: Bucket,
    style: ActStyle,
    index: number,
    x: number,
    y: number,
    z: number,
    scale: number,
  ): void {
    const girth = 2.6 * scale;
    const height = 44 + rand(index * 3 + 1) * 30;

    this.box(chunk, 'trunk', girth, height + 26, girth, [x, y + height / 2 - 13, z]);
    // Buttresses: the flared roots a rainforest giant stands on, and the one
    // detail that makes a big trunk read as a tree rather than a pillar.
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2 + 0.4;
      this.box(
        chunk,
        'bark',
        girth * 0.7,
        9 * scale,
        girth * 2.2,
        [x + Math.cos(angle) * girth * 0.9, y + 3 * scale, z + Math.sin(angle) * girth * 0.9],
        [0, angle, 0],
      );
    }

    const leaf = style.leaves[index % style.leaves.length] as number;
    const crown = 15 * scale;
    this.leafPlate(chunk, leaf, x, y + height, z, crown, 3);
    this.leafPlate(chunk, style.leaves[(index + 2) % style.leaves.length] as number, x, y + height + 4.5, z, crown * 0.72, 2.6);
    this.leafPlate(chunk, leaf, x, y + height + 8.5, z, crown * 0.4, 2.2);
  }

  /**
   * One plate of foliage.
   *
   * Keyed by COLOUR rather than by role, so the moss tone used as a canopy and
   * the moss used on a shelf lip share one material and one draw call per
   * chunk. Every key costs a draw call in every chunk the player can see.
   */
  private leafPlate(
    chunk: Bucket,
    colour: number,
    x: number,
    y: number,
    z: number,
    size: number,
    thickness: number,
  ): void {
    this.push(chunk, `leaf:${colour}`, colour, plainBox(size, thickness, size), [x, y, z], undefined);
  }

  /** Moss, keyed by its colour so it shares a material with the moss canopy. */
  private mossBox(
    chunk: Bucket,
    w: number,
    h: number,
    d: number,
    at: readonly [number, number, number],
    rotation?: readonly [number, number, number],
  ): void {
    this.push(chunk, `leaf:${PALETTE.moss}`, PALETTE.moss, plainBox(w, h, d), at, rotation);
  }

  private fern(chunk: Bucket, x: number, y: number, z: number, scale: number): void {
    // Three fronds, not four. There are tens of thousands of these and the
    // fourth is never the one that sells it.
    for (let i = 0; i < 3; i += 1) {
      const angle = (i / 3) * Math.PI * 2;
      this.box(
        chunk,
        i % 2 === 0 ? 'frond' : 'fernDark',
        3.2 * scale,
        0.4,
        1 * scale,
        [x + Math.cos(angle) * 1.2 * scale, y + 0.9 * scale, z + Math.sin(angle) * 1.2 * scale],
        [0, angle, -0.42],
      );
    }
  }

  private bush(chunk: Bucket, x: number, y: number, z: number, scale: number): void {
    this.box(chunk, 'bush', 3.4 * scale, 2.4 * scale, 3.4 * scale, [x, y + 1.2 * scale, z]);
    this.box(chunk, 'frond', 2.3 * scale, 1.5 * scale, 2.3 * scale, [x + 0.7, y + 2.6 * scale, z - 0.4]);
  }

  private box(
    chunk: Bucket,
    key: string,
    w: number,
    h: number,
    d: number,
    at: readonly [number, number, number],
    rotation?: readonly [number, number, number],
  ): void {
    this.push(chunk, key, COLOURS[key] ?? PALETTE.leafB, plainBox(w, h, d), at, rotation);
  }

  private push(
    chunk: Bucket,
    key: string,
    colour: number,
    geometry: BufferGeometry,
    at: readonly [number, number, number],
    rotation: readonly [number, number, number] | undefined,
  ): void {
    if (rotation) {
      geometry.rotateX(rotation[0]);
      geometry.rotateY(rotation[1]);
      geometry.rotateZ(rotation[2]);
    }
    geometry.translate(at[0], at[1], at[2]);
    const list = chunk.get(key) ?? [];
    list.push(geometry);
    chunk.set(key, list);
    this.count += 1;
    if (!this.byKey.has(key)) {
      const material = new MeshLambertMaterial({ color: colour });
      this.materials.push(material);
      this.byKey.set(key, material);
    }
  }

  /** Merge one chunk's geometry, one mesh per material, and let the rest go. */
  private flush(chunk: Bucket): void {
    for (const [key, list] of chunk) {
      const merged = mergeGeometries(list, false);
      for (const geometry of list) geometry.dispose();
      if (!merged) continue;
      this.geometries.push(merged);
      const mesh = new Mesh(merged, this.byKey.get(key) as Material);
      // The forest receives but does not cast. Fourteen thousand units of
      // canopy in the shadow map would spend the whole budget on trees nobody
      // is standing under, and leave the mounts without one.
      mesh.receiveShadow = key === 'bank' || key === 'floor';
      this.root.add(mesh);
    }
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.geometries.length = 0;
    this.materials.length = 0;
    this.byKey.clear();
    this.root.removeFromParent();
  }
}

/** The colour each part is drawn in. One material per entry, shared per chunk. */
const COLOURS: Record<string, number> = {
  bank: PALETTE.forestBank,
  floor: PALETTE.forestFloor,
  trunk: PALETTE.trunk,
  bark: PALETTE.trunkDark,
  bush: PALETTE.bush,
  frond: PALETTE.frond,
  fernDark: PALETTE.fernDark,
  vine: PALETTE.vine,
  moss: PALETTE.moss,

  stone: PALETTE.boulder,
  ruin: PALETTE.statueDark,
  stream: PALETTE.streamWater,
};
