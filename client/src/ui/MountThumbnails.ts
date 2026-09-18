import { mountForSlot } from '@evolve/shared';
import {
  AmbientLight,
  Box3,
  DirectionalLight,
  OrthographicCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { MountModel } from '../mount/MountModel.js';

/**
 * Portraits of the mounts, for the Evolve menu.
 *
 * Every creature in this game is built at runtime out of boxes, so there is no
 * picture of one to put in a menu - and a letter in a coloured square, which is
 * what this replaced, tells a player nothing about what they are about to be
 * riding.
 *
 * So each one is RENDERED ONCE, offscreen, into a data URL. A second
 * WebGLRenderer exists only for as long as it takes to draw the roster and is
 * then destroyed, which is why this is a one-off cost at first open rather than
 * a permanent second context competing with the game's own for GPU memory.
 *
 * The models are the real ones: the same `MountModel` the world builds, from
 * the same cached per-species geometry. A thumbnail therefore cannot drift
 * from the mount it depicts, because it IS the mount.
 */

/** Edge length of a portrait, in device pixels. */
const SIZE = 192;

const CACHE = new Map<number, string>();

/** True once the roster has been drawn, successfully or otherwise. */
let rendered = false;

/**
 * The portrait for a mount slot, or '' when there is none.
 *
 * Never throws and never blocks: a browser that refuses a second WebGL context
 * - and some will, having already given one to the game - gets an empty string
 * and the menu falls back to its coloured card. A menu is not worth a crash.
 */
export const mountThumbnail = (slot: number): string => {
  if (!rendered) renderAll();
  return CACHE.get(Math.floor(slot)) ?? '';
};

const renderAll = (): void => {
  rendered = true;

  let renderer: WebGLRenderer | null = null;
  try {
    renderer = new WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(SIZE, SIZE, false);
    renderer.setPixelRatio(1);
  } catch {
    return;
  }

  const scene = new Scene();
  // Flat and bright, to match the world's own unlit-looking art direction. A
  // portrait lit differently from the game would be a picture of a different
  // creature.
  scene.add(new AmbientLight(0xffffff, 1.5));
  const key = new DirectionalLight(0xffffff, 1.5);
  key.position.set(3, 5, 4);
  scene.add(key);

  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const box = new Box3();
  const size = new Vector3();
  const centre = new Vector3();

  try {
    for (let slot = 1; ; slot += 1) {
      const definition = mountForSlot(slot);
      // `mountForSlot` falls back to the starter for an unknown slot, which is
      // exactly how this loop knows it has reached the end of the roster.
      if (definition.slot !== slot) break;

      const model = new MountModel(definition);
      // Three-quarter FRONT view: enough of the flank to read the body and
      // enough of the face to read the species. The camera below sits out along
      // +X and +Z, so turning the mount's own forward (+Z) a quarter turn
      // toward it is what puts its face in shot - straight-on side loses the
      // head and straight-on back loses everything.
      model.root.rotation.y = Math.PI * 0.28;
      scene.add(model.root);

      box.setFromObject(model.root);
      box.getSize(size);
      box.getCenter(centre);

      // Framed from the model's OWN bounds rather than a fixed zoom, so a
      // cockroach fills its portrait exactly as much as a dragon fills its
      // own - otherwise the early mounts are specks and the late ones overflow.
      // Half the largest dimension, with a tenth of margin. Tighter than that
      // and a dragon's wings clip the frame; looser and a cockroach is a speck.
      const extent = Math.max(size.x, size.y, size.z) * 0.58;
      camera.left = -extent;
      camera.right = extent;
      camera.top = extent;
      camera.bottom = -extent;
      camera.position.set(centre.x + 40, centre.y + 18, centre.z + 40);
      camera.lookAt(centre);
      camera.updateProjectionMatrix();

      renderer.render(scene, camera);
      CACHE.set(slot, renderer.domElement.toDataURL('image/png'));

      scene.remove(model.root);
      model.dispose();
    }
  } catch {
    // A partial roster is fine: every slot that did render has a portrait and
    // the rest fall back to the coloured card.
  }

  // The context goes immediately. Holding a second renderer alive for the
  // whole session to serve fourteen images that never change would be the most
  // expensive thing in the HUD.
  renderer.dispose();
  renderer.forceContextLoss();
};
