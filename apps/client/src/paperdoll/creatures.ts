// Creature art uses the dolls' rasterizer, skeleton, frame size and one-pixel outline.
// Pure RGBA buffers keep the same art usable in the world, combat and portraits.
import { ANIMS, F, MIRROR_SRC, PX, hexRgb } from './model';
import type { AnimId, Slot } from './model';
import { overlay } from './looks';
import type { FrameSource } from './looks';
import { blockGear, raster, skeleton } from './pose';
import type { Shape, SP } from './pose';

export const CREATURE_IDS = ['slime', 'bat', 'skeleton', 'wisp', 'cultist', 'warden'] as const;
export type CreatureId = (typeof CREATURE_IDS)[number];
export const isFlying = (type: string) => type === 'bat' || type === 'wisp';
type Pt = { x: number; y: number };
type Gear = [Slot, string, string];
const GEAR: Record<'cultist' | 'warden', Gear[]> = {
  cultist: [
    ['boots', 'boots', '#3a3848'],
    ['chest', 'robe', '#76434f'],
    ['helmet', 'hood', '#4e303d'],
    ['weapon', 'staff', '#9b6662'],
  ],
  warden: [
    ['pants', 'trousers', '#303439'],
    ['boots', 'boots', '#4a4a55'],
    ['chest', 'plate', '#666c72'],
    ['gloves', 'gloves', '#9b8263'],
    ['helmet', 'helm', '#9b8263'],
    ['offhand', 'shield', '#62404a'],
    ['weapon', 'mace', '#9b8263'],
  ],
};

function humanoid(type: CreatureId, anim: AnimId, dir: number, f: number) {
  const out = new Uint8ClampedArray(PX),
    tmp = new Uint8ClampedArray(PX);
  const body = type === 'warden' ? 'orcM' : 'humanM';
  const sk = skeleton(anim, f, dir, body),
    shapes: Shape[] = [];
  const circle = (p: Pt, r: number, color: string, d = sk.head.d + 2) =>
    shapes.push({ circle: p, r, color: hexRgb(color), d });
  const line = (a: Pt, b: Pt, r: number, color: string, d = 0) =>
    shapes.push({ a, b, r, color: hexRgb(color), d });
  if (type === 'skeleton') {
    for (const sg of sk.segs) {
      if (sg.part === 'ear') continue;
      line(sg.a, sg.b, sg.part === 'hips' ? 2 : 1.25, sg.d < -1 ? '#a89f86' : '#d8d0b8', sg.d);
      if (sg.part === 'forearm' || sg.part === 'shin') circle(sg.a, 1.7, '#e6dcc0', sg.d);
    }
    const torso = sk.segs.find((s) => s.part === 'torso')!;
    for (const t of [0.35, 0.52, 0.69]) {
      const y = torso.la.y + (torso.lb.y - torso.la.y) * t;
      const z = torso.la.z + (torso.lb.z - torso.la.z) * t;
      // Ribs wrap around the chest, so they keep their width in side views.
      for (let j = 0; j < 12; j++) {
        const a = (j * Math.PI) / 6,
          b = ((j + 1) * Math.PI) / 6;
        line(
          sk.toScreen({ x: Math.cos(a) * 4, y, z: z + Math.sin(a) * 2.8 }),
          sk.toScreen({ x: Math.cos(b) * 4, y, z: z + Math.sin(b) * 2.8 }),
          0.65,
          '#d8d0b8',
          torso.d + 0.2,
        );
      }
    }
    circle(sk.head, sk.head.r, '#d8d0b8', sk.head.d);
    raster(
      out,
      shapes.sort((a, b) => (a.d ?? 0) - (b.d ?? 0)),
    );
    blockGear(tmp, anim, f, dir, body, 'weapon', '#8d8aa0', 'sword');
    overlay(out, tmp);
  } else {
    blockGear(out, anim, f, dir, body, 'base', '#000000');
    if (type === 'warden')
      for (let i = 0; i < PX; i += 4)
        if (out[i] === 143 && out[i + 1] === 179 && out[i + 2] === 84) out.set([135, 144, 139], i);
    for (const [slot, style, color] of GEAR[type as 'cultist' | 'warden']) {
      blockGear(tmp, anim, f, dir, body, slot, color, style);
      if (type === 'cultist' && slot === 'weapon')
        for (let i = 0; i < PX; i += 4)
          if (tmp[i] === 79 && tmp[i + 1] === 179 && tmp[i + 2] === 168) tmp.set([217, 101, 97], i);
      overlay(out, tmp);
    }
    // Mask the exposed face inside the hood/helm, leaving its silhouette intact.
    const h = sk.head;
    for (let y = Math.floor(h.y - h.r * 0.35); y < h.y + h.r * 0.65; y++)
      for (let x = Math.floor(h.x - h.r * 0.8); x < h.x + h.r * 0.8; x++) {
        if (x < 0 || y < 0 || x >= F || y >= F) continue;
        const i = (y * F + x) * 4;
        if (out[i + 3] && sk.facing.fz >= -0.3) out.set([36, 31, 42], i);
      }
  }
  // Eyes are projected on the skull/mask, and disappear when facing away.
  const dots: { x: number; y: number; c: [number, number, number] }[] = [];
  for (const side of [-1, 1]) {
    const h = sk.headLocal;
    const p: SP = sk.toScreen({ x: h.x + side * sk.HR * 0.4, y: h.y, z: h.z + sk.HR * 0.72 });
    if (p.d <= sk.head.d + sk.HR * 0.3) continue;
    dots.push({ x: p.x, y: p.y, c: hexRgb(type === 'skeleton' ? '#1b1a24' : '#f19174') });
    if (type === 'skeleton') dots.push({ x: p.x, y: p.y + 1, c: [27, 26, 36] });
  }
  for (const { x, y, c } of dots) {
    if (x >= 0 && y >= 0 && x < F && y < F) out.set(c, (Math.floor(y) * F + Math.floor(x)) * 4);
  }
  if (type === 'warden') {
    // The key emblem distinguishes the boss from the party's plated tank.
    const t = sk.segs.find((s) => s.part === 'torso')!;
    const p = { x: (t.a.x + t.b.x) / 2, y: (t.a.y + t.b.y) / 2 };
    shapes.length = 0;
    circle(p, 2.1, '#e5ba72');
    circle(p, 0.8, '#62404a');
    line({ x: p.x, y: p.y + 2 }, { x: p.x, y: p.y + 7 }, 0.6, '#e5ba72', sk.head.d + 2);
    line({ x: p.x, y: p.y + 6 }, { x: p.x + 2, y: p.y + 6 }, 0.6, '#e5ba72', sk.head.d + 2);
    raster(tmp, shapes, { innerEdges: false });
    overlay(out, tmp);
  }
  return out;
}

function creature(type: CreatureId, anim: AnimId, dir: number, f: number) {
  if (type === 'skeleton' || type === 'cultist' || type === 'warden')
    return humanoid(type, anim, dir, f);
  const shapes: Shape[] = [],
    out = new Uint8ClampedArray(PX);
  const ellipse = (x: number, y: number, rx: number, ry: number, color: string) =>
    shapes.push({ circle: { x, y }, r: 1, rx, ry, color: hexRgb(color) });
  const line = (x: number, y: number, xx: number, yy: number, r: number, color: string) =>
    shapes.push({ a: { x, y }, b: { x: xx, y: yy }, r, color: hexRgb(color) });
  const phase = [0, 1, 0, -1][f % 4];
  const hurt = anim === 'hurt',
    death = anim === 'death';
  const fall = death ? f / (ANIMS.death.frames - 1) : 0;
  const face = dir === 4 ? 0 : dir === 2 ? -1 : dir === 6 ? 1 : dir < 4 ? -0.5 : 0.5;
  if (type === 'slime') {
    const rx = 16 + phase + fall * 7,
      ry = 11 - phase - fall * 8;
    const cy = 61 - ry;
    ellipse(32, cy, rx, ry, hurt ? '#b5d17a' : '#6b8f3a');
    ellipse(32, cy + ry * 0.45, rx * 0.92, ry * 0.5, '#4d6b2c');
    ellipse(27, cy - ry * 0.45, 5, Math.max(1, ry * 0.25), '#b5d17a');
    if (fall < 0.7 && dir !== 4) {
      for (const s of [-1, 1])
        ellipse(
          32 + face * 4 + s * (Math.abs(face) === 1 ? 2 : 6),
          cy,
          1,
          hurt ? 0.6 : 1.5,
          '#1b1a24',
        );
      line(30 + face * 4, cy + 5, 34 + face * 4, cy + 5, 0.6, '#1b1a24');
    }
  } else if (type === 'bat') {
    const cy = 40 + phase * 1.5 + fall * 17;
    const span = (20 - Math.abs(phase) * 5 - fall * 10) * (Math.abs(face) === 1 ? 0.65 : 1);
    const lift = phase * 8 + fall * 5;
    // Fan-shaped membranes are filled with adjacent ribs, all on the native grid.
    for (const s of [-1, 1]) {
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        line(
          32 + s * 4,
          cy,
          32 + s * (8 + span * t),
          cy - 10 + lift + Math.sin(t * Math.PI * 3) * 3,
          1.3,
          '#725779',
        );
      }
      line(32 + s * 4, cy - 3, 32 + s * (span + 8), cy - 10 + lift, 0.6, '#a17b9c');
      ellipse(32 + s * 4, cy - 8, 2, 5 - fall * 3, '#403444');
    }
    ellipse(32, cy + 1, 6 + fall * 4, 8 - fall * 4, hurt ? '#a17b9c' : '#403444');
    if (fall < 0.8 && dir !== 4) {
      for (const s of Math.abs(face) === 1 ? [0] : [-1, 1]) {
        ellipse(32 + face * 2 + s * 2.5, cy - 2, 0.9, 0.9, '#f2cf7a');
        line(32 + s * 2, cy + 3, 32 + s * 2, cy + 5, 0.6, '#e6dcc0');
      }
    }
  } else {
    const cy = 42 + phase * 2 + fall * 16,
      h = 14 * (1 - fall) + 2;
    // An ember core with three tongues and drifting sparks, rather than a smooth glow.
    for (const [x, lean, size] of [
      [23, -3, 0.7],
      [32, phase * 3, 1.2],
      [41, 4, 0.8],
    ])
      line(x, cy + 3, x + lean, cy - h * size, 3 * (1 - fall) + 0.7, '#d9994a');
    ellipse(32, cy + 3, 10 - fall * 5, 12 - fall * 10, hurt ? '#f6d7bd' : '#d9994a');
    ellipse(32, cy + 4, 5 - fall * 3, 8 - fall * 6, '#f2cf7a');
    ellipse(32, cy + 6, 2, 4 - fall * 3, '#fff3c4');
    if (fall < 0.7) {
      ellipse(21 + (f % 3), cy - 13, 0.7, 1.1, '#f2cf7a');
      ellipse(43 - (f % 2), cy - 17, 0.7, 1.1, '#d9994a');
      if (dir !== 4)
        for (const s of [-1, 1]) ellipse(32 + face * 2 + s * 3, cy, 0.8, 1.1, '#49332b');
    }
  }
  raster(out, shapes, { innerEdges: false });
  return out;
}

class Creature implements FrameSource {
  readonly version = 0;
  private frames = new Map<string, Uint8ClampedArray>();
  constructor(readonly type: CreatureId) {}
  frame(anim: AnimId, dir: number, f: number) {
    return this.frameNow(anim, dir, f);
  }
  frameNow(anim: AnimId, dir: number, f: number): Uint8ClampedArray {
    const key = `${anim}|${dir}|${f}`;
    let frame = this.frames.get(key);
    if (!frame) {
      const source = MIRROR_SRC[dir];
      if (source === undefined) frame = creature(this.type, anim, dir, f);
      else {
        frame = new Uint8ClampedArray(PX);
        overlay(frame, this.frameNow(anim, source, f), true);
      }
      this.frames.set(key, frame);
    }
    return frame;
  }
  warm() {
    this.frameNow('idle', 0, 0);
  }
}
const cache = new Map<CreatureId, Creature>();
export function creatureFor(id: string): FrameSource {
  const type = CREATURE_IDS.includes(id as CreatureId) ? (id as CreatureId) : 'cultist';
  let source = cache.get(type);
  if (!source) {
    source = new Creature(type);
    cache.set(type, source);
  }
  return source;
}
