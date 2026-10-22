// The changing room: a small corner of the Gathering Hall where the character being drawn
// walks around in eight directions and tries out combat moves.
import * as THREE from 'three';
import { DollSprite } from '../scene/doll-sprite';
import { billboard } from '../scene/billboard';
import { floorTexture, prop, wallTexture, capTexture } from '../scene/pixels';
import type { PropId } from '../scene/pixels';
import type { AnimId } from '../paperdoll/model';
import type { FrameSource } from '../paperdoll/looks';
import { moveOnGrid } from '../scene/grid';

const ROOM = [
  '#########',
  '#.......#',
  '#.......#',
  '#.......#',
  '#.......#',
  '#.......#',
  '#########',
];
/** A square loop around the room passes through every direction. */
const LOOP = [
  { x: 2, z: 2 },
  { x: 6, z: 2 },
  { x: 6, z: 5 },
  { x: 4, z: 3.5 },
  { x: 2, z: 5 },
];

export class ChangingRoom {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
  private doll: DollSprite;
  private pos = { x: 4, z: 4 };
  private held = new Set<string>();
  private waypoint = 0;
  private last = 0;
  private observer: ResizeObserver;
  autoWalk = true;
  constructor(
    private host: HTMLElement,
    source: FrameSource,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor('#120f0d');
    host.append(this.renderer.domElement);
    this.scene.add(new THREE.AmbientLight('#ffe2bd', 1.9));
    const sun = new THREE.DirectionalLight('#fff0cf', 1.5);
    sun.position.set(-3, 10, 8);
    this.scene.add(sun);
    this.build();
    this.doll = new DollSprite(source);
    this.doll.sprite.position.set(this.pos.x, 0, this.pos.z);
    this.scene.add(this.doll.sprite);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    host.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
        this.held.add(key);
        this.autoWalk = false;
        host.dispatchEvent(new CustomEvent('autowalk', { detail: false }));
      }
    });
    host.addEventListener('keyup', (e) => this.held.delete(e.key.toLowerCase()));
    host.addEventListener('blur', () => this.held.clear());
  }
  private build() {
    const tile = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const cap = new THREE.MeshLambertMaterial({ map: capTexture('hall') });
    ROOM.forEach((row, z) =>
      [...row].forEach((t, x) => {
        if (t === '#') {
          if (z === ROOM.length - 1) return;
          const side = new THREE.MeshLambertMaterial({ map: wallTexture('hall', (x + z) % 2) });
          for (let layer = 0; layer < 2; layer++) {
            const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [
              side,
              side,
              cap,
              cap,
              side,
              side,
            ]);
            wall.position.set(x, layer + 0.5, z);
            this.scene.add(wall);
          }
          return;
        }
        const floor = new THREE.Mesh(
          tile,
          new THREE.MeshLambertMaterial({ map: floorTexture('hall', (x * 3 + z) % 4, 'wood') }),
        );
        floor.position.set(x, 0, z);
        this.scene.add(floor);
      }),
    );
    const props: [PropId, number, number, number][] = [
      ['wardrobe', 2, 0.55, 0],
      ['mirror', 5, 0.55, 0],
      ['plant', 7, 1.4, 0],
      ['chest', 1.4, 5.4, 0],
      ['torch', 3.5, 0.52, 0.85],
      ['torch', 6.5, 0.52, 0.85],
    ];
    for (const [id, x, z, y] of props) {
      const p = prop(id, 'hall');
      const sprite = billboard(p.texture, p.w, p.h);
      sprite.position.set(x, y, z);
      this.scene.add(sprite);
    }
  }
  private resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  /** New art arrived: redraw from the source. */
  setSource(source: FrameSource) {
    this.doll.setLook(source);
  }
  /** Plays a combat move, facing the combat camera direction. */
  try(anim: AnimId, dir: number) {
    this.doll.play(anim, dir, anim === 'death', () => undefined);
    if (anim === 'death') window.setTimeout(() => this.doll.play('idle', dir), 2200);
  }
  frame(ms: number) {
    const dt = this.last ? Math.min(0.05, (ms - this.last) / 1000) : 0;
    this.last = ms;
    let dx = 0,
      dz = 0;
    const key = (a: string, b: string) => Number(this.held.has(a) || this.held.has(b));
    dx = key('d', 'arrowright') - key('a', 'arrowleft');
    dz = key('s', 'arrowdown') - key('w', 'arrowup');
    if (this.autoWalk && !this.doll.playing && !dx && !dz) {
      const goal = LOOP[this.waypoint];
      const gx = goal.x - this.pos.x,
        gz = goal.z - this.pos.z,
        d = Math.hypot(gx, gz);
      if (d < 0.05) this.waypoint = (this.waypoint + 1) % LOOP.length;
      else {
        dx = gx / d;
        dz = gz / d;
      }
    }
    const length = Math.hypot(dx, dz);
    if (length && !this.doll.playing)
      this.pos = moveOnGrid(ROOM, this.pos, (dx / length) * 2.6 * dt, (dz / length) * 2.6 * dt);
    this.doll.sprite.position.set(this.pos.x, 0, this.pos.z);
    this.doll.update(dt);
    this.camera.position.set(4, 4.4, 9.6);
    this.camera.lookAt(4, 0.6, 3.1);
    this.renderer.render(this.scene, this.camera);
  }
}
