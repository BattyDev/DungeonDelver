// Pose guide and block-in shapes, ported from Paper Doll Studio. Pure functions over RGBA buffers,
// so the studio, the game and tests all draw the same pixels.
import { ANIMS, DIRS, F, STYLES, bodyDef, hexRgb } from './model';
import type { AnimId, BodyDef, Slot } from './model';

type RGB = [number, number, number];
interface V3 {
  x: number;
  y: number;
  z: number;
}
/** Screen point plus depth toward the camera. */
export interface SP {
  x: number;
  y: number;
  d: number;
}
interface Pose {
  lean: number;
  tilt: number;
  rot: number;
  breath: number;
  aR: [number, number];
  aL: [number, number];
  lR: [number, number];
  lL: [number, number];
  sA: number;
  sL: number;
}
export type Part =
  | 'torso'
  | 'hips'
  | 'shoulders'
  | 'upperArm'
  | 'forearm'
  | 'thigh'
  | 'shin'
  | 'foot'
  | 'ear';
export interface Seg {
  la: V3;
  lb: V3;
  part: Part;
  side?: 'L' | 'R';
  a: SP;
  b: SP;
  d: number;
}
export interface Skeleton {
  segs: Seg[];
  head: SP & { r: number };
  headLocal: V3;
  HR: number;
  k: number;
  b: BodyDef;
  facing: { fx: number; fz: number };
  toScreen: (p: V3) => SP;
}

const D = Math.PI / 180,
  TILT = 0.28;
const STAND: Pose = {
  lean: 0,
  tilt: 0,
  rot: 0,
  breath: 0,
  aR: [8, 14],
  aL: [8, 14],
  lR: [0, 0],
  lL: [0, 0],
  sA: 12,
  sL: 4,
};
const POSES: Record<AnimId, Partial<Pose>[]> = {
  idle: [
    {},
    { breath: 1, aR: [9, 14], aL: [9, 14] },
    { breath: 2, tilt: -3, aR: [11, 12], aL: [11, 12] },
    { breath: 1 },
  ],
  walk: [
    { lean: 4, lL: [28, 4], lR: [-22, 14], aR: [26, 18], aL: [-22, 6] },
    { lean: 5, lL: [12, 20], lR: [-16, 46], aR: [12, 18], aL: [-8, 8] },
    { lean: 4, lL: [-6, 8], lR: [14, 62], aR: [0, 12], aL: [0, 12] },
    { lean: 4, lR: [28, 4], lL: [-22, 14], aL: [26, 18], aR: [-22, 6] },
    { lean: 5, lR: [12, 20], lL: [-16, 46], aL: [12, 18], aR: [-8, 8] },
    { lean: 4, lR: [-6, 8], lL: [14, 62], aL: [0, 12], aR: [0, 12] },
  ],
  attack: [
    { aR: [40, 95], aL: [18, 40], lL: [14, 6], lR: [-10, 8] },
    { lean: -6, aR: [205, 60], aL: [30, 30], lL: [14, 6], lR: [-12, 10] },
    { lean: -3, aR: [175, 20], aL: [25, 30], lL: [14, 6], lR: [-12, 10] },
    { lean: 8, aR: [95, 8], aL: [-10, 20], lL: [26, 16], lR: [-16, 12] },
    { lean: 14, aR: [22, 4], aL: [-20, 20], lL: [30, 28], lR: [-18, 16] },
    { lean: 4, aR: [45, 60], aL: [10, 30], lL: [16, 8], lR: [-10, 8] },
  ],
  block: [
    { lean: 4, aL: [50, 80], aR: [16, 40], lL: [10, 16], lR: [-8, 16] },
    { lean: 8, aL: [78, 102], aR: [20, 55], lL: [16, 34], lR: [-12, 32] },
    { lean: 5, aL: [74, 104], aR: [20, 55], lL: [14, 30], lR: [-14, 28] },
  ],
  hurt: [
    { lean: -12, tilt: -15, aR: [-12, 24], aL: [-12, 24], sA: 20 },
    { lean: -16, tilt: -8, aR: [-28, 30], aL: [32, 30], lR: [-20, 10], lL: [8, 8], sA: 32 },
    { lean: -4, aR: [4, 16], aL: [4, 16] },
  ],
  death: [
    { lean: -14, tilt: -12, aR: [-30, 20], aL: [40, 20], sA: 40 },
    { lean: 6, lR: [22, 60], lL: [4, 60], aR: [10, 20], aL: [10, 20] },
    { lean: 12, lR: [70, 120], lL: [66, 118], aR: [6, 10], aL: [20, 20] },
    { lean: 10, rot: 38, lR: [50, 80], lL: [40, 70], aR: [40, 10], aL: [60, 10] },
    { rot: 80, lR: [12, 24], lL: [6, 14], aR: [20, 10], aL: [40, 10] },
    { rot: 90, lR: [6, 6], lL: [2, 4], aR: [10, 4], aL: [24, 6] },
  ],
  heal: [
    { aR: [40, 40], aL: [30, 40] },
    { lean: -3, breath: 1, aR: [130, 30], aL: [70, 30] },
    { lean: -6, breath: 2, aR: [165, 10], aL: [95, 10] },
    { lean: -2, breath: 1, aR: [80, 40], aL: [40, 40] },
  ],
  shoot: [
    { aL: [60, 20], aR: [50, 60], lL: [10, 4], lR: [-10, 6] },
    { aL: [85, 5], aR: [85, 40], lL: [10, 4], lR: [-10, 6] },
    { aL: [90, 0], aR: [90, 150], lL: [10, 4], lR: [-10, 6] },
    { lean: -3, aL: [92, 0], aR: [95, 165], lL: [10, 4], lR: [-10, 6] },
    { lean: -2, aL: [90, 0], aR: [70, 100], lL: [10, 4], lR: [-10, 6] },
    { aL: [50, 20], aR: [30, 40], lL: [8, 4], lR: [-8, 6] },
  ],
  dodge: [
    { lean: 6, lL: [20, 40], lR: [-12, 36], aR: [20, 40], aL: [20, 40] },
    { lean: -12, lL: [30, 60], lR: [-30, 40], aR: [-30, 20], aL: [40, 20], sA: 30 },
    { lean: 4, lL: [18, 36], lR: [-16, 30], aR: [20, 30], aL: [20, 30] },
    { lean: 1, aR: [10, 16], aL: [10, 16] },
  ],
  cast: [
    { aR: [30, 40], aL: [30, 40] },
    { lean: -2, aR: [60, 70], aL: [60, 70], sA: 2 },
    { lean: 6, aR: [90, 10], aL: [90, 10], lL: [16, 8], lR: [-10, 8], sA: 4 },
    { lean: 5, aR: [86, 14], aL: [86, 14], lL: [16, 8], lR: [-10, 8], sA: 4 },
    { aR: [30, 30], aL: [30, 30] },
  ],
  channel: [
    { lean: -2, aR: [170, 10], aL: [100, 40] },
    { lean: -2, breath: 1, aR: [172, 8], aL: [104, 36] },
    { lean: -3, breath: 2, aR: [175, 6], aL: [108, 32] },
    { lean: -2, breath: 1, aR: [172, 8], aL: [104, 36] },
  ],
  slash: [
    { aR: [60, 50], aL: [55, 55], lL: [14, 10], lR: [-14, 10], sA: 3 },
    { lean: -5, aR: [190, 30], aL: [185, 35], lL: [14, 10], lR: [-14, 10], sA: 3 },
    { lean: 2, aR: [130, 10], aL: [128, 12], lL: [20, 14], lR: [-14, 10], sA: 3 },
    { lean: 10, aR: [70, 0], aL: [68, 5], lL: [28, 22], lR: [-18, 12], sA: 3 },
    { lean: 14, aR: [10, 10], aL: [10, 15], lL: [30, 30], lR: [-20, 15], sA: 3 },
    { lean: 4, aR: [50, 50], aL: [48, 55], lL: [16, 10], lR: [-12, 8], sA: 3 },
  ],
  parry: [
    { lean: 3, aR: [90, 60], aL: [85, 65], lL: [12, 18], lR: [-10, 16], sA: 3 },
    { lean: 5, aR: [120, 60], aL: [110, 70], lL: [16, 30], lR: [-12, 28], sA: 3 },
    { lean: 3, aR: [116, 62], aL: [106, 72], lL: [14, 26], lR: [-14, 24], sA: 3 },
  ],
};
const poseFor = (anim: AnimId, frame: number): Pose => ({
  ...STAND,
  ...(POSES[anim][frame] ?? {}),
});

// Builds the body in 3D (x = their right, y = down, z = forward), turns it to face `dir`,
// projects it with a slightly raised camera, then anchors the feet to the ground row.
export function skeleton(anim: AnimId, frame: number, dir: number, bkey: string): Skeleton {
  const p = poseFor(anim, frame),
    b = bodyDef(bkey),
    k = b.scale;
  const T = 18 * k + p.breath * 0.8,
    UA = 10 * k,
    FA = 9 * k,
    TH = 13 * k,
    SH = 14 * k;
  const HR = 5.5 * k * b.head,
    NECK = 4.5 * k + HR * 0.18;
  const sw = 7 * k * b.shoulder * (0.7 + 0.3 * b.bulk),
    hw = 3.6 * k * b.hip * (0.7 + 0.3 * b.bulk);
  const L = p.lean * D;
  const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
  const addv = (a: V3, c: V3, s = 1) => v(a.x + c.x * s, a.y + c.y * s, a.z + c.z * s);
  const limb = (u: number, spread: number, side: number) =>
    v(
      side * Math.sin(spread * D),
      Math.cos(spread * D) * Math.cos(u * D),
      Math.cos(spread * D) * Math.sin(u * D),
    );
  const raw: { la: V3; lb: V3; part: Part; side?: 'L' | 'R' }[] = [];
  const add = (a: V3, c: V3, part: Part, side?: 'L' | 'R') =>
    raw.push({ la: a, lb: c, part, side });
  const hip = v(0, 0, 0);
  const neck = v(0, -Math.cos(L) * T, Math.sin(L) * T);
  const head = addv(
    neck,
    v(0, -Math.cos(L + p.tilt * D), Math.sin(L + p.tilt * D)),
    NECK + HR * 0.55,
  );
  add(hip, neck, 'torso');
  const hipS = { R: v(hw, 0, 0), L: v(-hw, 0, 0) };
  const shS = {
    R: v(sw, neck.y + 2.5 * k, neck.z * 0.95),
    L: v(-sw, neck.y + 2.5 * k, neck.z * 0.95),
  };
  add(hipS.L, hipS.R, 'hips');
  add(shS.L, shS.R, 'shoulders');
  for (const [side, sg] of [
    ['R', 1],
    ['L', -1],
  ] as const) {
    const a = side === 'R' ? p.aR : p.aL,
      l = side === 'R' ? p.lR : p.lL;
    const el = addv(shS[side], limb(a[0] + p.lean, p.sA, sg), UA);
    const hd = addv(el, limb(a[0] + a[1] + p.lean, p.sA * 0.5, sg), FA);
    add(shS[side], el, 'upperArm', side);
    add(el, hd, 'forearm', side);
    const kn = addv(hipS[side], limb(l[0], p.sL, sg), TH);
    const ft = addv(kn, limb(l[0] - l[1], p.sL * 0.5, sg), SH);
    add(hipS[side], kn, 'thigh', side);
    add(kn, ft, 'shin', side);
    add(ft, addv(ft, v(0, 0, 3.2 * k)), 'foot', side);
  }
  if (b.ears) {
    const len = b.ears === 'elf' ? 4 : b.ears === 'gnome' ? 3 : 2.4,
      up = b.ears === 'elf' ? 3.2 : 1.6;
    for (const sg of [1, -1])
      add(
        addv(head, v(sg * HR * 0.85, 0.3, -0.5)),
        addv(head, v(sg * (HR + len * k), -up * k, -1.2)),
        'ear',
        sg > 0 ? 'R' : 'L',
      );
  }
  // Turn and project.
  const [fx, fz] = DIRS[dir].f,
    rx = -fz,
    rz = fx;
  const project = (q: V3): SP => {
    const wx = q.x * rx + q.z * fx,
      wz = q.x * rz + q.z * fz;
    return { x: wx, y: q.y + wz * TILT, d: wz };
  };
  let P = raw.map((s) => ({ a: project(s.la), b: project(s.lb) }));
  let H = project(head);
  // Whole-body roll for falling, in screen space, toward the way they face (or right when facing the camera).
  const rollSign = Math.abs(fx) > 0.2 ? Math.sign(fx) : 1;
  const th = rollSign * p.rot * D,
    c = Math.cos(th),
    s = Math.sin(th);
  const rot = (q: SP): SP => ({ x: q.x * c - q.y * s, y: q.x * s + q.y * c, d: q.d });
  P = P.map((pp) => ({ a: rot(pp.a), b: rot(pp.b) }));
  H = rot(H);
  const pts = P.flatMap((pp) => [pp.a, pp.b]).concat([
    { x: H.x, y: H.y + HR, d: 0 },
    { x: H.x - HR, y: H.y, d: 0 },
    { x: H.x + HR, y: H.y, d: 0 },
  ]);
  const maxY = Math.max(...pts.map((q) => q.y));
  const minX = Math.min(...pts.map((q) => q.x)),
    maxX = Math.max(...pts.map((q) => q.x));
  const dx = Math.abs(p.rot) > 20 ? 32 - (minX + maxX) / 2 : 32,
    dy = 62.5 - maxY;
  const place = (q: SP): SP => ({ x: q.x + dx, y: q.y + dy, d: q.d });
  const toScreen = (lp: V3) => place(rot(project(lp)));
  return {
    segs: raw.map((sg, i) => ({
      ...sg,
      a: place(P[i].a),
      b: place(P[i].b),
      d: (P[i].a.d + P[i].b.d) / 2,
    })),
    head: { ...place(H), r: HR },
    headLocal: head,
    HR,
    k,
    b,
    facing: { fx, fz },
    toScreen,
  };
}

interface Pt {
  x: number;
  y: number;
}
type ShapeColor = RGB | ((t: number, py: number) => RGB);
interface CircleShape {
  circle: Pt;
  r: number;
  rx?: number;
  ry?: number;
  color: RGB;
  clip?: (x: number, y: number) => boolean;
  head?: boolean;
  d?: number;
}
interface CapsuleShape {
  a: Pt;
  b: Pt;
  r: number;
  t0?: number;
  t1?: number;
  color: ShapeColor;
  d?: number;
}
type Shape = CircleShape | CapsuleShape;
const isCircle = (s: Shape): s is CircleShape => 'circle' in s;

// Rasterizes capsules, ellipses and dots into a buffer with a 1px outline. Shapes later in the list draw on top.
function raster(
  buf: Uint8ClampedArray,
  shapes: Shape[],
  opts: {
    headY?: number;
    dots?: { x: number; y: number; c: RGB }[];
    shadeBottom?: [RGB, RGB];
  } = {},
) {
  const fill = new Uint8Array(F * F),
    col: (RGB | undefined)[] = new Array(F * F),
    headMask = new Uint8Array(F * F);
  for (let y = 0; y < F; y++)
    for (let x = 0; x < F; x++) {
      const px = x + 0.5,
        py = y + 0.5;
      let c: RGB | null = null,
        isHead = false;
      for (const s of shapes) {
        if (isCircle(s)) {
          const ex = (px - s.circle.x) / (s.rx || 1),
            ey = (py - s.circle.y) / (s.ry || 1);
          if (ex * ex + ey * ey <= s.r * s.r && (!s.clip || s.clip(px, py))) {
            c = s.color;
            isHead = !!s.head;
          }
          continue;
        }
        const vx = s.b.x - s.a.x,
          vy = s.b.y - s.a.y,
          len2 = vx * vx + vy * vy;
        let t = len2 ? ((px - s.a.x) * vx + (py - s.a.y) * vy) / len2 : 0;
        const t0 = s.t0 || 0,
          t1 = s.t1 == null ? 1 : s.t1;
        if (len2 && (t < t0 - 0.02 || t > t1 + 0.02)) continue;
        t = Math.max(t0, Math.min(t1, t));
        const ddx = px - (s.a.x + vx * t),
          ddy = py - (s.a.y + vy * t);
        if (ddx * ddx + ddy * ddy <= s.r * s.r) {
          c = typeof s.color === 'function' ? s.color(t, py) : s.color;
          isHead = false;
        }
      }
      if (c) {
        fill[y * F + x] = 1;
        col[y * F + x] = c;
        if (isHead) headMask[y * F + x] = 1;
      }
    }
  buf.fill(0);
  const outline: RGB = [27, 26, 36];
  const n = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < F && yy < F && fill[yy * F + xx];
  for (let y = 0; y < F; y++)
    for (let x = 0; x < F; x++) {
      const i = y * F + x;
      let c = col[i];
      if (!fill[i]) {
        if (n(x + 1, y) || n(x - 1, y) || n(x, y + 1) || n(x, y - 1)) c = outline;
        else continue;
      } else if (opts.headY != null && !headMask[i] && y > opts.headY && y > 0 && headMask[i - F])
        c = outline;
      else if (opts.shadeBottom && c === opts.shadeBottom[0] && fill[i - F] && !fill[i + F])
        c = opts.shadeBottom[1];
      if (!c) continue;
      buf[i * 4] = c[0];
      buf[i * 4 + 1] = c[1];
      buf[i * 4 + 2] = c[2];
      buf[i * 4 + 3] = 255;
    }
  for (const dot of opts.dots || []) {
    const x = Math.floor(dot.x),
      y = Math.floor(dot.y);
    if (x < 0 || y < 0 || x >= F || y >= F) continue;
    const i = (y * F + x) * 4;
    if (!buf[i + 3]) continue;
    buf[i] = dot.c[0];
    buf[i + 1] = dot.c[1];
    buf[i + 2] = dot.c[2];
  }
}

const R: Record<Part, number> = {
  torso: 4.6,
  hips: 4.4,
  shoulders: 3.6,
  upperArm: 2.7,
  forearm: 2.3,
  thigh: 3.4,
  shin: 2.6,
  foot: 1.6,
  ear: 1.0,
};
// Bald base body in plain underclothes, with eyes (and tusks for orcs) so facing reads at a glance.
function blockBody(buf: Uint8ClampedArray, sk: Skeleton) {
  const b = sk.b,
    bulk = b.bulk * b.scale,
    skin = hexRgb(b.skin[1]),
    skinD = hexRgb(b.skin[0]),
    cloth = hexRgb('#4a4a55');
  const sideness = Math.abs(sk.facing.fx);
  const parts: Shape[] = sk.segs.map((sg) => {
    let r = R[sg.part] * (sg.part === 'ear' ? Math.max(1, b.scale) : bulk);
    if (sg.part === 'torso') r += sideness * 0.8 * bulk;
    const far = sg.d < -1.2 && sg.part !== 'torso';
    let color: ShapeColor = far ? skinD : skin;
    if (sg.part === 'torso') color = (t) => (t < 0.28 || t > 0.5 ? cloth : skin);
    if (sg.part === 'hips') color = cloth;
    if (sg.part === 'shoulders')
      color = (_t, py) => (py > sk.head.y + sk.head.r + 3 ? cloth : skin);
    if (sg.part === 'thigh') color = (t) => (t < 0.42 ? cloth : far ? skinD : skin);
    return { a: sg.a, b: sg.b, r, color, d: sg.d + (sg.part === 'ear' ? 0.01 : 0) };
  });
  parts.push({
    circle: sk.head,
    r: sk.head.r * Math.sqrt(Math.min(1.2, bulk)) * 0.95,
    color: skin,
    head: true,
    d: sk.head.d + 0.001,
  });
  // Ears go behind the head when they face away.
  parts.sort((p1, p2) => (p1.d ?? 0) - (p2.d ?? 0));
  const dots: { x: number; y: number; c: RGB }[] = [];
  const H = sk.headLocal,
    HR = sk.HR;
  for (const sg of [1, -1]) {
    const e = sk.toScreen({ x: H.x + sg * HR * 0.38, y: H.y - HR * 0.05, z: H.z + HR * 0.9 });
    if (e.d > sk.head.d + HR * 0.3) dots.push({ x: e.x, y: e.y, c: [27, 26, 36] });
    if (b.tusks) {
      const t = sk.toScreen({ x: H.x + sg * HR * 0.3, y: H.y + HR * 0.55, z: H.z + HR * 0.85 });
      if (t.d > sk.head.d + HR * 0.3) dots.push({ x: t.x, y: t.y, c: [240, 236, 220] });
    }
  }
  raster(buf, parts, { headY: sk.head.y, dots });
}

/** Starter shape for one slot and style, fitted to the skeleton, in the chosen color with a shade and an outline. */
export function blockGear(
  buf: Uint8ClampedArray,
  anim: AnimId,
  frame: number,
  dir: number,
  bkey: string,
  slot: Slot,
  colorHex: string,
  style?: string | null,
) {
  const sk = skeleton(anim, frame, dir, bkey);
  if (slot === 'base') {
    blockBody(buf, sk);
    return;
  }
  style = style || STYLES[slot][0][0];
  const b = sk.b,
    bulk = b.bulk * b.scale,
    k = sk.k,
    kk = Math.max(0.75, k);
  const base = hexRgb(colorHex),
    shade = base.map((v) => Math.round(v * 0.68)) as RGB,
    light = base.map((v) => Math.min(255, Math.round(v + (255 - v) * 0.35))) as RGB;
  const dark: RGB = [42, 39, 48],
    steel: RGB = [196, 193, 210],
    gold: RGB = [232, 197, 71],
    gem: RGB = [79, 179, 168];
  const seg = (part: Part, side?: 'L' | 'R') =>
    sk.segs.find((s) => s.part === part && (!side || s.side === side));
  const shapes: Shape[] = [];
  const sideness = Math.abs(sk.facing.fx);
  const cap = (sg: Seg | undefined, pad: number, t0 = 0, t1 = 1, color?: RGB, dOff = 0) =>
    sg &&
    shapes.push({
      a: sg.a,
      b: sg.b,
      r: R[sg.part] * bulk + pad + (sg.part === 'torso' ? sideness * 0.8 * bulk : 0),
      t0,
      t1,
      color: color || (sg.d < -1.2 && sg.part !== 'torso' ? shade : base),
      d: sg.d + dOff,
    });
  const hd = sk.head,
    H = sk.headLocal,
    HR = sk.HR,
    headR = hd.r * Math.sqrt(Math.min(1.2, bulk)) * 0.95;
  const along = (sg: Seg, t: number): Pt => ({
    x: sg.a.x + (sg.b.x - sg.a.x) * t,
    y: sg.a.y + (sg.b.y - sg.a.y) * t,
  });
  const unit = (sg: Seg): Pt => {
    const dx = sg.b.x - sg.a.x,
      dy = sg.b.y - sg.a.y,
      L = Math.hypot(dx, dy) || 1;
    return { x: dx / L, y: dy / L };
  };
  const P = (p: Pt, u: Pt, s: number): Pt => ({ x: p.x + u.x * s, y: p.y + u.y * s });
  const back = { x: -sk.facing.fx, z: -sk.facing.fz };
  const facingAway = sk.facing.fz < -0.3,
    facingUs = sk.facing.fz > 0.3;
  const torso = seg('torso')!,
    neckL = torso.lb;
  if (slot === 'chest') {
    if (style === 'robe') {
      cap(torso, 1.0);
      cap(seg('hips'), 1.3);
      cap(seg('shoulders'), 1.0);
      for (const s of ['L', 'R'] as const) {
        cap(seg('thigh', s), 1.6);
        cap(seg('shin', s), 1.9, 0, 0.6);
        cap(seg('upperArm', s), 0.9);
        cap(seg('forearm', s), 1.4, 0, 0.55);
      }
    } else if (style === 'leather') {
      cap(torso, 0.5, 0.22, 1);
      cap(seg('shoulders'), 0.5);
      for (const s of ['L', 'R'] as const) cap(seg('upperArm', s), 0.4, 0, 0.3);
    } else {
      cap(torso, 0.9, 0.22, 1);
      cap(seg('shoulders'), 1.0);
      for (const s of ['L', 'R'] as const) cap(seg('upperArm', s), 0.8, 0, 0.45);
      if (style === 'lamellar')
        for (const s of ['L', 'R'] as const) cap(seg('upperArm', s), 1.9, 0.05, 0.6, shade, 0.5);
    }
  } else if (slot === 'pants') {
    const wide = style === 'hakama';
    cap(seg('hips'), wide ? 1.4 : 0.8);
    cap(torso, 0.8, 0, 0.26);
    for (const s of ['L', 'R'] as const) {
      cap(seg('thigh', s), wide ? 2.0 : 0.7);
      cap(seg('shin', s), wide ? 2.3 : 0.6, 0, wide ? 0.9 : 0.6);
    }
  } else if (slot === 'boots') {
    for (const s of ['L', 'R'] as const) {
      cap(seg('shin', s), 0.8, 0.55, 1);
      cap(seg('foot', s), 1.0);
    }
  } else if (slot === 'gloves') {
    for (const s of ['L', 'R'] as const) {
      const fa = seg('forearm', s);
      cap(fa, 0.8, 0.55, 1);
      if (fa)
        shapes.push({
          a: fa.b,
          b: fa.b,
          r: 2.2 * bulk,
          color: fa.d < -1.2 ? shade : base,
          d: fa.d + 0.1,
        });
    }
  } else if (slot === 'helmet') {
    if (style === 'hood') {
      const faceClip = (x: number, y: number) => {
        const ox = x - hd.x,
          oy = y - hd.y;
        if (facingAway) return true;
        if (facingUs) return !(oy > -headR * 0.35 && Math.abs(ox) < headR * 0.72);
        return !(oy > -headR * 0.35 && ox * sk.facing.fx > -headR * 0.15);
      };
      const drape = { x: hd.x + back.x * headR * 0.3, y: hd.y + headR * 1.4 };
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        shapes.push({
          circle: { x: hd.x + (drape.x - hd.x) * t, y: hd.y + (drape.y - hd.y) * t },
          r: headR + 1.2,
          color: shade,
          d: hd.d - 1,
          clip: faceClip,
        });
      }
      shapes.push({ circle: hd, r: headR + 1.4, color: base, clip: faceClip, d: hd.d + 1 });
    } else if (style === 'wizard') {
      const brim = { x: hd.x, y: hd.y - headR * 0.35 };
      shapes.push({ circle: brim, r: headR * 1.65, ry: 0.32, color: shade, d: hd.d + 1 });
      // Tall bodies would push the tip out of the frame; bend it down to fit.
      const tip = { x: hd.x + back.x * headR * 0.9, y: Math.max(5.5, hd.y - headR * 2.9) };
      for (let i = 0; i <= 8; i++) {
        const t = i / 8,
          c = { x: brim.x + (tip.x - brim.x) * t, y: brim.y - 1 + (tip.y - brim.y) * t };
        shapes.push({ circle: c, r: headR * (0.92 - t * 0.78) + 0.4, color: base, d: hd.d + 1.1 });
      }
    } else {
      shapes.push({
        circle: hd,
        r: headR + 1.2,
        color: base,
        clip: (_x, y) => y < hd.y + headR * 0.15,
        d: hd.d + 1,
      });
      shapes.push({
        a: { x: hd.x - headR - 1.2, y: hd.y + headR * 0.12 },
        b: { x: hd.x + headR + 1.2, y: hd.y + headR * 0.12 },
        r: 1.1,
        color: shade,
        d: hd.d + 1.1,
      });
      if (style === 'kabuto') {
        for (const sg of [1, -1]) {
          const a = sk.toScreen({ x: H.x + sg * HR * 0.95, y: H.y + HR * 0.1, z: H.z - HR * 0.2 }),
            c = sk.toScreen({ x: H.x + sg * (HR + 3 * kk), y: H.y + HR * 0.7, z: H.z - HR * 0.5 });
          shapes.push({ a, b: c, r: 1.4, color: shade, d: a.d });
        }
        if (!facingAway) {
          const root = sk.toScreen({ x: H.x, y: H.y - HR * 0.7, z: H.z + HR * 0.85 });
          for (const sg of [1, -1]) {
            const t = sk.toScreen({
              x: H.x + sg * HR * 0.75,
              y: H.y - HR * 1.7,
              z: H.z + HR * 0.7,
            });
            shapes.push({ a: root, b: t, r: 0.8, color: gold, d: hd.d + 2 });
          }
        }
      }
    }
  } else if (slot === 'hair') {
    const capClip = (x: number, y: number) => {
      const ox = x - hd.x,
        oy = y - hd.y;
      if (facingAway) return oy < headR * 0.45;
      return oy < -headR * 0.2 || (ox * back.x > headR * 0.25 && oy < headR * 0.35);
    };
    const tails: Shape[] = [];
    if (style === 'ponytail' && !facingUs) {
      tails.push({
        a: sk.toScreen({ x: H.x, y: H.y - HR * 0.2, z: H.z - HR * 0.85 }),
        b: sk.toScreen({ x: H.x, y: H.y + 15 * k, z: H.z - HR * 1.3 }),
        r: 2.3 * kk,
        color: base,
        d: hd.d - 1,
      });
    } else if (style === 'long') {
      for (const sg of [1, -1])
        tails.push({
          a: sk.toScreen({ x: H.x + sg * HR * 0.75, y: H.y - HR * 0.1, z: H.z - HR * 0.35 }),
          b: sk.toScreen({ x: H.x + sg * HR * 0.85, y: H.y + 12 * k, z: H.z - HR * 0.6 }),
          r: 2.4 * kk,
          color: shade,
          d: hd.d - 0.5,
        });
      if (!facingUs)
        tails.push({
          a: sk.toScreen({ x: H.x, y: H.y, z: H.z - HR * 0.8 }),
          b: sk.toScreen({ x: H.x, y: H.y + 12 * k, z: H.z - HR * 0.9 }),
          r: HR * 0.8,
          color: base,
          d: hd.d - 0.6,
        });
    } else if (style === 'bun' && !facingUs) {
      tails.push({
        circle: sk.toScreen({ x: H.x, y: H.y - HR * 0.65, z: H.z - HR * 0.8 }),
        r: 2.6 * kk,
        color: base,
        d: hd.d + 0.5,
      });
    }
    shapes.push(...tails.filter((t) => (t.d ?? 0) < hd.d));
    shapes.push({ circle: hd, r: headR + 0.7, color: base, clip: capClip, d: hd.d });
    shapes.push(...tails.filter((t) => (t.d ?? 0) >= hd.d));
  } else if (slot === 'beard') {
    if (sk.facing.fz > -0.5)
      shapes.push({
        a: sk.toScreen({ x: H.x, y: H.y + HR * 0.35, z: H.z + HR * 0.75 }),
        b: sk.toScreen({ x: H.x, y: H.y + HR * 0.35 + 8 * k, z: H.z + HR * 0.6 }),
        r: 3.3 * kk,
        color: base,
        d: hd.d + 1,
      });
  } else if (slot === 'back') {
    const bz = -4.2 * k * bulk;
    if (style === 'cape') {
      for (const sx of [-1, 0, 1]) {
        const a = sk.toScreen({ x: sx * 5.5 * k, y: neckL.y + 2.5 * k, z: neckL.z + bz });
        const c = sk.toScreen({ x: sx * 7 * k, y: 12 * k, z: bz - 1.5 });
        shapes.push({ a, b: c, r: 3.4 * kk, color: sx === 0 ? base : shade, d: a.d });
      }
    } else {
      const a = sk.toScreen({ x: 4 * k, y: neckL.y - 1 * k, z: neckL.z + bz }),
        c = sk.toScreen({ x: -3 * k, y: neckL.y + 14 * k, z: bz });
      shapes.push({ a, b: c, r: 2.1 * kk, color: base, d: a.d });
      for (const o of [-1, 0, 1])
        shapes.push({
          circle: { x: a.x + o * 1.2, y: a.y - 1.5 },
          r: 0.9,
          color: light,
          d: a.d + 0.1,
        });
    }
  } else if (slot === 'weapon') {
    const fa = seg('forearm', style === 'bow' ? 'L' : 'R');
    if (fa) {
      const u = unit(fa),
        hand = fa.b,
        perp = { x: -u.y, y: u.x };
      if (style === 'sword') {
        const guard = P(hand, u, 2),
          tip = P(hand, u, 17 * k);
        shapes.push({ a: guard, b: tip, r: 1.1, color: light });
        shapes.push({ a: P(guard, perp, -3), b: P(guard, perp, 3), r: 0.9, color: shade });
        shapes.push({ a: hand, b: guard, r: 1, color: shade });
      } else if (style === 'mace') {
        const end = P(hand, u, 8 * k);
        shapes.push({ a: P(hand, u, -1.5), b: end, r: 0.9, color: shade });
        shapes.push({ circle: end, r: 2.4 * kk, color: base });
      } else if (style === 'wand') {
        const end = P(hand, u, 8 * k);
        shapes.push({ a: hand, b: end, r: 0.8, color: base });
        shapes.push({ circle: end, r: 1.1, color: gem });
      } else if (style === 'staff') {
        const top = { x: hand.x + u.x * 3, y: hand.y - 16 * k },
          bottom = { x: hand.x - u.x * 1.5, y: hand.y + 11 * k };
        shapes.push({ a: bottom, b: top, r: 1.0, color: base });
        shapes.push({ circle: top, r: 2.2 * kk, color: gem });
      } else if (style === 'katana') {
        shapes.push({ a: P(hand, u, -4), b: hand, r: 0.95, color: dark });
        shapes.push({ circle: P(hand, u, 1), r: 1.5, color: gold });
        shapes.push({ a: P(hand, u, 2), b: P(hand, u, 22 * k), r: 0.9, color: base });
      } else if (style === 'bow') {
        // Held in the left hand. Hanging at the side it stands upright; raised, it turns across the arm.
        const hanging = u.y > 0.6,
          fsx = Math.abs(sk.facing.fx) > 0.2 ? Math.sign(sk.facing.fx) : 1;
        const axis = hanging ? { x: 0, y: 1 } : perp,
          tipDir = hanging ? { x: -fsx, y: 0 } : { x: -u.x, y: -u.y };
        const len = 11 * k,
          pts: Pt[] = [];
        // The grip sits in the hand; the limbs curve back toward the archer.
        for (let i = -4; i <= 4; i++) {
          const t = i / 4;
          pts.push({
            x: hand.x + axis.x * t * len + tipDir.x * 3 * k * t * t,
            y: hand.y + axis.y * t * len + tipDir.y * 3 * k * t * t,
          });
        }
        for (let i = 0; i < pts.length - 1; i++)
          shapes.push({ a: pts[i], b: pts[i + 1], r: 1.0, color: base });
        shapes.unshift({ a: pts[0], b: pts[pts.length - 1], r: 0.55, color: steel });
      }
    }
  } else if (slot === 'offhand') {
    const fa = seg('forearm', 'L');
    if (fa) {
      const u = unit(fa),
        perp = { x: -u.y, y: u.x };
      if (style === 'tome') {
        const c = P(fa.b, u, 1.5);
        shapes.push({
          a: P(c, perp, -1.8 * kk),
          b: P(c, perp, 1.8 * kk),
          r: 2.3 * kk,
          color: base,
        });
        shapes.push({
          a: P(c, perp, -1.2 * kk),
          b: P(c, perp, 1.2 * kk),
          r: 0.8,
          color: [232, 226, 201],
        });
      } else if (style === 'orb') {
        const c = P(fa.b, u, 2.5);
        shapes.push({ circle: c, r: 2.8 * kk, color: base });
        shapes.push({ circle: { x: c.x - 0.8, y: c.y - 0.8 }, r: 1.0, color: light });
      } else {
        const c = along(fa, 0.6),
          rx = 0.5 + 0.5 * Math.abs(sk.facing.fz);
        shapes.push({ circle: c, r: 6.5 * kk, color: base, rx });
        shapes.push({ circle: c, r: 1.6 * kk, color: light });
      }
    }
  }
  shapes.sort((s1, s2) => (s1.d || 0) - (s2.d || 0));
  raster(buf, shapes, { shadeBottom: [base, shade] });
}

export const frameCount = (anim: AnimId) => ANIMS[anim].frames;
