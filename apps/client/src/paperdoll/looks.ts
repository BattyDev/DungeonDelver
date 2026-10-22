// Character looks for the game: the studio's default block-ins, built frame by frame in the background,
// with any look sent from the studio replacing them.
import type { Character, Race, Sex } from '@delver/rules';
import {
  ANIMS,
  F,
  GAME_CLASS_LOOK,
  LOOK_CLASSES,
  MIRROR_SRC,
  PRESETS,
  PX,
  RACES,
  bodyKey,
} from './model';
import type { AnimId, LookClass, Slot } from './model';
import { blockGear } from './pose';
import { readWardrobe, wardrobeId } from './wardrobe';

export interface Look {
  race: Race;
  sex: Sex;
  cls: LookClass;
  hair: string;
  hairColor: string;
  beard: boolean;
  /** Use art sent from the studio for this body and class, when there is some. */
  custom?: boolean;
}
export interface LayerSpec {
  slot: Slot;
  style: string;
  color: string;
  behind: number[];
}
/** The combat camera: fighters are drawn facing east, toward the enemy line. */
export const COMBAT_DIR = 6;

export const lookKey = (l: Look) =>
  [l.race, l.sex, l.cls, l.hair, l.hairColor, l.beard ? 'b' : '', l.custom ? 'c' : ''].join('|');
export const defaultLook = (race: Race, sex: Sex, cls: LookClass): Look => ({
  race,
  sex,
  cls,
  hair: sex === 'F' ? 'ponytail' : 'short',
  hairColor: RACES[race].hair,
  beard: sex === 'M' && race === 'dwarf',
});
export function characterLook(c: Pick<Character, 'classId' | 'appearance'>, custom = false): Look {
  const a = c.appearance ?? { race: 'human', sex: 'M' };
  return { ...defaultLook(a.race, a.sex, GAME_CLASS_LOOK[c.classId]), custom };
}
const RACE_LIST = Object.keys(RACES) as Race[];
/** A random default body for a class, for filling the hall. */
export function randomLook(cls: LookClass, rand: () => number = Math.random): Look {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const race = pick(RACE_LIST),
    sex = pick(['F', 'M'] as const);
  return {
    ...defaultLook(race, sex, cls),
    hair: pick(sex === 'F' ? ['ponytail', 'long', 'bun'] : ['short', 'short', 'long']),
    beard: sex === 'M' && (race === 'dwarf' || rand() < 0.3),
  };
}
/** Base body, hair and the class's starter gear, bottom to top. Gear the preset hides stays off. */
export function lookLayers(look: Look): LayerSpec[] {
  const layers: LayerSpec[] = [{ slot: 'base', style: 'body', color: '#000000', behind: [] }];
  for (const [slot, style, color, behind, hidden] of PRESETS[look.cls].gear)
    if (!hidden) layers.push({ slot, style, color, behind: behind ?? [] });
  // Hair hangs over clothing, with headwear and held objects above it. Putting
  // every hair pixel below the chest left only stray fragments of the ponytail.
  const headwear = layers.findIndex((l) =>
    ['helmet', 'weapon', 'offhand', 'back'].includes(l.slot),
  );
  layers.splice(headwear < 0 ? layers.length : headwear, 0, {
    slot: 'hair',
    style: look.hair,
    color: look.hairColor,
    behind: [],
  });
  // A beard lies over the chest piece but under anything held.
  if (look.beard) {
    const held = layers.findIndex(
      (l) => l.slot === 'weapon' || l.slot === 'offhand' || l.slot === 'back',
    );
    layers.splice(held < 0 ? layers.length : held, 0, {
      slot: 'beard',
      style: 'full',
      color: look.hairColor,
      behind: [],
    });
  }
  return layers;
}
export const lookAnims = (look: Look): AnimId[] => LOOK_CLASSES[look.cls].anims;

/** Copies the opaque pixels of `src` over `dst`, optionally flipped left to right. */
export function overlay(dst: Uint8ClampedArray, src: Uint8ClampedArray, flip = false) {
  for (let y = 0; y < F; y++)
    for (let x = 0; x < F; x++) {
      const si = (y * F + (flip ? F - 1 - x : x)) * 4;
      if (!src[si + 3]) continue;
      const di = (y * F + x) * 4;
      dst[di] = src[si];
      dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2];
      dst[di + 3] = 255;
    }
}

/** Anything that hands out character frames: a built look, or the studio's live drawing. */
export interface FrameSource {
  frame(anim: AnimId, dir: number, f: number): Uint8ClampedArray | undefined;
  frameNow(anim: AnimId, dir: number, f: number): Uint8ClampedArray;
  warm(): void;
  readonly version: number;
}
interface Unit {
  doll: Doll;
  anim: AnimId;
  dir: number;
}
const queue: Unit[] = [];
const dolls = new Map<string, Doll>();

/** Every frame of one look. Frames are drawn on demand, one animation direction at a time. */
export class Doll implements FrameSource {
  private frames = new Map<string, Uint8ClampedArray>();
  private units = new Set<string>();
  readonly layers: LayerSpec[];
  constructor(readonly look: Look) {
    this.layers = lookLayers(look);
    if (look.custom) void this.loadCustom();
  }
  /** The frame, or undefined while it is still being drawn (the request moves it up the queue). */
  frame(anim: AnimId, dir: number, f: number): Uint8ClampedArray | undefined {
    const key = `${anim}|${dir}|${f}`;
    const found = this.frames.get(key);
    if (found) return found;
    const src = MIRROR_SRC[dir] ?? dir;
    const source = this.frames.get(`${anim}|${src}|${f}`);
    if (source && src !== dir) {
      const flipped = new Uint8ClampedArray(PX);
      overlay(flipped, source, true);
      this.frames.set(key, flipped);
      return flipped;
    }
    this.request(anim, src, true);
    return undefined;
  }
  /** Draws the frame immediately (for portraits and still previews). */
  frameNow(anim: AnimId, dir: number, f: number): Uint8ClampedArray {
    const src = MIRROR_SRC[dir] ?? dir;
    if (!this.frames.has(`${anim}|${src}|${f}`)) this.build(anim, src);
    return this.frame(anim, dir, f)!;
  }
  request(anim: AnimId, dir: number, urgent = false) {
    const id = `${anim}|${dir}`;
    if (this.units.has(id)) return;
    const i = queue.findIndex((u) => u.doll === this && u.anim === anim && u.dir === dir);
    if (i >= 0) {
      if (urgent && i > 0) queue.unshift(...queue.splice(i, 1));
      return;
    }
    const unit = { doll: this, anim, dir };
    if (urgent) queue.unshift(unit);
    else queue.push(unit);
  }
  /** Queues walking in every direction plus the class's combat animations. */
  warm() {
    for (const dir of [0, 1, 2, 3, 4]) {
      this.request('idle', dir);
      this.request('walk', dir);
    }
    for (const anim of lookAnims(this.look)) if (ANIMS[anim].combat) this.request(anim, COMBAT_DIR);
  }
  build(anim: AnimId, dir: number) {
    const id = `${anim}|${dir}`;
    if (this.units.has(id)) return;
    this.units.add(id);
    const bk = bodyKey(this.look.race, this.look.sex),
      tmp = new Uint8ClampedArray(PX);
    // Walking layer overrides are whole-layer choices. In combat, articulated
    // arms cross the torso: blockGear's per-pixel body depth resolves the held
    // items, without hiding a staff/arrow behind its own raised hand as well.
    const behind = (l: LayerSpec) => !ANIMS[anim].combat && l.behind.includes(dir);
    const order = [...this.layers.filter(behind), ...this.layers.filter((l) => !behind(l))];
    for (let f = 0; f < ANIMS[anim].frames; f++) {
      const key = `${anim}|${dir}|${f}`;
      if (this.frames.has(key)) continue;
      const out = new Uint8ClampedArray(PX);
      for (const layer of order) {
        blockGear(tmp, anim, f, dir, bk, layer.slot, layer.color, layer.style);
        overlay(out, tmp);
      }
      this.frames.set(key, out);
    }
  }
  private async loadCustom() {
    const entry = readWardrobe()[wardrobeId(bodyKey(this.look.race, this.look.sex), this.look.cls)];
    if (!entry || typeof document === 'undefined') return;
    for (const [anim, sheet] of Object.entries(entry.anims) as [
      AnimId,
      { dirs: number[]; sheet: string },
    ][]) {
      if (!ANIMS[anim] || !sheet) continue;
      try {
        const image = new Image();
        image.src = sheet.sheet;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(image, 0, 0);
        // The game shows combat from one camera; whichever side was drawn plays there.
        const dirs = ANIMS[anim].combat ? sheet.dirs.map(() => COMBAT_DIR) : sheet.dirs;
        dirs.forEach((dir, row) => {
          for (let f = 0; f < ANIMS[anim].frames && (f + 1) * F <= image.width; f++) {
            const data = ctx.getImageData(f * F, row * F, F, F).data;
            this.frames.set(`${anim}|${dir}|${f}`, new Uint8ClampedArray(data));
          }
          this.units.add(`${anim}|${dir}`);
        });
        this.version++;
      } catch {
        // A broken sheet leaves the default art in place.
      }
    }
  }
  /** Bumps when custom art replaces frames already handed out. */
  version = 0;
}
export function dollFor(look: Look): Doll {
  const key = lookKey(look);
  let doll = dolls.get(key);
  if (!doll) {
    doll = new Doll(look);
    dolls.set(key, doll);
  }
  return doll;
}
/** Forget built looks, e.g. after the studio sends new art. */
export const resetDolls = () => {
  dolls.clear();
  queue.length = 0;
};
/** Draws queued frames for up to `budgetMs`. Call once per animation frame. */
export function pumpDolls(budgetMs = 6) {
  const start = performance.now();
  while (queue.length && performance.now() - start < budgetMs) {
    const unit = queue.shift()!;
    unit.doll.build(unit.anim, unit.dir);
  }
}

const scratch = typeof document !== 'undefined' ? document.createElement('canvas') : undefined;
/** A still of a look as a data URL, for HTML portraits. */
export function lookImage(look: Look, anim: AnimId = 'idle', dir = 0, frame = 0): string {
  if (!scratch) return '';
  scratch.width = scratch.height = F;
  const ctx = scratch.getContext('2d')!;
  ctx.putImageData(new ImageData(dollFor(look).frameNow(anim, dir, frame).slice(), F, F), 0, 0);
  return scratch.toDataURL();
}
/** Head and shoulders, cropped square from the idle frame facing the camera. */
export function lookPortrait(look: Look, size = 28): string {
  if (!scratch) return '';
  const frame = dollFor(look).frameNow('idle', 0, 0);
  let top = F;
  for (let i = 3; i < frame.length; i += 4)
    if (frame[i]) top = Math.min(top, Math.floor(i / 4 / F));
  const full = document.createElement('canvas');
  full.width = full.height = F;
  full.getContext('2d')!.putImageData(new ImageData(frame.slice(), F, F), 0, 0);
  scratch.width = scratch.height = size;
  const ctx = scratch.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(full, 32 - size / 2, Math.max(0, top - 2), size, size, 0, 0, size, size);
  return scratch.toDataURL();
}
