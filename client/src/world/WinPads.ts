import { STAGES, WIN_PAD, formatSpeed } from '@evolve/shared';
import {
  BoxGeometry,
  CanvasTexture,
  Group,
  LinearFilter,
  Mesh,
  MeshLambertMaterial,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  TextureLoader,
  type BufferGeometry,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../config/worldVisuals.js';

/**
 * The win plate at every stage's end, dressed the way the reference draws it.
 *
 * The plate itself is course data - a `winPad` solid, studded orange checker,
 * drawn with the rest of the floor. This adds what makes it read as a PRIZE
 * from the far end of the stage: a near-black frame under it, the supplied
 * trophy standing on it, and a floating "Return / +N Wins" label.
 *
 * Nothing here touches gameplay. Where the plate is, and what it pays, come
 * from `STAGES`; the label prints the stage's own reward, compact, through the
 * one formatter every figure in the game uses.
 */

/** How far the frame stands out round the plate, each side. */
const FRAME = 1.2;
/** Label size in world units, and how high it floats over the plate. */
const LABEL_W = 16;
const LABEL_H = 8;
const LABEL_LIFT = 9;
/** Trophy height in world units; the width follows the image. */
const TROPHY_H = 6.2;
/** trophy.png is 514 x 486. */
const TROPHY_ASPECT = 514 / 486;

export class WinPads {
  readonly root = new Group();

  private readonly trophies: Sprite[] = [];
  private readonly baseY: number[] = [];
  private readonly textures: Texture[] = [];
  private readonly materials: (SpriteMaterial | MeshLambertMaterial)[] = [];
  private readonly geometries: BufferGeometry[] = [];

  constructor() {
    // The frames: one merged mesh for the whole course.
    const frames: BufferGeometry[] = [];
    for (const stage of STAGES) {
      const frame = new BoxGeometry(WIN_PAD.width + FRAME * 2, 0.45, WIN_PAD.length + FRAME * 2);
      // Just under the plate's top, so the rim shows round it without ever
      // sharing its plane.
      frame.translate(stage.winPadX, stage.winPadY - 0.1 - 0.225, stage.winPadZ);
      frames.push(frame);
    }
    const merged = mergeGeometries(frames, false);
    for (const geometry of frames) geometry.dispose();
    if (merged) {
      const material = new MeshLambertMaterial({ color: PALETTE.winPadFrame });
      this.materials.push(material);
      this.geometries.push(merged);
      const mesh = new Mesh(merged, material);
      mesh.receiveShadow = true;
      this.root.add(mesh);
    }

    // The trophy: the supplied image, used as it is, one shared material.
    const trophyTexture = new TextureLoader().load('/ui/trophy.png');
    trophyTexture.colorSpace = SRGBColorSpace;
    this.textures.push(trophyTexture);
    const trophyMaterial = new SpriteMaterial({ map: trophyTexture, transparent: true });
    this.materials.push(trophyMaterial);

    for (const stage of STAGES) {
      // At the OUTER end of the plate - away from the trail - where the reference
      // stands it, so riding onto the plate is riding toward the trophy.
      const trophy = new Sprite(trophyMaterial);
      trophy.scale.set(TROPHY_H * TROPHY_ASPECT, TROPHY_H, 1);
      const y = stage.winPadY + TROPHY_H / 2 + 0.1;
      trophy.position.set(stage.winPadX - WIN_PAD.width / 2 + 4, y, stage.winPadZ);
      this.root.add(trophy);
      this.trophies.push(trophy);
      this.baseY.push(y);

      // The label: a sprite, so it faces whoever looks at it and is never
      // seen mirrored from behind.
      const labelTexture = drawLabel(`+${formatSpeed(stage.winReward)} Wins`);
      this.textures.push(labelTexture);
      const labelMaterial = new SpriteMaterial({ map: labelTexture, transparent: true, depthWrite: false });
      this.materials.push(labelMaterial);
      const label = new Sprite(labelMaterial);
      label.scale.set(LABEL_W, LABEL_H, 1);
      label.position.set(stage.winPadX, stage.winPadY + LABEL_LIFT, stage.winPadZ);
      this.root.add(label);
    }
  }

  /** A slow bob, so the trophy reads as a prize rather than a sticker. */
  update(elapsed: number): void {
    for (let i = 0; i < this.trophies.length; i += 1) {
      const trophy = this.trophies[i] as Sprite;
      trophy.position.y = (this.baseY[i] as number) + Math.sin(elapsed * 2.2 + i) * 0.35;
    }
  }

  dispose(): void {
    for (const texture of this.textures) texture.dispose();
    for (const material of this.materials) material.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    this.textures.length = 0;
    this.materials.length = 0;
    this.geometries.length = 0;
    this.trophies.length = 0;
    this.root.removeFromParent();
  }
}

const FONT = '"Arial Black", "Segoe UI", system-ui, sans-serif';

/**
 * "Return" over "+N Wins", the way the reference sets it: a white word, then
 * the reward in heavy gold on a dark band that fades out at both ends.
 */
const drawLabel = (reward: string): CanvasTexture => {
  const width = 512;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    // The dark band behind the reward.
    const band = ctx.createLinearGradient(0, 0, width, 0);
    band.addColorStop(0, 'rgba(8,12,24,0)');
    band.addColorStop(0.2, 'rgba(8,12,24,0.78)');
    band.addColorStop(0.8, 'rgba(8,12,24,0.78)');
    band.addColorStop(1, 'rgba(8,12,24,0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, 112, width, 120);

    // "Return".
    ctx.font = `900 64px ${FONT}`;
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#11131a';
    ctx.strokeText('Return', width / 2, 62);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Return', width / 2, 62);

    // "+N Wins", shrunk to fit if the number is long.
    let size = 96;
    ctx.font = `900 ${size}px ${FONT}`;
    const room = width * 0.9;
    const measured = ctx.measureText(reward).width + size * 0.2;
    if (measured > room) {
      size *= room / measured;
      ctx.font = `900 ${size}px ${FONT}`;
    }
    const gold = ctx.createLinearGradient(0, 172 - size / 2, 0, 172 + size / 2);
    gold.addColorStop(0, '#fff27a');
    gold.addColorStop(0.55, '#ffd21f');
    gold.addColorStop(1, '#ff9a0a');
    ctx.lineWidth = size * 0.2;
    ctx.strokeStyle = '#1a1206';
    ctx.strokeText(reward, width / 2, 172);
    ctx.fillStyle = gold;
    ctx.fillText(reward, width / 2, 172);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  return texture;
};
