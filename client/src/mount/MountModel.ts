import { RIDER_HIP_HEIGHT, mountForSlot, type MountDefinition } from '@evolve/shared';
import { Group, Mesh, MeshLambertMaterial, type BufferGeometry } from 'three';
import { mountParts, type MountParts } from './MountGeometry.js';

/**
 * ONE material for every mount in the scene.
 *
 * Colour lives in the vertices, so a spider and a mammoth are the same draw
 * state - which is what lets a busy camp show a dozen different species
 * without a dozen material uploads. Lambert rather than Standard: the roster
 * gets its form from shaded vertex colour rather than from roughness maps, and
 * a PBR shader would spend its whole cost on material response this game has
 * no textures to drive.
 */
let sharedMaterial: MeshLambertMaterial | null = null;

const material = (): MeshLambertMaterial => {
  sharedMaterial ??= new MeshLambertMaterial({ vertexColors: true });
  return sharedMaterial;
};

/**
 * A built, animatable animal.
 *
 * The node tree is the animation contract: `MountAnimator` writes to these
 * nodes and to nothing else, and the simulation writes only to `root`. That
 * separation is why an animation can never move the player.
 *
 *   root            placed by gameplay: world position and facing
 *     scaled        the species' uniform scale
 *       body        bob, pitch and roll. Everything else hangs off this.
 *         head      nod and turn
 *         tail      sway
 *         hip xN -> knee xN -> ankle xN     the gait
 *         rider     where the player model is parented, counter-scaled
 *
 * THREE joints per limb rather than two. The third is not decoration: a dog's
 * hock, a bird's ankle and a spider's tarsus are all the joint that actually
 * meets the ground, and a leg without one either floats or drives its shin
 * through the floor.
 */
export class MountModel {
  /** Attach this to the scene, or to a mount. Gameplay owns its transform. */
  readonly root = new Group();

  /** Carries the body's bob, pitch and roll. */
  readonly body = new Group();
  readonly head = new Group();
  readonly tail = new Group();

  /**
   * Shoulder/hip joints: front pair first, right then left within a pair.
   *
   * TWO of these for a chick, four for a wolf, six for a cockroach and eight
   * for a spider. Nothing downstream is allowed to assume the count - the
   * animator derives its gait phases from `hips.length`, which is the whole
   * reason a spider needs no animation code of its own.
   */
  readonly hips: Group[] = [];
  /** Knee joints, one per hip and parented to it. */
  readonly knees: Group[] = [];
  /** Ankle joints, one per knee. The joint that meets the ground. */
  readonly ankles: Group[] = [];

  /**
   * Where the rider is parented.
   *
   * A child of `body`, so the rider inherits the bob, the pitch and the roll
   * for free and can never drift off the saddle. Counter-scaled by the
   * species' own scale, so a bigger animal does not also produce a bigger
   * person.
   */
  readonly riderAnchor = new Group();

  readonly definition: MountDefinition;
  readonly parts: MountParts;

  private readonly scaled = new Group();

  constructor(definition: MountDefinition) {
    this.definition = definition;
    this.parts = mountParts(definition);

    this.root.add(this.scaled);
    this.scaled.scale.setScalar(definition.scale);
    this.scaled.add(this.body);

    this.body.position.set(0, this.parts.bodyCentreY, 0);
    this.body.add(mesh(this.parts.body));

    this.head.position.set(...this.parts.neckBase);
    this.head.add(mesh(this.parts.head));
    this.body.add(this.head);

    if (this.parts.tail) {
      this.tail.position.set(...this.parts.tailBase);
      this.tail.rotation.x = -definition.shape.tailDroop;
      this.tail.add(mesh(this.parts.tail));
      this.body.add(this.tail);
    }

    for (let i = 0; i < this.parts.hips.length; i += 1) {
      const leg = this.parts.legs[i];
      if (!leg) continue;
      const at = this.parts.hips[i] as readonly [number, number, number];
      const rest = this.parts.hipRest[i] as readonly [number, number, number];

      const hip = new Group();
      hip.position.set(at[0], at[1], at[2]);
      // The rest pose, applied here and RE-applied by the animator every
      // frame. A spider whose eight legs snapped upright the moment it started
      // walking is what happens when only one of the two does it.
      hip.rotation.set(rest[0], rest[1], rest[2]);
      hip.add(mesh(leg.upper));

      const knee = new Group();
      knee.position.set(0, leg.kneeY, 0);
      this.setJoint(knee, this.parts.kneeRest[i] ?? 0);
      knee.add(mesh(leg.lower));
      hip.add(knee);

      const ankle = new Group();
      ankle.position.set(0, leg.ankleY, 0);
      this.setJoint(ankle, this.parts.ankleRest[i] ?? 0);
      ankle.add(mesh(leg.foot));
      knee.add(ankle);

      this.body.add(hip);
      this.hips.push(hip);
      this.knees.push(knee);
      this.ankles.push(ankle);
    }

    /*
     * The seat.
     *
     * Measured from the BACKLINE, which is where a saddle actually is, and
     * converted into the rider's own hip height here. The rider FBX puts its
     * origin at its feet with its hips `RIDER_HIP_HEIGHT` above, so dropping
     * the origin by that much is what lands the rider's hips - rather than
     * its ankles - on the saddle.
     *
     * The hip height is divided by the species' scale because `riderAnchor`
     * is counter-scaled: its POSITION is still in the animal's units, and
     * failing to convert is what leaves a rider sitting a little deeper into
     * every large mount than into a small one.
     */
    const seat = definition.seat;
    this.riderAnchor.position.set(
      seat.x,
      this.parts.backlineY + seat.lift - RIDER_HIP_HEIGHT / definition.scale,
      this.parts.saddleZ + seat.z,
    );
    this.riderAnchor.scale.setScalar(1 / definition.scale);
    this.body.add(this.riderAnchor);
  }

  /** Height from feet to crown, in world units, for floating labels. */
  get height(): number {
    return this.parts.height * this.definition.scale;
  }

  /** Reset every animated node to its rest pose. */
  resetPose(): void {
    this.body.position.set(0, this.parts.bodyCentreY, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.scale.setScalar(1);
    this.head.rotation.set(0, 0, 0);
    this.tail.rotation.set(-this.definition.shape.tailDroop, 0, 0);
    for (let i = 0; i < this.hips.length; i += 1) {
      const rest = this.parts.hipRest[i] as readonly [number, number, number] | undefined;
      (this.hips[i] as Group).rotation.set(rest?.[0] ?? 0, rest?.[1] ?? 0, rest?.[2] ?? 0);
      this.setJoint(this.knees[i] as Group, this.parts.kneeRest[i] ?? 0);
      this.setJoint(this.ankles[i] as Group, this.parts.ankleRest[i] ?? 0);
    }
  }

  /** Write an angle to whichever axis this species' knees fold about. */
  private setJoint(node: Group, angle: number): void {
    if (this.parts.jointAxis === 'z') node.rotation.set(0, 0, angle);
    else node.rotation.set(angle, 0, 0);
  }

  /**
   * Meshes are cheap and geometry is shared, so disposal only unhooks the
   * scene graph. The cached per-species geometry outlives every instance and
   * is released by `disposeMountGeometry`.
   */
  dispose(): void {
    this.root.removeFromParent();
  }
}

/** A fresh mount for a replicated slot. Never throws on an unknown slot. */
export const mountModelForSlot = (slot: number): MountModel =>
  new MountModel(mountForSlot(slot));

const mesh = (geometry: BufferGeometry): Mesh => {
  const node = new Mesh(geometry, material());
  node.castShadow = true;
  node.receiveShadow = true;
  return node;
};
