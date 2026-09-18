import {
  COURSE_HAZARDS,
  fallerLiftAt,
  hazardPositionAt,
  type CourseHazard,
} from '@evolve/shared';
import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  SphereGeometry,
  type BufferGeometry,
  type Material,
} from 'three';
import { PALETTE } from '../config/worldVisuals.js';

/** How high the warning patch floats above the floor, to beat z-fighting. */
const WARN_LIFT = 0.06;

/**
 * Everything in the world that moves and kills.
 *
 * Every position here is a PURE FUNCTION of the server's clock: the server
 * evaluates `hazardPositionAt` against its own elapsed time to decide a death,
 * and this evaluates the identical function against the replicated value to
 * draw the thing. The two cannot disagree, because there is nothing to
 * disagree about - no hazard state is on the wire at all.
 *
 * Six kinds share one update loop and four shapes. A boulder rolls, a log
 * swings, a bar segment orbits, debris falls, a dart shoots and a cascade
 * hangs - and which one a hazard is affects only what geometry it was given at
 * construction. The motion, and therefore the kill, is the same code for all
 * of them.
 */
export class Hazards {
  readonly root = new Group();

  private readonly meshes: Mesh[] = [];
  /** The ground patch under each faller, or null for hazards that do not fall. */
  private readonly warnings: (Mesh | null)[] = [];

  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];

  /** Scratch for a hazard position, so a frame allocates nothing. */
  private readonly at = { x: 0, y: 0, z: 0 };

  constructor() {
    // 16x12 segments: chunky enough to read as a toy ball, cheap enough that a
    // dozen of them cost nothing.
    const ball = this.keep(new SphereGeometry(1, 16, 12));
    // A trunk, lying along X: unit radius and unit length, scaled per log.
    const trunk = this.keep(new CylinderGeometry(1, 1, 1, 12, 1));
    trunk.rotateZ(Math.PI / 2);
    const bar = this.keep(new BoxGeometry(1, 1, 1));
    const patch = this.keep(new CircleGeometry(1, 18));

    /*
     * ONE lavender for every moving killer - balls and bars alike.
     *
     * In this game a colour is a promise, and lavender promises "this will end
     * your run". Stage 6 was first built with log-brown arms turning over a
     * log-brown floor, which is invisible until it has already hit; giving the
     * bars the same colour the rolling balls have had since stage 2 is worth
     * more than making a log look like a log.
     */
    const hazardMaterial = this.keepMaterial(
      new MeshLambertMaterial({ color: PALETTE.hazard }),
    );
    const rockMaterial = this.keepMaterial(
      new MeshLambertMaterial({ color: PALETTE.hazardRock }),
    );
    // A cascade is water rather than a killer-coloured object, and it is the
    // ONE exception to the lavender rule. It has to be: a waterfall the player
    // can see from a hundred units away that turned out to be purple would
    // break the world far worse than it would clarify the hazard, and its
    // danger is legible from the fact that it is a waterfall.
    const waterMaterial = this.keepMaterial(
      new MeshLambertMaterial({
        color: PALETTE.rapids,
        transparent: true,
        opacity: 0.82,
      }),
    );
    // Unlit and translucent: the warning is a marker on the ground, and a
    // marker that dimmed with the sun would be least visible in the shade of
    // the thing about to land on it.
    const warnMaterial = this.keepMaterial(
      new MeshBasicMaterial({
        color: PALETTE.impactWarn,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      }),
    );

    for (const hazard of COURSE_HAZARDS) {
      let mesh: Mesh;
      switch (hazard.kind) {
        case 'spinner':
          // A cube, not a ball. Several of these at stepped radii are ONE
          // rigid bar, and a row of spheres would read as beads on a string.
          mesh = new Mesh(bar, hazardMaterial);
          mesh.scale.set(hazard.radius * 2.1, hazard.radius * 1.9, hazard.radius * 2.1);
          break;
        case 'faller':
          mesh = new Mesh(bar, rockMaterial);
          mesh.scale.set(hazard.radius * 1.8, hazard.radius * 1.8, hazard.radius * 1.8);
          break;
        case 'boulder':
          if (hazard.spanX > 0) {
            // A LOG: a trunk lying across the path, rolling down a slope or
            // floating across a ford. Lavender like every moving killer that
            // is not stone - a brown log on a brown trail is invisible.
            mesh = new Mesh(trunk, hazardMaterial);
            mesh.scale.set((hazard.spanX + hazard.radius) * 2, hazard.radius, hazard.radius);
            break;
          }
          // A real ball, and big. The boulder chase only works if the thing
          // coming down the ramp reads as unstoppable from the far end of it.
          mesh = new Mesh(ball, rockMaterial);
          mesh.scale.setScalar(hazard.radius);
          break;
        case 'dart':
          // A stubby bolt, aligned across the corridor it fires over.
          mesh = new Mesh(bar, hazardMaterial);
          mesh.scale.set(hazard.radius * 4.2, hazard.radius * 0.9, hazard.radius * 0.9);
          break;
        case 'cascade':
          // A column hanging from its own anchor down to the pool, which is
          // why it is offset half its height in `update` rather than centred.
          mesh = new Mesh(bar, waterMaterial);
          mesh.scale.set(hazard.radius * 2, hazard.sweep, hazard.radius * 1.4);
          mesh.castShadow = false;
          break;
        case 'vine':
          // A thorn vine: a lavender column from the canopy to the ground. The
          // killer colour, not a green one - a green vine swinging through
          // green jungle is the camouflage the lavender rule exists to stop.
          mesh = new Mesh(bar, hazardMaterial);
          mesh.scale.set(hazard.radius * 1.5, Math.max(1, hazard.y - hazard.fromY), hazard.radius * 1.5);
          break;
        default:
          // A swing: a vine-hung log, drawn as a bar across the path.
          mesh = new Mesh(bar, hazardMaterial);
          mesh.scale.set(
            Math.max(hazard.radius * 5.4, (hazard.spanX + hazard.radius) * 2),
            hazard.radius * 1.5,
            hazard.radius * 1.5,
          );
      }

      mesh.position.set(hazard.x, hazard.y, hazard.z);
      mesh.castShadow = true;
      this.root.add(mesh);
      this.meshes.push(mesh);

      this.warnings.push(hazard.kind === 'faller' ? this.addWarning(patch, warnMaterial, hazard) : null);
    }
  }

  /** @param elapsed the server's clock, in seconds. */
  update(elapsed: number): void {
    for (let i = 0; i < this.meshes.length; i += 1) {
      const hazard = COURSE_HAZARDS[i];
      const mesh = this.meshes[i];
      if (!hazard || !mesh) continue;

      hazardPositionAt(hazard, elapsed, this.at);
      mesh.position.set(this.at.x, this.at.y, this.at.z);

      switch (hazard.kind) {
        case 'spinner':
          // Turned to face along its own orbit, so the segments of one arm line
          // up into a bar instead of each sitting at its own angle.
          mesh.rotation.y = -Math.atan2(
            this.at.z - hazard.z,
            this.at.x - hazard.x,
          );
          break;
        case 'cascade':
          // Hung from its anchor rather than centred on it, so a fall reaches
          // the pool instead of floating halfway down the cliff.
          mesh.position.y = this.at.y - hazard.sweep / 2;
          break;
        case 'dart':
          mesh.rotation.y = 0;
          break;
        case 'vine': {
          // Centred on its column, and leaning with its own swing so it reads
          // as hung from above rather than sliding along the ground.
          const half = (hazard.y - hazard.fromY) / 2;
          mesh.position.y = this.at.y - half;
          mesh.rotation.z = ((this.at.x - hazard.x) / Math.max(1, hazard.sweep)) * 0.22;
          break;
        }
        case 'faller': {
          const warning = this.warnings[i];
          if (warning) {
            // The patch tightens and darkens as the rock comes down, so a
            // glance says how long is left rather than merely that something
            // is overhead. Both come from the SAME curve the kill does.
            const fallen = 1 - fallerLiftAt(hazard, elapsed) / Math.max(1, hazard.sweep);
            warning.scale.setScalar(hazard.radius * (1.9 - fallen * 0.6));
            const material = warning.material as MeshBasicMaterial;
            material.opacity = 0.2 + fallen * 0.42;
          }
          mesh.rotation.y = hazard.phase;
          break;
        }
        case 'boulder':
          // Rolling the RIGHT way: the spin comes from the same travel the
          // position does, so a boulder never slides while appearing to roll
          // backwards. A log turns about its own length only.
          mesh.rotation.x = -this.at.z / hazard.radius;
          if (hazard.spanX === 0) mesh.rotation.z = -this.at.x / hazard.radius;
          break;
        default:
          // A swing hangs from a vine, so it tilts with its own arc.
          mesh.rotation.z = (this.at.x - hazard.x) / Math.max(1, hazard.sweep) * 0.6;
      }
    }
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.geometries.length = 0;
    this.materials.length = 0;
    this.root.removeFromParent();
  }

  private addWarning(
    geometry: BufferGeometry,
    material: Material,
    hazard: CourseHazard,
  ): Mesh {
    const mesh = new Mesh(geometry, material.clone());
    this.materials.push(mesh.material as Material);
    mesh.rotation.x = -Math.PI / 2;
    // On the hazard's OWN floor, which is wherever the stage that placed it
    // happens to be. A patch pinned to the world's zero would be under the
    // valley on every stage that climbs.
    mesh.position.set(hazard.x, hazard.y + WARN_LIFT, hazard.z);
    mesh.scale.setScalar(hazard.radius * 1.9);
    this.root.add(mesh);
    return mesh;
  }

  private keep<T extends BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }

  private keepMaterial<T extends Material>(material: T): T {
    this.materials.push(material);
    return material;
  }
}
