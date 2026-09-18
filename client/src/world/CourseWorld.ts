import {
  CAVE_REGIONS,
  COURSE,
  COURSE_END_Z,
  COURSE_SOLIDS,
  PITS,
  STAGES,
  WIDE_AREAS,
  WorldCollision,
  type CourseSolid,
  type PitRegion,
  type SolidKind,
} from '@evolve/shared';
import {
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Scene,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../config/worldVisuals.js';
import { CanvasSign } from './CanvasSign.js';
import { Foliage } from './Foliage.js';
import { Guardians } from './Guardians.js';
import { Hazards } from './Hazards.js';
import { MovingPlatforms } from './MovingPlatforms.js';
import { Rainforest } from './Rainforest.js';
import { Scoreboard } from './Scoreboard.js';
import { ShopStalls } from './ShopStalls.js';
import { Sky } from './Sky.js';
import { StageMarkers } from './StageMarkers.js';
import { TrainingArea } from './TrainingArea.js';
import { UpgradePads } from './UpgradePads.js';
import { WinPads } from './WinPads.js';
import { WorldTextures } from './WorldTextures.js';
import { texturedBox } from './texturedBox.js';

/** World units one repeat of a surface texture covers. */
const TILE = 6;

/**
 * The valley, drawn.
 *
 * Built ENTIRELY from `@evolve/shared`'s course arrays - the same ones the
 * simulation collides against - so a platform the player can see and a
 * platform the player can stand on are the same platform by construction.
 * There are no world coordinates anywhere in this file.
 *
 * The structural difference from the previous game in this series: there is no
 * floor. That game laid a continuous green slab under its whole corridor and
 * dropped obstacles onto it. Here the route IS the world - a trail, a bridge,
 * a ledge, a temple floor - and what is beside it is a river, a ravine or a
 * two-hundred-unit drop into the canopy. Everything below is drawn to make
 * that legible: the valley floor far underneath, the rock walls that box it
 * in, and a water surface under every crossing.
 */
export class CourseWorld {
  readonly root = new Group();

  /** The gameplay shape of the same data. Shared with the local prediction. */
  readonly collision = new WorldCollision();

  readonly hazards: Hazards;
  readonly platforms: MovingPlatforms;
  readonly foliage: Foliage;
  readonly markers: StageMarkers;
  /** The win plate at each stage's end: frame, trophy and reward label. */
  readonly winPads: WinPads;
  /** The twelve speed-upgrade pads, on the player's left. */
  readonly pads: UpgradePads;
  /** The three traders' stalls. */
  readonly shops: ShopStalls;
  readonly training: TrainingArea;
  readonly guardians: Guardians;
  /** The three stone tablets on the camp's back wall. */
  readonly scoreboard: Scoreboard;
  readonly sky: Sky;
  /** The rainforest that bounds the valley, in place of the old rock walls. */
  readonly forest: Rainforest;

  private readonly textures = new WorldTextures();
  private readonly materials: Material[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly signs: CanvasSign[] = [];

  /** Cached per kind, so one material serves every solid made of it. */
  private readonly byKind = new Map<SolidKind, Material>();

  constructor() {
    this.buildSolids();
    this.buildValleyFloor();
    this.buildWater();

    this.platforms = new MovingPlatforms(
      (kind) => this.materialFor(kind),
      (kind) => tintOf(kind),
    );
    this.root.add(this.platforms.root);

    this.hazards = new Hazards();
    this.root.add(this.hazards.root);

    this.foliage = new Foliage();
    this.root.add(this.foliage.root);

    this.markers = new StageMarkers();
    this.root.add(this.markers.root);

    this.winPads = new WinPads();
    this.root.add(this.winPads.root);

    this.pads = new UpgradePads();
    this.root.add(this.pads.root);

    this.shops = new ShopStalls();
    this.root.add(this.shops.root);

    this.training = new TrainingArea(
      // Pale grey chevrons on dark rubber. The green ones this shipped with
      // read as a strip of grass laid in a frame, which is the one thing a
      // treadmill must not look like.
      this.textures.belt(hex(PALETTE.treadmillBelt), '#c9d2cf'),
    );
    this.root.add(this.training.root);

    this.guardians = new Guardians();
    this.root.add(this.guardians.root);

    this.scoreboard = new Scoreboard();
    this.root.add(this.scoreboard.root);

    // The forest the whole world stands in. Built last, because it reads the
    // finished course's own elevation to decide where its floor goes.
    this.forest = new Rainforest();
    this.root.add(this.forest.root);

    this.sky = new Sky();
    this.root.add(this.sky.root);
  }

  addTo(scene: Scene): void {
    scene.add(this.root);
  }

  /**
   * @param elapsed the server's clock, replicated. Every moving thing in the
   *                world is a pure function of it, so drawing from it is what
   *                makes what is on screen the same thing the server will kill
   *                with.
   */
  update(delta: number, elapsed: number): void {
    this.platforms.update(elapsed);
    this.hazards.update(elapsed);
    this.winPads.update(elapsed);
    this.pads.update();
    this.training.update(delta);
    this.guardians.update(delta);
  }

  /** How dense the world turned out. For the size and performance reports. */
  get census(): {
    solids: number;
    movers: number;
    scenery: number;
    hazards: number;
    forest: number;
  } {
    return {
      solids: COURSE_SOLIDS.length,
      movers: this.platforms.count,
      scenery: this.foliage.count,
      hazards: this.hazards.root.children.length,
      forest: this.forest.count,
    };
  }

  dispose(): void {
    this.platforms.dispose();
    this.hazards.dispose();
    this.foliage.dispose();
    this.markers.dispose();
    this.winPads.dispose();
    this.pads.dispose();
    this.shops.dispose();
    this.training.dispose();
    this.guardians.dispose();
    this.scoreboard.dispose();
    this.forest.dispose();
    this.sky.dispose();
    for (const material of this.materials) material.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const sign of this.signs) sign.dispose();
    this.textures.dispose();
    this.materials.length = 0;
    this.geometries.length = 0;
    this.signs.length = 0;
    this.root.removeFromParent();
  }

  /**
   * Every static solid, merged into one mesh per material.
   *
   * Thousands of boxes become a dozen draw calls. `texturedBox` scales the UVs
   * to WORLD size, so one texture tiles at the same physical scale across a
   * 3-unit stair tread and a 250-unit courtyard - without it the two would each
   * stretch one copy of the texture over themselves and the ground would
   * visibly change scale at every seam.
   */
  private buildSolids(): void {
    const byKind = new Map<SolidKind, BufferGeometry[]>();

    for (const solid of COURSE_SOLIDS) {
      const list = byKind.get(solid.kind) ?? [];
      list.push(boxFor(solid, TILE));
      byKind.set(solid.kind, list);
    }

    for (const [kind, geometries] of byKind) {
      const merged = mergeGeometries(geometries, false);
      for (const geometry of geometries) geometry.dispose();
      if (!merged) continue;
      this.geometries.push(merged);

      const mesh = new Mesh(merged, this.materialFor(kind));
      mesh.receiveShadow = true;
      // Only the things that stand UP cast. A path slab casting a shadow onto
      // the valley two hundred units below costs a shadow-map draw for
      // something nobody can see.
      mesh.castShadow = CASTS.has(kind);
      this.root.add(mesh);
    }
  }

  /**
   * The bottom of the valley.
   *
   * A REAL surface, drawn under everything. Without it a fall shows the
   * underside of the course and an infinite void, which is exactly what makes
   * a map look unfinished - and it is not a cover-up, because every stretch of
   * route lays its own kill volume far above this: the player dies looking at
   * a valley they were falling toward, rather than into nothing.
   */
  private buildValleyFloor(): void {
    const widest = Math.max(
      COURSE.halfWidth,
      COURSE.campHalfWidth,
      ...WIDE_AREAS.map((area) => area.halfWidth),
    );
    const width = widest * 2 + 180;
    const from = COURSE.campStartZ - 80;
    const to = COURSE_END_Z + 80;

    const floor = texturedBox(width, 8, to - from, TILE * 3);
    floor.translate(0, COURSE.valleyFloorY - 4, (from + to) / 2);
    this.geometries.push(floor);
    const mesh = new Mesh(floor, this.solidMaterial(PALETTE.valleyFloor));
    mesh.receiveShadow = true;
    this.root.add(mesh);
  }

  /**
   * The surface of every kill volume: rivers, rapids, mud, fire and haze.
   *
   * Drawn from the same `PITS` array the simulation kills with, so what looks
   * like water is water and what looks like a drop is a drop. Merged per
   * surface, and every one of them is a single flat slab - a river is a
   * texture on a plane in this art direction, not a mesh with waves.
   */
  private buildWater(): void {
    const bySurface = new Map<PitRegion['surface'], BufferGeometry[]>();

    for (const region of PITS) {
      // A void needs no surface: what is under it is the valley floor, which
      // is already drawn, and a grey slab across the whole valley at every
      // stage would hide it.
      if (region.surface === 'void') continue;
      const list = bySurface.get(region.surface) ?? [];
      const width = region.maxX - region.minX;
      const length = region.maxZ - region.minZ;
      const slab = texturedBox(width, 1.6, length, TILE * 2);
      slab.translate(
        (region.minX + region.maxX) / 2,
        region.surfaceY - 0.8,
        (region.minZ + region.maxZ) / 2,
      );
      list.push(slab);
      bySurface.set(region.surface, list);
    }

    for (const [surface, geometries] of bySurface) {
      this.addMerged(geometries, this.waterMaterial(surface), false);
    }
  }

  /** One material per kind, built once and remembered for disposal. */
  private materialFor(kind: SolidKind): Material {
    const cached = this.byKind.get(kind);
    if (cached) return cached;
    const material = this.buildMaterial(kind);
    this.byKind.set(kind, material);
    return material;
  }

  private buildMaterial(kind: SolidKind): Material {
    switch (kind) {
      case 'dirt':
      case 'camp':
      case 'lobby':
        return this.textured(
          this.textures.grassStuds(PALETTE.dirt, PALETTE.dirtDark),
        );
      case 'mud':
        return this.textured(this.textures.sand(PALETTE.mud, PALETTE.mudDark));
      case 'quicksand':
        return this.textured(this.textures.sand(PALETTE.quicksand, PALETTE.quicksandDark));
      case 'gate':
        return this.textured(
          this.textures.planks(PALETTE.gate, PALETTE.gateDark, PALETTE.plankSpeck),
        );
      case 'rock':
        return this.textured(this.textures.stone(PALETTE.rock, PALETTE.rockDark));
      case 'stone':
        return this.textured(this.textures.stone(PALETTE.stone, PALETTE.stoneDark));
      case 'ruin':
        return this.textured(this.textures.stone(PALETTE.ruin, PALETTE.ruinDark));
      case 'cave':
        return this.textured(this.textures.stone(PALETTE.cave, PALETTE.caveDark));
      case 'gilded':
        return this.textured(this.textures.stone(PALETTE.gilded, PALETTE.gildedDark));
      case 'plank':
      case 'shop':
        return this.textured(
          this.textures.planks(PALETTE.plank, PALETTE.plankDark, PALETTE.plankSpeck),
        );
      case 'training':
        return this.textured(
          this.textures.planks(PALETTE.deck, PALETTE.deckDark, PALETTE.plankSpeck),
        );
      case 'log':
        return this.textured(
          this.textures.planks(PALETTE.log, PALETTE.logDark, PALETTE.plankSpeck),
        );
      case 'rope':
        return this.textured(
          this.textures.planks(PALETTE.rope, PALETTE.ropeDark, PALETTE.plankSpeck),
        );
      case 'winPad':
        return this.textured(
          this.textures.goldCheck(PALETTE.winPad, PALETTE.winPadAlt, PALETTE.winPadStud),
        );
      case 'board':
        return this.solidMaterial(PALETTE.boardFrameDark);
      // The pads' own surfaces are re-tinted by lock state every time the
      // wallet moves; what reaches here is the DECK the back row stands on.
      case 'pad':
      default:
        return this.textured(
          this.textures.planks(PALETTE.deck, PALETTE.deckDark, PALETTE.plankSpeck),
        );
    }
  }

  private waterMaterial(surface: PitRegion['surface']): Material {
    switch (surface) {
      case 'rapids':
        return this.translucent(PALETTE.rapids, PALETTE.rapidsDark, 0.9);
      case 'mud':
        return this.translucent(PALETTE.mudPool, PALETTE.mudPoolDark, 1);
      case 'fire':
        // The one surface in the world that emits. A fire pit that needed the
        // sun to be visible would be invisible in the temple, which is indoors.
        return this.emissive(PALETTE.fire, PALETTE.fireDark);
      case 'water':
      default:
        return this.translucent(PALETTE.water, PALETTE.waterDark, 0.85);
    }
  }

  private addMerged(
    geometries: BufferGeometry[],
    material: Material,
    receiveShadow: boolean,
  ): void {
    if (geometries.length === 0) return;
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) return;
    this.geometries.push(merged);
    const mesh = new Mesh(merged, material);
    mesh.receiveShadow = receiveShadow;
    this.root.add(mesh);
  }

  private textured(map: Texture): Material {
    const material = new MeshLambertMaterial({ map });
    this.materials.push(material);
    return material;
  }

  private solidMaterial(color: number): Material {
    const material = new MeshLambertMaterial({ color });
    this.materials.push(material);
    return material;
  }

  private translucent(color: string, dark: string, opacity: number): Material {
    const material = new MeshLambertMaterial({
      map: this.textures.ice(color, dark),
      transparent: opacity < 1,
      opacity,
      side: DoubleSide,
    });
    this.materials.push(material);
    return material;
  }

  private emissive(color: string, dark: string): Material {
    const material = new MeshBasicMaterial({ map: this.textures.sand(color, dark) });
    this.materials.push(material);
    return material;
  }
}

/** Kinds that stand up, and therefore cast. */
const CASTS = new Set<SolidKind>(['ruin', 'stone', 'cave', 'gilded', 'plank', 'log', 'shop', 'board']);

/** The flat colour an instanced bank of a kind starts at. */
const tintOf = (kind: SolidKind): number => {
  switch (kind) {
    case 'ruin':
      return 0xffffff;
    default:
      return 0xffffff;
  }
};

const boxFor = (solid: CourseSolid, tile: number): BufferGeometry => {
  const geometry = texturedBox(
    solid.maxX - solid.minX,
    solid.maxY - solid.minY,
    solid.maxZ - solid.minZ,
    tile,
  );
  geometry.translate(
    (solid.minX + solid.maxX) / 2,
    (solid.minY + solid.maxY) / 2,
    (solid.minZ + solid.maxZ) / 2,
  );
  return geometry;
};

const hex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

/** How dark the world is at a Z. Re-exported so the scene can dim with it. */
export { CAVE_REGIONS, STAGES };
void Color;
