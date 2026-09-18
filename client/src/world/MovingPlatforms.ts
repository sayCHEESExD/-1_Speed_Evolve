import {
  MOVING_SOLIDS,
  collapseWarningAt,
  platformOffsetAt,
  type MotionPoint,
  type MovingSolid,
  type SolidKind,
} from '@evolve/shared';
import {
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Object3D,
  type BufferGeometry,
  type Material,
} from 'three';
import { texturedBox } from './texturedBox.js';

/**
 * Every platform in the world that moves, drawn from the same pure functions
 * the simulation collides against.
 *
 * Nothing here decides where a platform is. `platformOffsetAt` does, from the
 * replicated clock, and this file only writes the answer into a matrix - so a
 * platform the player is standing on and the platform they can see are the
 * same platform by construction, at every speed and on every machine.
 *
 * ONE `InstancedMesh` per material. There are several hundred moving platforms
 * in the course and they are all boxes; drawing them as separate meshes would
 * be several hundred draw calls for something the GPU can do in one per
 * material.
 *
 * Instances are NOT culled individually - `frustumCulled` is off - because an
 * instanced mesh's bounds are computed from its rest pose and every one of
 * these leaves it.
 */

/** How far a collapsing platform sinks into its warning colour. */
const WARN_TINT = 0.85;

interface Bank {
  readonly mesh: InstancedMesh;
  readonly platforms: MovingSolid[];
  /** True when any platform in this bank can change colour. */
  readonly tinted: boolean;
}

export class MovingPlatforms {
  readonly root = new Group();

  private readonly banks: Bank[] = [];
  private readonly geometries: BufferGeometry[] = [];

  private readonly dummy = new Object3D();
  private readonly matrix = new Matrix4();
  private readonly offset: MotionPoint = { x: 0, y: 0, z: 0 };
  private readonly base = new Color();
  private readonly warn = new Color(0xff6b4a);
  private readonly tint = new Color();

  constructor(materialFor: (kind: SolidKind) => Material, tintFor: (kind: SolidKind) => number) {
    // Grouped by KIND, because that is what decides the material, and within a
    // kind by whether it can change colour - a bank that never re-tints skips
    // the per-instance colour write entirely.
    const byKind = new Map<SolidKind, MovingSolid[]>();
    for (const platform of MOVING_SOLIDS) {
      const list = byKind.get(platform.kind) ?? [];
      list.push(platform);
      byKind.set(platform.kind, list);
    }

    for (const [kind, platforms] of byKind) {
      // A UNIT box, scaled per instance. Every platform in a bank is a
      // different size, and an instanced mesh has exactly one geometry.
      const geometry = texturedBox(1, 1, 1, 1);
      this.geometries.push(geometry);

      const mesh = new InstancedMesh(geometry, materialFor(kind), platforms.length);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const tinted = platforms.some((p) => p.motion === 'collapse');
      if (tinted) {
        this.base.setHex(tintFor(kind));
        for (let i = 0; i < platforms.length; i += 1) mesh.setColorAt(i, this.base);
      }

      this.root.add(mesh);
      this.banks.push({ mesh, platforms, tinted });
    }
  }

  /**
   * Place every platform at the world's current instant.
   *
   * @param elapsed the server's clock, replicated. Both sides evaluate the
   *                same function against it, which is why what the player sees
   *                is what they can stand on.
   */
  update(elapsed: number): void {
    for (const bank of this.banks) {
      for (let i = 0; i < bank.platforms.length; i += 1) {
        const platform = bank.platforms[i] as MovingSolid;
        platformOffsetAt(platform, elapsed, this.offset);

        this.dummy.position.set(
          (platform.minX + platform.maxX) / 2 + this.offset.x,
          (platform.minY + platform.maxY) / 2 + this.offset.y,
          (platform.minZ + platform.maxZ) / 2 + this.offset.z,
        );
        this.dummy.scale.set(
          platform.maxX - platform.minX,
          platform.maxY - platform.minY,
          platform.maxZ - platform.minZ,
        );

        if (platform.motion === 'collapse') {
          // The SHAKE, which is the whole warning. A section that vanished
          // with no tell would be a trap rather than an obstacle, and this
          // course has both - but only where it means to.
          const warning = collapseWarningAt(platform, elapsed);
          if (warning > 0) {
            const shake = warning * 0.34;
            this.dummy.position.x += Math.sin(elapsed * 42 + i) * shake;
            this.dummy.position.z += Math.cos(elapsed * 37 + i) * shake;
          }
          if (bank.tinted) {
            this.tint.copy(this.base).lerp(this.warn, warning * WARN_TINT);
            bank.mesh.setColorAt(i, this.tint);
          }
        }

        this.dummy.updateMatrix();
        this.matrix.copy(this.dummy.matrix);
        bank.mesh.setMatrixAt(i, this.matrix);
      }

      bank.mesh.instanceMatrix.needsUpdate = true;
      if (bank.tinted && bank.mesh.instanceColor) bank.mesh.instanceColor.needsUpdate = true;
    }
  }

  /** How many platforms move. For the density report. */
  get count(): number {
    return MOVING_SOLIDS.length;
  }

  dispose(): void {
    for (const bank of this.banks) bank.mesh.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    this.banks.length = 0;
    this.geometries.length = 0;
    this.root.removeFromParent();
  }
}

/** A plain instanced material, for the banks whose kind has no texture. */
export const flatMaterial = (color: number): MeshLambertMaterial =>
  new MeshLambertMaterial({ color });
