import { AmbientLight, Color, DirectionalLight, Fog, HemisphereLight, Scene } from 'three';
import { PALETTE, WORLD_FOG } from '../config/worldVisuals.js';

/**
 * Bounce colour off the forest floor.
 *
 * Strongly GREEN, because in a rainforest it is: the light reaching anything
 * from below has been through a canopy and off wet leaves. It is the cheapest
 * half of making a scene read as jungle rather than as a park, and it costs
 * one constant.
 */
const GROUND_BOUNCE = 0x4e7a33;

/** How fast the lighting eases between daylight and underground, per second. */
const CAVE_EASE = 2.6;

/**
 * The scene root and the base lighting rig.
 *
 * Soft and simple on purpose. The art direction is flat toy-brick, so the
 * lighting exists to separate one face of a box from another and to lay a
 * shadow under each mount - not to model anything. A hemisphere fill, a low
 * ambient and a single sun is the whole rig.
 */
export class SceneManager {
  readonly scene = new Scene();

  /** The sun. Exposed so its shadow camera can follow the player. */
  readonly sun: DirectionalLight;

  // Lifted a little, because the canopy now covers most of the sky and the
  // shadowed side of a trunk still has to read as a trunk.
  private readonly ambient = new AmbientLight(0xe8f2dd, 0.5);
  private readonly hemi: HemisphereLight;

  /** Eased 0..1 depth underground, and the colours it blends between. */
  private caveDepth = 0;
  private readonly dayFog = new Color();
  private readonly caveFog = new Color();
  private readonly dayHemi = new Color();
  private readonly caveHemi = new Color();
  private readonly scratch = new Color();

  constructor() {
    this.scene.fog = new Fog(PALETTE.fog, WORLD_FOG.near, WORLD_FOG.far);
    this.setBackground();

    const hemi = new HemisphereLight(PALETTE.canopyLight, GROUND_BOUNCE, 1.2);
    hemi.position.set(0, 60, 0);
    this.scene.add(hemi);

    this.scene.add(this.ambient);

    /*
     * The sun, WARM rather than white.
     *
     * Daylight filtered through a canopy arrives warm and a little green, and
     * a pure white key under a green fill is what makes a jungle look like a
     * studio. It stays bright: this is a tropical afternoon, not a horror
     * film, and the player has to be able to read the ground at four hundred
     * units a second.
     */
    this.sun = new DirectionalLight(0xfff0d2, 1.62);
    this.sun.position.set(34, 62, -24);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 220;
    this.sun.shadow.camera.left = -60;
    this.sun.shadow.camera.right = 60;
    this.sun.shadow.camera.top = 60;
    this.sun.shadow.camera.bottom = -60;
    this.sun.shadow.bias = -0.0009;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.hemi = hemi;
    this.dayFog.setHex(PALETTE.fog);
    this.caveFog.setHex(PALETTE.caveFog);
    this.dayHemi.setHex(PALETTE.canopyLight);
    this.caveHemi.setHex(PALETTE.caveLight);
  }

  /**
   * How far underground the player is, 0..1.
   *
   * Driven from `caveDepthAt`, which is course data - so the tunnel that
   * darkens is exactly the tunnel the route declared, and a stage cannot end
   * up lit as an interior while being drawn as a hillside.
   *
   * EASED rather than applied outright. The regions have soft mouths already,
   * but a player crossing one at four hundred units a second would still see
   * the whole world change colour in a single frame.
   */
  setCaveDepth(target: number, delta: number): void {
    const wanted = Number.isFinite(target) ? Math.min(1, Math.max(0, target)) : 0;
    this.caveDepth += (wanted - this.caveDepth) * (1 - Math.exp(-CAVE_EASE * delta));
    const t = this.caveDepth;

    this.scratch.copy(this.dayFog).lerp(this.caveFog, t);
    const fog = this.scene.fog as Fog | null;
    if (fog) {
      fog.color.copy(this.scratch);
      fog.near = WORLD_FOG.near + (WORLD_FOG.caveNear - WORLD_FOG.near) * t;
      fog.far = WORLD_FOG.far + (WORLD_FOG.caveFar - WORLD_FOG.far) * t;
    }
    (this.scene.background as Color | null)?.copy(this.scratch);

    // The sun goes out and the ambient comes up: underground there is no sun,
    // but a cave lit by nothing at all is a cave nobody can play.
    this.sun.intensity = 1.75 * (1 - t * 0.88);
    this.ambient.intensity = 0.42 + t * 0.34;
    this.hemi.intensity = 1.15 * (1 - t * 0.55);
    this.hemi.color.copy(this.dayHemi).lerp(this.caveHemi, t);
  }

  /**
   * Keep the shadow frustum over the player.
   *
   * The course is fifteen hundred units long and the shadow map is one texture.
   * A frustum big enough to cover the whole run would put a handful of texels
   * under each mount; moving a small frustum with the player keeps the shadows
   * crisp everywhere and costs one vector copy a frame.
   */
  followShadow(x: number, y: number, z: number): void {
    this.sun.target.position.set(x, y, z);
    this.sun.position.set(x + 34, y + 62, z - 24);
    this.sun.target.updateMatrixWorld();
  }

  /**
   * The flat colour behind everything.
   *
   * A fallback only: the blocky sky dome covers the whole view, so this is
   * what shows for the one frame before it is added and behind anything the
   * dome's triangles miss at an extreme aspect ratio. Matched to the fog, so
   * even then the seam is invisible.
   */
  setBackground(color: number = PALETTE.fog): void {
    this.scene.background = new Color(color);
  }
}
