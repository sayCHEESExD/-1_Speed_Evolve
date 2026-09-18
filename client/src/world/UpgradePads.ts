import {
  COURSE,
  SPEED_UPGRADES,
  UPGRADE_ROW,
  formatSpeed,
  upgradeX,
  upgradeY,
  upgradeZ,
  type SpeedUpgrade,
} from '@evolve/shared';
import {
  Group,
  Mesh,
  MeshLambertMaterial,
  type BufferGeometry,
  type Object3D,
} from 'three';
import { PALETTE } from '../config/worldVisuals.js';
import { CanvasSign } from './CanvasSign.js';
import { mergeStatic } from './mergeStatic.js';
import { texturedBox } from './texturedBox.js';

/**
 * The twelve speed-upgrade plates, down the player's LEFT side.
 *
 * Two rows of six, the back one on a terrace seven units up. Each is a CARVED
 * PLATE set into a stone socket, with a glyph kerb round its rim, a
 * rope-bound totem at its shoulder and two signs: the value above and the
 * requirement below. They are training platforms the expedition cut into a
 * ruin, not twelve buttons.
 *
 * A pad has THREE states and all three are drawn differently, because the one
 * question a player asks looking at this bank is "which of these can I use?":
 *
 *   OWNED    the pad currently equipped. Gold, and lit.
 *   UNLOCKED affordable but not equipped. Green.
 *   LOCKED   more Wins needed. Red, and the requirement is the loud line.
 *
 * Nothing here decides anything. The colour follows replicated Wins and the
 * replicated equipped slot, and riding onto a pad sends a REQUEST that the
 * server answers - so a pad drawn green that the server refuses would be a
 * bug in the shared `upgradeUnlocked` predicate, which both sides call.
 */
export class UpgradePads {
  readonly root = new Group();

  private readonly pads: {
    upgrade: SpeedUpgrade;
    surface: Mesh;
    kerb: Mesh;
  }[] = [];

  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: MeshLambertMaterial[] = [];

  /** Replicated figures. Display only; the server still decides. */
  private wins = 0;
  private equipped = 0;
  /** So the whole bank is only re-tinted when something has actually moved. */
  private dirty = true;

  private readonly lockedMaterial: MeshLambertMaterial;
  private readonly unlockedMaterial: MeshLambertMaterial;
  private readonly equippedMaterial: MeshLambertMaterial;
  private readonly kerbLocked: MeshLambertMaterial;
  private readonly kerbUnlocked: MeshLambertMaterial;
  private readonly kerbEquipped: MeshLambertMaterial;
  /** The deep red band along the front of each row. Never changes state. */
  private readonly apronMaterial: MeshLambertMaterial;
  /** The camp's own three materials, shared with the huts and the rigs. */
  private readonly stoneMaterial: MeshLambertMaterial;
  private readonly timberMaterial: MeshLambertMaterial;
  private readonly ropeMaterial: MeshLambertMaterial;
  private readonly glyphMaterial: MeshLambertMaterial;
  private readonly kerbStone: MeshLambertMaterial;
  private readonly leafMaterial: MeshLambertMaterial;

  private readonly signs: CanvasSign[] = [];

  constructor() {
    this.lockedMaterial = this.material(0xe0453f);
    this.unlockedMaterial = this.material(0x49d43a);
    this.equippedMaterial = this.material(0xffd21f);
    this.kerbLocked = this.material(0x8e2a26);
    this.kerbUnlocked = this.material(0x2a8a22);
    this.kerbEquipped = this.material(0xc99414);
    this.apronMaterial = this.material(0x8e2f22);
    this.stoneMaterial = this.material(PALETTE.rockSolid);
    this.timberMaterial = this.material(PALETTE.timber);
    this.ropeMaterial = this.material(PALETTE.ropeCord);
    this.glyphMaterial = this.material(PALETTE.inlay);
    this.kerbStone = this.material(PALETTE.boardFrameDark);
    this.leafMaterial = this.material(PALETTE.frond);

    const size = UPGRADE_ROW.size;

    /*
     * TWELVE CARVED TRAINING PLATES, set into the terrace the camp cut.
     *
     * Each is a stone socket with a carved plate in it, a rope-bound totem
     * beside it carrying the tier's colour, and a low glyph kerb round the
     * rim. The three states the player actually reads - equipped, affordable,
     * locked - live on the PLATE and on the totem's band, so the bank still
     * answers "which of these can I use?" from across the camp, which is the
     * one question it exists to answer.
     *
     * Everything else is the camp's own three materials, the same ones the
     * trader huts and the training rigs are built from: found stone, felled
     * timber and rope.
     */
    const surface = this.geometry(size - 1.4, UPGRADE_ROW.height, size - 1.4);
    const socket = this.geometry(size + 1.6, 1.1, size + 1.6);
    const kerbBar = this.geometry(size + 1.9, 0.55, 1.1);
    const glyph = this.geometry(0.9, 0.3, 0.9);
    const totemPost = this.geometry(1.0, 5.2, 1.0);
    const totemHead = this.geometry(1.9, 1.7, 1.9);
    const totemBand = this.geometry(2.15, 0.7, 2.15);
    const lashing = this.geometry(1.35, 0.4, 1.35);
    const apron = this.geometry(3.2, 0.7, size + 1.2);
    const frondGeom = this.geometry(2.6, 0.32, 0.9);

    for (const upgrade of SPEED_UPGRADES) {
      const pad = new Group();
      const top = upgradeY(upgrade.slot);
      pad.position.set(upgradeX(upgrade.slot), top - UPGRADE_ROW.height, upgradeZ(upgrade.slot));

      // The socket the plate sits in: cut stone, a little proud of the
      // terrace, so the plate reads as set INTO something.
      const socketMesh = new Mesh(socket, this.stoneMaterial);
      socketMesh.position.y = -0.35;
      socketMesh.receiveShadow = true;
      pad.add(socketMesh);

      // A kerb of carved glyph blocks round the rim, front and back.
      for (const sz of [-1, 1]) {
        // Slate, not the lock colour. The kerb is masonry and never changes
        // state; borrowing the locked material for it made every pad in the
        // bank wear a red rim whatever the wallet said.
        const bar = new Mesh(kerbBar, this.kerbStone);
        bar.position.set(0, 0.2, (sz * (size + 0.8)) / 2);
        bar.receiveShadow = true;
        pad.add(bar);
      }
      for (let i = 0; i < 3; i += 1) {
        const mark = new Mesh(glyph, this.glyphMaterial);
        mark.position.set(-size / 3 + (i * size) / 3, 0.5, (size + 0.8) / 2);
        pad.add(mark);
      }

      // The plate itself. This is the mesh the lock state re-tints.
      const surfaceMesh = new Mesh(surface, this.lockedMaterial);
      surfaceMesh.position.y = UPGRADE_ROW.height / 2 + 0.2;
      surfaceMesh.receiveShadow = true;
      pad.add(surfaceMesh);

      // The apron in front, running the length of each row, so twelve plates
      // read as two BANKS rather than as twelve tiles dropped on the terrace.
      const apronMesh = new Mesh(apron, this.apronMaterial);
      apronMesh.position.set(-size / 2 - 2.2, 0.35, 0);
      apronMesh.receiveShadow = true;
      pad.add(apronMesh);

      /*
       * The TOTEM, at the plate's outer shoulder.
       *
       * A lashed timber post with a carved head and a painted band. The band
       * is the second place the tier state lands, and it is the one visible
       * from behind and from above - a player riding along the row reads the
       * totems, not the plates they are standing on.
       */
      const totem = new Group();
      totem.position.set(size / 2 + 2.4, 0, -size / 2 + 1.2);
      const postMesh = new Mesh(totemPost, this.timberMaterial);
      postMesh.position.y = 2.6;
      postMesh.castShadow = true;
      totem.add(postMesh);
      for (const y of [1.1, 4.0]) {
        const tie = new Mesh(lashing, this.ropeMaterial);
        tie.position.y = y;
        totem.add(tie);
      }
      const headMesh = new Mesh(totemHead, this.stoneMaterial);
      headMesh.position.y = 6.0;
      headMesh.castShadow = true;
      totem.add(headMesh);
      const bandMesh = new Mesh(totemBand, this.kerbLocked);
      bandMesh.position.y = 5.3;
      totem.add(bandMesh);
      pad.add(totem);

      // A frond at the plate's inner shoulder, so the bank is planted rather
      // than paved. Kept OFF the approach side: the lane the player rides in
      // along stays clear.
      const frond = new Mesh(frondGeom, this.leafMaterial);
      frond.position.set(size / 2 + 1.4, 0.5, size / 2 - 0.6);
      frond.rotation.set(0, 0.7, -0.45);
      pad.add(frond);

      // The value, big, and the requirement under it. Both face -X, across the
      // camp - which is where a player standing in the open ground is when
      // they look this way. Signs are single-sided, so one facing the wall is
      // invisible.
      const label = new CanvasSign(8.4, 3.1, [
        {
          text: `+${formatSpeed(upgrade.perStep)}/Steps`,
          size: 1,
          fill: '#ffffff',
          stroke: '#18320f',
          strokeWidth: 0.22,
        },
        {
          text:
            upgrade.winsRequired === 0
              ? '0 Wins Required'
              : `${formatSpeed(upgrade.winsRequired)} Wins Required`,
          size: 0.62,
          fill: '#ffd83d',
          stroke: '#3a2a06',
        },
      ]);
      // The back row's label clears the TREELINE as well as the front row's
      // signs: the jungle band behind the terrace is the camp's backdrop, and
      // a canopy at twenty units is exactly where a label at twenty units is.
      const back = upgrade.slot > UPGRADE_ROW.perRow;
      label.mesh.position.set(-size / 2 - 0.1, UPGRADE_ROW.height + (back ? 16 : 6.6), 0);
      label.mesh.rotation.y = -Math.PI / 2;
      pad.add(label.mesh);
      this.signs.push(label);

      this.root.add(pad);
      this.pads.push({ upgrade, surface: surfaceMesh, kerb: bandMesh });
    }

    // The bank's own title, hung over the back row and facing the arena.
    const title = new CanvasSign(40, 9, [
      {
        text: 'Speed Upgrades',
        size: 1,
        fill: '#ffd21f',
        stroke: '#4a2a06',
        strokeWidth: 0.2,
      },
    ]);
    title.mesh.position.set(
      UPGRADE_ROW.backX + 4,
      // Well above the BACK row's labels, which hang at about 23 once the
      // terrace has lifted them. A title resting on the top line of the signs
      // it titles reads as a thirteenth pad rather than as a heading.
      COURSE.floorY + 31,
      (upgradeZ(1) + upgradeZ(UPGRADE_ROW.perRow)) / 2,
    );
    // Facing -X, back across the arena toward the treadmills - which is where
    // the player is standing when they first look this way.
    title.mesh.rotation.y = -Math.PI / 2;
    this.root.add(title.mesh);
    this.signs.push(title);

    /*
     * Merge the sockets, kerbs, totems, aprons and foliage.
     *
     * The PLATE and the totem's BAND are what the wallet re-tints, so those
     * two per pad survive as themselves; the other dozen boxes are the same
     * twelve times over and become one mesh per material.
     */
    const dynamic = new Set<Object3D>();
    for (const pad of this.pads) {
      dynamic.add(pad.surface);
      dynamic.add(pad.kerb);
    }
    for (const sign of this.signs) dynamic.add(sign.mesh);
    mergeStatic(this.root, dynamic, this.geometries);

    this.refresh();
  }

  /**
   * Mirror the replicated wallet and equipped pad.
   *
   * Compared before it is stored, so the common case - twenty patches a second
   * that change neither - costs two comparisons rather than a re-tint of the
   * whole bank.
   */
  setState(wins: number, equipped: number): void {
    if (this.wins === wins && this.equipped === equipped) return;
    this.wins = wins;
    this.equipped = equipped;
    this.dirty = true;
  }

  /** Re-tint whatever has changed. Cheap, and usually nothing. */
  update(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.refresh();
  }

  private refresh(): void {
    for (const pad of this.pads) {
      const owned = pad.upgrade.slot === this.equipped;
      // The SHARED predicate, not a comparison written here: a pad drawn green
      // that the server then refuses would be exactly the bug two copies of
      // this test produce.
      const unlocked = this.wins >= pad.upgrade.winsRequired;

      pad.surface.material = owned
        ? this.equippedMaterial
        : unlocked
          ? this.unlockedMaterial
          : this.lockedMaterial;
      pad.kerb.material = owned
        ? this.kerbEquipped
        : unlocked
          ? this.kerbUnlocked
          : this.kerbLocked;
    }
  }

  private geometry(w: number, h: number, d: number): BufferGeometry {
    const geometry = texturedBox(w, h, d, 3);
    this.geometries.push(geometry);
    return geometry;
  }

  private material(color: number): MeshLambertMaterial {
    const material = new MeshLambertMaterial({ color });
    // A little emissive so a pad still reads as lit inside the deck's shadow,
    // which is where half of the back row sits.
    material.emissive.setHex(color);
    material.emissiveIntensity = 0.22;
    this.materials.push(material);
    return material;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const sign of this.signs) sign.dispose();
    this.geometries.length = 0;
    this.materials.length = 0;
    this.signs.length = 0;
    this.root.removeFromParent();
  }
}
