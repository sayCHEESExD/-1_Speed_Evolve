import { COURSE, SHOPS, SHOP_ROW, type ShopId } from '@evolve/shared';
import { Group, Mesh, MeshLambertMaterial, type BufferGeometry, type Object3D } from 'three';
import { BoxSet } from '../mount/BoxSet.js';
import { PALETTE } from '../config/worldVisuals.js';
import { CanvasSign } from './CanvasSign.js';
import { mergeStatic } from './mergeStatic.js';
import { texturedBox } from './texturedBox.js';

/**
 * The three traders' huts on the camp's terrace.
 *
 * Each is a palm-thatch roof on lashed timber posts over a plank counter,
 * standing on a cut stone footing, with an ANIMAL shopkeeper behind it in a
 * top hat - a goat for the trails, a horse for the auras and a capybara for
 * the items. Animal keepers rather than human ones is
 * the one piece of set dressing that tells a new player what kind of world
 * this is, and it costs nothing: the keepers are built from the same `BoxSet`
 * the mounts are, so there is no model asset behind any of them.
 *
 * Nothing here is interactive. The stall is scenery and a landmark; the prompt
 * that appears when a player rides up to one lives in the HUD, and the shop it
 * opens is a panel. Keeping the three apart is what lets the stall be as
 * elaborate as it likes without any of it being on the input path.
 */
export class ShopStalls {
  readonly root = new Group();

  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: MeshLambertMaterial[] = [];
  private readonly signs: CanvasSign[] = [];
  /** The three keepers, which are merged geometry of their own already. */
  private readonly keepers: Group[] = [];

  constructor() {
    /*
     * Three TRADERS' HUTS, dug into the camp's terrace.
     *
     * A stone footing course, timber posts lashed with rope, a palm-thatch
     * roof, a plank counter and a board hung on two ropes. They were built by
     * the same people who built the training rigs out of the same three
     * things, which is what makes the camp read as one expedition's work
     * rather than as four features standing near each other.
     *
     * The three are told apart by CLOTH and by their keeper, not by a paint
     * colour: a dyed banner in the shop's own accent and a different animal
     * behind the counter. The striped market canopy this replaced was a
     * perfectly good market canopy and belonged in a different game.
     *
     * ORIENTATION is the thing to get right, and it has been wrong three
     * times: the row has moved from the back of the camp, to the player's
     * left, to their right, and now across the front, and more than once the
     * meshes did not follow the counters.
     *
     * So each hut is built in its OWN frame - `ACROSS` along local Z, `DEEP`
     * along local X, the counter facing local +X - and the whole group is then
     * turned to `SHOP_ROW.faceX/faceZ`, the same vector the collision box and
     * the prompt are placed from. Moving or turning the row is an edit to the
     * layout and nothing in here.
     */
    const ACROSS = SHOP_ROW.width;
    const DEEP = SHOP_ROW.depth;
    /** Local +X is the front. Kept as a name so the geometry below reads. */
    const FACE = 1;
    /** The front face, which every player approaches from. */
    const FRONT = (FACE * DEEP) / 2;
    /** Turns local +X onto the layout's facing vector. */
    const YAW = Math.atan2(-SHOP_ROW.faceZ, SHOP_ROW.faceX);

    const stone = this.material(PALETTE.rockSolid);
    const stoneDark = this.material(PALETTE.boardFrameDark);
    const wood = this.material(PALETTE.timber);
    const woodDark = this.material(PALETTE.timberDark);
    const rope = this.material(PALETTE.ropeCord);
    const thatch = this.material(PALETTE.thatch);
    const thatchDark = this.material(PALETTE.thatchDark);
    const leaf = this.material(PALETTE.frond);
    const moss = this.material(PALETTE.moss);

    for (const shop of SHOPS) {
      const stall = new Group();
      stall.position.set(shop.x, COURSE.floorY, shop.z);
      stall.rotation.y = YAW;
      const accent = this.material(shop.color);

      /* ---- Stone footing ------------------------------------------------ */

      // The hut stands on cut stone rather than on the dirt, which is both
      // what an expedition does in a rainforest and what stops the timber
      // reading as pushed into the ground.
      /*
       * Everything is kept INSIDE the spacing.
       *
       * The stalls stand sixteen apart and are thirteen long, so there are
       * three units between one hut and the next - and a roof, a footing or a
       * sign built wider than its own hut eats that gap and grows into its
       * neighbour. The first version's thatch reached 16.6 and its board 16,
       * and the three ran together into one continuous shed.
       */
      stall.add(this.box(stoneDark, 0, 0.35, 0, DEEP + 3.4, 0.7, ACROSS + 1.2));
      for (const sx of [-1, 1]) {
        stall.add(this.box(stone, (sx * (DEEP + 1.6)) / 2, 0.95, 0, 1.2, 0.8, ACROSS + 1.2));
      }
      stall.add(this.box(moss, FRONT + FACE * 0.8, 1.32, -ACROSS * 0.22, 1.1, 0.25, ACROSS * 0.3));

      /* ---- The counter --------------------------------------------------- */

      stall.add(this.box(wood, 0, 0.7 + SHOP_ROW.height / 2, 0, DEEP, SHOP_ROW.height, ACROSS));
      stall.add(this.box(woodDark, 0, 0.7 + SHOP_ROW.height, 0, DEEP + 0.9, 0.3, ACROSS + 0.9));
      // Plank joints across the counter top, so it is boards rather than slab.
      for (let i = 0; i < 4; i += 1) {
        stall.add(
          this.box(
            woodDark,
            0,
            0.7 + SHOP_ROW.height - 0.02,
            -ACROSS / 2 + 1.4 + (i * (ACROSS - 2.8)) / 3,
            DEEP + 0.6,
            0.26,
            0.16,
          ),
        );
      }

      /* ---- Posts, lashings and the ridge ---------------------------------- */

      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const px = (sx * (DEEP + 1.2)) / 2;
          const pz = (sz * (ACROSS - 0.8)) / 2;
          stall.add(this.box(wood, px, 4.9, pz, 0.7, 8.8, 0.7));
          // Rope lashing where the beam crosses the post - the detail that
          // makes a timber frame read as tied rather than as welded.
          stall.add(this.box(rope, px, 8.6, pz, 1.0, 0.45, 1.0));
          stall.add(this.box(rope, px, 1.8, pz, 1.0, 0.4, 1.0));
        }
        // The wall plate each pitch rests on, running the hut's length.
        stall.add(
          this.box(woodDark, (sx * (DEEP + 1.2)) / 2, 8.9, 0, 0.5, 0.5, ACROSS + 1.4),
        );
      }
      // Gable braces at the two ENDS, and the ridge beam between them.
      for (const sz of [-1, 1]) {
        for (const sx of [-1, 1]) {
          stall.add(
            this.box(woodDark, (sx * DEEP) / 4, 9.7, (sz * (ACROSS - 0.8)) / 2, DEEP * 0.8, 0.45, 0.45, [0, 0, sx * 0.55]),
          );
        }
      }
      stall.add(this.box(woodDark, 0, 10.4, 0, 0.55, 0.55, ACROSS + 1.8));

      /* ---- Palm thatch ---------------------------------------------------- */

      stall.add(this.thatchRoof(thatch, thatchDark, leaf, ACROSS, DEEP, FACE));

      /* ---- The hanging board ---------------------------------------------- */

      // Two ropes and a plank, swinging off a bracket out over the counter. A
      // sign bolted flat to the roof is a label; one hanging on ropes is a
      // shop.
      const signX = FRONT + FACE * 3.2;
      stall.add(this.box(woodDark, FRONT + FACE * 1.7, 10.0, 0, 3.6, 0.45, 0.45));
      for (const sz of [-1, 1]) {
        stall.add(this.box(rope, signX, 9.2, sz * 4.6, 0.22, 2.0, 0.22));
      }
      stall.add(this.box(woodDark, signX, 8.2, 0, 0.45, 0.5, 11.8));
      const sign = new CanvasSign(11.5, 3.2, [
        { text: shop.title, size: 1, fill: '#ffffff', stroke: '#3a2408', strokeWidth: 0.2 },
      ]);
      // Above the keeper's head rather than across their chest: the board is
      // the first thing read from a distance and the keeper is the first thing
      // read at the counter, so they must not be at the same height.
      sign.mesh.position.set(signX + FACE * 0.3, 7.1, 0);
      // Turned to look the way the counter does. Signs are single-sided, so
      // one left facing +Z is invisible from the only direction anybody comes
      // from - and one facing the wrong way along X is worse, because it is a
      // blank board rather than an obviously missing one.
      sign.mesh.rotation.y = (FACE * Math.PI) / 2;
      stall.add(sign.mesh);
      this.signs.push(sign);

      // Two banners in the shop's own colour, hung either side of the counter.
      // This is where the accent lands now the roof is thatch: flat panels of
      // dyed cloth facing squarely at anybody riding up.
      for (const sz of [-1, 1]) {
        stall.add(this.box(accent, FRONT + FACE * 1.1, 7.4, (sz * (ACROSS - 4.4)) / 2, 0.18, 2.6, 3.6));
      }

      /* ---- Expedition clutter --------------------------------------------- */

      // Crates, a lantern post and a plant, all at the hut's ENDS so nothing
      // stands between the player and the counter they have ridden up to.
      for (const sz of [-1, 1]) {
        stall.add(this.box(wood, -FACE * DEEP * 0.5, 1.5, sz * (ACROSS / 2 - 1.2), 2.2, 1.6, 2.2));
        stall.add(this.box(woodDark, -FACE * DEEP * 0.5, 2.4, sz * (ACROSS / 2 - 1.2), 2.3, 0.25, 2.3));
      }
      stall.add(this.box(wood, -FACE * (DEEP * 0.5 + 1.4), 1.4, -ACROSS / 2 + 1.4, 1.8, 1.4, 1.8, [0, 0.4, 0]));
      stall.add(this.box(leaf, -FACE * (DEEP * 0.5 + 1.4), 2.6, -ACROSS / 2 + 1.4, 2.6, 1.3, 2.6, [0, 0.4, 0]));
      // Rope hanging from the eaves at each end.
      for (const sz of [-1, 1]) {
        stall.add(this.box(rope, FRONT + FACE * 0.4, 8.0, sz * (ACROSS / 2 - 0.2), 0.2, 2.2, 0.2));
      }

      // The keeper, behind the counter and FACING THE FRONT.
      // BEHIND the counter, not inside it. The counter is five deep about the
      // hut's centre, so an offset of a third of that put the keeper in the
      // middle of the woodwork with only a hat showing.
      const keeper = this.keeper(shop.id);
      keeper.rotation.y = (FACE * Math.PI) / 2;
      keeper.position.set(-FACE * (DEEP / 2 + 1.5), 0, 0);
      stall.add(keeper);

      this.root.add(stall);
      this.keepers.push(keeper);
    }

    // The keepers carry vertex colours and the boards carry canvases; the huts
    // themselves are three hundred static boxes, and they collapse to a
    // handful of meshes.
    mergeStatic(
      this.root,
      new Set<Object3D>([...this.keepers, ...this.signs.map((sign) => sign.mesh)]),
      this.geometries,
    );
  }

  /**
   * A palm-thatch roof.
   *
   * Four courses of overlapping fronds up each pitch, the lower ones hanging
   * past the one above. Thatch is the one roof an expedition can actually
   * build out of a rainforest, and the overlap is the whole reason it reads as
   * thatch rather than as two tilted boards.
   */
  private thatchRoof(
    thatch: MeshLambertMaterial,
    thatchDark: MeshLambertMaterial,
    leaf: MeshLambertMaterial,
    across: number,
    deep: number,
    facing: number,
  ): Group {
    const group = new Group();
    /*
     * ASYMMETRIC, and that is the whole point of it.
     *
     * A symmetrical roof brought the front eave down to about eye height,
     * which put a thatch beam exactly between the player and the counter they
     * had ridden up to: from the saddle you saw three roofs and three signs and
     * no shop at all. The BACK pitch is long and low, the FRONT one is short
     * and stops high, and what is left is an open front over the counter -
     * which is what a market stall is for.
     *
     * The pitches fall away in ±X, so each course runs the hut's LENGTH and
     * tilts about Z. Tilting about X - which the first version did - pitched
     * the roof along its own ridge and left a valley down the middle.
     */
    const RIDGE = 10.2;
    for (const sx of [-1, 1]) {
      const front = sx === facing;
      const courses = front ? 2 : 4;
      const reach = front ? deep / 2 + 0.4 : deep / 2 + 3.0;
      const fall = front ? 1.1 : 3.2;
      for (let i = 0; i < courses; i += 1) {
        const t = i / (courses - 1);
        group.add(
          this.box(
            i % 2 === 0 ? thatch : thatchDark,
            sx * (0.7 + t * reach),
            RIDGE - 0.4 - t * fall,
            0,
            2.5,
            0.62,
            across + 0.6 + t * 0.7,
            [0, 0, sx * (front ? 0.36 : 0.56)],
          ),
        );
      }
      // A fringe of loose fronds along the eave. Only on the BACK pitch: on
      // the front it would undo the clearance the short pitch just bought.
      if (front) continue;
      for (let i = 0; i < 5; i += 1) {
        group.add(
          this.box(
            leaf,
            sx * (deep / 2 + 3.8),
            RIDGE - 4.0,
            -across / 2 + 1.6 + (i * (across - 3.2)) / 4,
            1.5,
            0.3,
            2.4,
            [(i - 2) * 0.12, 0, sx * 0.68],
          ),
        );
      }
    }
    return group;
  }

  /** One boxed part of a hut. */
  private box(
    material: MeshLambertMaterial,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    rotation?: readonly [number, number, number],
  ): Mesh {
    const mesh = new Mesh(this.geometry(w, h, d), material);
    mesh.position.set(x, y, z);
    if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * One shopkeeper: a blocky animal in a top hat.
   *
   * Three species from one builder, differing only in colours, ear shape and
   * a snout length - the same principle the mount roster runs on. They are
   * merged into a SINGLE geometry each, so three keepers cost three meshes
   * rather than sixty.
   */
  private keeper(id: ShopId): Group {
    const look = KEEPERS[id];
    const set = new BoxSet();

    // Body, behind the counter and tall enough to clear it.
    set.add([2.2, 2.6, 1.6], [0, 1.3, 0], look.body);
    set.add([1.5, 1.2, 0.2], [0, 1.2, 0.85], look.belly);

    // Head.
    const headY = 3.5;
    set.add([1.9, 1.7, 1.7], [0, headY, 0.15], look.body);
    // Snout, long for the horse and the goat, stubby for the capybara.
    set.add([1.0, 0.8, look.snout], [0, headY - 0.4, 1.05 + look.snout / 2], look.belly);
    set.add([0.5, 0.22, 0.14], [0, headY - 0.25, 1.05 + look.snout], 0x2b2118);

    /*
     * Eyes, at the size the ROSTER uses.
     *
     * These were the last pair of cartoon eyes in the game - a white square a
     * fifth of the head wide with a dot on it - left behind when the mounts
     * were rebuilt. A keeper whose face is drawn to a different rule from the
     * animal the player is sitting on is the one thing that would make these
     * three read as imported from somewhere else.
     */
    set.add([0.5, 0.42, 0.14], [0, headY + 0.52, 0.96], look.body, { shade: 0.3 });
    set.addMirrored([0.2, 0.22, 0.08], [0.44, headY + 0.26, 1.0], 0x241a12);
    set.addMirrored([0.13, 0.14, 0.06], [0.46, headY + 0.26, 1.03], look.eye);
    set.addMirrored([0.07, 0.07, 0.05], [0.5, headY + 0.32, 1.05], 0xffffff, { tint: -0.3 });

    // Ears.
    set.addMirrored(
      [look.earW, look.earH, 0.26],
      [0.78, headY + 0.8, -0.1],
      look.body,
      [0, 0, -0.5],
    );

    // The top hat. All three wear one, which is what makes them read as
    // shopkeepers rather than as loose livestock.
    set.add([2.3, 0.22, 2.3], [0, headY + 0.95, 0.1], 0x1d1a24);
    set.add([1.5, 1.5, 1.5], [0, headY + 1.7, 0.1], 0x1d1a24);
    set.add([1.56, 0.3, 1.56], [0, headY + 1.35, 0.1], look.hatBand);

    // Horns for the goat, a mane for the horse, nothing for the capybara.
    if (look.horns) {
      set.addMirrored([0.2, 0.75, 0.2], [0.5, headY + 0.6, -0.4], 0xe8e0c8, [0.5, 0, -0.25]);
    }
    if (look.mane) {
      for (let i = 0; i < 4; i += 1) {
        set.add([0.34, 0.5, 0.34], [0, headY - i * 0.5, -0.8], look.hair);
      }
    }

    const geometry = set.build() as BufferGeometry;
    this.geometries.push(geometry);
    const mesh = new Mesh(geometry, this.keeperMaterial());
    // Built facing +Z in its OWN space. The caller turns the whole group to
    // face the counter's front, so this model never has to know which way the
    // hut ended up pointing - which is exactly the coupling that left three
    // keepers staring at a wall when the stalls were re-zoned.
    //
    // Scaled up so the keeper reads at the distance a player approaches from:
    // built to the counter's own proportions it was a doll beside a rider.
    mesh.scale.setScalar(1.35);
    mesh.castShadow = true;
    const group = new Group();
    group.add(mesh);
    return group;
  }

  /**
   * ONE vertex-coloured material for all three keepers.
   *
   * The same trick the mount roster uses: colour lives in the vertices, so
   * three different animals are one draw state.
   */
  private keeperMaterialCache: MeshLambertMaterial | null = null;
  private keeperMaterial(): MeshLambertMaterial {
    if (!this.keeperMaterialCache) {
      this.keeperMaterialCache = new MeshLambertMaterial({ vertexColors: true });
      this.materials.push(this.keeperMaterialCache);
    }
    return this.keeperMaterialCache;
  }

  private geometry(w: number, h: number, d: number): BufferGeometry {
    const geometry = texturedBox(w, h, d, 3);
    this.geometries.push(geometry);
    return geometry;
  }

  private material(color: number): MeshLambertMaterial {
    const material = new MeshLambertMaterial({ color });
    this.materials.push(material);
    return material;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const sign of this.signs) sign.dispose();
    this.geometries.length = 0;
    this.materials.length = 0;
    this.signs.length = 0;
    this.root.removeFromParent();
  }
}

/** What each keeper is made of. Three variations on one builder. */
const KEEPERS: Record<
  ShopId,
  {
    body: number;
    belly: number;
    /** The iris. Small and dark, exactly as the mount roster draws one. */
    eye: number;
    hair: number;
    hatBand: number;
    snout: number;
    earW: number;
    earH: number;
    horns: boolean;
    mane: boolean;
  }
> = {
  // The goat sells trails.
  trail: {
    eye: 0x3d2a10,
    body: 0xf2ece0,
    belly: 0xfffaf0,
    hair: 0xd8cdb8,
    hatBand: 0xf25a9e,
    snout: 0.9,
    earW: 0.28,
    earH: 0.7,
    horns: true,
    mane: false,
  },
  // The horse sells auras.
  aura: {
    eye: 0x2a1a10,
    body: 0x8a5a34,
    belly: 0xc49a6c,
    hair: 0x3a2616,
    hatBand: 0x3aa8ff,
    snout: 1.2,
    earW: 0.26,
    earH: 0.6,
    horns: false,
    mane: true,
  },
  // The capybara sells items.
  item: {
    eye: 0x241812,
    body: 0x9a7048,
    belly: 0xc9a274,
    hair: 0x6f4d2c,
    hatBand: 0xf2a53a,
    snout: 0.55,
    earW: 0.3,
    earH: 0.3,
    horns: false,
    mane: false,
  },
};
