import * as THREE from 'three';

export type Billboard = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
/**
 * The camera always looks due north and down a little, so the flat art is foreshortened.
 * Stretching it this much restores its drawn proportions.
 */
const LEAN = 1.06;
/**
 * An upright picture facing the camera. Unlike a THREE.Sprite, which tilts back toward a
 * raised camera, it stays vertical, so a character standing against a wall never leans into it.
 * `anchorY` is the fraction of the height that sits on the ground (feet below the image bottom).
 */
export function billboard(map: THREE.Texture, w: number, h: number, anchorY = 0): Billboard {
  const geometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5 - anchorY, 0);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.5 }),
  );
  mesh.scale.set(w, h * LEAN, 1);
  return mesh;
}
