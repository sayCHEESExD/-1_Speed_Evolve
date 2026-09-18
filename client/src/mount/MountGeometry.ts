import type { MountDefinition, MountPalette, MountShape } from '@evolve/shared';
import { Euler, Quaternion, Vector3, type BufferGeometry } from 'three';
import { BoxSet } from './BoxSet.js';

/**
 * The creature builder.
 *
 * It builds ANIMALS. That sounds obvious and it is the entire point of this
 * file, because the thing it replaced did not: it laid one slab for a barrel,
 * hung four identical posts under it, put a pale bib on the chest and a pair
 * of white squares a third of the skull wide on the face, and called the
 * result a wolf, a spider or a mammoth depending on which colours went in.
 * Every animal in the roster read as the same toy because every animal in the
 * roster WAS the same toy.
 *
 * What is here instead:
 *
 *  - The torso is a swept PROFILE, not a box. Cross-sections run from the
 *    rump to the chest through an authored waist, with a spine that rises over
 *    the shoulder and a belly that tucks up at the flank. That single change
 *    is most of the difference between a live animal and a brick.
 *  - Limbs have THREE segments that fold the way the real joint folds, and
 *    the rest angles come from the body plan: a dog's hind leg zig-zags at the
 *    stifle and hock, a bird's knee is buried in the body with the ankle
 *    standing where a knee looks like it should be, and a spider's femur
 *    reaches UP and out so the joint stands above its back.
 *  - Eyes are eyes: a tenth of the skull, the iris colour the species actually
 *    has, set into a socket under a brow.
 *  - Colour is shaded per box rather than flat, so form reads without a single
 *    texture byte.
 *
 * Coordinates are MOUNT SPACE: origin between the feet, +Y up, +Z forward.
 * Each returned geometry is in its own part's local space so it can hang off
 * an animated node.
 */

/** Which axis a limb's knee and ankle fold about. */
export type JointAxis = 'x' | 'z';

/** The three segments of one limb, and where its joints sit. */
export interface LegParts {
  /** Femur/humerus. Origin at the hip, hanging down -Y. */
  readonly upper: BufferGeometry;
  /** Tibia/radius. Origin at the knee. */
  readonly lower: BufferGeometry;
  /** Foot bone and the foot itself. Origin at the ankle. */
  readonly foot: BufferGeometry;
  /** Knee offset below the hip. */
  readonly kneeY: number;
  /** Ankle offset below the knee. */
  readonly ankleY: number;
}

/**
 * Geometry and joint offsets for one species.
 *
 * Built once and shared by every instance of that species in the scene, which
 * is what lets a busy camp draw fourteen different creatures for the cost of
 * one material and a handful of geometries.
 */
export interface MountParts {
  /** Torso, saddle and anything that wraps them. Origin at the body centre. */
  readonly body: BufferGeometry;
  /** Neck, skull and face. Origin at the base of the neck. */
  readonly head: BufferGeometry;
  /** Tail. Origin at its root, extending along -Z. Null when there is none. */
  readonly tail: BufferGeometry | null;

  /**
   * One entry per leg, front pair first, right then left within a pair.
   *
   * Front and hind limbs of a quadruped are DIFFERENT shapes, so this is a
   * list rather than the single shared pair the first version used - a horse
   * whose hind leg is its front leg upside down is a hobby horse.
   */
  readonly legs: readonly LegParts[];

  /** Hip joints, in BODY-node local space. */
  readonly hips: readonly (readonly [number, number, number])[];
  /**
   * Rest rotation of each hip, in radians, as [pitch, yaw, roll].
   *
   * Applied in three.js' default XYZ order, which composes as roll, then yaw,
   * then pitch. That order is exactly what an eight-legged stance needs: the
   * ROLL throws the limb out to the side, the YAW fans it forward or back
   * around the body, and the PITCH left over on top is the one channel the
   * animator swings the gait with.
   *
   * The animator must RE-APPLY yaw and roll every frame rather than writing
   * zero - a spider whose legs snapped upright the moment it started walking
   * is what writing zero does.
   */
  readonly hipRest: readonly (readonly [number, number, number])[];
  /** Rest angle of each knee about `jointAxis`. The animator adds to it. */
  readonly kneeRest: readonly number[];
  /** Rest angle of each ankle about `jointAxis`. */
  readonly ankleRest: readonly number[];
  /**
   * Which way the knee and ankle fold.
   *
   * 'x' is the sagittal fold of anything with its legs under it. 'z' is the
   * fold of a limb that has already been thrown out sideways - a spider bends
   * its knee in the vertical plane its own leg lies in, which is not the plane
   * its body travels in.
   */
  readonly jointAxis: JointAxis;
  /** Per-leg fold direction, so a left and a right limb bend the same way. */
  readonly jointSign: readonly number[];

  /** Height of the belly line above the feet. */
  readonly bellyY: number;
  /** Height of the body's centre above the feet - the body node's origin. */
  readonly bodyCentreY: number;
  /** Top of the barrel over the shoulder, in BODY-node space. The saddle. */
  readonly backlineY: number;
  /** Where along the spine the saddle sits, in BODY-node space. */
  readonly saddleZ: number;
  /** Neck base, in BODY-node local space. */
  readonly neckBase: readonly [number, number, number];
  /** Tail root, in BODY-node local space. */
  readonly tailBase: readonly [number, number, number];
  /** Total height from feet to crown, for label placement. */
  readonly height: number;
}

/** Cache keyed by mount id. Fourteen species, built once each, shared forever. */
const CACHE = new Map<string, MountParts>();

/** Geometry for one species, built on first use. */
export const mountParts = (definition: MountDefinition): MountParts => {
  const cached = CACHE.get(definition.id);
  if (cached) return cached;
  const built = build(definition);
  CACHE.set(definition.id, built);
  return built;
};

/** Release every cached species. Only used when the whole game is torn down. */
export const disposeMountGeometry = (): void => {
  for (const parts of CACHE.values()) {
    parts.body.dispose();
    parts.head.dispose();
    parts.tail?.dispose();
    for (const leg of parts.legs) {
      leg.upper.dispose();
      leg.lower.dispose();
      leg.foot.dispose();
    }
  }
  CACHE.clear();
};

/* ------------------------------------------------------------------------ */
/* The torso profile                                                         */
/* ------------------------------------------------------------------------ */

/** How many cross-sections a barrel is swept from. */
const SLICES = 11;

/**
 * A smooth bump peaking at `at`, used for the withers and the belly tuck.
 *
 * A raised cosine rather than a triangle, because the shoulder of an animal is
 * a swelling and a triangle would put a corner in the middle of its back.
 */
const bump = (t: number, at: number, width = 0.42): number => {
  const d = Math.abs(t - at) / width;
  return d >= 1 ? 0 : 0.5 * (1 + Math.cos(d * Math.PI));
};

/**
 * Interpolate rump -> waist -> chest.
 *
 * Quadratic through three control points rather than two linear halves: the
 * join between them would be a crease running round the animal at exactly the
 * place a real one is smoothest.
 */
const profile = (rump: number, waist: number, chest: number, t: number): number => {
  const a = (1 - t) * (1 - t);
  const b = 2 * t * (1 - t);
  const c = t * t;
  return rump * a + waist * b * 1.0 + chest * c + waist * b * 0;
};

/** The cross-section of the barrel at `t`, 0 at the tail and 1 at the chest. */
interface Section {
  readonly t: number;
  readonly z: number;
  readonly w: number;
  readonly top: number;
  readonly bottom: number;
}

const sections = (s: MountShape): Section[] => {
  const out: Section[] = [];
  for (let i = 0; i < SLICES; i += 1) {
    const t = i / (SLICES - 1);
    const z = (t - 0.5) * s.bodyL;
    // The ends draw IN. Without it the barrel is a rectangular prism whatever
    // its profile does in the middle, and a flat vertical wall where an
    // animal's chest and rump are rounded is the single loudest thing saying
    // "box" in a silhouette.
    const cap = 1 - 0.34 * Math.abs(t * 2 - 1) ** 3.2;
    const w = s.bodyW * profile(s.rumpW, s.waist, s.chestW, t) * cap;
    const h = s.bodyH * profile(s.rumpH, s.waist, s.chestH, t) * cap;
    out.push({
      t,
      z,
      w,
      top: h / 2 + s.withers * bump(t, 0.76, 0.5),
      bottom: -h / 2 + s.bellyLine * bump(t, 0.34, 0.55),
    });
  }
  return out;
};

/* ------------------------------------------------------------------------ */
/* Limb rest poses                                                           */
/* ------------------------------------------------------------------------ */

interface LimbPose {
  /** Pitch, yaw and roll of the hip. */
  readonly hip: readonly [number, number, number];
  readonly knee: number;
  readonly ankle: number;
  readonly sign: number;
}

/**
 * The rest pose of one limb.
 *
 * This is where a body plan actually becomes visible. Positive pitch swings a
 * limb BACKWARD, so a front leg reads as shoulder-back / elbow-forward and a
 * hind leg as femur-forward / stifle-back / hock-forward: the double zig-zag
 * every running mammal has and the first version of this roster had none of.
 *
 * @param front   true for the leading pair of a quadruped
 * @param side    +1 for the limb on +X
 * @param fan     0 at the front pair, 1 at the rear, for radiating limbs
 */
const limbPose = (
  s: MountShape,
  front: boolean,
  side: number,
  fan: number,
): LimbPose => {
  switch (s.plan) {
    case 'arachnid':
    case 'insect': {
      // The femur is thrown out PAST horizontal so the knee stands above the
      // back, then the tibia drops steeply and the tarsus finishes nearly
      // vertical. Three angles, and between them they are the whole reason an
      // eight-legged animal reads as a spider instead of a many-legged dog.
      const lift = Math.PI / 2 + s.legSplay;
      const drop = s.plan === 'arachnid' ? 0.3 : 0.52;
      const toe = s.plan === 'arachnid' ? 0.1 : 0.18;
      // The fan runs from reaching forward at the front pair to raking behind
      // at the back. Negated for the +X side, because a yaw that sends the
      // right limb forward sends the left one back.
      const yaw = -side * s.legFan * (1 - 2 * fan);
      return {
        hip: [0, yaw, side * lift],
        knee: -side * (lift - drop),
        ankle: -side * (drop - toe),
        // The sign that DEEPENS the fold, which on a limb thrown out to the
        // left is the opposite of one thrown out to the right. Handing the
        // animator the side instead would make half the legs straighten as
        // the other half flexed.
        sign: -side,
      };
    }
    case 'biped': {
      // A bird's knee is inside its body and what looks like a backward knee
      // is its ANKLE. Building that literally is why the ostrich reads as a
      // bird rather than as a person in a costume.
      const bird = s.foot === 'talon';
      return bird
        ? { hip: [-0.92, 0, side * s.legSplay], knee: 1.38, ankle: -0.58, sign: 1 }
        : { hip: [-0.55, 0, side * s.legSplay], knee: 0.98, ankle: -0.47, sign: 1 };
    }
    default: {
      // Column-legged animals barely fold at all; everything else zig-zags.
      const column = s.foot === 'pad';
      if (front) {
        return column
          ? { hip: [0.05, 0, side * s.legSplay], knee: -0.03, ankle: 0.0, sign: 1 }
          : { hip: [0.2, 0, side * s.legSplay], knee: -0.17, ankle: 0.05, sign: 1 };
      }
      return column
        ? { hip: [-0.14, 0, side * s.legSplay], knee: 0.26, ankle: -0.14, sign: 1 }
        : { hip: [-0.42, 0, side * s.legSplay], knee: 0.86, ankle: -0.5, sign: 1 };
    }
  }
};

/**
 * How far the foot of a limb in this pose falls below its hip.
 *
 * Forward kinematics rather than an authored stance height, and that is not
 * fussiness: the belly line, the saddle, the rider and the nameplate are all
 * measured from it, so a hand-written number is four things that go wrong
 * together the first time a leg segment changes length. Solving it means an
 * animal always stands ON the ground it is drawn over.
 */
const footDrop = (s: MountShape, pose: LimbPose, axis: JointAxis): number => {
  const rotation = new Quaternion().setFromEuler(
    new Euler(pose.hip[0], pose.hip[1], pose.hip[2]),
  );
  const down = new Vector3();
  const tip = new Vector3();

  const step = (length: number): void => {
    down.set(0, -length, 0).applyQuaternion(rotation);
    tip.add(down);
  };

  step(s.legUpper);
  rotation.multiply(fold(pose.knee, axis));
  step(s.legLower);
  rotation.multiply(fold(pose.ankle, axis));
  step(s.legFoot);

  return -tip.y;
};

const fold = (angle: number, axis: JointAxis): Quaternion =>
  new Quaternion().setFromEuler(
    axis === 'z' ? new Euler(0, 0, angle) : new Euler(angle, 0, 0),
  );

/* ------------------------------------------------------------------------ */
/* The build                                                                 */
/* ------------------------------------------------------------------------ */

const build = (definition: MountDefinition): MountParts => {
  const s = definition.shape;
  const p = definition.palette;
  const has = (feature: string): boolean =>
    (definition.features as readonly string[]).includes(feature);

  const axis: JointAxis = s.plan === 'arachnid' || s.plan === 'insect' ? 'z' : 'x';
  const slices = sections(s);
  const chest = slices[slices.length - 1] as Section;
  const rump = slices[0] as Section;

  /* ---- Where the legs hang, and how ------------------------------------ */

  const pairs = Math.max(1, Math.round(s.legPairs));
  const hips: (readonly [number, number, number])[] = [];
  const hipRest: (readonly [number, number, number])[] = [];
  const kneeRest: number[] = [];
  const ankleRest: number[] = [];
  const jointSign: number[] = [];
  const poses: LimbPose[] = [];

  for (let pair = 0; pair < pairs; pair += 1) {
    const fan = pairs === 1 ? 0.5 : pair / (pairs - 1);
    // Front pair at +legSpreadZ, back pair at -legSpreadZ.
    const z = s.legSpreadZ * (1 - 2 * fan);
    // The middle pairs of a six- or eight-legged animal sit slightly wider
    // than the ends, which is what gives the body its oval plan.
    const widen = pairs > 2 ? 1 + Math.sin(fan * Math.PI) * 0.16 : 1;
    // The hip follows the barrel: a leg attaches to the body it is under, not
    // to an average of the body's widest point.
    const at = sectionAt(slices, (z + s.bodyL / 2) / s.bodyL);
    const hipY = s.plan === 'arachnid' ? at.bottom * 0.3 : at.bottom + s.legW * 0.4;

    for (const side of [1, -1]) {
      const pose = limbPose(s, fan < 0.5, side, fan);
      hips.push([side * s.legSpreadX * widen, hipY, z] as const);
      hipRest.push(pose.hip);
      kneeRest.push(pose.knee);
      ankleRest.push(pose.ankle);
      jointSign.push(pose.sign);
      poses.push(pose);
    }
  }

  // Every limb must reach the same ground, so the stance is the DEEPEST of
  // them - anything shallower is a leg that would hang in the air, and the
  // gait would then walk the animal on its longest pair alone.
  let drop = 0;
  for (const pose of poses) drop = Math.max(drop, footDrop(s, pose, axis));
  const hipY = hips.length > 0 ? (hips[0] as readonly number[])[1] ?? 0 : 0;
  const bodyCentreY = drop - hipY;

  /* ---- Torso ------------------------------------------------------------ */

  const body = new BoxSet();
  buildTorso(body, s, p, slices, has);

  const backlineY = chest.top;
  const saddleZ = chest.z * 0.08 + rump.z * 0.1;
  buildSaddle(body, s, p, slices, saddleZ);

  if (has('dragonWings')) addDragonWings(body, s, p, chest);
  if (has('wings')) addFoldedWings(body, s, p, slices);

  /* ---- Head ------------------------------------------------------------- */

  const head = new BoxSet();
  const face = buildHead(head, s, p, has);

  /* ---- Legs -------------------------------------------------------------- */

  const legs: LegParts[] = [];
  for (let i = 0; i < hips.length; i += 1) {
    const front = Math.floor(i / 2) < pairs / 2;
    legs.push(buildLeg(s, p, front, has));
  }

  /* ---- Tail --------------------------------------------------------------- */

  let tail: BufferGeometry | null = null;
  if (s.tailLen > 0 && s.tailW > 0) tail = buildTail(s, p, has);

  return {
    body: body.build() as BufferGeometry,
    head: head.build() as BufferGeometry,
    tail,
    legs,
    hips,
    hipRest,
    kneeRest,
    ankleRest,
    jointAxis: axis,
    jointSign,
    bellyY: bodyCentreY + rump.bottom,
    bodyCentreY,
    backlineY,
    saddleZ,
    neckBase: [0, chest.top - s.neckW * 0.45, chest.z - s.bodyL * 0.02],
    tailBase: [0, rump.top - s.tailW * 0.4, rump.z],
    height: bodyCentreY + Math.max(chest.top, face.crownY + chest.top - s.neckW * 0.45),
  };
};

/** The cross-section nearest a normalised position along the barrel. */
const sectionAt = (slices: readonly Section[], t: number): Section => {
  const index = Math.round(clamp(t, 0, 1) * (slices.length - 1));
  return slices[index] as Section;
};

/* ------------------------------------------------------------------------ */
/* Torso                                                                     */
/* ------------------------------------------------------------------------ */

const buildTorso = (
  set: BoxSet,
  s: MountShape,
  p: MountPalette,
  slices: readonly Section[],
  has: (feature: string) => boolean,
): void => {
  const span = s.bodyH * 1.6;
  const sliceLen = (s.bodyL / (slices.length - 1)) * 1.06;
  const arachnid = s.plan === 'arachnid';

  for (let i = 0; i < slices.length; i += 1) {
    const at = slices[i] as Section;
    const height = at.top - at.bottom;
    if (height <= 0.01 || at.w <= 0.01) continue;
    const centre = (at.top + at.bottom) / 2;

    // An arachnid's two masses are DIFFERENT colours - the cephalothorax is
    // always darker and harder than the abdomen - so the waist reads as a
    // join between two body parts rather than as a dent in one.
    const colour = arachnid && at.t > 0.62 ? p.dark : p.body;
    set.add([at.w, height, sliceLen], [0, centre, at.z], colour, {
      shade: 0.36,
      shadeSpan: span,
      shadeAt: 0,
    });

    // Countershading: the underside is pale in almost every real animal, and
    // painting it on the BOTTOM of the barrel rather than as a bib on the
    // chest is the difference between a wolf and a soft toy.
    if (has('countershade') && !arachnid) {
      set.add(
        [at.w * 0.82, height * 0.24, sliceLen],
        [0, at.bottom + height * 0.1, at.z],
        p.belly,
        { shade: 0.2, shadeSpan: span, shadeAt: 0 },
      );
    }

    // Scale rows and guard hair follow the same sweep, so they wrap the form
    // instead of sitting on a flat side.
    if (has('scales') && at.t > 0.08 && i % 2 === 0) {
      set.addMirrored(
        [0.05, height * 0.42, sliceLen * 0.7],
        [at.w / 2, centre + height * 0.12, at.z],
        p.dark,
        { shade: 0.3, shadeSpan: span, shadeAt: 0 },
      );
    }
    if (has('shaggy')) {
      // Hanging guard hair, longer at the flank than at the shoulder.
      const fringe = height * (0.26 + 0.2 * bump(at.t, 0.36, 0.7));
      set.addMirrored(
        [0.08, fringe, sliceLen * 0.9],
        [at.w / 2 - 0.02, at.bottom + fringe * 0.2, at.z],
        p.hair,
        { shade: 0.34, shadeSpan: span, shadeAt: 0 },
      );
      set.add(
        [at.w * 0.5, fringe * 0.5, sliceLen * 0.9],
        [0, at.top + fringe * 0.18, at.z],
        p.hair,
        { shade: 0.2, shadeSpan: span, shadeAt: 0 },
      );
    }
    if (has('down') && at.t < 0.72) {
      // Contour feathers: short overlapping plates, biggest over the rump.
      // Two thirds of the way toward the hair colour rather than all of it,
      // so plumage reads as a texture over the body instead of as a second
      // animal strapped to its side.
      const plume = height * 0.22;
      set.addMirrored(
        [0.1, plume, sliceLen * 0.82],
        [at.w / 2 - 0.02, centre - height * 0.06, at.z],
        i % 2 === 0 ? p.dark : p.body,
        { shade: 0.34, shadeSpan: span, shadeAt: 0 },
      );
    }
    if (has('bristles') && i % 2 === 1) {
      set.addMirrored(
        [0.06, 0.06, 0.34],
        [at.w / 2 + 0.05, centre + height * 0.28, at.z],
        p.hair,
        { rotation: [0.5, 0, -0.7] },
      );
    }
  }

  if (has('stripes')) addStripes(set, s, p, slices);
  if (has('rosettes')) addRosettes(set, s, p, slices);
  if (has('spines')) addSpines(set, s, p, slices);
  if (has('elytra')) addElytra(set, s, p, slices);
};

/**
 * Tiger stripes, which WRAP.
 *
 * Each bar is one box as wide as the barrel plus a hair, so it appears on the
 * left flank, over the spine and on the right flank as one continuous mark.
 * The first version drew a separate patch on each flat side, which is how a
 * pattern ends up looking printed on rather than grown.
 */
const addStripes = (
  set: BoxSet,
  s: MountShape,
  p: MountPalette,
  slices: readonly Section[],
): void => {
  const bars = 9;
  for (let i = 0; i < bars; i += 1) {
    const t = 0.08 + (i / (bars - 1)) * 0.82;
    const at = sectionAt(slices, t);
    const height = at.top - at.bottom;
    // Alternating lengths, because real stripes do not all reach the belly.
    const reach = i % 2 === 0 ? 0.86 : 0.58;
    set.add(
      [at.w + 0.04, height * reach, s.bodyL * 0.035],
      [0, at.top - (height * reach) / 2, at.z],
      p.accent,
      { shade: 0.3, shadeSpan: s.bodyH * 1.6, shadeAt: 0 },
    );
  }
};

/** Broken rosettes on the upper flank, scattered by a fixed lattice. */
const addRosettes = (
  set: BoxSet,
  s: MountShape,
  p: MountPalette,
  slices: readonly Section[],
): void => {
  for (let i = 0; i < 12; i += 1) {
    const t = 0.1 + ((i * 7) % 12) / 14;
    const at = sectionAt(slices, t);
    const height = at.top - at.bottom;
    const y = at.bottom + height * (0.28 + ((i * 5) % 7) / 12);
    const size = 0.16 + ((i * 3) % 4) * 0.035;
    set.addMirrored([0.045, size, size], [at.w / 2, y, at.z], p.accent, {
      shade: 0.25,
      shadeSpan: s.bodyH * 1.6,
      shadeAt: 0,
    });
  }
};

/** Neural spines down the back, tallest over the hips. */
const addSpines = (
  set: BoxSet,
  s: MountShape,
  p: MountPalette,
  slices: readonly Section[],
): void => {
  for (let i = 1; i < slices.length - 1; i += 1) {
    const at = slices[i] as Section;
    const height = (s.bodyH * 0.16 + s.bodyH * 0.16 * bump(at.t, 0.38, 0.8)) * 1.1;
    set.add(
      [0.09, height, s.bodyL * 0.05],
      [0, at.top + height / 2 - 0.02, at.z],
      p.dark,
      { shade: 0.4, tint: 0.06 },
    );
  }
};

/** The cockroach's wing case: two hardened plates with a seam down the join. */
const addElytra = (
  set: BoxSet,
  s: MountShape,
  p: MountPalette,
  slices: readonly Section[],
): void => {
  for (let i = 0; i < slices.length; i += 1) {
    const at = slices[i] as Section;
    if (at.t > 0.66) continue;
    const height = at.top - at.bottom;
    set.addMirrored(
      [at.w * 0.5, height * 0.34, (s.bodyL / (slices.length - 1)) * 1.08],
      [at.w * 0.24, at.top - height * 0.1, at.z],
      p.accent,
      { shade: 0.42, shadeSpan: s.bodyH * 1.2, shadeAt: 0, tint: -0.12 },
    );
  }
  // The seam. Narrow, dark and the length of the case: without it the two
  // halves read as one lid.
  const back = sectionAt(slices, 0.32);
  set.add(
    [0.07, s.bodyH * 0.26, s.bodyL * 0.62],
    [0, back.top, back.z + s.bodyL * 0.02],
    p.hoof,
    { shade: 0.3 },
  );
};

/* ------------------------------------------------------------------------ */
/* Saddle                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * The tack.
 *
 * Deliberately modest: a blanket, a seat pad and a girth. The first version
 * had a strap round the whole barrel with a bright buckle on the chest, which
 * on a cockroach looked like a parcel and on a spider looked like a mistake.
 */
const buildSaddle = (
  set: BoxSet,
  s: MountShape,
  p: MountPalette,
  slices: readonly Section[],
  saddleZ: number,
): void => {
  const at = sectionAt(slices, (saddleZ + s.bodyL / 2) / s.bodyL);
  const length = Math.min(s.bodyL * 0.26, 1.1);

  // A blanket, a pad and a girth, and all three deliberately SMALL. The first
  // version put a slab across the whole back with a bright buckle on the
  // chest; on a cockroach it looked like a parcel and on a spider it looked
  // like a mistake. Tack should be the thing you notice second.
  set.add([at.w * 0.9, 0.06, length * 1.1], [0, at.top + 0.01, at.z], p.saddle, {
    shade: 0.3,
    tint: -0.12,
  });
  set.add([at.w * 0.52, 0.11, length * 0.7], [0, at.top + 0.08, at.z], p.saddle, {
    shade: 0.34,
    tint: -0.02,
  });
  // The cantle and pommel, so the seat has a front and a back to sit between.
  set.add([at.w * 0.5, 0.1, 0.07], [0, at.top + 0.14, at.z - length * 0.32], p.saddle, {
    shade: 0.3,
  });
  set.add([at.w * 0.44, 0.07, 0.07], [0, at.top + 0.12, at.z + length * 0.32], p.saddle, {
    shade: 0.3,
  });
  // The girth: one narrow band round the barrel where a girth actually goes,
  // behind the elbow rather than across the chest, and dark enough to read as
  // a strap rather than as a panel.
  const girth = sectionAt(slices, (saddleZ + s.bodyL / 2) / s.bodyL - 0.07);
  set.add(
    [girth.w + 0.03, girth.top - girth.bottom, 0.07],
    [0, (girth.top + girth.bottom) / 2, girth.z],
    p.saddle,
    { shade: 0.36, tint: -0.3 },
  );
};

/* ------------------------------------------------------------------------ */
/* Head                                                                      */
/* ------------------------------------------------------------------------ */

interface FaceMetrics {
  readonly crownY: number;
}

/**
 * The neck and skull.
 *
 * Built in its own space with the neck base at the origin, so the whole thing
 * can be nodded and turned as one node.
 */
const buildHead = (
  set: BoxSet,
  s: MountShape,
  p: MountPalette,
  has: (feature: string) => boolean,
): FaceMetrics => {
  const tilt = s.neckTilt;
  const dirY = Math.cos(tilt);
  const dirZ = Math.sin(tilt);

  // The neck is SEGMENTED and tapers. One box would be a plank, and a plank
  // between a body and a head is the thing that makes a model read as parts
  // rather than as an animal.
  const segments = Math.max(2, Math.round(3 + s.neckLen * 1.6));
  for (let i = 0; i < segments; i += 1) {
    const t = (i + 0.5) / segments;
    const width = s.neckW * (1 - (1 - s.neckTaper) * t);
    const along = t * s.neckLen;
    set.add(
      [width, (s.neckLen / segments) * 1.25, width * 0.98],
      [0, dirY * along, dirZ * along],
      p.body,
      { rotation: [tilt, 0, 0], shade: 0.34, shadeSpan: s.neckW * 2 },
    );
    if (has('mane')) {
      set.add(
        [width * 0.34, s.neckW * 0.5, (s.neckLen / segments) * 1.3],
        [0, dirY * along + s.neckW * 0.3, dirZ * along - width * 0.42],
        p.hair,
        { rotation: [tilt, 0, 0], shade: 0.3 },
      );
    }
    if (has('shaggy')) {
      // Guard hair off the sides of the neck, in the coat colour rather than
      // the mane colour: a pale fringe alternating with a dark neck segment
      // turns a long neck into a barber pole, which is what the ostrich did
      // the first time this was drawn.
      set.addMirrored(
        [0.07, (s.neckLen / segments) * 1.25, (s.neckLen / segments) * 1.1],
        [width / 2, dirY * along, dirZ * along],
        p.body,
        { rotation: [tilt, 0, 0], shade: 0.4 },
      );
    }
  }

  const skullY = dirY * s.neckLen + s.headH * 0.28;
  const skullZ = dirZ * s.neckLen + s.headL * 0.26;
  const span = s.headH * 2;

  // The cranium, then a narrower box in front of it for the face. Two masses
  // rather than one is what gives a skull a cheek and a temple.
  set.add([s.headW, s.headH, s.headL * 0.66], [0, skullY, skullZ - s.headL * 0.14], p.body, {
    shade: 0.38,
    shadeSpan: span,
    shadeAt: skullY,
  });
  set.add(
    [s.headW * 0.84, s.headH * 0.82, s.headL * 0.44],
    [0, skullY - s.headH * 0.04, skullZ + s.headL * 0.22],
    p.body,
    { shade: 0.36, shadeSpan: span, shadeAt: skullY },
  );

  // The brow: a ridge over the eye, which is what gives a predator its stare
  // and a herbivore its softness, and it costs one box.
  if (s.brow > 0) {
    set.addMirrored(
      [s.headW * 0.3, s.headH * 0.13 * s.brow + 0.03, s.headL * 0.3],
      [s.headW * 0.3, skullY + s.headH * 0.3, skullZ + s.headL * 0.1],
      p.dark,
      { shade: 0.3, shadeSpan: span, shadeAt: skullY, tint: -0.04 },
    );
  }

  const muzzleZ = skullZ + s.headL * 0.44;
  const muzzleY = skullY - s.muzzleDrop;

  if (has('beak')) {
    addBeak(set, s, p, muzzleY, muzzleZ);
  } else {
    addMuzzle(set, s, p, muzzleY, muzzleZ, has);
  }

  addEyes(set, s, p, skullY, skullZ, has);

  if (s.earH > 0) addEars(set, s, p, skullY, skullZ);
  if (has('ruff')) addRuff(set, s, p, skullY, skullZ);
  if (has('antennae')) addAntennae(set, s, p, skullY, skullZ);
  if (has('crest')) addCrest(set, s, p, skullY, skullZ);
  if (has('horns')) addHorns(set, s, p, skullY, skullZ);
  if (has('tusks')) addTusks(set, s, p, muzzleY, muzzleZ);
  if (has('trunk')) addTrunk(set, s, p, muzzleY, muzzleZ);
  if (has('arachnidFace')) addChelicerae(set, s, p, muzzleY, muzzleZ);

  return { crownY: skullY + s.headH * 0.5 };
};

/** A tapering muzzle in three plates, with a nose and a jaw under it. */
const addMuzzle = (
  set: BoxSet,
  s: MountShape,
  p: MountPalette,
  y: number,
  z: number,
  has: (feature: string) => boolean,
): void => {
  const steps = 3;
  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1);
    const w = s.muzzleW * (1 - t * 0.3);
    const h = s.muzzleH * (1 - t * 0.26);
    set.add(
      [w, h, (s.muzzleL / steps) * 1.1],
      [0, y - t * s.muzzleH * 0.1, z + (t + 0.5) * (s.muzzleL / steps)],
      p.body,
      { shade: 0.34, shadeSpan: s.headH * 2, shadeAt: y },
    );
  }

  // The jaw. Hung UNDER the muzzle and shorter than it, so the mouth line is
  // a shadow along the side of the face rather than a slot cut in a box.
  if (s.jaw > 0) {
    set.add(
      [s.muzzleW * 0.82, s.muzzleH * 0.42 * s.jaw + 0.04, s.muzzleL * 0.84],
      [0, y - s.muzzleH * 0.48, z + s.muzzleL * 0.42],
      p.dark,
      { shade: 0.3, shadeSpan: s.headH * 2, shadeAt: y },
    );
  }

  // The nose: dark, damp and at the very tip.
  set.add(
    [s.muzzleW * 0.56, s.muzzleH * 0.42, s.muzzleL * 0.18],
    [0, y + s.muzzleH * 0.08, z + s.muzzleL * 0.96],
    p.hoof,
    { shade: 0.22, tint: 0.04 },
  );

  if (has('fangs')) {
    const jawY = y - s.muzzleH * 0.44;
    for (let i = 0; i < 3; i += 1) {
      const scale = 1 - i * 0.24;
      set.addMirrored(
        [0.055, s.muzzleH * 0.3 * scale, 0.055],
        [s.muzzleW * (0.16 + i * 0.13), jawY, z + s.muzzleL * (0.72 - i * 0.2)],
        p.belly,
        { tint: 0.14 },
      );
    }
  }
};

/** A keratin beak: an upper mandible over a shorter lower one. */
const addBeak = (
  set: BoxSet,
  s: MountShape,
  p: MountPalette,
  y: number,
  z: number,
): void => {
  const steps = 3;
  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1);
    set.add(
      [s.muzzleW * (1 - t * 0.66), s.muzzleH * (1 - t * 0.6), (s.muzzleL / steps) * 1.1],
      [0, y - t * s.muzzleH * 0.26, z + (t + 0.5) * (s.muzzleL / steps)],
      p.hoof,
      { shade: 0.34, shadeSpan: s.headH * 2, shadeAt: y },
    );
  }
  set.add(
    [s.muzzleW * 0.72, s.muzzleH * 0.3, s.muzzleL * 0.66],
    [0, y - s.muzzleH * 0.44, z + s.muzzleL * 0.34],
    p.hoof,
    { shade: 0.28, tint: -0.1 },
  );
  // The nostril, a dark notch at the base. Small, and it is what stops a beak
  // reading as a traffic cone.
  set.addMirrored(
    [0.05, 0.05, 0.05],
    [s.muzzleW * 0.22, y + s.muzzleH * 0.2, z + s.muzzleL * 0.12],
    p.eye,
  );
};

/**
 * Eyes.
 *
 * The single most important twenty lines in this file. An eye is a SMALL dark
 * sphere with a coloured iris, set into a socket in the side of a skull, with
 * a lid over it. What was here before was a white square a third of the head
 * wide with a black dot on it, which is a cartoon convention, and no amount of
 * good anatomy underneath survives one of those on the face.
 */
const addEyes = (
  set: BoxSet,
  s: MountShape,
  p: MountPalette,
  skullY: number,
  skullZ: number,
  has: (feature: string) => boolean,
): void => {
  if (has('arachnidFace')) {
    // Eight eyes in the real arrangement: a wide front row of four with the
    // two median ones largest, and two pairs set back on the carapace.
    const front = skullZ + s.headL * 0.34;
    const row = skullY + s.headH * 0.12;
    const placements: readonly (readonly [number, number, number, number])[] = [
      [0.16, row, front, 1.25],
      [0.44, row - 0.02, front - 0.02, 0.9],
      [0.28, row + s.eyeSize * 1.5, front - s.headL * 0.14, 0.75],
      [0.56, row + s.eyeSize * 1.2, front - s.headL * 0.2, 0.7],
    ];
    for (const [x, y, z, scale] of placements) {
      const size = s.eyeSize * scale;
      set.addMirrored([size, size, size * 0.7], [s.headW * x, y, z], p.eye, {
        tint: -0.2,
      });
      set.addMirrored(
        [size * 0.34, size * 0.34, size * 0.4],
        [s.headW * x - size * 0.2, y + size * 0.24, z + size * 0.3],
        0xffffff,
        { tint: -0.35 },
      );
    }
    return;
  }

  // How far round the skull the eye sits: forward for a predator, on the side
  // for prey. `eyeSet` is the one number that decides which.
  const x = s.headW * (0.24 + 0.24 * s.eyeSet);
  const z = skullZ + s.headL * (0.3 - 0.2 * s.eyeSet);
  const y = skullY + s.headH * 0.16;
  const size = s.eyeSize;

  // The socket, so the eye sits IN the head rather than on it.
  set.addMirrored([size * 0.5, size * 1.5, size * 1.5], [x, y, z], p.dark, {
    shade: 0.2,
    tint: -0.12,
  });
  // The eyeball: iris colour, with a dark pupil in front of it.
  set.addMirrored([size * 0.7, size * 1.15, size * 1.15], [x + size * 0.14, y, z], p.eye, {
    tint: 0.05,
  });
  set.addMirrored(
    [size * 0.4, size * 0.62, size * 0.62],
    [x + size * 0.42, y, z + size * 0.02],
    0x0d0b0d,
  );
  // One specular highlight. Tiny, off-centre, and it is what makes an eye look
  // wet instead of painted.
  set.addMirrored(
    [size * 0.24, size * 0.24, size * 0.24],
    [x + size * 0.5, y + size * 0.3, z + size * 0.26],
    0xffffff,
    { tint: -0.25 },
  );
  // The upper lid, tipped down over the top of the eye.
  set.addMirrored(
    [size * 0.9, size * 0.4, size * 1.5],
    [x + size * 0.1, y + size * 0.7, z],
    p.dark,
    { shade: 0.24, rotation: [0.2, 0, 0] },
  );
};

/** Ears, splayed and with a darker inner surface. */
const addEars = (
  set: BoxSet,
  s: MountShape,
  p: MountPalette,
  skullY: number,
  skullZ: number,
): void => {
  const x = s.headW * 0.34;
  const y = skullY + s.headH * 0.44;
  const z = skullZ - s.headL * 0.18;
  const steps = s.earH > 0.5 ? 3 : 1;

  for (let i = 0; i < steps; i += 1) {
    const t = steps === 1 ? 0 : i / (steps - 1);
    const height = s.earH / steps;
    set.addMirrored(
      [s.earW * (1 - t * 0.3), height * 1.12, s.earL * (1 - t * 0.35)],
      [x + t * 0.06, y + height * (i + 0.5), z],
      p.body,
      { rotation: [0, 0, -s.earSplay], shade: 0.3, shadeSpan: s.earH * 1.4, shadeAt: y },
    );
    set.addMirrored(
      [s.earW * 0.5, height * 0.9, s.earL * 0.55 * (1 - t * 0.3)],
      [x + t * 0.06 + s.earW * 0.16, y + height * (i + 0.5), z + s.earL * 0.16],
      p.dark,
      { rotation: [0, 0, -s.earSplay], shade: 0.2 },
    );
  }
};

/** A cheek ruff: hair off the jaw line, not a ring of blocks round the skull. */
const addRuff = (
  set: BoxSet,
  s: MountShape,
  p: MountPalette,
  skullY: number,
  skullZ: number,
): void => {
  for (let i = 0; i < 4; i += 1) {
    const t = i / 3;
    set.addMirrored(
      [0.09, s.headH * (0.32 - t * 0.12), s.headL * 0.2],
      [s.headW * (0.5 + t * 0.06), skullY - s.headH * (0.08 + t * 0.2), skullZ - s.headL * 0.1],
      p.hair,
      { rotation: [0, 0, -0.35 - t * 0.3], shade: 0.3 },
    );
  }
};

/** Long segmented feelers, kinked and swept back: the cockroach. */
const addAntennae = (
  set: BoxSet,
  s: MountShape,
  p: MountPalette,
  skullY: number,
  skullZ: number,
): void => {
  let x = s.headW * 0.26;
  let y = skullY + s.headH * 0.22;
  let z = skullZ + s.headL * 0.4;
  let pitch = -0.32;
  let yaw = 0.24;

  for (let i = 0; i < 5; i += 1) {
    const length = 0.85 - i * 0.1;
    const thickness = 0.07 - i * 0.008;
    // Step forward along the current direction, then bend a little more: a
    // whip rather than two straight sticks.
    const dz = Math.cos(pitch) * Math.cos(yaw) * length;
    const dy = -Math.sin(pitch) * length;
    const dx = Math.cos(pitch) * Math.sin(yaw) * length;
    set.addMirrored(
      [thickness, thickness, length * 1.08],
      [x + dx / 2, y + dy / 2, z + dz / 2],
      p.hoof,
      { rotation: [pitch, yaw, 0], shade: 0.3 },
    );
    x += dx;
    y += dy;
    z += dz;
    pitch += 0.2;
    yaw += 0.12;
  }
};

/** A swept-back crown of feathers: the phoenix. */
const addCrest = (
  set: BoxSet,
  s: MountShape,
  p: MountPalette,
  skullY: number,
  skullZ: number,
): void => {
  for (let i = 0; i < 5; i += 1) {
    const t = i / 4;
    set.add(
      [0.07 + t * 0.03, s.headH * (0.9 - t * 0.28), 0.14],
      [0, skullY + s.headH * 0.6 + t * 0.14, skullZ - t * s.headL * 0.5],
      i % 2 === 0 ? p.hair : p.accent,
      { rotation: [0.55 + t * 0.35, 0, 0], shade: 0.3, tint: t * 0.06 },
    );
  }
};

/** Two horns swept back off the skull: the dragon. */
const addHorns = (
  set: BoxSet,
  s: MountShape,
  p: MountPalette,
  skullY: number,
  skullZ: number,
): void => {
  let y = skullY + s.headH * 0.4;
  let z = skullZ - s.headL * 0.2;
  const x = s.headW * 0.3;
  for (let i = 0; i < 4; i += 1) {
    const length = 0.34 - i * 0.05;
    const thickness = 0.16 - i * 0.032;
    set.addMirrored([thickness, thickness, length * 1.1], [x + i * 0.04, y, z], p.hoof, {
      rotation: [0.9 - i * 0.14, 0.2, 0],
      shade: 0.36,
    });
    y += 0.16;
    z -= length * 0.74;
  }
};

/** Two curved ivory tusks: the mammoth. */
const addTusks = (
  set: BoxSet,
  s: MountShape,
  p: MountPalette,
  y: number,
  z: number,
): void => {
  let cx = s.headW * 0.3;
  let cy = y - s.muzzleH * 0.2;
  let cz = z + s.muzzleL * 0.5;
  let pitch = 0.5;
  for (let i = 0; i < 5; i += 1) {
    const length = 0.46;
    const thickness = 0.2 - i * 0.028;
    set.addMirrored([thickness, thickness, length * 1.12], [cx, cy, cz], p.belly, {
      rotation: [pitch, 0.05, 0],
      shade: 0.3,
      tint: 0.05,
    });
    cz += Math.cos(pitch) * length;
    cy -= Math.sin(pitch) * length;
    cx += 0.015;
    // Curling UP at the tip, which is the whole silhouette of a mammoth tusk.
    pitch -= 0.34;
  }
};

/** A segmented prehensile trunk. */
const addTrunk = (
  set: BoxSet,
  s: MountShape,
  p: MountPalette,
  y: number,
  z: number,
): void => {
  let cy = y - s.muzzleH * 0.3;
  let cz = z + s.muzzleL * 0.3;
  for (let i = 0; i < 6; i += 1) {
    const t = i / 5;
    const size = s.muzzleW * (0.62 - t * 0.3);
    set.add([size, size * 1.1, size], [0, cy, cz], p.body, {
      shade: 0.34,
      shadeSpan: s.headH,
    });
    cy -= size * 0.72;
    cz += size * 0.12 * (1 - t);
  }
};

/** Chelicerae and the fangs folded under them: the spider's mouthparts. */
const addChelicerae = (
  set: BoxSet,
  s: MountShape,
  p: MountPalette,
  y: number,
  z: number,
): void => {
  set.addMirrored(
    [s.muzzleW * 0.5, s.muzzleH, s.muzzleL],
    [s.muzzleW * 0.28, y, z + s.muzzleL * 0.3],
    p.dark,
    { shade: 0.34, tint: -0.06 },
  );
  // The fangs, hinged down and inward.
  set.addMirrored(
    [0.08, s.muzzleH * 0.86, 0.09],
    [s.muzzleW * 0.24, y - s.muzzleH * 0.7, z + s.muzzleL * 0.5],
    p.hoof,
    { rotation: [0.35, 0, 0.3], shade: 0.3 },
  );
  // Pedipalps: the short pair in front that are NOT legs, and leaving them
  // off is one of the ways a spider model ends up looking like an insect.
  for (let i = 0; i < 2; i += 1) {
    set.addMirrored(
      [0.11, 0.11, 0.42],
      [s.muzzleW * (0.5 + i * 0.1), y - s.muzzleH * (0.3 + i * 0.5), z + 0.22 + i * 0.3],
      p.body,
      { rotation: [0.7 - i * 1.1, 0.24, 0], shade: 0.3 },
    );
  }
};

/* ------------------------------------------------------------------------ */
/* Wings                                                                     */
/* ------------------------------------------------------------------------ */

/** Folded feathered wings held along the flanks: the ratites. */
const addFoldedWings = (
  set: BoxSet,
  s: MountShape,
  p: MountPalette,
  slices: readonly Section[],
): void => {
  const at = sectionAt(slices, 0.58);
  for (let i = 0; i < 5; i += 1) {
    const t = i / 4;
    // Overlapping coverts down the flank, drawing back to the primaries. Only
    // the last one takes the pale feather colour: a wing built half in white
    // reads as a folded towel rather than as plumage.
    set.addMirrored(
      [0.07, s.bodyH * (0.34 - t * 0.14), s.bodyL * (0.3 - t * 0.02)],
      [at.w / 2 + 0.02, at.top - s.bodyH * (0.26 + t * 0.12), at.z - t * 0.34],
      i === 4 ? p.hair : p.dark,
      { rotation: [0, 0, -0.1 - t * 0.12], shade: 0.34, tint: -t * 0.03 },
    );
  }
};

/**
 * A membrane on an arm: the dragon's.
 *
 * Built the way a bat's wing is - one arm sweeping up and back, four fingers
 * fanning off its wrist, and skin stretched between the fingers. Panels laid
 * between the arm and the body without fingers to hang from is what made the
 * first attempt read as a ladder bolted to the shoulder.
 */
const addDragonWings = (
  set: BoxSet,
  s: MountShape,
  p: MountPalette,
  chest: Section,
): void => {
  const rootX = chest.w / 2 - 0.05;
  const rootY = chest.top - s.bodyH * 0.14;
  const rootZ = chest.z - s.bodyL * 0.2;

  // The arm: two bones sweeping out and up to a wrist above the shoulder.
  let x = rootX;
  let y = rootY;
  let z = rootZ;
  let roll = 0.95;
  for (let i = 0; i < 2; i += 1) {
    const length = 1.35 - i * 0.2;
    const thickness = 0.2 - i * 0.05;
    set.addMirrored(
      [length * 1.06, thickness, thickness * 1.2],
      [x + (Math.cos(roll) * length) / 2, y + (Math.sin(roll) * length) / 2, z],
      p.hoof,
      { rotation: [0, 0, roll], shade: 0.34 },
    );
    x += Math.cos(roll) * length;
    y += Math.sin(roll) * length;
    z -= length * 0.16;
    roll -= 0.55;
  }

  const wristX = x;
  const wristY = y;
  const wristZ = z;

  // Four fingers fanning back and down from the wrist, and one membrane panel
  // hung off each. The panel is as long as its finger, so the trailing edge
  // scallops the way a real wing does.
  for (let i = 0; i < 4; i += 1) {
    const t = i / 3;
    const spread = 0.35 - t * 1.5;
    const length = 2.2 - t * 0.5;
    const dx = Math.cos(spread) * length * 0.42;
    const dy = Math.sin(spread) * length * 0.5;
    const dz = -length * 0.78;

    set.addMirrored(
      [0.1, 0.1, length],
      [wristX + dx / 2, wristY + dy / 2, wristZ + dz / 2],
      p.hoof,
      { rotation: [Math.atan2(dy, -dz), Math.atan2(dx, -dz), 0], shade: 0.3 },
    );
    // The skin. Anchored at the wrist end and widening toward the body, which
    // is what gives a wing its swept triangle rather than a row of slats.
    const inboard = 1 - t;
    set.addMirrored(
      [Math.max(0.3, (wristX - rootX) * inboard * 0.75), 0.06, length * 0.92],
      [
        rootX + (wristX - rootX) * (0.45 + t * 0.3) + dx / 2,
        rootY + (wristY - rootY) * (0.5 + t * 0.2) + dy / 2,
        wristZ + dz / 2 - 0.1,
      ],
      p.accent,
      {
        rotation: [Math.atan2(dy, -dz) * 0.6, 0, -0.5 - t * 0.35],
        shade: 0.26,
        tint: -0.14 + t * 0.08,
      },
    );
  }
};

/* ------------------------------------------------------------------------ */
/* Limbs                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * One limb: three tapering segments and a foot.
 *
 * Front and hind limbs are built SEPARATELY - a hind leg carries more muscle
 * at the top and less at the bottom than a front one - which is why this
 * returns a `LegParts` per leg rather than the single shared pair the previous
 * builder instanced eight times.
 */
const buildLeg = (
  s: MountShape,
  p: MountPalette,
  front: boolean,
  has: (feature: string) => boolean,
): LegParts => {
  const span = s.legUpper + s.legLower + s.legFoot;
  const thin = s.plan === 'arachnid' || s.plan === 'insect';
  // A hind leg is heavier at the haunch. On a spider every leg is the same.
  const haunch = thin ? 1 : front ? 1.06 : 1.28;

  const upper = new BoxSet();
  segment(
    upper,
    s.legUpper,
    s.legW * haunch,
    s.legW * (1 - (1 - s.legTaper) * 0.45),
    p.body,
    span,
    thin ? 3 : 4,
  );
  if (has('shaggy') || has('down')) {
    upper.add(
      [s.legW * haunch * 1.1, s.legUpper * 0.4, s.legW * haunch * 1.2],
      [0, -s.legUpper * 0.24, 0],
      p.hair,
      { shade: 0.3, shadeSpan: span },
    );
  }
  if (has('bristles')) {
    for (let i = 0; i < 3; i += 1) {
      upper.addMirrored(
        [0.05, 0.05, 0.26],
        [s.legW * 0.4, -s.legUpper * (0.25 + i * 0.25), 0],
        p.hair,
        { rotation: [0.4, 0, -0.9] },
      );
    }
  }

  const lower = new BoxSet();
  segment(
    lower,
    s.legLower,
    s.legW * (1 - (1 - s.legTaper) * 0.5),
    s.legW * s.legTaper,
    p.body,
    span,
    thin ? 3 : 4,
  );
  if (has('bristles')) {
    for (let i = 0; i < 3; i += 1) {
      lower.addMirrored(
        [0.045, 0.045, 0.22],
        [s.legW * 0.32, -s.legLower * (0.2 + i * 0.28), 0],
        p.hair,
        { rotation: [0.4, 0, -0.9] },
      );
    }
  }

  const foot = new BoxSet();
  segment(foot, s.legFoot, s.legW * s.legTaper, s.legW * s.legTaper * 0.9, p.body, span, 2);
  buildFoot(foot, s, p, front);

  return {
    upper: upper.build() as BufferGeometry,
    lower: lower.build() as BufferGeometry,
    foot: foot.build() as BufferGeometry,
    kneeY: -s.legUpper,
    ankleY: -s.legLower,
  };
};

/**
 * One limb segment, hanging from the origin down -Y and tapering as it goes.
 *
 * Stepped rather than a single box, because a limb that is the same thickness
 * at the knee as at the hip is a table leg. The shade span covers the WHOLE
 * limb, so the gradient runs continuously from shoulder to foot instead of
 * restarting at each joint.
 */
const segment = (
  set: BoxSet,
  length: number,
  top: number,
  bottom: number,
  colour: number,
  span: number,
  steps: number,
): void => {
  if (length <= 0) return;
  for (let i = 0; i < steps; i += 1) {
    const t = (i + 0.5) / steps;
    const width = top + (bottom - top) * t;
    set.add(
      [width, (length / steps) * 1.14, width * 1.08],
      [0, -length * t, 0],
      colour,
      { shade: 0.34, shadeSpan: span * 1.4, shadeAt: -length * 0.5 },
    );
  }
};

/** What the limb ends in. Built in the foot node's space, at its bottom. */
const buildFoot = (set: BoxSet, s: MountShape, p: MountPalette, front: boolean): void => {
  const y = -s.legFoot;
  const w = s.footW;
  const l = s.footL;

  switch (s.foot) {
    case 'paw': {
      // A pad with three toes and short claws, longer on the front foot.
      set.add([w, w * 0.5, l], [0, y + w * 0.22, l * 0.14], p.body, { shade: 0.3 });
      for (let i = -1; i <= 1; i += 1) {
        set.add(
          [w * 0.3, w * 0.4, l * 0.34],
          [i * w * 0.32, y + w * 0.18, l * 0.45],
          p.body,
          { shade: 0.26 },
        );
        set.add(
          [w * 0.12, w * 0.12, l * 0.16],
          [i * w * 0.32, y + w * 0.1, l * 0.62],
          p.hoof,
        );
      }
      void front;
      return;
    }
    case 'pad': {
      // A weight-bearing column with nail plates round the front rim.
      set.add([w, w * 0.42, l], [0, y + w * 0.2, l * 0.04], p.body, { shade: 0.3 });
      for (let i = -1; i <= 1; i += 1) {
        set.add(
          [w * 0.24, w * 0.2, l * 0.14],
          [i * w * 0.3, y + w * 0.14, l * 0.46],
          p.hoof,
          { tint: 0.05 },
        );
      }
      return;
    }
    case 'talon': {
      // Three forward toes and one back: the bird foot, and the back toe is
      // most of what makes it read as one.
      for (let i = -1; i <= 1; i += 1) {
        set.add(
          [w * 0.26, w * 0.24, l * 0.8],
          [i * w * 0.36, y + w * 0.1, l * 0.3],
          p.hoof,
          { rotation: [0, i * 0.34, 0], shade: 0.3 },
        );
        set.add(
          [w * 0.14, w * 0.14, l * 0.18],
          [i * w * 0.46, y + w * 0.06, l * 0.62],
          p.hoof,
          { tint: -0.14 },
        );
      }
      set.add([w * 0.2, w * 0.2, l * 0.4], [0, y + w * 0.1, -l * 0.22], p.hoof, {
        shade: 0.3,
      });
      return;
    }
    case 'claw': {
      // Three heavy toes with hooked claws.
      for (let i = -1; i <= 1; i += 1) {
        set.add(
          [w * 0.34, w * 0.34, l * 0.72],
          [i * w * 0.4, y + w * 0.16, l * 0.28],
          p.body,
          { rotation: [0, i * 0.28, 0], shade: 0.3 },
        );
        set.add(
          [w * 0.18, w * 0.18, l * 0.3],
          [i * w * 0.52, y + w * 0.1, l * 0.62],
          p.hoof,
          { rotation: [0.4, i * 0.28, 0], tint: 0.05 },
        );
      }
      return;
    }
    default: {
      // A tarsus: it tapers to a point and finishes in two small claws. A
      // spider does not stand on a foot, it stands on the tip of its leg.
      set.add([w * 0.7, l * 0.9, w * 0.7], [0, y + l * 0.3, 0], p.body, { shade: 0.3 });
      set.addMirrored([w * 0.34, w * 0.34, w * 0.5], [w * 0.2, y + l * 0.02, 0], p.hoof, {
        rotation: [0.3, 0, 0.4],
      });
    }
  }
};

/* ------------------------------------------------------------------------ */
/* Tail                                                                      */
/* ------------------------------------------------------------------------ */

const buildTail = (
  s: MountShape,
  p: MountPalette,
  has: (feature: string) => boolean,
): BufferGeometry => {
  const set = new BoxSet();
  const steps = Math.max(3, Math.round(s.tailLen * 3));

  for (let i = 0; i < steps; i += 1) {
    const t = (i + 0.5) / steps;
    const size = s.tailW * (1 - (1 - s.tailTaper) * t);
    set.add(
      [size, size, (s.tailLen / steps) * 1.15],
      [0, 0, -t * s.tailLen],
      p.body,
      { shade: 0.32, shadeSpan: s.tailW * 2.4 },
    );
    if (has('shaggy') || has('tailBrush')) {
      // A brush: hair OVER the bone, thickest two thirds along and drawing to
      // a point, which is the shape of a fox's tail and the reason it is not
      // a rope. The pale tip is the LAST tenth - a brush whose whole back half
      // was hair colour read as a cream block bolted to the animal's rump.
      const fur = size * (1.35 + 0.95 * bump(t, 0.58, 0.85)) * (1 - t * 0.4);
      set.add(
        [fur, fur, (s.tailLen / steps) * 1.1],
        [0, 0, -t * s.tailLen],
        t > 0.9 ? p.hair : p.body,
        { shade: 0.32, shadeSpan: s.tailW * 3 },
      );
    }
    if (has('down')) {
      set.add(
        [size * 2.2, size * 0.5, (s.tailLen / steps) * 1.2],
        [0, size * 0.4, -t * s.tailLen],
        p.hair,
        { shade: 0.26 },
      );
    }
    if (has('spines') && t < 0.7) {
      set.add(
        [0.06, size * 0.7, (s.tailLen / steps) * 0.5],
        [0, size * 0.8, -t * s.tailLen],
        p.hoof,
        { shade: 0.3 },
      );
    }
  }

  return set.build() as BufferGeometry;
};

const clamp = (value: number, lo: number, hi: number): number =>
  value < lo ? lo : value > hi ? hi : value;
