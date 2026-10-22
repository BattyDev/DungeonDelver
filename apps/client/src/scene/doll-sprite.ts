import * as THREE from 'three';
import { ANIMS, F, dirIndex } from '../paperdoll/model';
import type { AnimId } from '../paperdoll/model';
import { dollFor } from '../paperdoll/looks';
import type { FrameSource, Look } from '../paperdoll/looks';

/** World height of one 64 px frame. A human stands about 1.5 units tall inside it. */
export const DOLL_SIZE = 1.85;

/**
 * A billboarded paper doll: walks and idles in eight directions from its ground velocity,
 * and plays one-shot combat animations on request.
 */
export class DollSprite {
  readonly sprite: THREE.Sprite;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private doll: FrameSource;
  private anim: AnimId = 'idle';
  private dir = 0;
  private clock = Math.random() * 2;
  private once?: { anim: AnimId; hold: boolean; done?: () => void };
  private shown = '';
  private last?: THREE.Vector3;
  constructor(look: Look | FrameSource, size = DOLL_SIZE) {
    this.canvas.width = this.canvas.height = F;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.texture, transparent: true, alphaTest: 0.5 }),
    );
    // Feet sit on row 62.5 of the frame: anchor there so position.y is the ground.
    this.sprite.center.set(0.5, 1.5 / F);
    this.sprite.scale.set(size, size, 1);
    this.doll = 'race' in look ? dollFor(look) : look;
    this.doll.warm();
    this.draw();
  }
  setLook(look: Look | FrameSource) {
    this.doll = 'race' in look ? dollFor(look) : look;
    this.doll.warm();
    this.shown = '';
  }
  face(dir: number) {
    this.dir = dir;
  }
  /** Plays an animation once. `hold` keeps the last frame (for death) until another animation starts. */
  play(anim: AnimId, dir = this.dir, hold = false, done?: () => void) {
    this.dir = dir;
    this.anim = anim;
    this.clock = 0;
    this.once = { anim, hold, done };
  }
  get playing() {
    return !!this.once && !this.once.hold;
  }
  /** Advances the animation from the sprite's movement since the last update. */
  update(dt: number) {
    const pos = this.sprite.position;
    let speed = 0;
    if (this.last && dt > 0) {
      const vx = (pos.x - this.last.x) / dt,
        vz = (pos.z - this.last.z) / dt;
      speed = Math.hypot(vx, vz);
      if (speed > 0.35 && !this.once) this.dir = dirIndex(vx, vz);
    }
    this.last = (this.last ?? new THREE.Vector3()).copy(pos);
    if (!this.once) {
      const next: AnimId = speed > 0.35 ? 'walk' : 'idle';
      if (next !== this.anim) {
        this.anim = next;
        this.clock = 0;
      }
    }
    const def = ANIMS[this.anim];
    this.clock +=
      dt * def.fps * (this.anim === 'walk' ? Math.min(1.4, Math.max(0.7, speed / 3.5)) : 1);
    if (this.once && this.clock >= def.frames) {
      if (this.once.hold) this.clock = def.frames - 1;
      else {
        const done = this.once.done;
        this.once = undefined;
        this.anim = 'idle';
        this.clock = 0;
        done?.();
      }
    }
    this.draw();
  }
  private draw() {
    const def = ANIMS[this.anim];
    const f = def.loop
      ? Math.floor(this.clock) % def.frames
      : Math.min(def.frames - 1, Math.floor(this.clock));
    let frame = this.doll.frame(this.anim, this.dir, f),
      key = `${this.anim}|${this.dir}|${f}|${this.doll.version}`;
    // While a direction is still being drawn, stand facing the camera.
    if (!frame) {
      frame = this.doll.frame('idle', 0, 0) ?? this.doll.frameNow('idle', 0, 0);
      key = `fallback|${this.doll.version}`;
    }
    if (key === this.shown) return;
    this.shown = key;
    this.ctx.putImageData(new ImageData(frame.slice(), F, F), 0, 0);
    this.texture.needsUpdate = true;
  }
  dispose() {
    this.texture.dispose();
    this.sprite.material.dispose();
  }
}
