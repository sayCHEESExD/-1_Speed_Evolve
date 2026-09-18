/**
 * The MOUNT roster, and the evolution chain that runs through it.
 *
 * A mount is not a pet and not an inventory item: it is the movement
 * character. The simulation's transform, the collision body and the physics
 * all belong to it, and the rider is carried on its back. Everything a system
 * needs to know about one lives here and nowhere else, so a fifteenth mount is
 * a new entry in `MOUNTS` and nothing more - no movement code, no renderer
 * branch, no server case statement.
 *
 * EVOLUTION replaces the previous game's purchasable stands. A mount is never
 * bought: the server unlocks and equips the next one the moment the player
 * meets its level AND wins requirement, which is why `requiredLevel` and
 * `requiredWins` sit on the mount being unlocked rather than on the one being
 * left behind. Wins are NOT spent - they are a threshold, not a price, so
 * evolving can never empty a wallet the trail and aura shops are waiting for.
 *
 * Deliberately framework-free: the client turns `shape`, `palette` and
 * `features` into blocky geometry, the server reads `multiplier`,
 * `requiredLevel` and `requiredWins`, and neither knows the other's half
 * exists.
 */

/**
 * How a creature is PUT TOGETHER, rather than what size its boxes are.
 *
 * The plan decides the things a scale factor can never fix: where the legs
 * attach, which way the joints fold, whether there is a neck at all, and
 * whether the torso is one barrel or two masses joined by a waist. A wolf and
 * a spider are not the same animal at different sizes, and the previous
 * version of this roster - in which they were - is exactly why every mount in
 * it read as the same toy with a different palette.
 */
export type BodyPlan =
  /** Four legs under a barrel, knees forward in front and folded behind. */
  | 'quadruped'
  /** Two legs under the hips, with the bird's backward-folding hock. */
  | 'biped'
  /** Cephalothorax and abdomen, eight legs radiating, knees ABOVE the back. */
  | 'arachnid'
  /** Head, thorax and a flat segmented abdomen; six legs angled rearward. */
  | 'insect';

/** What the end of a limb is. Decides toes, claws and how the foot plants. */
export type FootKind =
  /** Soft pads and short claws: cats, dogs, rabbits. */
  | 'paw'
  /** A flat weight-bearing column: mammoths. */
  | 'pad'
  /** Scaled bird foot, three toes forward and one back. */
  | 'talon'
  /** Theropod foot: three heavy forward toes with hooked claws. */
  | 'claw'
  /** A tapered point that touches the ground: spiders and insects. */
  | 'tarsus';

/**
 * Anatomical proportions, in world units.
 *
 * These are the whole description of a species' build - one builder consumes
 * the struct and there is no second way to make a mount, so a new animal is
 * a new set of numbers rather than a new modelling file.
 *
 * The torso is described by a PROFILE rather than by one box: a maximum size,
 * multipliers at the chest, the waist and the rump, and how far the spine
 * rises over the shoulder. The builder sweeps cross-sections along that
 * profile, which is what gives a fox a deep chest and a tucked waist instead
 * of the single slab every animal in the first version of this game was.
 */
export interface MountShape {
  readonly plan: BodyPlan;

  /* ---- Torso ----------------------------------------------------------- */
  /** Maximum barrel dimensions: the profile multipliers scale these. */
  readonly bodyW: number;
  readonly bodyH: number;
  readonly bodyL: number;
  /** Width and depth at the SHOULDER, as a fraction of the maximum. */
  readonly chestW: number;
  readonly chestH: number;
  /** Width and depth at the HIP. */
  readonly rumpW: number;
  readonly rumpH: number;
  /** Width and depth at mid-body. Under 1 for anything athletic. */
  readonly waist: number;
  /** How far the spine rises over the shoulder, in world units. */
  readonly withers: number;
  /** How far the belly line rises toward the groin. The tuck-up. */
  readonly bellyLine: number;
  /**
   * Height of the belly above the ground.
   *
   * Derived from the leg segments for anything that stands ON its legs, and
   * authored only where that is wrong - a spider's body hangs between legs
   * that reach out sideways, so its stance height has nothing to do with the
   * sum of its segments.
   */
  readonly standH?: number;

  /* ---- Neck ------------------------------------------------------------ */
  readonly neckW: number;
  readonly neckLen: number;
  /** Radians the neck leans FORWARD from vertical. 0 is straight up. */
  readonly neckTilt: number;
  /** How much thinner the neck is at the skull than at the shoulder. */
  readonly neckTaper: number;

  /* ---- Head ------------------------------------------------------------ */
  readonly headW: number;
  readonly headH: number;
  readonly headL: number;
  /** Muzzle, jaws or beak, hung off the front of the skull. */
  readonly muzzleW: number;
  readonly muzzleH: number;
  readonly muzzleL: number;
  /** How far below the skull's axis the muzzle sits. */
  readonly muzzleDrop: number;
  /** How pronounced the lower jaw is, 0..1. */
  readonly jaw: number;
  /** How heavy the brow over the eye is, 0..1. */
  readonly brow: number;
  /**
   * Eye diameter, in world units.
   *
   * SMALL. Around a tenth of the skull's width for a mammal - a real eye is a
   * detail on a face, not a feature of a silhouette. The googly eye that used
   * to be here was a third of the head wide, and it was single-handedly
   * responsible for every animal in the roster reading as a toy.
   */
  readonly eyeSize: number;
  /** 0 puts the eyes on the front of the skull, 1 fully on its sides. */
  readonly eyeSet: number;

  /* ---- Ears ------------------------------------------------------------ */
  readonly earW: number;
  readonly earH: number;
  readonly earL: number;
  readonly earSplay: number;

  /* ---- Legs ------------------------------------------------------------ */
  /** Pairs, not legs: one is a biped, two a quadruped, four a spider. */
  readonly legPairs: number;
  /** Limb thickness at the top, and how much thinner it is at the foot. */
  readonly legW: number;
  readonly legTaper: number;
  /** The three segments: femur, tibia and the foot bone. */
  readonly legUpper: number;
  readonly legLower: number;
  readonly legFoot: number;
  /** Half the distance between the left and right legs, and front to back. */
  readonly legSpreadX: number;
  readonly legSpreadZ: number;
  /** Radians the whole limb bows outward at rest. */
  readonly legSplay: number;
  /**
   * How far the limbs RADIATE around the body, in radians, at the outermost
   * pair.
   *
   * Zero for a mammal, whose legs all point straight down the body's axis. On
   * an arachnid it is most of the silhouette: the front pair reaches forward,
   * the back pair rakes behind, and the middle pairs go out sideways, which is
   * what makes eight legs read as a spider rather than as a dog with too many.
   */
  readonly legFan: number;
  readonly footW: number;
  readonly footL: number;
  readonly foot: FootKind;

  /* ---- Tail ------------------------------------------------------------ */
  readonly tailW: number;
  readonly tailLen: number;
  /** Radians the tail hangs below horizontal. Negative lifts it. */
  readonly tailDroop: number;
  /** How much thinner the tip is than the root. */
  readonly tailTaper: number;
}

/**
 * An animal's colours.
 *
 * NATURALISTIC, and that word is doing real work here. The previous roster
 * described itself as "flat, saturated toy colours" and delivered exactly
 * that: a pure yellow chick, a pure white rabbit, a pure orange tiger. Real
 * coats are narrow bands of related hue - a wolf is six greys, not one - so
 * every entry below is a family rather than a swatch, and the builder shades
 * between them across every box it lays.
 */
export interface MountPalette {
  /** The dominant coat, hide or chitin. */
  readonly body: number;
  /** The shadowed version of it: undersides of limbs, creases, the muzzle. */
  readonly dark: number;
  /** The pale underside. Countershading, not a painted bib. */
  readonly belly: number;
  /** Horn, claw, hoof, beak and nail. */
  readonly hoof: number;
  /** Mane, tail brush, guard hair, feather edges. */
  readonly hair: number;
  /** Markings: stripes, rosettes, the warning colour on an insect. */
  readonly accent: number;
  /** The iris. Never white, and never larger than `eyeSize`. */
  readonly eye: number;
  /** Saddle leather. */
  readonly saddle: number;
}

/**
 * Species detail bolted onto the body plan.
 *
 * Each one is an anatomical FEATURE rather than a decoration: a mane is hair
 * that follows the neck, a dewlap hangs under a jaw, stripes wrap a barrel
 * whose width the builder already knows. Nothing here paints a marking onto a
 * flat side, which is what the flank "spots" and "patches" of the first
 * version were and why every animal wearing them read as printed plastic.
 */
export type MountFeature =
  /** Hair along the crest of the neck: horses, wolves, lions. */
  | 'mane'
  /** A ruff encircling the head and jaw: the big cats. */
  | 'ruff'
  /** Guard hair over the whole barrel: mammoths, and a wolf's winter coat. */
  | 'shaggy'
  /** Rosettes, broken and scattered the way a real coat carries them. */
  | 'rosettes'
  /** Vertical flank bars that WRAP the barrel: tigers. */
  | 'stripes'
  /** A darker saddle over the back and a pale underside: countershading. */
  | 'countershade'
  /** A brush of longer hair at the end of the tail. */
  | 'tailBrush'
  /** Down rather than hair: chicks and ratites. */
  | 'down'
  /** Folded feathered wings held against the flanks. */
  | 'wings'
  /** Large membranous wings on an arm: the dragon. */
  | 'dragonWings'
  /** Two long segmented feelers: the insects. */
  | 'antennae'
  /** A hardened wing-case over the abdomen: the cockroach. */
  | 'elytra'
  /** Eight eyes in the arachnid arrangement, and fangs beneath them. */
  | 'arachnidFace'
  /** Fine hair over a body: tarantulas, and it is what stops one reading flat. */
  | 'bristles'
  /** A keratin beak in place of a muzzle. */
  | 'beak'
  /** A row of neural spines down the spine: theropods and the dragon. */
  | 'spines'
  /** Scaled hide: reptiles. */
  | 'scales'
  /** Two curved ivory tusks. */
  | 'tusks'
  /** A prehensile trunk. */
  | 'trunk'
  /** Teeth showing along the jaw line. */
  | 'fangs'
  /** A crest of feathers sweeping off the crown: the phoenix. */
  | 'crest'
  /** Horns swept back off the skull: the dragon. */
  | 'horns';

/** One mount: how it looks, how fast it farms, and what unlocks it. */
export interface MountDefinition {
  /** Stable id, used in saves and in the model cache. Never re-used. */
  readonly id: string;
  /** Display name, as the Evolve menu shows it. */
  readonly name: string;
  /**
   * Slot number, 1-based and contiguous, in evolution order.
   *
   * The replicated `mountSlot` and the unlocked bitmask are indexed by this,
   * so it is the wire identity and `id` is the human one.
   */
  readonly slot: number;
  /**
   * Multiplier on Speed gained per step, as the Evolve menu's "x1.25 Speed"
   * label shows it.
   *
   * ONE of the factors the shared gain formula multiplies together. It is
   * deliberately not a movement-speed modifier: how fast the mount physically
   * travels comes from LEVEL, and keeping the two axes apart is what stops an
   * evolution quietly multiplying the wrong system.
   */
  readonly multiplier: number;
  /** Level that must be reached before this mount unlocks. Slot 1 is free. */
  readonly requiredLevel: number;
  /**
   * Wins that must be HELD before this mount unlocks.
   *
   * A threshold, never a price: nothing is deducted. Evolution is automatic,
   * so a player who has just spent their wallet in the trail shop does not
   * lose an evolution they had already qualified for.
   */
  readonly requiredWins: number;
  /** Uniform scale applied to the built model. */
  readonly scale: number;
  /**
   * Where the rider sits, per animal. See `MountSeat`.
   *
   * Measured from the BACKLINE rather than from the feet, so it stays a fact
   * about the saddle: a longer leg raises the whole animal and the rider with
   * it, and neither number has to be re-measured against the other.
   */
  readonly seat: MountSeat;
  /**
   * Stride length in world units.
   *
   * Drives the gait phase, so a short-legged cockroach takes visibly more
   * steps to cover the same ground than a mammoth does.
   */
  readonly strideLength: number;
  readonly shape: MountShape;
  readonly palette: MountPalette;
  readonly features: readonly MountFeature[];
}

/**
 * Height of the rider FBX's hip joints above its own origin.
 *
 * Measured from the supplied asset. The rider is seated by its HIPS, so every
 * seat in the roster is expressed as a height above the animal's backline and
 * converted through this one number - which is why a shape change can never
 * leave a rider sunk into a mount nobody re-measured.
 */
export const RIDER_HIP_HEIGHT = 1.21;

/**
 * Where the rider sits ON a given animal.
 *
 * `lift` is measured from the BACKLINE - the top of the barrel over the
 * shoulder - not from the ground, which is the whole point: it is a fact
 * about the saddle rather than about the legs, so lengthening a leg moves the
 * rider up with the animal automatically instead of leaving them hovering.
 *
 * Every mount authors its own, because they are different animals. A spider's
 * abdomen slopes away behind the seat, a theropod's spine is horizontal and
 * the rider sits over the hips, and a mammoth's shoulders are higher than its
 * back. One universal offset is what made the first version's riders float
 * over the small animals and sink into the large ones.
 */
export interface MountSeat {
  /** Lateral offset. Zero on everything; here so a seat can never assume. */
  readonly x: number;
  /** Height above the backline at the shoulder. */
  readonly lift: number;
  /** Where along the spine, +Z toward the head. */
  readonly z: number;
}

/**
 * The ten body plans the roster is built from.
 *
 * Ten rather than the nine of the first version, and not the same nine: a
 * wolf and a tiger used to share one "cat" preset, and a rabbit and a fox
 * shared a "nimble" one. They are different animals - a fox has a long narrow
 * muzzle and a brush, a rabbit has a short face, long ears and a crouched
 * spine - and sharing a preset is precisely how fourteen mounts came to read
 * as one toy in fourteen colours.
 */
const BUILD = {
  /**
   * COCKROACH. Flat, oval and low, under a pronotum shield, with six spined
   * legs raked backward and antennae longer than the body.
   */
  roach: {
    plan: 'insect',
    bodyW: 1.72,
    bodyH: 0.62,
    bodyL: 3.2,
    chestW: 0.88,
    chestH: 1,
    rumpW: 0.74,
    rumpH: 0.82,
    waist: 1.02,
    withers: 0,
    bellyLine: 0.02,
    neckW: 0.42,
    neckLen: 0.12,
    neckTilt: 1.5,
    neckTaper: 0.9,
    headW: 0.74,
    headH: 0.3,
    headL: 0.58,
    muzzleW: 0.38,
    muzzleH: 0.16,
    muzzleL: 0.22,
    muzzleDrop: 0.06,
    jaw: 0.9,
    brow: 0,
    eyeSize: 0.15,
    eyeSet: 0.92,
    earW: 0,
    earH: 0,
    earL: 0,
    earSplay: 0,
    legPairs: 3,
    legW: 0.14,
    legTaper: 0.34,
    legUpper: 0.6,
    legLower: 0.62,
    legFoot: 0.34,
    legSpreadX: 0.66,
    legSpreadZ: 0.92,
    legSplay: 0.72,
    legFan: 0.62,
    footW: 0.1,
    footL: 0.18,
    foot: 'tarsus',
    tailW: 0.11,
    tailLen: 0.52,
    tailDroop: 1.1,
    tailTaper: 0.3,
  },

  /**
   * SPIDER. Two masses joined by a pinched waist - that is what `waist: 0.3`
   * is doing, and it is the single number that stops this reading as a beetle.
   * Eight legs that reach UP and OUT before dropping to the ground, so the
   * knees stand above the back exactly as a real spider's do.
   */
  spider: {
    plan: 'arachnid',
    bodyW: 1.62,
    bodyH: 1.18,
    bodyL: 2.55,
    chestW: 0.84,
    chestH: 0.6,
    rumpW: 1,
    rumpH: 1,
    waist: 0.3,
    withers: 0,
    bellyLine: 0,
    neckW: 0.3,
    neckLen: 0.05,
    neckTilt: 1.35,
    neckTaper: 1,
    headW: 0.92,
    headH: 0.5,
    headL: 0.46,
    muzzleW: 0.46,
    muzzleH: 0.38,
    muzzleL: 0.34,
    muzzleDrop: 0.2,
    jaw: 1,
    brow: 0.25,
    eyeSize: 0.1,
    eyeSet: 0.22,
    earW: 0,
    earH: 0,
    earL: 0,
    earSplay: 0,
    legPairs: 4,
    legW: 0.21,
    legTaper: 0.2,
    legUpper: 1.12,
    legLower: 1.2,
    legFoot: 0.56,
    legSpreadX: 0.52,
    legSpreadZ: 0.5,
    legSplay: 1.16,
    legFan: 0.98,
    footW: 0.12,
    footL: 0.22,
    foot: 'tarsus',
    tailW: 0,
    tailLen: 0,
    tailDroop: 0,
    tailTaper: 0,
  },

  /**
   * CHICK. A real one: a small round body carried level, a short neck it can
   * pull in, a stubby triangular beak and two thin legs with scaled toes. It
   * is small and soft WITHOUT being a ball with a face on it.
   */
  chick: {
    plan: 'biped',
    bodyW: 1.1,
    bodyH: 1.12,
    bodyL: 1.72,
    chestW: 0.66,
    chestH: 0.7,
    rumpW: 0.74,
    rumpH: 0.78,
    waist: 1.2,
    withers: 0.04,
    bellyLine: 0.06,
    neckW: 0.56,
    neckLen: 0.5,
    neckTilt: 0.2,
    neckTaper: 0.82,
    headW: 0.62,
    headH: 0.6,
    headL: 0.66,
    muzzleW: 0.28,
    muzzleH: 0.24,
    muzzleL: 0.34,
    muzzleDrop: 0.02,
    jaw: 0.2,
    brow: 0.1,
    eyeSize: 0.11,
    eyeSet: 0.78,
    earW: 0,
    earH: 0,
    earL: 0,
    earSplay: 0,
    legPairs: 1,
    legW: 0.17,
    legTaper: 0.6,
    legUpper: 0.52,
    legLower: 0.5,
    legFoot: 0.3,
    legSpreadX: 0.3,
    legSpreadZ: 0,
    legSplay: 0.05,
    legFan: 0,
    footW: 0.24,
    footL: 0.4,
    foot: 'talon',
    tailW: 0.3,
    tailLen: 0.42,
    tailDroop: -0.55,
    tailTaper: 0.7,
  },

  /**
   * RABBIT. Crouched, with the spine arched over enormous haunches, a short
   * blunt face and ears longer than its skull. Nothing about it is a fox.
   */
  rabbit: {
    plan: 'quadruped',
    bodyW: 1.08,
    bodyH: 1.12,
    bodyL: 2.05,
    chestW: 0.78,
    chestH: 0.78,
    rumpW: 1,
    rumpH: 1,
    waist: 0.82,
    withers: -0.14,
    bellyLine: 0.2,
    neckW: 0.56,
    neckLen: 0.26,
    neckTilt: 0.5,
    neckTaper: 0.9,
    headW: 0.58,
    headH: 0.56,
    headL: 0.76,
    muzzleW: 0.34,
    muzzleH: 0.3,
    muzzleL: 0.28,
    muzzleDrop: 0.1,
    jaw: 0.3,
    brow: 0.3,
    eyeSize: 0.11,
    eyeSet: 0.88,
    earW: 0.16,
    earH: 0.92,
    earL: 0.1,
    earSplay: 0.22,
    legPairs: 2,
    legW: 0.26,
    legTaper: 0.62,
    legUpper: 0.46,
    legLower: 0.46,
    legFoot: 0.3,
    legSpreadX: 0.38,
    legSpreadZ: 0.72,
    legSplay: 0.02,
    legFan: 0,
    footW: 0.24,
    footL: 0.46,
    foot: 'paw',
    tailW: 0.24,
    tailLen: 0.2,
    tailDroop: -0.4,
    tailTaper: 1.1,
  },

  /**
   * CANID - fox and wolf. Long narrow muzzle, upright triangular ears, a deep
   * narrow chest, a level back and a brush of a tail.
   */
  canid: {
    plan: 'quadruped',
    bodyW: 1.02,
    bodyH: 1.16,
    bodyL: 2.5,
    chestW: 1,
    chestH: 1,
    rumpW: 0.88,
    rumpH: 0.9,
    waist: 0.8,
    withers: 0.14,
    bellyLine: 0.2,
    neckW: 0.62,
    neckLen: 0.54,
    neckTilt: 0.72,
    neckTaper: 0.82,
    headW: 0.6,
    headH: 0.58,
    headL: 0.72,
    muzzleW: 0.3,
    muzzleH: 0.28,
    muzzleL: 0.66,
    muzzleDrop: 0.14,
    jaw: 0.6,
    brow: 0.3,
    eyeSize: 0.11,
    eyeSet: 0.72,
    earW: 0.1,
    earH: 0.44,
    earL: 0.26,
    earSplay: 0.3,
    legPairs: 2,
    legW: 0.25,
    legTaper: 0.58,
    legUpper: 0.66,
    legLower: 0.62,
    legFoot: 0.3,
    legSpreadX: 0.36,
    legSpreadZ: 0.86,
    legSplay: 0.02,
    legFan: 0,
    footW: 0.24,
    footL: 0.36,
    foot: 'paw',
    tailW: 0.26,
    tailLen: 1.15,
    tailDroop: 0.62,
    tailTaper: 0.8,
  },

  /**
   * FELID - panther and tiger. Broader and lower than the canid, with a
   * rounded skull, a short muzzle, small round ears, heavy shoulders and a
   * long counterbalancing tail.
   */
  felid: {
    plan: 'quadruped',
    bodyW: 1.16,
    bodyH: 1.2,
    bodyL: 2.6,
    chestW: 1,
    chestH: 1,
    rumpW: 0.94,
    rumpH: 0.92,
    waist: 0.84,
    withers: 0.16,
    bellyLine: 0.18,
    neckW: 0.74,
    neckLen: 0.44,
    neckTilt: 0.86,
    neckTaper: 0.88,
    headW: 0.74,
    headH: 0.64,
    headL: 0.66,
    muzzleW: 0.46,
    muzzleH: 0.34,
    muzzleL: 0.32,
    muzzleDrop: 0.12,
    jaw: 0.7,
    brow: 0.5,
    eyeSize: 0.12,
    eyeSet: 0.6,
    earW: 0.1,
    earH: 0.26,
    earL: 0.24,
    earSplay: 0.5,
    legPairs: 2,
    legW: 0.3,
    legTaper: 0.66,
    legUpper: 0.62,
    legLower: 0.58,
    legFoot: 0.3,
    legSpreadX: 0.4,
    legSpreadZ: 0.9,
    legSplay: 0.02,
    legFan: 0,
    footW: 0.3,
    footL: 0.38,
    foot: 'paw',
    tailW: 0.2,
    tailLen: 1.5,
    tailDroop: 0.5,
    tailTaper: 0.85,
  },

  /**
   * RATITE - ostrich and phoenix. A big feathered body carried high on two
   * enormously long legs, and a bare neck twice the length of the body.
   */
  ratite: {
    plan: 'biped',
    bodyW: 1.42,
    bodyH: 1.5,
    bodyL: 1.95,
    chestW: 0.96,
    chestH: 0.94,
    rumpW: 1,
    rumpH: 1,
    waist: 1,
    withers: 0.06,
    bellyLine: 0.08,
    neckW: 0.38,
    neckLen: 2.1,
    neckTilt: 0.2,
    neckTaper: 0.72,
    headW: 0.42,
    headH: 0.38,
    headL: 0.5,
    muzzleW: 0.26,
    muzzleH: 0.22,
    muzzleL: 0.46,
    muzzleDrop: 0.02,
    jaw: 0.2,
    brow: 0.2,
    eyeSize: 0.12,
    eyeSet: 0.86,
    earW: 0,
    earH: 0,
    earL: 0,
    earSplay: 0,
    legPairs: 1,
    legW: 0.26,
    legTaper: 0.5,
    legUpper: 0.92,
    legLower: 1.05,
    legFoot: 0.95,
    legSpreadX: 0.34,
    legSpreadZ: 0,
    legSplay: 0.04,
    legFan: 0,
    footW: 0.28,
    footL: 0.56,
    foot: 'talon',
    tailW: 0.62,
    tailLen: 0.78,
    tailDroop: -0.25,
    tailTaper: 0.6,
  },

  /**
   * THEROPOD - raptor and T-Rex. The spine is HORIZONTAL and the tail is a
   * counterweight held off the ground, which is the one thing that separates a
   * dinosaur from a lizard standing up.
   */
  theropod: {
    plan: 'biped',
    bodyW: 1.2,
    bodyH: 1.2,
    bodyL: 2.5,
    chestW: 0.96,
    chestH: 1,
    rumpW: 1,
    rumpH: 0.92,
    waist: 0.86,
    withers: 0.06,
    bellyLine: 0.16,
    neckW: 0.58,
    neckLen: 1.05,
    neckTilt: 1.02,
    neckTaper: 0.8,
    headW: 0.62,
    headH: 0.66,
    headL: 0.8,
    muzzleW: 0.5,
    muzzleH: 0.44,
    muzzleL: 0.72,
    muzzleDrop: 0.1,
    jaw: 0.9,
    brow: 0.7,
    eyeSize: 0.11,
    eyeSet: 0.74,
    earW: 0,
    earH: 0,
    earL: 0,
    earSplay: 0,
    legPairs: 1,
    legW: 0.4,
    legTaper: 0.42,
    legUpper: 1.02,
    legLower: 1.06,
    legFoot: 0.58,
    legSpreadX: 0.4,
    legSpreadZ: 0,
    legSplay: 0.05,
    legFan: 0,
    footW: 0.34,
    footL: 0.62,
    foot: 'claw',
    tailW: 0.56,
    tailLen: 2.6,
    tailDroop: -0.06,
    tailTaper: 0.16,
  },

  /**
   * MAMMOTH. Column legs straight under a huge barrel, a domed skull, small
   * ears held flat, and the highest point of the animal at the shoulder.
   */
  mammoth: {
    plan: 'quadruped',
    bodyW: 1.9,
    bodyH: 2.05,
    bodyL: 3.15,
    chestW: 1,
    chestH: 1,
    rumpW: 0.94,
    rumpH: 0.9,
    waist: 0.96,
    withers: 0.28,
    bellyLine: 0.08,
    neckW: 1.05,
    neckLen: 0.42,
    neckTilt: 0.55,
    neckTaper: 0.92,
    headW: 1.12,
    headH: 1.1,
    headL: 1.05,
    muzzleW: 0.72,
    muzzleH: 0.5,
    muzzleL: 0.36,
    muzzleDrop: 0.28,
    jaw: 0.4,
    brow: 0.5,
    eyeSize: 0.12,
    eyeSet: 0.86,
    earW: 0.14,
    earH: 0.66,
    earL: 0.5,
    earSplay: 0.85,
    legPairs: 2,
    legW: 0.56,
    legTaper: 0.82,
    legUpper: 0.9,
    legLower: 0.78,
    legFoot: 0.24,
    legSpreadX: 0.62,
    legSpreadZ: 1.02,
    legSplay: 0,
    legFan: 0,
    footW: 0.66,
    footL: 0.66,
    foot: 'pad',
    tailW: 0.16,
    tailLen: 0.86,
    tailDroop: 1.25,
    tailTaper: 0.7,
  },

  /**
   * DRAGON. A long serpentine barrel on sprawling reptilian legs, a raised
   * neck and a tail longer than the rest of it put together.
   */
  dragon: {
    plan: 'quadruped',
    bodyW: 1.6,
    bodyH: 1.62,
    bodyL: 3.3,
    chestW: 1,
    chestH: 1,
    rumpW: 0.88,
    rumpH: 0.86,
    waist: 0.78,
    withers: 0.2,
    bellyLine: 0.22,
    neckW: 0.78,
    neckLen: 1.95,
    neckTilt: 0.46,
    neckTaper: 0.68,
    headW: 0.78,
    headH: 0.72,
    headL: 1.05,
    muzzleW: 0.56,
    muzzleH: 0.44,
    muzzleL: 0.76,
    muzzleDrop: 0.14,
    jaw: 0.9,
    brow: 0.8,
    eyeSize: 0.12,
    eyeSet: 0.7,
    earW: 0.12,
    earH: 0.34,
    earL: 0.34,
    earSplay: 0.9,
    legPairs: 2,
    legW: 0.42,
    legTaper: 0.5,
    legUpper: 0.76,
    legLower: 0.72,
    legFoot: 0.36,
    legSpreadX: 0.58,
    legSpreadZ: 1.08,
    legSplay: 0.3,
    legFan: 0,
    footW: 0.4,
    footL: 0.5,
    foot: 'claw',
    tailW: 0.5,
    tailLen: 3,
    tailDroop: 0.3,
    tailTaper: 0.1,
  },
} as const satisfies Record<string, MountShape>;

/**
 * The evolution chain, in order.
 *
 * The three authored head entries are fixed by the game's specification -
 * Cockroach x1.04, Spider x1.10 at level 3 with 3 Wins, Chick x1.25 at level 6
 * with 9 Wins - and everything after them continues the same shape: the
 * multiplier roughly doubles a rung, the level requirement climbs at about the
 * rate the rebirth ladder actually grants levels (25 per rebirth), and the
 * Wins requirement accelerates hard so a late mount is a real milestone.
 *
 * `verify-progression` enforces that all three of those ladders are strictly
 * increasing, so a mount that is somehow both easier AND better than the one
 * before it cannot reach the game.
 *
 * The PALETTES are the other half of the rework. Each one is a family of
 * related tones taken from the real animal - a wolf is six greys, a tiger is
 * four ambers over a black - rather than the one saturated swatch per species
 * the first version used. A single flat colour is the reason a model reads as
 * moulded plastic no matter how good its geometry is.
 */
export const MOUNTS: readonly MountDefinition[] = [
  {
    id: 'cockroach',
    name: 'Cockroach',
    slot: 1,
    multiplier: 1.04,
    requiredLevel: 0,
    requiredWins: 0,
    scale: 0.94,
    seat: { x: 0, lift: 0.16, z: -0.15 },
    strideLength: 1.2,
    shape: BUILD.roach,
    palette: {
      body: 0x6b4423,
      dark: 0x3d2612,
      belly: 0x8a5c30,
      hoof: 0x2a1a0d,
      hair: 0x4a2e15,
      accent: 0x9c6a33,
      eye: 0x120c06,
      saddle: 0x6d5236,
    },
    features: ['antennae', 'elytra', 'bristles'],
  },
  {
    id: 'spider',
    name: 'Spider',
    slot: 2,
    multiplier: 1.1,
    requiredLevel: 3,
    requiredWins: 3,
    scale: 1,
    seat: { x: 0, lift: 0.1, z: 0.05 },
    strideLength: 1.6,
    shape: BUILD.spider,
    palette: {
      body: 0x3a2e28,
      dark: 0x1d1714,
      belly: 0x4a3b32,
      hoof: 0x141010,
      hair: 0x5a4438,
      accent: 0x8a5a2e,
      eye: 0x0a0a0c,
      saddle: 0x5e4a33,
    },
    features: ['arachnidFace', 'bristles'],
  },
  {
    id: 'chick',
    name: 'Chick',
    slot: 3,
    multiplier: 1.25,
    requiredLevel: 6,
    requiredWins: 9,
    scale: 1.02,
    seat: { x: 0, lift: 0.14, z: -0.1 },
    strideLength: 1.4,
    shape: BUILD.chick,
    palette: {
      body: 0xe8c65a,
      dark: 0xbf9a3a,
      belly: 0xf5e3a8,
      hoof: 0xd8912f,
      hair: 0xd9b24a,
      accent: 0xc98f2c,
      eye: 0x2a1d10,
      saddle: 0x8f6a3c,
    },
    features: ['beak', 'down'],
  },
  {
    id: 'rabbit',
    name: 'Rabbit',
    slot: 4,
    multiplier: 1.6,
    requiredLevel: 10,
    requiredWins: 30,
    scale: 1.06,
    seat: { x: 0, lift: 0.14, z: -0.12 },
    strideLength: 1.9,
    shape: BUILD.rabbit,
    palette: {
      body: 0x9a8574,
      dark: 0x6e5d50,
      belly: 0xded3c6,
      hoof: 0x4a3f36,
      hair: 0xb5a494,
      accent: 0x7d6b5c,
      eye: 0x2a1a16,
      saddle: 0x7d5a35,
    },
    features: ['countershade', 'tailBrush'],
  },
  {
    id: 'fox',
    name: 'Fox',
    slot: 5,
    multiplier: 2.2,
    requiredLevel: 14,
    requiredWins: 100,
    scale: 1.04,
    seat: { x: 0, lift: 0.14, z: -0.14 },
    strideLength: 2.1,
    shape: BUILD.canid,
    palette: {
      body: 0xb85c25,
      dark: 0x8a3f16,
      belly: 0xe8dccb,
      hoof: 0x241a14,
      hair: 0xd9d0c2,
      accent: 0x3a2a22,
      eye: 0x3d2a10,
      saddle: 0x7d5730,
    },
    features: ['countershade', 'tailBrush'],
  },
  {
    id: 'wolf',
    name: 'Wolf',
    slot: 6,
    multiplier: 3,
    requiredLevel: 18,
    requiredWins: 350,
    scale: 1.14,
    seat: { x: 0, lift: 0.14, z: -0.14 },
    strideLength: 2.5,
    shape: BUILD.canid,
    palette: {
      body: 0x7d7669,
      dark: 0x4e4941,
      belly: 0xd2cabb,
      hoof: 0x2b2823,
      hair: 0x625c52,
      accent: 0x3a352f,
      eye: 0xb08a32,
      saddle: 0x5c4630,
    },
    features: ['countershade', 'shaggy', 'mane', 'tailBrush', 'fangs'],
  },
  {
    id: 'ostrich',
    name: 'Ostrich',
    slot: 7,
    multiplier: 4.5,
    requiredLevel: 24,
    requiredWins: 1_200,
    scale: 1.04,
    seat: { x: 0, lift: 0.12, z: -0.12 },
    strideLength: 3.4,
    shape: BUILD.ratite,
    palette: {
      body: 0x2f2a26,
      dark: 0x1a1613,
      belly: 0xe2dacb,
      hoof: 0xc48a3a,
      hair: 0xe8e2d5,
      accent: 0xd9a05a,
      eye: 0x241a12,
      saddle: 0x7d5a32,
    },
    features: ['beak', 'down', 'wings'],
  },
  {
    id: 'panther',
    name: 'Panther',
    slot: 8,
    multiplier: 7,
    requiredLevel: 32,
    requiredWins: 5_000,
    scale: 1.16,
    seat: { x: 0, lift: 0.13, z: -0.14 },
    strideLength: 2.7,
    shape: BUILD.felid,
    palette: {
      body: 0x2a2730,
      dark: 0x16141b,
      belly: 0x3a3742,
      hoof: 0x100e14,
      hair: 0x322e3a,
      accent: 0x1c1a22,
      eye: 0x7ad44a,
      saddle: 0x4a3e33,
    },
    features: ['rosettes', 'ruff', 'fangs', 'tailBrush'],
  },
  {
    id: 'raptor',
    name: 'Raptor',
    slot: 9,
    multiplier: 12,
    requiredLevel: 42,
    requiredWins: 25_000,
    scale: 1.1,
    seat: { x: 0, lift: 0.12, z: -0.22 },
    strideLength: 3.1,
    shape: BUILD.theropod,
    palette: {
      body: 0x5c6b46,
      dark: 0x3a452b,
      belly: 0xbcbf92,
      hoof: 0x2a2a1e,
      hair: 0x7a6a3a,
      accent: 0x8a5a2a,
      eye: 0xd8a326,
      saddle: 0x6a4a2a,
    },
    features: ['scales', 'spines', 'fangs', 'stripes'],
  },
  {
    id: 'tiger',
    name: 'Tiger',
    slot: 10,
    multiplier: 20,
    requiredLevel: 55,
    requiredWins: 120_000,
    scale: 1.2,
    seat: { x: 0, lift: 0.13, z: -0.14 },
    strideLength: 2.9,
    shape: BUILD.felid,
    palette: {
      body: 0xc87a28,
      dark: 0x9a5518,
      belly: 0xefe4d0,
      hoof: 0x241c14,
      hair: 0xefe4d0,
      accent: 0x201812,
      eye: 0xc9a52a,
      saddle: 0x6d4a24,
    },
    features: ['stripes', 'ruff', 'fangs', 'tailBrush'],
  },
  {
    id: 'mammoth',
    name: 'Mammoth',
    slot: 11,
    multiplier: 35,
    requiredLevel: 70,
    requiredWins: 600_000,
    scale: 1.22,
    seat: { x: 0, lift: 0.14, z: -0.1 },
    strideLength: 3.6,
    shape: BUILD.mammoth,
    palette: {
      body: 0x7a5533,
      dark: 0x4f371f,
      belly: 0x8c6740,
      hoof: 0x3a2c1c,
      hair: 0x9a6c3c,
      accent: 0x5e4426,
      eye: 0x2a1c10,
      saddle: 0x5c3f22,
    },
    features: ['shaggy', 'tusks', 'trunk', 'tailBrush'],
  },
  {
    id: 'trex',
    name: 'T-Rex',
    slot: 12,
    multiplier: 60,
    requiredLevel: 90,
    requiredWins: 3_000_000,
    scale: 1.42,
    seat: { x: 0, lift: 0.12, z: -0.24 },
    strideLength: 4.4,
    shape: BUILD.theropod,
    palette: {
      body: 0x5a5a48,
      dark: 0x38382c,
      belly: 0xa8a487,
      hoof: 0xd8d0b4,
      hair: 0x46462f,
      accent: 0x7a4030,
      eye: 0xc23a1e,
      saddle: 0x4a3420,
    },
    features: ['scales', 'spines', 'fangs', 'countershade'],
  },
  {
    id: 'phoenix',
    name: 'Phoenix',
    slot: 13,
    multiplier: 110,
    requiredLevel: 115,
    requiredWins: 20_000_000,
    scale: 1.2,
    seat: { x: 0, lift: 0.12, z: -0.12 },
    strideLength: 3.5,
    shape: BUILD.ratite,
    palette: {
      body: 0xd4541c,
      dark: 0x9c3410,
      belly: 0xf2a832,
      hoof: 0xf5d06a,
      hair: 0xf2c43a,
      accent: 0xffe07a,
      eye: 0xffdd66,
      saddle: 0x8a4418,
    },
    features: ['beak', 'wings', 'crest', 'down'],
  },
  {
    id: 'dragon',
    name: 'Dragon',
    slot: 14,
    multiplier: 200,
    requiredLevel: 140,
    requiredWins: 150_000_000,
    scale: 1.34,
    seat: { x: 0, lift: 0.13, z: -0.16 },
    strideLength: 4.2,
    shape: BUILD.dragon,
    palette: {
      body: 0x4a3a6e,
      dark: 0x2c2246,
      belly: 0x8a7ab0,
      hoof: 0xe0c86a,
      hair: 0x352a52,
      accent: 0x5b3f96,
      eye: 0x4ce0b8,
      saddle: 0x2f2244,
    },
    features: ['dragonWings', 'scales', 'spines', 'horns', 'fangs'],
  },
];

/** The mount every player starts on, before a single evolution. */
export const STARTER_MOUNT_SLOT = 1;

/**
 * The highest slot the unlocked bitmask can hold.
 *
 * Thirty-one, and no more: `mountBit(32)` is `1 << 31`, which is NEGATIVE in
 * JavaScript and would corrupt the mask rather than extend it.
 * `verify-progression` checks the roster against this.
 */
export const MAX_MOUNT_SLOTS = 31;

/** Bitmask a fresh player begins with: the starter mount and nothing else. */
export const INITIAL_UNLOCKED_MOUNTS = 1 << (STARTER_MOUNT_SLOT - 1);

/** One bit per slot, so the whole chain is a single replicated integer. */
export const mountBit = (slot: number): number => 1 << (Math.floor(slot) - 1);

/** True when the player has evolved into this mount at some point. */
export const isMountUnlocked = (unlocked: number, slot: number): boolean =>
  (unlocked & mountBit(slot)) !== 0;

/** Look up a mount by slot. Falls back to the starter, never throws. */
export const mountForSlot = (slot: number): MountDefinition => {
  const found = MOUNTS.find((mount) => mount.slot === Math.floor(slot));
  return found ?? (MOUNTS[STARTER_MOUNT_SLOT - 1] as MountDefinition);
};

/** Look up a mount by its stable id. */
export const mountById = (id: string): MountDefinition | undefined =>
  MOUNTS.find((mount) => mount.id === id);

/** The mount AFTER this one in the chain, or null at the end of it. */
export const nextMount = (slot: number): MountDefinition | null =>
  MOUNTS.find((mount) => mount.slot === Math.floor(slot) + 1) ?? null;

/**
 * Speed-gain multiplier from the equipped mount.
 *
 * Returns the starter's multiplier for an unknown slot rather than 1, because
 * every player is always riding SOMETHING - "no mount" is not a state this
 * game has, and a neutral 1 would quietly under-pay anyone whose slot failed
 * to resolve.
 */
export const mountMultiplier = (slot: number): number =>
  mountForSlot(slot).multiplier;

/**
 * Does this player qualify for the mount in `slot`?
 *
 * The ONE predicate. The server calls it to decide an evolution and the Evolve
 * menu calls it to decide whether to light the button, so the menu can never
 * promise an evolution the server would refuse.
 */
export const qualifiesForMount = (
  slot: number,
  level: number,
  wins: number,
): boolean => {
  const mount = MOUNTS.find((entry) => entry.slot === Math.floor(slot));
  if (!mount) return false;
  return level >= mount.requiredLevel && wins >= mount.requiredWins;
};

/**
 * The highest mount this player has EARNED, by walking the chain in order.
 *
 * Walked rather than searched from the top: the chain is a ladder, so
 * qualifying for the dragon without ever having met the spider's requirement
 * is not a state the game recognises. Stopping at the first rung the player
 * fails is what makes the Evolve menu's "next" always the rung directly above
 * where they actually are.
 */
export const highestEarnedMount = (level: number, wins: number): number => {
  let best = STARTER_MOUNT_SLOT;
  for (const mount of MOUNTS) {
    if (mount.slot === STARTER_MOUNT_SLOT) continue;
    if (!qualifiesForMount(mount.slot, level, wins)) break;
    best = mount.slot;
  }
  return best;
};
