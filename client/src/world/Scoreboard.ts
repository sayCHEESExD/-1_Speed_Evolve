import { COURSE, LEADERBOARD_SIZE, formatSpeed } from '@evolve/shared';
import {
  CanvasTexture,
  FrontSide,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type BufferGeometry,
} from 'three';
import type { LeaderboardSnapshot, NetLeaderEntry } from '../net/netTypes.js';
import { PALETTE } from '../config/worldVisuals.js';
import { logger } from '../util/logger.js';
import { CanvasSign } from './CanvasSign.js';
import { mergeStatic } from './mergeStatic.js';
import { texturedBox } from './texturedBox.js';

const SCOPE = 'Scoreboard';

/** Which board is which, in the order they stand on the wall. */
type Category = 'wins' | 'speed' | 'rebirths';

interface BoardSpec {
  readonly category: Category;
  /** The big floating word above the board. */
  readonly title: string;
  /** The header printed on the panel itself. */
  readonly heading: string;
  readonly titleFill: string;
  readonly titleStroke: string;
  /** Where it stands, as a fraction of the arena's half-width. */
  readonly x: number;
}

const BOARDS: readonly BoardSpec[] = [
  {
    category: 'wins',
    title: 'Wins',
    heading: 'Top Wins',
    titleFill: '#ffd53d',
    titleStroke: '#7a4a00',
    x: -1,
  },
  {
    category: 'speed',
    title: 'Speed',
    heading: 'Top Speed',
    titleFill: '#57d8ff',
    titleStroke: '#0d4a72',
    x: 0,
  },
  {
    category: 'rebirths',
    title: 'Rebirths',
    heading: 'Top Rebirths',
    titleFill: '#ff6ae4',
    titleStroke: '#6a1060',
    x: 1,
  },
];

/** Board footprint, in world units. */
const BOARD = {
  /*
   * Sized so all THREE fit one view.
   *
   * A board is only "clearly visible from the spawn area" if the set of them
   * is: three boards wide enough to need a head-turn each are three separate
   * signs, not a scoreboard. At this width the trio spans about 88 units,
   * which is what a player standing anywhere in the back half of the arena
   * sees at once.
   */
  width: 26,
  height: 21,
  /** Thickness of the stone surround. */
  frame: 2,
  /** How far the whole thing stands off the wall. */
  depth: 2,
  /** Height of the panel's bottom edge above the arena floor. */
  baseY: 3.4,
} as const;

/** Canvas pixels per world unit on the panel. Enough to read from the spawn. */
const PIXELS_PER_UNIT = 46;

/** Medal colours for the first three places, then everyone else. */
const RANK_COLOURS = ['#ffd53d', '#dfe6ef', '#ff9a3d'] as const;
const RANK_DEFAULT = '#ffffff';

const FONT = '"Arial Black", "Segoe UI", system-ui, sans-serif';

/**
 * The three leaderboards on the back wall of the spawn arena.
 *
 * WORLD-SPACE, not HUD. The reference art puts these on the wall of the room
 * the player is standing in, and that is the whole character of them: they are
 * a place you walk up to and read, and something another player can be seen
 * looking at. A flat panel pinned to the corner of the screen would be a
 * different feature wearing the same numbers.
 *
 * The back wall was deliberately left empty when the camp was laid out. This
 * is what it was left empty for, and it stays the only thing there.
 *
 * They are ANCIENT. The expedition found three carved stelae standing against
 * the ruin, cleared the moss off the faces and started keeping its own
 * standings on them - which is the camp's whole premise stated in one object.
 * The surround carries all of that; the face carries none of it, because a
 * leaderboard that is hard to read is not a better leaderboard for being
 * handsome.
 *
 * Every figure comes from replicated server state and this draws it. There is
 * no client-side ranking, no local tally, and nothing here that could disagree
 * with what the server decided the order was.
 */
export class Scoreboard {
  readonly root = new Group();

  private readonly panels: PanelSurface[] = [];
  private readonly signs: CanvasSign[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: (MeshBasicMaterial | MeshLambertMaterial)[] = [];

  /** So the "no leaderboard" complaint is made once, not sixty times a second. */
  private warnedMissing = false;

  constructor() {
    /*
     * Three CARVED STELAE against the ruin at the back of the camp.
     *
     * The expedition did not build these. It found them, cleared the moss off
     * the faces and started chalking its own numbers on them, which is the
     * whole story of this camp told in one object. Everything below is in
     * service of that: a stepped plinth the stone actually stands on, pilasters
     * with carved banding, a receding lintel, and enough moss and vine left on
     * the parts nobody needed to clean to make it obvious the stone is older
     * than the expedition.
     *
     * The FACE is untouched - same panel, same canvas, same data path. A
     * leaderboard that is hard to read is not a better leaderboard for being
     * handsome, so the surround got the decoration and the panel got none.
     */
    const wallZ = COURSE.campStartZ + BOARD.depth;
    const outer = BOARD.width + BOARD.frame * 2;
    // Shoulder to shoulder with a hand's breadth between, rather than pushed
    // out to the corners of the room: they are one feature, not three.
    const spread = outer + 1;

    const stone = this.material(new MeshLambertMaterial({ color: PALETTE.boardFrame }));
    const stoneDark = this.material(
      new MeshLambertMaterial({ color: PALETTE.boardFrameDark }),
    );
    const carved = this.material(new MeshLambertMaterial({ color: PALETTE.statue }));
    const moss = this.material(new MeshLambertMaterial({ color: PALETTE.moss }));
    const vine = this.material(new MeshLambertMaterial({ color: PALETTE.vine }));
    const gold = this.material(new MeshLambertMaterial({ color: PALETTE.inlay }));
    const wood = this.material(new MeshLambertMaterial({ color: PALETTE.trunkDark }));
    // Unlit, so a torch reads as a light source rather than as a lit object.
    const flame = this.material(new MeshBasicMaterial({ color: PALETTE.flame }));
    const flameCore = this.material(new MeshBasicMaterial({ color: PALETTE.flameCore }));

    for (const spec of BOARDS) {
      const group = new Group();
      group.position.set(spec.x * spread, 0, wallZ);

      const midY = BOARD.baseY + BOARD.height / 2;
      const outerW = BOARD.width + BOARD.frame * 2;
      const outerH = BOARD.height + BOARD.frame * 2;

      /* ---- The plinth it stands on ------------------------------------- */

      // Three receding courses. A stele resting on the floor is a poster; a
      // stele on a base somebody cut for it is masonry.
      for (let i = 0; i < 3; i += 1) {
        const inset = i * 1.6;
        const h = BOARD.baseY / 3;
        group.add(
          this.box(
            i === 0 ? stoneDark : stone,
            0,
            h * (i + 0.5),
            0,
            outerW + 7 - inset * 2,
            h + 0.2,
            BOARD.depth + 5 - inset,
          ),
        );
      }
      // Moss along the top of the plinth, where rain collects and nobody
      // sweeps. Broken into patches rather than a band: moss does not grow in
      // a stripe, and a continuous line reads as paint.
      for (let i = 0; i < 5; i += 1) {
        if (i === 2) continue;
        group.add(
          this.box(
            moss,
            -outerW / 2 + 2 + (i * (outerW - 4)) / 4,
            BOARD.baseY + 0.12,
            BOARD.depth / 2 + 1.4,
            3.4 + (i % 2) * 1.6,
            0.45,
            2.6,
          ),
        );
      }

      /* ---- The recess, so the face is set INTO the stone ---------------- */

      group.add(
        this.box(stoneDark, 0, midY, -0.9, BOARD.width + 1.2, BOARD.height + 1.2, 1.8),
      );

      /* ---- Pilasters either side --------------------------------------- */

      // Five courses each, alternating width, so the column is banded the way
      // a carved one is rather than being a smooth post.
      for (const sx of [-1, 1]) {
        const x = sx * (BOARD.width / 2 + BOARD.frame / 2);
        const courses = 5;
        for (let i = 0; i < courses; i += 1) {
          const h = outerH / courses;
          const wide = i % 2 === 0;
          group.add(
            this.box(
              wide ? stone : carved,
              x,
              BOARD.baseY + h * (i + 0.5),
              0,
              BOARD.frame * (wide ? 1 : 1.35),
              h - 0.18,
              BOARD.depth + (wide ? 0 : 0.5),
            ),
          );
        }
        // The capital, and a gold inlay glyph on it: the one bright detail,
        // and the only thing on the whole structure that is not weathered.
        group.add(
          this.box(stoneDark, x, BOARD.baseY + outerH + 0.5, 0.2, BOARD.frame * 2, 1.2, BOARD.depth + 1.2),
        );
        group.add(
          this.box(gold, x, BOARD.baseY + outerH + 0.5, BOARD.depth / 2 + 0.9, 0.9, 0.9, 0.2),
        );
      }

      /* ---- Lintel and sill ---------------------------------------------- */

      group.add(
        this.box(stone, 0, BOARD.baseY + BOARD.height + BOARD.frame / 2, 0, outerW, BOARD.frame, BOARD.depth),
      );
      group.add(this.box(stone, 0, BOARD.baseY - BOARD.frame / 2, 0, outerW, BOARD.frame, BOARD.depth));

      // A stepped cap over the lintel: three courses, each shorter and further
      // forward, which is the silhouette that says "ancient" without a single
      // extra texture.
      for (let i = 0; i < 3; i += 1) {
        group.add(
          this.box(
            i === 1 ? carved : stone,
            0,
            BOARD.baseY + outerH + 1.4 + i * 1.15,
            0.3 + i * 0.35,
            outerW - 2 - i * 3.4,
            1.15,
            BOARD.depth + 1 + i * 0.7,
          ),
        );
      }
      // Moss on the cap, and vines hanging off its corners.
      group.add(
        this.box(moss, 1.5, BOARD.baseY + outerH + 4.9, 0.9, outerW * 0.35, 0.4, BOARD.depth + 2),
      );
      for (const sx of [-1, 1]) {
        const x = sx * (outerW / 2 - 1.2);
        for (let i = 0; i < 4; i += 1) {
          group.add(
            this.box(
              vine,
              x + sx * Math.sin(i * 1.3) * 0.6,
              BOARD.baseY + outerH - i * 2.6,
              BOARD.depth / 2 + 0.9,
              0.45,
              2.6,
              0.45,
            ),
          );
        }
        group.add(
          this.box(moss, x, BOARD.baseY + outerH - 10.4, BOARD.depth / 2 + 0.9, 1.5, 0.9, 0.8),
        );
      }

      /* ---- A torch on each side of the plinth --------------------------- */

      for (const sx of [-1, 1]) {
        const x = sx * (outerW / 2 + 2.6);
        group.add(this.box(wood, x, 3.2, BOARD.depth / 2 + 2, 0.8, 6.4, 0.8));
        group.add(this.box(stoneDark, x, 6.7, BOARD.depth / 2 + 2, 1.9, 0.9, 1.9));
        group.add(this.box(flame, x, 7.5, BOARD.depth / 2 + 2, 1.3, 1.3, 1.3));
        group.add(this.box(flameCore, x, 8.2, BOARD.depth / 2 + 2, 0.7, 0.9, 0.7));
      }

      /* ---- The face, unchanged ------------------------------------------ */

      const surface = new PanelSurface(spec, BOARD.width, BOARD.height);
      surface.mesh.position.set(0, midY, BOARD.depth / 2 + 0.02);
      group.add(surface.mesh);
      this.panels.push(surface);

      // The big carved word above it, on the cap.
      const title = new CanvasSign(outerW * 0.8, 6.4, [
        {
          text: spec.title,
          size: 1,
          fill: spec.titleFill,
          stroke: spec.titleStroke,
          strokeWidth: 0.2,
        },
      ]);
      title.mesh.position.set(0, BOARD.baseY + outerH + 8.4, BOARD.depth / 2 + 2.2);
      group.add(title.mesh);
      this.signs.push(title);

      this.root.add(group);
    }

    // The faces redraw and the titles are their own canvases; the stone never
    // moves, so it collapses to one mesh per material.
    mergeStatic(
      this.root,
      new Set([
        ...this.panels.map((panel) => panel.mesh),
        ...this.signs.map((sign) => sign.mesh),
      ]),
      this.geometries,
    );
  }

  /**
   * Take the latest standings.
   *
   * Cheap to call every frame: each panel compares a signature of what it was
   * asked to draw against what it last drew, and a canvas is only re-rendered
   * and re-uploaded when something has actually moved. The board changes every
   * couple of seconds at most, and redrawing three 1400-pixel canvases at
   * sixty hertz for that would cost more than the rest of the world put
   * together.
   */
  update(board: LeaderboardSnapshot | null): void {
    if (!board) {
      /*
       * The server sent no leaderboard at all.
       *
       * Not "no scores" - no FIELD. The only way that happens is a server
       * whose `CourseState` has no `leaderboard` on it, which means the
       * deployed server is older than the deployed client. Everything else
       * about the session works, because every other field predates this one,
       * so the symptom is three blank boards and no other clue at all.
       *
       * Said ONCE, and loudly enough to find. Silence here cost a deployment.
       */
      if (!this.warnedMissing) {
        this.warnedMissing = true;
        logger.warn(
          SCOPE,
          'the server sent no leaderboard: its state has no such field, which ' +
            'means it is running an older build than this client. Redeploy the ' +
            'Colyseus server.',
        );
        for (const panel of this.panels) panel.showUnavailable();
      }
      return;
    }

    this.warnedMissing = false;
    for (const panel of this.panels) panel.apply(board[panel.category]);
  }

  dispose(): void {
    for (const panel of this.panels) panel.dispose();
    for (const sign of this.signs) sign.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.panels.length = 0;
    this.signs.length = 0;
    this.geometries.length = 0;
    this.materials.length = 0;
    this.root.removeFromParent();
  }

  private box(
    material: MeshBasicMaterial | MeshLambertMaterial,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ): Mesh {
    const geometry = texturedBox(w, h, d, 4);
    this.geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private material<T extends MeshBasicMaterial | MeshLambertMaterial>(material: T): T {
    this.materials.push(material);
    return material;
  }
}

/**
 * One board's face: a canvas, a texture and the plane showing it.
 *
 * Unlit, like every other piece of world text in this game. A board that
 * dimmed when the sun went behind it is a board nobody can read.
 */
class PanelSurface {
  readonly mesh: Mesh;
  readonly category: Category;

  private readonly spec: BoardSpec;
  private readonly canvas: HTMLCanvasElement;
  private readonly texture: CanvasTexture;
  private readonly material: MeshBasicMaterial;
  private readonly geometry: PlaneGeometry;

  /** What was last drawn, so an unchanged board is not redrawn. */
  private signature = '';

  /** The line shown instead of rows when nothing is ranked yet. */
  private placeholder = 'No scores yet';

  constructor(spec: BoardSpec, width: number, height: number) {
    this.spec = spec;
    this.category = spec.category;

    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(width * PIXELS_PER_UNIT);
    this.canvas.height = Math.round(height * PIXELS_PER_UNIT);

    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = LinearFilter;

    this.geometry = new PlaneGeometry(width, height);
    this.material = new MeshBasicMaterial({ map: this.texture, side: FrontSide });
    this.mesh = new Mesh(this.geometry, this.material);

    this.draw([]);
  }

  apply(rows: readonly NetLeaderEntry[]): void {
    const signature = rows.map((row) => `${row.handle}:${row.value}`).join('|');
    if (signature === this.signature && this.placeholder === 'No scores yet') return;
    this.signature = signature;
    this.placeholder = 'No scores yet';
    this.draw(rows);
    this.texture.needsUpdate = true;
  }

  /**
   * Draw the board as UNAVAILABLE rather than merely empty.
   *
   * Used only when the server has no leaderboard field to send - a state the
   * player cannot fix and the operator has to know about.
   */
  showUnavailable(): void {
    this.placeholder = 'Scores unavailable';
    this.signature = '\u0000unavailable';
    this.draw([]);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    this.material.dispose();
    this.geometry.dispose();
    this.mesh.removeFromParent();
  }

  private draw(rows: readonly NetLeaderEntry[]): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = this.canvas;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = PALETTE.boardPanel;
    ctx.fillRect(0, 0, width, height);

    // An inner bevel, so the panel reads as set INTO the frame around it.
    ctx.strokeStyle = PALETTE.boardPanelEdge;
    ctx.lineWidth = width * 0.012;
    ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, width - ctx.lineWidth * 2, height - ctx.lineWidth * 2);

    const pad = width * 0.05;
    const headerH = height * 0.16;

    // The header.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    fitText(ctx, this.spec.heading, width - pad * 2, headerH * 0.62);
    ctx.lineWidth = headerH * 0.1;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(this.spec.heading, width / 2, headerH * 0.62);
    ctx.fillStyle = PALETTE.boardHeading;
    ctx.fillText(this.spec.heading, width / 2, headerH * 0.62);

    // The rows.
    const rowTop = headerH;
    const rowH = (height - headerH - pad * 0.6) / LEADERBOARD_SIZE;
    const rankX = pad;
    const handleX = pad + width * 0.13;
    const valueRight = width - pad;
    const handleRoom = valueRight - handleX - width * 0.2;

    /*
     * An empty board has to LOOK empty on purpose.
     *
     * A fresh server has no profiles and every live figure starts at zero, so
     * nothing is ranked and every row is blank - which is pixel-identical to
     * the board being broken. One line of text is the difference between "no
     * one has scored yet" and "this feature is dead", and on a newly deployed
     * server the first is what is actually true.
     */
    if (!rows.some((row) => row && row.handle)) {
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.boardHeading;
      fitText(ctx, this.placeholder, width - pad * 2, rowH * 0.62);
      ctx.globalAlpha = 0.75;
      ctx.fillText(this.placeholder, width / 2, rowTop + rowH * 1.6);
      ctx.globalAlpha = 1;
      return;
    }

    for (let i = 0; i < LEADERBOARD_SIZE; i += 1) {
      const row = rows[i];
      const centreY = rowTop + rowH * (i + 0.5);
      const size = rowH * 0.58;

      // A faint stripe on alternate rows: nine lines of similar text are much
      // easier to track across when the eye has something to follow.
      if (i % 2 === 1) {
        ctx.fillStyle = PALETTE.boardStripe;
        ctx.fillRect(pad * 0.4, rowTop + rowH * i, width - pad * 0.8, rowH);
      }
      if (!row || !row.handle) continue;

      ctx.textAlign = 'left';
      ctx.lineWidth = size * 0.16;
      ctx.strokeStyle = PALETTE.boardInk;

      // Rank, in its medal colour.
      ctx.font = `900 ${size}px ${FONT}`;
      ctx.fillStyle = RANK_COLOURS[i] ?? RANK_DEFAULT;
      const rank = `#${i + 1}`;
      ctx.strokeText(rank, rankX, centreY);
      ctx.fillText(rank, rankX, centreY);

      // Handle, shrunk to fit the space between the rank and the figure. It is
      // the one field whose length is not ours to choose, so it is the one
      // that has to give - and the figure beside it must never be pushed off
      // the board by a long name.
      fitText(ctx, row.handle, handleRoom, size, 'left');
      ctx.fillStyle = PALETTE.boardName;
      ctx.strokeText(row.handle, handleX, centreY);
      ctx.fillText(row.handle, handleX, centreY);

      // The figure, right-aligned so the column reads down the page.
      const text = this.format(row.value);
      ctx.textAlign = 'right';
      fitText(ctx, text, width * 0.24, size, 'right');
      ctx.fillStyle = PALETTE.boardValue;
      ctx.strokeText(text, valueRight, centreY);
      ctx.fillText(text, valueRight, centreY);
    }
  }

  /** Wins and Speed run to the millions; rebirths are a plain count. */
  private format(value: number): string {
    if (this.category === 'rebirths') return Math.floor(value).toString();
    return formatSpeed(value);
  }
}

/**
 * Set a font size that FITS, and leave it set.
 *
 * The same rule the world signs learned the hard way: a size chosen from the
 * row height alone, with nothing ever measured against the width available,
 * runs long text straight off the end of its own canvas. The stroke counts
 * too - `strokeText` paints half a line width outside the glyphs - so it is
 * budgeted for here rather than discovered later.
 */
const fitText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  room: number,
  preferred: number,
  align: CanvasTextAlign = 'center',
): void => {
  ctx.textAlign = align;
  let size = preferred;
  for (let pass = 0; pass < 4; pass += 1) {
    ctx.font = `900 ${size}px ${FONT}`;
    const drawn = ctx.measureText(text).width + size * 0.16;
    if (drawn <= room) break;
    size *= room / drawn;
  }
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.lineWidth = size * 0.16;
};
