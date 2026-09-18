import { STAGES, formatSpeed } from '@evolve/shared';
import { Group } from 'three';
import { CanvasSign } from './CanvasSign.js';

/**
 * The carved boards at each stage's entrance.
 *
 * Deliberately NOT a UI arrow. The specification for this world is that the
 * environment guides the player - the trail narrows, the gate frames the way
 * on, the torches line the causeway - and a marker's job is only to name where
 * they have arrived and what it will ask of them, the way a sign at the mouth
 * of a trail does.
 *
 * Two per stage, one facing each way down the route, because the route turns
 * and a single-sided panel is invisible from half of the approaches to it. A
 * DOUBLE-sided panel is worse than either: legible from the front and
 * MIRRORED from behind.
 */
export class StageMarkers {
  readonly root = new Group();

  private readonly signs: CanvasSign[] = [];

  constructor() {
    for (const stage of STAGES) {
      // The number, the name, and what it is built for. Three lines, and the
      // recommended figure is DERIVED from the level rather than authored
      // beside it, so the two can never advertise different things.
      const lines = [
        {
          text: `STAGE ${stage.index}`,
          size: 1,
          fill: '#ffffff',
          stroke: '#22301a',
          strokeWidth: 0.2,
        },
        {
          text: stage.name.toUpperCase(),
          size: 0.62,
          fill: ACT_INK[stage.act - 1] ?? '#ffd83d',
          stroke: '#22301a',
        },
        {
          text: `LEVEL ${stage.recommendedLevel} · ${formatSpeed(stage.recommendedSpeed)} SPEED`,
          size: 0.44,
          fill: '#e8e2cf',
          stroke: '#22301a',
        },
      ];

      // Hung on the two posts the course data placed at the stage's entrance.
      // Their exact positions come from the stage's own start, so a retuned
      // stage carries its marker with it.
      for (const facing of [0, Math.PI]) {
        const sign = new CanvasSign(21, 8, lines);
        sign.mesh.position.set(
          facing === 0 ? stage.winPadX + 26 : stage.winPadX - 2,
          stage.winPadY + 11,
          stage.startZ + 14,
        );
        sign.mesh.rotation.y = facing;
        this.root.add(sign.mesh);
        this.signs.push(sign);
      }
    }
  }

  dispose(): void {
    for (const sign of this.signs) sign.dispose();
    this.signs.length = 0;
    this.root.removeFromParent();
  }
}

/** One ink per act, so the six sections of the expedition read apart. */
const ACT_INK = ['#8ef07a', '#7ec8ff', '#d8d4c2', '#ff9a6b', '#ffd83d', '#ff7ad4'];
