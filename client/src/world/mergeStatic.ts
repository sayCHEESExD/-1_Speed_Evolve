import { Mesh, type BufferGeometry, type Material, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Collapse a structure's static meshes into one per material.
 *
 * The four camp structures - the stelae, the training rigs, the traders' huts
 * and the upgrade plates - are each built from a hundred-odd boxes, and built
 * that way ON PURPOSE: a hut assembled from posts, lashings, thatch courses
 * and a counter is far easier to author and to read than the same hut as one
 * hand-merged blob. But six hundred and ninety-five separate meshes is six
 * hundred and ninety-five draw calls, and the camp went from about two hundred
 * and thirty to eight hundred and sixty the moment they landed.
 *
 * So they are authored loose and merged here. Everything that never changes
 * becomes one mesh per material; anything that DOES change - a belt that
 * scrolls, a plate that re-tints with the wallet, a canvas that redraws when
 * the standings move - is named in `keep` and left alone.
 *
 * The world matrix is baked in, so a part positioned inside three nested
 * groups ends up exactly where it was. Geometry is CLONED first, because these
 * structures share one box between two dozen instances and applying a matrix
 * to the shared original would move all of them.
 *
 * @param root      the structure's own root; merged meshes are added back to it
 * @param keep      meshes that must survive as themselves, and their children
 * @param geometries the caller's disposal list, which the merged results join
 */
export const mergeStatic = (
  root: Object3D,
  keep: ReadonlySet<Object3D>,
  geometries: BufferGeometry[],
): void => {
  root.updateMatrixWorld(true);
  root.updateMatrix();

  const byMaterial = new Map<Material, BufferGeometry[]>();
  const doomed: Mesh[] = [];

  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    // A kept mesh, or anything hanging off one, stays exactly as it is.
    for (let walk: Object3D | null = mesh; walk; walk = walk.parent) {
      if (keep.has(walk)) return;
      if (walk === root) break;
    }
    if (Array.isArray(mesh.material)) return;

    const clone = mesh.geometry.clone();
    // Into the ROOT's space rather than the world's, so the structure can
    // still be moved afterwards.
    clone.applyMatrix4(root.matrixWorld.clone().invert().multiply(mesh.matrixWorld));
    const list = byMaterial.get(mesh.material) ?? [];
    list.push(clone);
    byMaterial.set(mesh.material, list);
    doomed.push(mesh);
  });

  for (const mesh of doomed) mesh.removeFromParent();

  for (const [material, list] of byMaterial) {
    const merged = mergeGeometries(list, false);
    for (const geometry of list) geometry.dispose();
    if (!merged) continue;
    geometries.push(merged);
    const mesh = new Mesh(merged, material);
    // The structures are furniture: they take a shadow and the things standing
    // on them cast one, which is what roots them to the ground.
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
};
