import {
  COURSE,
  TRAINING,
  TREADMILLS,
  TREADMILL_BELT_Y,
  treadmillZ,
  type TreadmillTier,
} from '@evolve/shared';
import {
  Group,
  Mesh,
  MeshLambertMaterial,
  type BufferGeometry,
  type Object3D,
  type Texture,
} from 'three';
import { PALETTE } from '../config/worldVisuals.js';
import { CanvasSign } from './CanvasSign.js';
import { mergeStatic } from './mergeStatic.js';
import { texturedBox } from './texturedBox.js';

/** How fast the belt texture scrolls, in texture repeats per second. */
const BELT_SCROLL = 0.9;

/**
 * Sign colour per rebirth gate.
 *
 * Keyed by the REQUIREMENT rather than by the machine index, so the two open
 * belts match each other and the two 1.5x belts match each other without
 * anybody having to keep a parallel list in step with the roster.
 */
const TIER_TEXT: Record<number, string> = {
  0: '#ffffff',
  1: '#8ef07a',
  3: '#7ec8ff',
  5: '#ff8ad4',
};

/** Frame colour per rebirth gate, so a tier is legible from across the arena. */
const TIER_FRAME: Record<number, number> = {
  0: 0xdfe6ef,
  1: 0x4ec94e,
  3: 0x3a8ae0,
  5: 0xe0407a,
};

/**
 * The training area on the player's right.
 *
 * SIX EXPEDITION TRAINING RIGS, not six gym machines. Each is four timber
 * posts on cut stone footings, lashed with rope, carrying a slatted belt
 * between two rollers, with a carved tier stone on the front upright - built
 * from what the camp has rather than shipped in. The belt, the side rails and
 * the console survive the redesign untouched because those three ARE the
 * silhouette: lose them and this is six handsome sheds.
 *
 * Six treadmills, and unlike the previous game's three they are a LADDER:
 * two open belts, two behind the first rebirth, one behind the third and one
 * behind the fifth. Each machine is COLOUR-CODED by its tier and carries its
 * own sign, so what a belt is worth and what it costs are both readable from
 * across the arena rather than only from a menu.
 *
 * A locked machine is drawn desaturated with its belt stopped. It is still
 * ridden onto - the simulation makes no distinction, and the Speed service
 * pays the ordinary ground rate on it - so a player who wanders onto one is
 * never stuck or silently earning nothing.
 *
 * ORIENTATION is the thing to get right. A treadmill faces the way its runner
 * does, and the runner is meant to be looking back at the spawn point in the
 * middle of the arena - which from this deck against the left wall is +X. So
 * the belt runs along X with the console at its +X end, and the three machines
 * stand in a row along Z. Building the belt along Z instead is what made the
 * first version read as a row of beds.
 *
 * The belts themselves are real solids in the shared course data; everything
 * here is the machine around them. Walking on starts the farming and walking
 * off stops it, and that decision belongs entirely to the simulation.
 */
export class TrainingArea {
  readonly root = new Group();

  /** Every belt that is currently turning. Locked machines are not in here. */
  private readonly belts: Mesh[] = [];
  /**
   * One per machine, in tier order, so the lock state can be re-applied.
   *
   * The frame and the console are kept alongside the belt because all three
   * change together: a machine the player cannot use goes grey, its screen
   * goes dark and its belt stops. A lock expressed in one of the three reads
   * as a rendering glitch rather than as a state.
   */
  private readonly machines: {
    tier: TreadmillTier;
    belt: Mesh;
    frame: Mesh[];
    /** This machine's own tier colour, to restore when it unlocks. */
    tierFrame: MeshLambertMaterial;
    screen: Mesh;
    locked: boolean;
  }[] = [];
  private readonly signs: CanvasSign[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: MeshLambertMaterial[] = [];

  private time = 0;
  /** Replicated rebirth count, so the locked belts can stop turning. */
  private rebirths = 0;
  /** So the row is only re-dressed when the rebirth count actually moves. */
  private dirty = true;

  /** The scrolling belt every UNLOCKED machine shares. */
  private running!: MeshLambertMaterial;
  /** The lit console screen. */
  private screenLit!: MeshLambertMaterial;
  /** The camp's own materials: found stone, felled timber, rope, leaf. */
  private stone!: MeshLambertMaterial;
  private timber!: MeshLambertMaterial;
  private timberDark!: MeshLambertMaterial;
  private rope!: MeshLambertMaterial;
  private leaf!: MeshLambertMaterial;
  /** A stopped, unlit belt. Shared by every locked machine. */
  private lockedBelt!: MeshLambertMaterial;
  /** Dead grey, for the frame and the screen of a machine that is off. */
  private lockedFrame!: MeshLambertMaterial;
  private lockedScreen!: MeshLambertMaterial;

  constructor(beltTexture: Texture) {
    // One frame material per rebirth GATE rather than per machine, so the two
    // open belts share a material and the two 1.5x belts share another - four
    // materials for six machines, and a tier that is readable from across the
    // arena before a single sign has been focused on.
    const frames = new Map<number, MeshLambertMaterial>();
    const frameFor = (gate: number): MeshLambertMaterial => {
      let material = frames.get(gate);
      if (!material) {
        material = this.material(TIER_FRAME[gate] ?? PALETTE.treadmillFrame);
        frames.set(gate, material);
      }
      return material;
    };
    const screen = this.material(PALETTE.treadmillScreen);
    // The belt carries a scrolling chevron texture, which is what makes an
    // empty machine still read as running.
    //
    // WHITE, not the belt colour: a lit material MULTIPLIES its colour by its
    // map, so tinting an already-dark texture by its own dark colour crushes
    // the chevrons to black. The colours live in the texture; the material
    // just carries it, with a little emissive so the chevrons stay legible in
    // the deck's own shadow.
    const beltMaterial = this.material(0xffffff);
    beltMaterial.map = beltTexture;
    beltMaterial.emissive.setHex(PALETTE.treadmillBelt);
    beltMaterial.emissiveIntensity = 0.55;
    beltMaterial.emissiveMap = beltTexture;

    /*
     * The locked set.
     *
     * A locked belt gets its OWN material rather than a tint on the shared
     * one, because the shared one is what scrolls: one texture offset drives
     * every running machine, and a stopped belt cannot come from it. Giving
     * the locked machines a second, static material is what lets a stopped
     * belt and a running belt stand side by side.
     */
    this.stone = this.material(PALETTE.rockSolid);
    this.timber = this.material(PALETTE.timber);
    this.timberDark = this.material(PALETTE.timberDark);
    this.rope = this.material(PALETTE.ropeCord);
    this.leaf = this.material(PALETTE.frond);
    this.running = beltMaterial;
    this.screenLit = screen;
    this.lockedBelt = this.material(0x6a6a72);
    this.lockedBelt.map = beltTexture;
    this.lockedFrame = this.material(0x7b7f85);
    this.lockedScreen = this.material(0x1a1d21);

    /*
     * ONE RIG, built six times.
     *
     * An expedition training frame: four timber posts on cut stone footings,
     * lashed with rope, carrying a belt of slats between two rollers, with a
     * carved tier stone on the front upright. It is built the way everything
     * else in this camp is - found stone, felled timber and rope - rather than
     * being the moulded plastic gym machine it started as.
     *
     * It still has to READ as a treadmill at a glance, which is why the belt,
     * the side rails and the console survive the redesign intact: those three
     * are the silhouette, and losing them would leave six handsome sheds.
     *
     * Shared geometry throughout: six machines are six transforms of about
     * twenty boxes, not six sets of them.
     */
    const L = TRAINING.beltLength;
    const W = TRAINING.beltWidth;

    const footing = this.geometry(3.2, 1.6, 3.2);
    const deck = this.geometry(L + 1.6, 1.1, W + 1.4);
    const belt = this.geometry(L - 1.6, 0.3, W - 2.6);
    const rail = this.geometry(L + 1.6, 0.9, 1.2);
    const roller = this.geometry(1.7, 1.7, W - 2.2);
    const post = this.geometry(0.95, 4.6, 0.95);
    const lash = this.geometry(1.25, 0.4, 1.25);
    const panel = this.geometry(1.1, 2.4, W - 2.2);
    const face = this.geometry(0.35, 1.4, W - 4);
    const handle = this.geometry(4.0, 0.5, 0.5);
    const tierStone = this.geometry(0.5, 1.9, 1.9);
    const frond = this.geometry(2.8, 0.34, 0.9);

    for (const tier of TREADMILLS) {
      const i = tier.index;
      const frame = frameFor(tier.rebirthsRequired);
      const machine = new Group();
      // No rotation: the belt geometry is authored running along X, which is
      // already the direction the runner faces.
      machine.position.set(TRAINING.centerX, TREADMILL_BELT_Y, treadmillZ(i));

      const frameParts: Mesh[] = [];
      const framed = (node: Mesh): Mesh => {
        frameParts.push(node);
        return node;
      };

      // Cut stone footings at the four corners. The rig stands ON something.
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          machine.add(
            this.mesh(footing, this.stone, (sx * (L - 1)) / 2, -1.5, (sz * (W - 1.6)) / 2),
          );
        }
      }

      // The timber deck the belt is set into.
      machine.add(this.mesh(deck, this.timber, 0, -0.7, 0));

      // The running belt: dark, lit, and scrolling.
      const surface = this.mesh(belt, beltMaterial, 0, -0.05, 0);
      machine.add(surface);

      // Rollers at each end, which is what a belt runs ON.
      for (const sx of [-1, 1]) {
        machine.add(this.mesh(roller, this.timberDark, (sx * (L - 1.4)) / 2, 0.05, 0));
      }

      // Raised side rails either side of the belt, in the tier colour - the
      // one painted thing on the rig, and the reason a tier is readable from
      // across the camp.
      for (const side of [-1, 1]) {
        machine.add(framed(this.mesh(rail, frame, 0, 0.25, side * (W / 2 - 0.1))));
      }

      /*
       * The frame: four posts, rope lashings, and a rope handrail between
       * them. The posts lean IN slightly at the top, because a lashed timber
       * frame does and a perfectly vertical one reads as extruded.
       */
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const px = (sx * (L - 2.4)) / 2;
          const pz = (sz * (W - 2.2)) / 2;
          machine.add(this.mesh(post, this.timber, px, 2.1, pz, [0, 0, -sx * 0.05]));
          machine.add(this.mesh(lash, this.rope, px, 3.5, pz));
          machine.add(this.mesh(lash, this.rope, px, 1.1, pz));
        }
        // The rope handrail the runner holds, running the length of the rig.
        machine.add(
          this.mesh(handle, this.rope, -0.4, 4.1, (sx * (W - 2.2)) / 2),
        );
      }

      // The console: a board lashed across the front uprights with a dark
      // slate face, and a carved tier stone beside it.
      machine.add(framed(this.mesh(panel, this.timberDark, L / 2 - 0.2, 3.4, 0)));
      const screenMesh = this.mesh(face, screen, L / 2 + 0.25, 3.5, 0);
      machine.add(screenMesh);
      machine.add(framed(this.mesh(tierStone, frame, L / 2 + 0.6, 1.5, 0)));

      // Foliage growing up the back of the rig. Two fronds, so the equipment
      // reads as having stood in a rainforest for a season.
      for (const sz of [-1, 1]) {
        machine.add(
          this.mesh(frond, this.leaf, -(L / 2) - 0.6, 0.9, (sz * (W - 3)) / 2, [
            0,
            sz * 0.6,
            -0.5,
          ]),
        );
      }

      // The reward label, over the console and facing the camp. Two lines when
      // the machine is gated, so the requirement is read at the same glance as
      // the reward rather than hunted for in a menu.
      const lines = [
        {
          text: `x${tier.multiplier} Steps`,
          size: 1,
          fill: TIER_TEXT[tier.rebirthsRequired] ?? '#ffffff',
          stroke: '#12240f',
        },
      ];
      if (tier.rebirthsRequired > 0) {
        lines.push({
          text: `Rebirth ${tier.rebirthsRequired}`,
          size: 0.68,
          fill: '#ffd83d',
          stroke: '#3a2a06',
        });
      }
      const sign = new CanvasSign(9, 3.4, lines);
      sign.mesh.position.set(L / 2 + 1, 6.4, 0);
      // Facing +X, back toward the camp the player rides in from. Signs are
      // single-sided, so one left facing +Z is invisible from the only
      // direction anybody approaches from.
      sign.mesh.rotation.y = Math.PI / 2;
      machine.add(sign.mesh);
      this.signs.push(sign);
      this.machines.push({
        tier,
        belt: surface,
        frame: frameParts,
        tierFrame: frame,
        screen: screenMesh,
        // Everything starts locked and `setRebirths` opens what it should.
        // Starting unlocked would flash every machine as available for the one
        // frame before the first patch arrives.
        locked: true,
      });

      this.root.add(machine);
    }

    // The area's own title, on the wall behind the machines and facing the
    // open ground the players gather on.
    const title = new CanvasSign(38, 9, [
      { text: 'Speed Training', size: 1, fill: '#ffd21f', stroke: '#4a2a06', strokeWidth: 0.2 },
    ]);
    title.mesh.position.set(
      TRAINING.minX - 0.5,
      COURSE.floorY + 22,
      (TRAINING.minZ + TRAINING.maxZ) / 2,
    );
    title.mesh.rotation.y = Math.PI / 2;
    this.root.add(title.mesh);
    this.signs.push(title);

    /*
     * Merge everything that does not change state.
     *
     * The belt scrolls, the console screen goes dark and the tier-coloured
     * parts are re-materialised when the player's rebirth count moves, so all
     * three are named here and survive. The timber, the rope, the stone
     * footings and the foliage are the same six rigs' worth of boxes every
     * frame, and they collapse to one mesh each.
     */
    const dynamic = new Set<Object3D>();
    for (const machine of this.machines) {
      dynamic.add(machine.belt);
      dynamic.add(machine.screen);
      for (const part of machine.frame) dynamic.add(part);
    }
    for (const sign of this.signs) dynamic.add(sign.mesh);
    mergeStatic(this.root, dynamic, this.geometries);
  }

  /**
   * Tell the area how many rebirths the local player has.
   *
   * The ONLY thing that changes a machine's appearance. It is a plain number
   * from replicated state rather than a decision made here, so the belt that
   * turns is always the belt the server will actually pay a bonus for.
   */
  setRebirths(rebirths: number): void {
    const next = Number.isFinite(rebirths) ? Math.max(0, Math.floor(rebirths)) : 0;
    if (next === this.rebirths && !this.dirty) return;
    this.rebirths = next;
    this.dirty = true;
  }

  /**
   * Scroll the belts, so a machine standing empty still looks like it runs.
   *
   * ONE shared offset for every unlocked belt: the map is shared between them,
   * so this is a single write rather than one per machine. A LOCKED machine
   * carries its OWN static material, so it simply does not move - which is the
   * whole point. The previous version nudged a locked belt down by 0.13 units
   * and left it scrolling, so a machine the player could not use looked
   * exactly like one they could.
   */
  update(delta: number): void {
    this.time += delta;
    // ONE write for every running belt: the map is shared between them, so the
    // whole row scrolls from a single texture offset. The locked machines have
    // their own static material and are untouched by it.
    const map = this.running.map;
    if (map) map.offset.x = (this.time * BELT_SCROLL) % 1;

    if (this.dirty) this.dress();
  }

  /**
   * Put every machine into the state the player's rebirth count says it is in.
   *
   * Only ever called when that count has moved, because it is a material swap
   * across six machines and it does not need doing sixty times a second.
   *
   * It is a MIRROR of replicated state, not a decision. The server decides
   * whether a belt runs - `activeTreadmillAt` refuses a locked one outright -
   * and this only makes what it decided visible. A machine drawn as running
   * that then paid nothing would be the worst version of this bug, because the
   * player would have no way of telling it was one.
   */
  private dress(): void {
    this.dirty = false;
    this.belts.length = 0;

    for (const machine of this.machines) {
      const locked = this.rebirths < machine.tier.rebirthsRequired;
      machine.locked = locked;

      machine.belt.material = locked ? this.lockedBelt : this.running;
      machine.screen.material = locked ? this.lockedScreen : this.screenLit;
      for (const part of machine.frame) {
        part.material = locked ? this.lockedFrame : machine.tierFrame;
      }
      if (!locked) this.belts.push(machine.belt);
    }
  }

  private mesh(
    geometry: BufferGeometry,
    material: MeshLambertMaterial,
    x: number,
    y: number,
    z: number,
    rotation?: readonly [number, number, number],
  ): Mesh {
    const node = new Mesh(geometry, material);
    node.position.set(x, y, z);
    if (rotation) node.rotation.set(rotation[0], rotation[1], rotation[2]);
    node.castShadow = true;
    node.receiveShadow = true;
    return node;
  }

  private geometry(w: number, h: number, d: number): BufferGeometry {
    const geometry = texturedBox(w, h, d, 3);
    this.geometries.push(geometry);
    return geometry;
  }

  private material(color: number, emissive = 0): MeshLambertMaterial {
    const material = new MeshLambertMaterial({ color });
    if (emissive > 0) {
      material.emissive.setHex(color);
      material.emissiveIntensity = emissive;
    }
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
