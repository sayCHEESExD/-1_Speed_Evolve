import {
  BoxGeometry,
  BufferAttribute,
  Color,
  Euler,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Options that turn a flat box into a piece of an animal.
 *
 * `shade` is the important one. A box painted one colour on all six faces is
 * the single thing that makes a model read as moulded plastic, because nothing
 * organic is uniformly lit from every direction. Darkening the underside and
 * lifting the top in the VERTEX colours gives every limb, rib and skull an
 * ambient-occlusion gradient that costs no texture, no second material and no
 * bytes - and it is what separates an animal from a toy at a glance.
 */
export interface BoxOptions {
  /** Euler rotation, radians. */
  readonly rotation?: readonly [number, number, number];
  /**
   * Vertical shading, 0 = flat.
   *
   * At 0.3 the bottom face is 30% darker than the flat colour and the top is
   * 15% brighter, blended across the side faces by height.
   */
  readonly shade?: number;
  /** Extra brightness on the whole box, e.g. +0.06 for a highlit ridge. */
  readonly tint?: number;
  /** Shading is measured against this height instead of the box's own. */
  readonly shadeSpan?: number;
  /** World Y the shading gradient is centred on. Defaults to the box centre. */
  readonly shadeAt?: number;
}

/**
 * A pile of coloured boxes that becomes ONE geometry.
 *
 * Every animal in this game is built from boxes, which is what keeps the file
 * size at zero - there is not a single model asset in the build. Merging them
 * into one vertex-coloured geometry per moving part is what keeps that cheap at
 * runtime too: a ten-animal lobby is about seventy meshes sharing one material,
 * not seven hundred.
 *
 * Colours are baked into vertices rather than materials, so the whole roster
 * renders with a SINGLE `MeshLambertMaterial` and no per-animal uploads - and
 * because they are per-VERTEX rather than per-box, one box can carry a
 * gradient. See `BoxOptions.shade`: that gradient is doing most of the work of
 * making a pile of rectangles look like a living thing.
 */
export class BoxSet {
  private readonly parts: BufferGeometry[] = [];

  private readonly scratchMatrix = new Matrix4();
  private readonly scratchQuat = new Quaternion();
  private readonly scratchEuler = new Euler();
  private readonly scratchPos = new Vector3();
  private readonly scratchScale = new Vector3(1, 1, 1);
  private readonly scratchColor = new Color();

  /**
   * Add one box.
   *
   * @param size     width (X), height (Y), depth (Z)
   * @param at       centre, in this part's local space
   * @param colorHex flat colour for every face, as a hex number or a CSS
   *                 string - the world palette holds both, because half of it
   *                 is handed to a canvas and half to a vertex
   * @param rotation optional Euler rotation, radians
   */
  add(
    size: readonly [number, number, number],
    at: readonly [number, number, number],
    colorHex: number | string,
    rotation?: readonly [number, number, number] | BoxOptions,
    options?: BoxOptions,
  ): this {
    const opts = normalise(rotation, options);
    const spin = opts.rotation;
    const [w, h, d] = size;
    // A degenerate box would contribute NaN normals to the merge, so a feature
    // that resolves to zero size is simply skipped rather than guarded at
    // every call site.
    if (w <= 0 || h <= 0 || d <= 0) return this;

    const geometry = new BoxGeometry(w, h, d);
    // No material here has a map, so the UVs are dead weight - and an
    // attribute set that differs between parts would make the merge fail.
    geometry.deleteAttribute('uv');

    if (spin) {
      this.scratchEuler.set(spin[0], spin[1], spin[2]);
      this.scratchQuat.setFromEuler(this.scratchEuler);
    } else {
      this.scratchQuat.identity();
    }
    this.scratchPos.set(at[0], at[1], at[2]);
    this.scratchMatrix.compose(this.scratchPos, this.scratchQuat, this.scratchScale);
    geometry.applyMatrix4(this.scratchMatrix);

    // `Color` converts the sRGB hex into the renderer's linear working space,
    // which is what makes a vertex colour match the same hex used on a
    // material elsewhere in the scene.
    this.scratchColor.set(colorHex);
    const tint = 1 + (opts.tint ?? 0);
    const shade = opts.shade ?? 0;
    // Shading is measured AFTER the rotation, against world Y, so a limb
    // segment swung out at an angle is still lit from above rather than
    // carrying a gradient that rolled over with it.
    const position = geometry.getAttribute('position');
    const count = position.count;
    // The gradient spans the box unless a caller widens it. A leg built from
    // three segments sets one span for all three, so the shading runs down the
    // whole limb instead of restarting at every joint - which is what stops a
    // three-part leg reading as three stacked bricks.
    const span = Math.max(1e-3, opts.shadeSpan ?? Math.max(h, w, d));
    const centre = opts.shadeAt ?? at[1];
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      let factor = tint;
      if (shade !== 0) {
        // -0.5 at the bottom of the span, +0.5 at the top.
        const t = clamp((position.getY(i) - centre) / span, -0.5, 0.5);
        factor *= 1 + shade * (t * 1.5 - 0.22);
      }
      colors[i * 3] = this.scratchColor.r * factor;
      colors[i * 3 + 1] = this.scratchColor.g * factor;
      colors[i * 3 + 2] = this.scratchColor.b * factor;
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3));

    this.parts.push(geometry);
    return this;
  }

  /** Add a box and its mirror image across X. */
  addMirrored(
    size: readonly [number, number, number],
    at: readonly [number, number, number],
    colorHex: number | string,
    rotation?: readonly [number, number, number] | BoxOptions,
    options?: BoxOptions,
  ): this {
    const opts = normalise(rotation, options);
    this.add(size, at, colorHex, opts);
    const spin = opts.rotation;
    this.add(size, [-at[0], at[1], at[2]], colorHex, {
      ...opts,
      // Mirroring a rotation means negating the two components that would
      // otherwise swing the copy the same way round instead of the opposite.
      rotation: spin ? [spin[0], -spin[1], -spin[2]] : undefined,
    });
    return this;
  }

  get isEmpty(): boolean {
    return this.parts.length === 0;
  }

  /**
   * Merge everything added so far into one geometry.
   *
   * The source boxes are disposed: they exist only to be merged, and holding
   * them would leak a few hundred small geometries per species.
   */
  build(): BufferGeometry | null {
    if (this.parts.length === 0) return null;
    const merged = mergeGeometries(this.parts, false);
    for (const part of this.parts) part.dispose();
    this.parts.length = 0;
    if (!merged) return null;
    merged.computeBoundingSphere();
    return merged;
  }
}

/** Accept either the old positional rotation or an options object. */
const normalise = (
  rotation: readonly [number, number, number] | BoxOptions | undefined,
  options: BoxOptions | undefined,
): BoxOptions => {
  if (Array.isArray(rotation)) {
    return { ...(options ?? {}), rotation: rotation as readonly [number, number, number] };
  }
  return (rotation as BoxOptions | undefined) ?? options ?? {};
};

const clamp = (value: number, lo: number, hi: number): number =>
  value < lo ? lo : value > hi ? hi : value;
