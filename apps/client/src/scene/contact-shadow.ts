import * as THREE from 'three';

let map: THREE.CanvasTexture | undefined;
/** A ground-plane contact shadow, shared by upright billboards and the changing room. */
export function contactShadow() {
  if (!map) {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 16);
    g.addColorStop(0, '#08091099');
    g.addColorStop(0.5, '#08091066');
    g.addColorStop(1, '#08091000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    map = new THREE.CanvasTexture(c);
  }
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }),
  );
  mesh.scale.set(0.7, 1, 0.45);
  return mesh;
}
