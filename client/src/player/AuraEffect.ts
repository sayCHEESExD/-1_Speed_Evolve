import { auraBySlot, type AuraStyle } from '@evolve/shared';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Points,
  PointsMaterial,
} from 'three';

/**
 * The glow that surrounds a mount wearing an aura.
 *
 * ONE `Points` cloud per player, allocated once at full size and never
 * regrown: the motes are moved and recoloured, and an aura change is a handful
 * of writes rather than a new geometry. That matters because a busy arena can
 * hold fifteen of these, and fifteen particle systems that each allocated on
 * every equip would be the frame budget.
 *
 * The four styles are four MOTIONS over the same cloud, not four effects:
 *
 *   orbit  a ring circling the mount at belly height
 *   pulse  a shell that breathes in and out
 *   rise   sparks climbing and recycling at the bottom
 *   fall   flakes drifting down and recycling at the top
 *
 * Deliberately cheap. `AdditiveBlending` with no depth write is what makes a
 * glow read as light rather than as a cluster of grey squares, and it costs one
 * draw call. There is no texture: a round point sprite would be an image file,
 * and this whole game has none.
 *
 * Parented to the mount's ROOT, so it travels and turns with the creature
 * without the aura needing to know where the creature is.
 */

/** Motes in the cloud. A hard ceiling, allocated once. */
const COUNT = 34;

/**
 * Radius of the ring, in world units.
 *
 * Wide enough to sit OUTSIDE the rider rather than through them. The first
 * version used 2.3 and the motes climbed straight up the rider's chest, which
 * made a Fire aura read as the player being on fire rather than surrounded by
 * it - obvious, certainly, but obvious about the wrong thing.
 */
const RADIUS = 3.1;

/** How high the column reaches for the rising and falling styles. */
const COLUMN = 4.6;

export class AuraEffect {
  readonly root = new Group();

  private readonly geometry = new BufferGeometry();
  private readonly material: PointsMaterial;
  private readonly positions = new Float32Array(COUNT * 3);
  private readonly colors = new Float32Array(COUNT * 3);

  /**
   * Per-mote phase, fixed at construction.
   *
   * Deterministic from the index rather than random, so every client draws the
   * same aura on the same player - the same rule the mount markings follow.
   */
  private readonly phase = new Float32Array(COUNT);

  private readonly tint = new Color(0xffffff);
  private readonly tintB = new Color(0xffffff);

  private slot = 0;
  private time = 0;

  constructor() {
    for (let i = 0; i < COUNT; i += 1) this.phase[i] = i / COUNT;

    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new BufferAttribute(this.colors, 3));

    this.material = new PointsMaterial({
      // Sized against the distance the camera actually sits at. At 0.5 the
      // motes were a faint shimmer on bright grass; at 1.2 they swallowed the
      // rider. This is the figure that reads as a glow from fifteen units.
      size: 0.9,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: AdditiveBlending,
      // Additive glow must not occlude what is behind it, and a mote that
      // wrote depth would punch a hole in the mount it is meant to surround.
      depthWrite: false,
    });

    const points = new Points(this.geometry, this.material);
    // The cloud surrounds the mount, so it is never culled by the mount's own
    // bounds - which a sphere computed from the rest pose would do the moment
    // the creature moved.
    points.frustumCulled = false;
    this.root.add(points);
    this.root.visible = false;
  }

  /** Show the aura the server says this player is wearing. Cosmetic only. */
  setSlot(slot: number): void {
    const next = Math.max(0, Math.floor(slot));
    if (next === this.slot) return;
    this.slot = next;

    const tier = auraBySlot(next);
    this.root.visible = !!tier;
    if (!tier) return;
    this.tint.setHex(tier.color);
    this.tintB.setHex(tier.colorB);
  }

  /** Advance the cloud. Cheap enough to run for every player in the room. */
  update(delta: number): void {
    if (!this.root.visible) return;
    const tier = auraBySlot(this.slot);
    if (!tier) return;

    this.time += delta;
    const style: AuraStyle = tier.style;

    for (let i = 0; i < COUNT; i += 1) {
      const phase = this.phase[i] as number;
      const at = i * 3;
      this.writeMote(at, phase, style);

      // Motes alternate between the tier's two colours and brighten toward the
      // top of their own cycle, which is what stops a ring of identical dots
      // reading as a mechanical rotation.
      const mix = (Math.sin((this.time * 1.6 + phase * 6.28)) + 1) * 0.5;
      this.tintOf(mix, i % 2 === 0);
      this.colors[at] = this.scratchR;
      this.colors[at + 1] = this.scratchG;
      this.colors[at + 2] = this.scratchB;
    }

    (this.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
  }

  /** Put one mote where its style says it belongs. */
  private writeMote(at: number, phase: number, style: AuraStyle): void {
    const spin = this.time * 1.15 + phase * Math.PI * 2;

    if (style === 'rise' || style === 'fall') {
      // A column. The height cycles and wraps, so a mote that leaves the top
      // reappears at the bottom without anything having to be respawned.
      const travel = (this.time * 0.55 + phase) % 1;
      const height = style === 'rise' ? travel : 1 - travel;
      // Narrow at the ends and widest in the middle, so the column reads as a
      // plume rather than a cylinder - and never narrow enough to pass through
      // the rider.
      const radius = RADIUS * (0.55 + 0.45 * Math.sin(travel * Math.PI));
      this.positions[at] = Math.cos(spin) * radius;
      this.positions[at + 1] = 0.3 + height * COLUMN;
      this.positions[at + 2] = Math.sin(spin) * radius;
      return;
    }

    if (style === 'pulse') {
      // A breathing shell: the radius swells and shrinks together, and the
      // motes are spread over a sphere rather than a ring.
      const breathe = 0.72 + 0.34 * Math.sin(this.time * 2.1);
      const tilt = phase * Math.PI;
      const radius = RADIUS * breathe * Math.sin(tilt);
      this.positions[at] = Math.cos(spin) * radius;
      this.positions[at + 1] = 1.9 + Math.cos(tilt) * RADIUS * breathe;
      this.positions[at + 2] = Math.sin(spin) * radius;
      return;
    }

    // orbit: a ring at belly height, with a gentle bob so it is not a disc.
    this.positions[at] = Math.cos(spin) * RADIUS;
    this.positions[at + 1] = 1.7 + Math.sin(spin * 2) * 0.45;
    this.positions[at + 2] = Math.sin(spin) * RADIUS;
  }

  /** Scratch, so mixing two colours per mote allocates nothing. */
  private scratchR = 1;
  private scratchG = 1;
  private scratchB = 1;

  private tintOf(mix: number, primary: boolean): void {
    const a = primary ? this.tint : this.tintB;
    const b = primary ? this.tintB : this.tint;
    const brightness = 0.55 + mix * 0.45;
    this.scratchR = (a.r + (b.r - a.r) * mix) * brightness;
    this.scratchG = (a.g + (b.g - a.g) * mix) * brightness;
    this.scratchB = (a.b + (b.b - a.b) * mix) * brightness;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.root.removeFromParent();
  }
}
