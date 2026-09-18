import { DECORATIONS, type Decoration, type DecorationKind } from '@evolve/shared';
import {
  BufferGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  Scene,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../config/worldVisuals.js';
import { BoxSet } from '../mount/BoxSet.js';

/**
 * Everything growing, carved or abandoned in the valley.
 *
 * Eighteen kinds of scenery, thousands of instances, and the whole lot ends up
 * as ONE mesh with ONE material. That is the trick this file exists for: every
 * piece is built from `BoxSet`, which bakes colour into the vertices, so a
 * fern, a statue and a waterfall differ by geometry rather than by draw state
 * and can therefore be merged together.
 *
 * The result is that density is bought with vertices and not with draw calls.
 * A valley wall three ranks deep in trees costs the frame almost exactly what
 * a bare one does, which is the only reason a jungle this thick fits inside a
 * budget this small.
 *
 * Built ONCE at construction and never touched again. Nothing here animates:
 * anything that moves is a hazard, a platform or a guardian, and lives
 * somewhere else.
 */

/** Geometry for one kind at unit scale, built on first use and shared. */
const TEMPLATES = new Map<string, BufferGeometry>();

export class Foliage {
  readonly root = new Group();

  private readonly material = new MeshLambertMaterial({ vertexColors: true });
  private merged: BufferGeometry | null = null;

  constructor() {
    const pieces: BufferGeometry[] = [];

    for (const item of DECORATIONS) {
      const template = templateFor(item.kind, item.tone);
      if (!template) continue;
      // `clone` copies the attribute buffers, which is what lets each instance
      // be transformed independently before the merge. They are thrown away by
      // `mergeGeometries` immediately afterwards.
      const piece = template.clone();
      piece.scale(item.scale, item.scale, item.scale);
      if (item.rotationY !== 0) piece.rotateY(item.rotationY);
      piece.translate(item.x, item.y, item.z);
      pieces.push(piece);
    }

    if (pieces.length > 0) {
      this.merged = mergeGeometries(pieces, false);
      for (const piece of pieces) piece.dispose();
      if (this.merged) {
        const mesh = new Mesh(this.merged, this.material);
        // Scenery does not cast: a valley wall three ranks deep in trees
        // casting shadows is the single most expensive thing this world could
        // ask for, and none of it is anything the player interacts with.
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        this.root.add(mesh);
      }
    }
  }

  addTo(scene: Scene): void {
    scene.add(this.root);
  }

  /** How many pieces were placed. For the size and density reports. */
  get count(): number {
    return DECORATIONS.length;
  }

  dispose(): void {
    this.merged?.dispose();
    this.material.dispose();
    for (const template of TEMPLATES.values()) template.dispose();
    TEMPLATES.clear();
    this.root.removeFromParent();
  }
}

/** A unit-scale template for one kind and tone, built once. */
const templateFor = (kind: DecorationKind, tone: number): BufferGeometry | null => {
  const key = `${kind}:${tone % 3}`;
  const cached = TEMPLATES.get(key);
  if (cached) return cached;

  const set = new BoxSet();
  build(set, kind, tone % 3);
  const geometry = set.build();
  if (!geometry) return null;
  TEMPLATES.set(key, geometry);
  return geometry;
};

/** The three canopy greens, so a treeline is mottled rather than uniform. */
const LEAF = [PALETTE.leafA, PALETTE.leafB, PALETTE.leafC];

const build = (set: BoxSet, kind: DecorationKind, tone: number): void => {
  const leaf = LEAF[tone] as number;

  switch (kind) {
    /**
     * A broadleaf tree: a trunk and three stacked canopy plates.
     *
     * Flat slabs rather than spheres. The reference art's trees are plates,
     * and getting that wrong is the single fastest way to make a scene stop
     * looking like this game.
     */
    case 'tree': {
      set.add([1.8, 11, 1.8], [0, 5.5, 0], PALETTE.trunk);
      set.add([2.4, 1.4, 2.4], [0, 1.4, 0], PALETTE.trunkDark);
      set.add([11, 1.8, 11], [0, 11.4, 0], leaf);
      set.add([8.6, 1.7, 8.6], [0, 13.1, 0], leaf);
      set.add([5.6, 1.6, 5.6], [0, 14.7, 0], PALETTE.leafC);
      return;
    }

    /** A palm: a bare leaning trunk with a crown of drooping fronds. */
    case 'palm': {
      for (let i = 0; i < 6; i += 1) {
        set.add([1.3, 2.2, 1.3], [i * 0.42, 1.1 + i * 2.1, 0], PALETTE.trunkDark);
      }
      const top = 13.6;
      for (let i = 0; i < 6; i += 1) {
        const angle = (i / 6) * Math.PI * 2;
        set.add(
          [6.4, 0.5, 1.7],
          [2.5 + Math.cos(angle) * 2.6, top - 0.5, Math.sin(angle) * 2.6],
          PALETTE.frond,
          [0, angle, -0.34],
        );
      }
      set.add([1.9, 1.3, 1.9], [2.5, top, 0], PALETTE.trunk);
      return;
    }

    /** A fern cluster: the ground cover that makes a jungle floor. */
    case 'fern': {
      for (let i = 0; i < 5; i += 1) {
        const angle = (i / 5) * Math.PI * 2;
        set.add(
          [2.9, 0.34, 0.9],
          [Math.cos(angle) * 1.1, 0.8, Math.sin(angle) * 1.1],
          i % 2 === 0 ? PALETTE.fern : PALETTE.fernDark,
          [0, angle, -0.45],
        );
      }
      return;
    }

    /** A flowering bush. */
    case 'bush': {
      set.add([3.2, 2.2, 3.2], [0, 1.1, 0], PALETTE.bush);
      set.add([2.2, 1.4, 2.2], [0.7, 2.4, -0.4], PALETTE.fern);
      set.add([0.5, 0.5, 0.5], [1.1, 2.9, 0.7], tone === 0 ? PALETTE.flower : PALETTE.flowerAlt);
      set.add([0.5, 0.5, 0.5], [-1, 2.3, -0.8], PALETTE.flowerAlt);
      return;
    }

    /** A vine hanging from whatever is above. Drawn downward from its anchor. */
    case 'vine': {
      const length = 7;
      for (let i = 0; i < 5; i += 1) {
        set.add(
          [0.32, length / 5, 0.32],
          [Math.sin(i * 1.3) * 0.5, -(i + 0.5) * (length / 5), Math.cos(i * 1.1) * 0.4],
          PALETTE.vine,
        );
      }
      set.add([1.5, 0.4, 1.5], [0, -length, 0], PALETTE.fern);
      return;
    }

    /** A buttress root arching out of a bank. */
    case 'root': {
      for (let i = 0; i < 5; i += 1) {
        const t = i / 4;
        set.add(
          [1.5 - t * 0.5, 1.5 - t * 0.5, 3],
          [0, 2.4 * Math.sin((1 - t) * 1.2), i * 2.6],
          PALETTE.log,
          [0.3 * (1 - t), 0, 0],
        );
      }
      set.add([2.6, 1.2, 2.6], [0, 0.6, 0], PALETTE.logDark);
      return;
    }

    /** A blocky boulder. */
    case 'rock': {
      set.add([4.4, 3.2, 4], [0, 1.6, 0], PALETTE.boulder);
      set.add([3, 1.8, 3.4], [1, 3.4, -0.5], PALETTE.boulderDark);
      set.add([2.2, 0.4, 2.2], [-0.4, 3.3, 0.8], PALETTE.moss);
      return;
    }

    /** Cave fungus: the only light in the deep cavern. */
    case 'mushroom': {
      for (let i = 0; i < 3; i += 1) {
        const at = [(i - 1) * 1.3, 0, Math.sin(i * 2) * 0.9] as const;
        set.add([0.5, 1.4 - i * 0.2, 0.5], [at[0], 0.7, at[2]], PALETTE.canvasDark);
        set.add(
          [2 - i * 0.3, 0.6, 2 - i * 0.3],
          [at[0], 1.6 - i * 0.2, at[2]],
          i === 1 ? PALETTE.fungusGlow : PALETTE.fungus,
        );
      }
      return;
    }

    /** A mossy fallen trunk lying beside the path. */
    case 'fallenLog': {
      set.add([2.4, 2.4, 13], [0, 1.2, 0], PALETTE.log);
      set.add([2.5, 0.5, 11], [0, 2.4, 0], PALETTE.moss);
      set.add([1.3, 1.3, 2.6], [1.2, 2.2, -3], PALETTE.logDark, [0, 0, -0.5]);
      return;
    }

    /**
     * A sheet of falling water.
     *
     * Three overlapping slabs at slightly different widths, so the column has
     * an edge and a core rather than being one flat plane. Drawn white at the
     * bottom where it breaks.
     */
    case 'waterfall': {
      const height = 20;
      set.add([11, height, 1.4], [0, -height / 2, 0], PALETTE.rapidsDark);
      set.add([8, height, 1.8], [0, -height / 2, 0.5], PALETTE.rapids);
      set.add([12, 3.4, 3.4], [0, -height, 0.6], 0xffffff);
      set.add([13, 1.8, 4.6], [0, -height - 1.4, 1.2], PALETTE.rapids);
      return;
    }

    /** A ruined arch: two piers and a lintel, with the jungle through it. */
    case 'arch': {
      for (const side of [-1, 1]) {
        set.add([2.6, 11, 2.6], [side * 5.5, 5.5, 0], PALETTE.ruin);
        set.add([3.2, 1.2, 3.2], [side * 5.5, 0.6, 0], PALETTE.ruinDark);
      }
      set.add([14, 2.4, 3], [0, 12.2, 0], PALETTE.ruin);
      set.add([12, 0.6, 3.2], [0, 13.5, 0], PALETTE.moss);
      return;
    }

    /** A weathered guardian figure, usually overgrown. */
    case 'statue': {
      set.add([5, 1.6, 4], [0, 0.8, 0], PALETTE.statueDark);
      set.add([3.6, 5, 3], [0, 4.1, 0], PALETTE.statue);
      set.add([2.6, 2.4, 2.4], [0, 7.8, 0.2], PALETTE.statue);
      // The headdress, which is what makes a block of stone read as a figure.
      set.add([4.4, 1, 3], [0, 9.3, 0], PALETTE.statueDark);
      set.add([1, 1.8, 0.4], [0, 9.9, 1.3], PALETTE.inlay);
      for (const side of [-1, 1]) {
        set.add([1.1, 3.4, 1.1], [side * 2.3, 4.4, 0.6], PALETTE.statue);
        set.add([0.6, 0.6, 0.6], [side * 1, 7.9, 1.3], 0x1b1b22);
      }
      set.add([3.8, 0.5, 3.2], [0, 6.6, 0], PALETTE.moss);
      return;
    }

    /** A carved stele: the ancient civilisation's writing. */
    case 'stele': {
      set.add([3.4, 0.9, 1.8], [0, 0.45, 0], PALETTE.statueDark);
      set.add([2.6, 6.4, 1.1], [0, 3.6, 0], PALETTE.statue);
      for (let i = 0; i < 4; i += 1) {
        set.add([1.6, 0.35, 0.2], [0, 1.6 + i * 1.3, 0.6], PALETTE.inlay);
      }
      set.add([2.8, 0.4, 1.3], [0, 7, 0], PALETTE.moss);
      return;
    }

    /** A lit brazier on a post: the temple corridors. */
    case 'torch': {
      set.add([0.8, 5, 0.8], [0, 2.5, 0], PALETTE.trunkDark);
      set.add([2, 1, 2], [0, 5.4, 0], PALETTE.statueDark);
      set.add([1.4, 1.2, 1.4], [0, 6.2, 0], PALETTE.flame);
      set.add([0.8, 1, 0.8], [0, 7, 0], PALETTE.flameCore);
      return;
    }

    /** An expedition tent. */
    case 'tent': {
      for (let i = 0; i < 5; i += 1) {
        const t = i / 4;
        const width = 7 * (1 - Math.abs(t - 0.5) * 0.3);
        set.add([width, 0.5, 1.7], [0, 0.6 + i * 1.1, 0], PALETTE.canvas, [0, 0, 0]);
      }
      set.add([1, 6, 1], [0, 3, -3], PALETTE.trunkDark);
      set.add([7.6, 0.6, 7.6], [0, 6.2, 0], PALETTE.canvasDark, [0.34, 0, 0]);
      set.add([7.8, 0.6, 7.8], [0, 6.2, 0], PALETTE.canvas, [-0.34, 0, 0]);
      return;
    }

    /** A stack of crates and a lantern. */
    case 'crates': {
      set.add([2.8, 2.6, 2.8], [0, 1.3, 0], PALETTE.crate);
      set.add([2.4, 2.2, 2.4], [1.1, 3.7, 0.5], PALETTE.crate);
      set.add([2.9, 0.3, 2.9], [0, 2.7, 0], PALETTE.trunkDark);
      set.add([0.7, 0.9, 0.7], [-1.4, 3.1, -0.9], PALETTE.flame);
      return;
    }

    /**
     * A stage marker: a carved post with the act's own colour on it.
     *
     * The stage NUMBER is drawn by `StageMarkers`, which hangs a canvas panel
     * on this. Keeping the text out of the merged mesh is what lets thirty
     * different numbers share one piece of geometry.
     */
    case 'marker': {
      set.add([1.5, 8, 1.5], [0, 4, 0], PALETTE.trunkDark);
      set.add([4.2, 1.2, 1.8], [0, 7.4, 0], PALETTE.plank);
      set.add([4.4, 0.4, 2], [0, 8.2, 0], MARKER_TONE[tone] as number);
      set.add([2.4, 0.5, 2.4], [0, 0.3, 0], PALETTE.dirtDark);
      return;
    }

    /** A blocky cloud cluster. */
    case 'cloud': {
      set.add([12, 3.4, 8], [0, 0, 0], PALETTE.cloud);
      set.add([7, 3, 6], [4.6, 1.1, 0.8], PALETTE.cloud);
      set.add([6, 2.6, 5.4], [-4.4, 0.7, -0.6], PALETTE.cloudShade);
      return;
    }

    default:
      return;
  }
};

/** Act accents for the stage markers, so the six acts are colour-coded. */
const MARKER_TONE = [0x4ad44a, 0x3aa8ff, 0xffd21f];
