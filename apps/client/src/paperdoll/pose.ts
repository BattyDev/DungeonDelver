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
  | 'neck'
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
    { lean: -6, breath: 2, aR: [145, 10], aL: [95, 10] },
    { lean: -2, breath: 1, aR: [80, 40], aL: [40, 40] },
  ],
  shoot: [
    { aL: [60, 20], aR: [50, 60], lL: [10, 4], lR: [-10, 6] },
    { aL: [85, 5], aR: [85, 40], lL: [10, 4], lR: [-10, 6] },
    { aL: [90, 0], aR: [35, 115], lL: [10, 4], lR: [-10, 6] },
    { lean: -3, aL: [90, 0], aR: [30, 125], lL: [10, 4], lR: [-10, 6] },
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
    { lean: -2, aR: [150, 10], aL: [100, 40] },
    { lean: -2, breath: 1, aR: [152, 8], aL: [104, 36] },
    { lean: -3, breath: 2, aR: [155, 6], aL: [108, 32] },
    { lean: -2, breath: 1, aR: [152, 8], aL: [104, 36] },
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
    b = bodyDef(bkey);
  // Reserve headwear room on the tallest bodies, retaining the same foot anchor.
  if (b.scale > 0.95) b.scale *= 0.94;
  const k = b.scale;
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
  add(neck, head, 'neck');
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
  angle?: number;
  color: RGB;
  clip?: (x: number, y: number) => boolean;
  head?: boolean;
  d?: number;
  /** Depth of the visible surface of a round head/shell, rather than its centre plane. */
  roundDepth?: boolean;
}
interface CapsuleShape {
  a: Pt;
  b: Pt;
  r: number | ((t: number) => number);
  /** Conservative bound when r varies along a capsule. */
  maxR?: number;
  t0?: number;
  t1?: number;
  color: ShapeColor;
  d?: number;
  /** Interpolate projected endpoints; d remains an optional offset from that depth. */
  depthEnds?: [number, number];
}
export type Shape = CircleShape | CapsuleShape;
const isCircle = (s: Shape): s is CircleShape => 'circle' in s;

/** Per-pixel depth toward the camera, and which pixels are the head, from a raster. */
interface DepthMap {
  depth: Float32Array;
  head: Uint8Array;
}
/** Parts this much nearer than what they overlap get an outline, so a near arm reads against the torso. */
const INNER_EDGE = 2.5;
// Rasterizes rounded capsules, ellipses and dots with one-pixel outlines.
// Explicit depths resolve crossings per pixel; equal depths retain drawing order.
export function raster(
  buf: Uint8ClampedArray,
  shapes: Shape[],
  opts: {
    headY?: number;
    dots?: { x: number; y: number; c: RGB }[];
    shadeBottom?: [RGB, RGB];
    /** Openings (a hood's face) that get no outline ring inside them. */
    open?: (x: number, y: number) => boolean;
    innerEdges?: boolean;
  } = {},
  out?: DepthMap,
) {
  const fill = new Uint8Array(F * F),
    col: (RGB | undefined)[] = new Array(F * F),
    headMask = new Uint8Array(F * F),
    depth = new Float32Array(F * F).fill(-Infinity);
  const bounded = shapes.map((s) => {
    if (isCircle(s)) {
      const a = s.angle ?? 0,
        rx = s.r * (s.rx || 1),
        ry = s.r * (s.ry || 1);
      const w = Math.hypot(rx * Math.cos(a), ry * Math.sin(a)),
        h = Math.hypot(rx * Math.sin(a), ry * Math.cos(a));
      return { s, x0: s.circle.x - w, x1: s.circle.x + w, y0: s.circle.y - h, y1: s.circle.y + h };
    }
    const r = typeof s.r === 'number' ? s.r : (s.maxR ?? F);
    return {
      s,
      x0: Math.min(s.a.x, s.b.x) - r,
      x1: Math.max(s.a.x, s.b.x) + r,
      y0: Math.min(s.a.y, s.b.y) - r,
      y1: Math.max(s.a.y, s.b.y) + r,
    };
  });
  for (let y = 0; y < F; y++)
    for (let x = 0; x < F; x++) {
      const px = x + 0.5,
        py = y + 0.5;
      let c: RGB | null = null,
        isHead = false,
        d = 0;
      for (const item of bounded) {
        if (px < item.x0 || px > item.x1 || py < item.y0 || py > item.y1) continue;
        const s = item.s;
        if (isCircle(s)) {
          const ca = Math.cos(s.angle ?? 0),
            sa = Math.sin(s.angle ?? 0);
          const dx = px - s.circle.x,
            dy = py - s.circle.y;
          const ex = (dx * ca + dy * sa) / (s.rx || 1),
            ey = (-dx * sa + dy * ca) / (s.ry || 1);
          if (ex * ex + ey * ey <= s.r * s.r && (!s.clip || s.clip(px, py))) {
            const sd = (s.d ?? 0) + (s.roundDepth ? Math.sqrt(s.r * s.r - ex * ex - ey * ey) : 0);
            if (c && sd < d) continue;
            c = s.color;
            isHead = !!s.head;
            d = sd;
          }
          continue;
        }
        const vx = s.b.x - s.a.x,
          vy = s.b.y - s.a.y,
          len2 = vx * vx + vy * vy;
        let t = len2 ? ((px - s.a.x) * vx + (py - s.a.y) * vy) / len2 : 0;
        const t0 = s.t0 || 0,
          t1 = s.t1 == null ? 1 : s.t1;
        // Full limbs have round joints. Partial clothing sections keep a straight cuff/hem.
        if (len2 && ((t0 > 0 && t < t0) || (t1 < 1 && t > t1))) continue;
        t = Math.max(t0, Math.min(t1, t));
        const ddx = px - (s.a.x + vx * t),
          ddy = py - (s.a.y + vy * t);
        const r = typeof s.r === 'function' ? s.r(t) : s.r;
        if (ddx * ddx + ddy * ddy <= r * r) {
          const sd = s.depthEnds
            ? s.depthEnds[0] + (s.depthEnds[1] - s.depthEnds[0]) * t + (s.d ?? 0)
            : (s.d ?? 0);
          if (c && sd < d) continue;
          c = typeof s.color === 'function' ? s.color(t, py) : s.color;
          isHead = false;
          d = sd;
        }
      }
      if (c) {
        fill[y * F + x] = 1;
        col[y * F + x] = c;
        depth[y * F + x] = d;
        if (isHead) headMask[y * F + x] = 1;
      }
    }
  buf.fill(0);
  const outline: RGB = [27, 26, 36];
  const n = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < F && yy < F && fill[yy * F + xx];
  const nearer = (i: number, x: number, y: number) =>
    [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ].some(([xx, yy]) => n(xx, yy) && depth[yy * F + xx] - depth[i] > INNER_EDGE);
  const outDepth = out ? out.depth.fill(-Infinity) : undefined;
  if (out) out.head.fill(0);
  for (let y = 0; y < F; y++)
    for (let x = 0; x < F; x++) {
      const i = y * F + x;
      let c = col[i];
      if (!fill[i]) {
        if (opts.open?.(x + 0.5, y + 0.5)) continue;
        if (n(x + 1, y) || n(x - 1, y) || n(x, y + 1) || n(x, y - 1)) {
          c = outline;
          // A silhouette outline belongs to the nearest part it borders.
          if (outDepth)
            for (const [xx, yy] of [
              [x + 1, y],
              [x - 1, y],
              [x, y + 1],
              [x, y - 1],
            ])
              if (n(xx, yy)) outDepth[i] = Math.max(outDepth[i], depth[yy * F + xx]);
        } else continue;
      } else if (opts.headY != null && !headMask[i] && y > opts.headY && y > 0 && headMask[i - F])
        c = outline;
      else if (opts.innerEdges !== false && !headMask[i] && nearer(i, x, y)) c = outline;
      else if (opts.shadeBottom && c === opts.shadeBottom[0] && fill[i - F] && !fill[i + F])
        c = opts.shadeBottom[1];
      if (!c) continue;
      if (outDepth && fill[i]) outDepth[i] = depth[i];
      if (out && headMask[i]) out.head[i] = 1;
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
  neck: 1.8,
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
// A fitted waist shared by skin, leather, plate and robes. Hip/shoulder joints
// provide the width at either end; armour follows the same body underneath.
function partRadius(sk: Skeleton, part: Part, t: number) {
  const bulk = sk.b.bulk * sk.b.scale;
  const arm = ['shoulders', 'upperArm', 'forearm'].includes(part) ? sk.b.arm : 1;
  let r = R[part] * bulk * arm;
  if (part === 'torso') {
    const waist = Math.max(0, 1 - Math.abs(t - 0.48) / 0.32);
    r = (r + Math.abs(sk.facing.fx) * 0.8 * bulk) * (1 - waist * (1 - sk.b.waist));
  }
  return r;
}
// Bald base body in plain underclothes, with eyes (and tusks for orcs) so facing reads at a glance.
function blockBody(buf: Uint8ClampedArray, sk: Skeleton, out?: DepthMap) {
  const b = sk.b,
    bulk = b.bulk * b.scale,
    skin = hexRgb(b.skin[1]),
    skinD = hexRgb(b.skin[0]),
    cloth = hexRgb('#4a4a55');
  const parts: Shape[] = sk.segs.map((sg) => {
    const r =
      sg.part === 'ear' ? R.ear * Math.max(1, b.scale) : (t: number) => partRadius(sk, sg.part, t);
    const far = sg.d < -1.2 && sg.part !== 'torso';
    let color: ShapeColor = far ? skinD : skin;
    if (sg.part === 'torso') color = (t) => (t < 0.28 || t > 0.5 ? cloth : skin);
    if (sg.part === 'hips') color = cloth;
    if (sg.part === 'shoulders')
      color = (_t, py) => (py > sk.head.y + sk.head.r + 3 ? cloth : skin);
    if (sg.part === 'thigh') color = (t) => (t < 0.42 ? cloth : far ? skinD : skin);
    return {
      a: sg.a,
      b: sg.b,
      r,
      maxR: partRadius(sk, sg.part, 1),
      color,
      depthEnds: [sg.a.d, sg.b.d],
      d: sg.part === 'ear' ? 0.01 : 0,
    };
  });
  parts.push({
    circle: sk.head,
    r: sk.head.r * Math.sqrt(Math.min(1.2, bulk)) * 0.95,
    color: skin,
    head: true,
    d: sk.head.d + 0.001,
    roundDepth: true,
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
  raster(buf, parts, { headY: sk.head.y, dots }, out);
}
const bodyCache = new Map<string, DepthMap>();
/** Where the bare body is and how near each pixel of it is, for one pose. */
function bodyDepth(sk: Skeleton, key: string): DepthMap {
  let map = bodyCache.get(key);
  if (!map) {
    if (bodyCache.size > 400) bodyCache.clear();
    map = { depth: new Float32Array(F * F), head: new Uint8Array(F * F) };
    blockBody(new Uint8ClampedArray(F * F * 4), sk, map);
    bodyCache.set(key, map);
  }
  return map;
}
/** Gear sits on the body: anything the body stands in front of is hidden, and outlined where it was cut. */
const OCCLUDE = 0.6;
/** Clothing never covers the face; held items may pass in front of it. */
const BODY_LEVEL: Slot[] = ['chest', 'pants', 'boots', 'gloves', 'back'];

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
  const cap = (sg: Seg | undefined, pad: number, t0 = 0, t1 = 1, color?: RGB, dOff = 0) =>
    sg &&
    shapes.push({
      a: sg.a,
      b: sg.b,
      r: (t) => partRadius(sk, sg.part, t) + pad,
      maxR: partRadius(sk, sg.part, 1) + pad,
      t0,
      t1,
      color: color || (sg.d < -1.2 && sg.part !== 'torso' ? shade : base),
      depthEnds: [sg.a.d, sg.b.d],
      d: dOff + 0.15,
    });
  const hd = sk.head,
    H = sk.headLocal,
    HR = sk.HR,
    headR = hd.r * Math.sqrt(Math.min(1.2, bulk)) * 0.95;
  // Headwear and hair openings share the body's screen rotation when falling.
  const downPoint = sk.toScreen({ x: H.x, y: H.y + 1, z: H.z });
  const down = { x: downPoint.x - hd.x, y: downPoint.y - hd.y };
  const right = { x: down.y, y: -down.x };
  const headAngle = Math.atan2(down.y, down.x) - Math.PI / 2;
  const headPoint = (x: number, y: number): Pt => ({
    x: hd.x + right.x * x + down.x * y,
    y: hd.y + right.y * x + down.y * y,
  });
  const headOffset = (x: number, y: number): Pt => ({
    x: (x - hd.x) * right.x + (y - hd.y) * right.y,
    y: (x - hd.x) * down.x + (y - hd.y) * down.y,
  });
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
  const visibleEyes = [-1, 1]
    .map((side) =>
      sk.toScreen({
        x: H.x + side * HR * 0.38,
        y: H.y - HR * 0.05,
        z: H.z + HR * 0.9,
      }),
    )
    .filter((e) => e.d > hd.d + HR * 0.3);
  const eyeOpening = (x: number, y: number) =>
    visibleEyes.some((e) => Math.floor(x) === Math.floor(e.x) && Math.floor(y) === Math.floor(e.y));
  const torso = seg('torso')!,
    neckL = torso.lb;
  if (slot === 'chest') {
    // Torso pieces stop short of the neck so the chin (and a beard) stays clear.
    if (style === 'robe') {
      cap(torso, 1.0, 0, 0.9);
      cap(seg('hips'), 1.3);
      cap(seg('shoulders'), 1.0);
      for (const s of ['L', 'R'] as const) {
        cap(seg('thigh', s), 1.6);
        cap(seg('shin', s), 1.9, 0, 0.6);
        // Sleeves a shade darker than the body of the robe, so the arms read.
        cap(seg('upperArm', s), 0.9, 0, 1, shade);
        cap(seg('forearm', s), 1.4, 0, 0.55, shade);
      }
    } else if (style === 'leather') {
      cap(torso, 0.5, 0.22, 0.88);
      cap(seg('shoulders'), 0.5);
      for (const s of ['L', 'R'] as const) cap(seg('upperArm', s), 0.4, 0, 0.3, shade);
    } else {
      cap(torso, 0.9, 0.22, 0.88);
      cap(seg('shoulders'), 1.0);
      for (const s of ['L', 'R'] as const)
        cap(seg('upperArm', s), 0.8, 0, 0.4, style === 'lamellar' ? shade : light, 0.2);
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
          d: fa.b.d + 0.2,
        });
    }
  } else if (slot === 'helmet') {
    if (style === 'hood') {
      const faceClip = (x: number, y: number) => {
        const { x: ox, y: oy } = headOffset(x, y);
        // A wide opening: the whole face shows below the brow.
        if (facingAway) return true;
        if (facingUs) return !(oy > -headR * 0.5 && Math.abs(ox) < headR * 0.82);
        return !(oy > -headR * 0.5 && ox * sk.facing.fx > -headR * 0.3);
      };
      const drape = headPoint(back.x * headR * 0.3, headR * 1.4);
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        shapes.push({
          circle: { x: hd.x + (drape.x - hd.x) * t, y: hd.y + (drape.y - hd.y) * t },
          r: headR + 1.2,
          color: shade,
          // The drape hangs behind the head, or over the back when walking away.
          d: facingAway ? hd.d + 0.5 : hd.d - 1,
          clip: faceClip,
        });
      }
      shapes.push({
        circle: hd,
        r: headR + 1.4,
        color: base,
        clip: faceClip,
        d: hd.d + 0.3,
        roundDepth: true,
      });
    } else if (style === 'wizard') {
      // The brim sits on the brow, above the eyes; the cone never dips below it.
      const brim = headPoint(0, -headR * 0.62);
      shapes.push({
        circle: brim,
        r: headR * 1.55,
        ry: 0.24,
        angle: headAngle,
        color: shade,
        d: hd.d + headR + 1,
      });
      // A low crown bends back at its tip. Its height fits the available headroom,
      // including the outline, instead of flattening a clamped straight cone.
      const room = Math.min(
        ...(['x', 'y'] as const).map((axis) => {
          const up = -down[axis];
          return Math.abs(up) < 0.001 ? Infinity : ((up > 0 ? F - 1 : 1) - brim[axis]) / up;
        }),
      );
      const height = Math.min(headR * 1.85, Math.max(1.5, room - 2));
      const bend = Math.abs(back.x) > 0.2 ? back.x : -0.65;
      for (let i = 0; i <= 12; i++) {
        const t = i / 12,
          c = headPoint(
            bend * headR * 1.3 * t * t,
            -headR * 0.62 - height * Math.sin(t * Math.PI * 0.58),
          );
        shapes.push({
          circle: c,
          r: headR * (0.88 - t * 0.8) + 0.3,
          ry: Math.min(1, height / (headR * 1.85)),
          angle: headAngle,
          color: base,
          d: hd.d + headR + 1.1,
          clip: (x, y) => headOffset(x, y).y < -headR * 0.62 + 0.5,
        });
      }
    } else {
      // Helms cover the crown and the cheeks, and leave the face open.
      const browY = -headR * 0.5;
      const helmClip = (x: number, y: number) => {
        if (eyeOpening(x, y)) return false;
        const { x: ox, y: oy } = headOffset(x, y);
        if (oy < browY) return true;
        if (oy > headR * 0.65 || facingAway) return facingAway && oy < headR * 0.15;
        // Turn the opening with the face. A centred front-view opening on a
        // diagonal exposed the rear ear through the helmet's cheek plate.
        if (facingUs)
          return (
            Math.abs(ox - sk.facing.fx * headR * 0.35) >
            headR * (0.62 - Math.abs(sk.facing.fx) * 0.14)
          );
        return ox * sk.facing.fx < -headR * 0.1;
      };
      shapes.push({
        circle: hd,
        r: headR + 1.2,
        color: base,
        clip: helmClip,
        d: hd.d + 0.3,
        roundDepth: true,
      });
      shapes.push({
        a: headPoint(-headR - 1.2, browY - 0.5),
        b: headPoint(headR + 1.2, browY - 0.5),
        r: 0.7,
        color: shade,
        d: hd.d + headR + 1.1,
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
            const room = Math.min(1, Math.max(0, root.y - 2.5) / Math.max(0.1, root.y - t.y));
            shapes.push({
              a: root,
              b: {
                x: root.x + (t.x - root.x) * room,
                y: root.y + (t.y - root.y) * room,
              },
              r: 0.8,
              color: gold,
              d: hd.d + 2,
            });
          }
        }
      }
    }
  } else if (slot === 'hair') {
    const capClip = (x: number, y: number) => {
      const { x: ox, y: oy } = headOffset(x, y);
      if (facingAway) return oy < headR * 0.45;
      return oy < -headR * 0.2 || (ox * back.x > headR * 0.25 && oy < headR * 0.35);
    };
    const tails: Shape[] = [];
    if (style === 'ponytail') {
      const a = sk.toScreen({ x: H.x, y: H.y - HR * 0.2, z: H.z - HR * 0.85 });
      const b = sk.toScreen({ x: H.x + 2.5 * k, y: H.y + 13 * k, z: H.z - HR * 1.3 });
      tails.push({
        a,
        b,
        r: (t) => (2.3 - t * 0.8) * kk,
        maxR: 2.3 * kk,
        color: base,
        depthEnds: [a.d, b.d],
      });
      // Short temple locks frame the face even when the tail is behind the
      // head. The body depth hides the far lock as the character turns.
      for (const side of [-1, 1]) {
        const a = sk.toScreen({ x: H.x + side * HR * 0.8, y: H.y - HR * 0.1, z: H.z + HR * 0.45 });
        const b = sk.toScreen({
          x: H.x + side * HR * 0.87,
          y: H.y + HR * 1.25,
          z: H.z + HR * 0.25,
        });
        tails.push({ a, b, r: 0.85 * kk, color: base, depthEnds: [a.d, b.d] });
      }
    } else if (style === 'long') {
      for (const sg of [1, -1]) {
        const a = sk.toScreen({ x: H.x + sg * HR * 0.75, y: H.y - HR * 0.1, z: H.z - HR * 0.35 });
        const b = sk.toScreen({ x: H.x + sg * HR * 0.85, y: H.y + 12 * k, z: H.z - HR * 0.6 });
        tails.push({
          a,
          b,
          r: 2.4 * kk,
          color: shade,
          depthEnds: [a.d, b.d],
        });
      }
      if (!facingUs)
        tails.push({
          a: sk.toScreen({ x: H.x, y: H.y, z: H.z - HR * 0.8 }),
          b: sk.toScreen({ x: H.x, y: H.y + 12 * k, z: H.z - HR * 0.9 }),
          r: HR * 0.8,
          color: base,
          d: hd.d - sk.facing.fz * HR * 0.85,
        });
    } else if (style === 'bun' && !facingUs) {
      tails.push({
        circle: sk.toScreen({ x: H.x, y: H.y - HR * 0.65, z: H.z - HR * 0.8 }),
        r: 2.6 * kk,
        color: base,
        d: hd.d - sk.facing.fz * HR * 0.8,
        roundDepth: true,
      });
    }
    shapes.push(...tails.filter((t) => (t.d ?? 0) < hd.d));
    shapes.push({
      circle: hd,
      r: headR + 0.7,
      color: base,
      clip: capClip,
      d: hd.d + 0.1,
      roundDepth: true,
    });
    shapes.push(...tails.filter((t) => (t.d ?? 0) >= hd.d));
  } else if (slot === 'beard') {
    if (sk.facing.fz > -0.5)
      shapes.push({
        a: sk.toScreen({ x: H.x, y: H.y + HR * 0.35, z: H.z + HR * 0.75 }),
        b: sk.toScreen({ x: H.x, y: H.y + HR * 0.35 + 8 * k, z: H.z + HR * 0.6 }),
        r: 3.3 * kk,
        color: base,
        d: hd.d + HR * 0.8,
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
        // The gem flares at the height of a heal or while channelling.
        const flare = (anim === 'heal' && frame === 2) || anim === 'channel';
        const top = {
            x: hand.x + right.x * u.x * 3 - down.x * 16 * k,
            y: hand.y + right.y * u.x * 3 - down.y * 16 * k,
          },
          bottom = {
            x: hand.x - right.x * u.x * 1.5 + down.x * 11 * k,
            y: hand.y - right.y * u.x * 1.5 + down.y * 11 * k,
          };
        // Slide the grip along the shaft when raised, retaining the staff's
        // length and keeping the gem/flare in frame. Fallen staves rotate too.
        const clearance = (flare ? 3.6 : 2.2) * kk + 2;
        for (const axis of ['x', 'y'] as const) {
          const shift =
            Math.max(0, clearance - Math.min(top[axis], bottom[axis])) +
            Math.min(0, F - clearance - Math.max(top[axis], bottom[axis]));
          top[axis] += shift;
          bottom[axis] += shift;
        }
        shapes.push({ a: bottom, b: top, r: 1.0, color: base });
        if (flare) shapes.push({ circle: top, r: 3.6 * kk, color: [158, 231, 179] });
        shapes.push({ circle: top, r: 2.2 * kk, color: flare ? [236, 255, 240] : gem });
        // A bolt leaves the hands while casting.
        const off = seg('forearm', 'L');
        if (anim === 'cast' && (frame === 2 || frame === 3) && off) {
          const mid = { x: (hand.x + off.b.x) / 2, y: (hand.y + off.b.y) / 2 };
          const ahead = Math.abs(sk.facing.fx) > 0.2 ? Math.sign(sk.facing.fx) : 0;
          const bolt = { x: mid.x + ahead * (frame === 3 ? 7 : 3), y: mid.y };
          shapes.push({ circle: bolt, r: 2.8 * kk, color: [124, 196, 255], d: fa.d + 2 });
          shapes.push({ circle: bolt, r: 1.3 * kk, color: [236, 246, 255], d: fa.d + 2.1 });
        }
      } else if (style === 'katana') {
        shapes.push({ a: P(hand, u, -4), b: hand, r: 0.95, color: dark });
        shapes.push({ circle: P(hand, u, 1), r: 1.5, color: gold });
        shapes.push({ a: P(hand, u, 2), b: P(hand, u, 22 * k), r: 0.9, color: base });
      } else if (style === 'bow') {
        // Held in the left hand. Hanging at the side it stands upright; raised, it turns across the arm.
        const hanging = u.y > 0.6,
          fsx = Math.abs(sk.facing.fx) > 0.2 ? Math.sign(sk.facing.fx) : 1;
        const aiming = anim === 'shoot' && frame >= 1 && frame <= 4;
        const axis = hanging || aiming ? { x: 0, y: 1 } : perp,
          tipDir = hanging || aiming ? { x: -fsx, y: 0 } : { x: -u.x, y: -u.y };
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
        // While drawing, the string comes back to the drawing hand with an arrow nocked.
        const draw = seg('forearm', 'R');
        const drawing = anim === 'shoot' && frame >= 1 && frame <= 3 && draw;
        // Ordering shapes inside the weapon layer cannot put the string behind
        // an arm in the body layer. Give it its own depth so body occlusion can.
        const stringDepth = Math.min(fa.a.d, fa.b.d, ...(drawing ? [draw.a.d, draw.b.d] : [])) - 1;
        if (drawing) {
          const nock = { x: draw.b.x, y: hand.y };
          shapes.unshift({ a: pts[0], b: nock, r: 0.45, color: steel, d: stringDepth });
          shapes.unshift({
            a: nock,
            b: pts[pts.length - 1],
            r: 0.45,
            color: steel,
            d: stringDepth,
          });
          const tip = { x: hand.x + fsx * 6 * k, y: hand.y };
          shapes.push({ a: nock, b: tip, r: 0.45, color: [214, 196, 160] });
          for (const sy of [-1, 1])
            shapes.push({
              a: tip,
              b: { x: tip.x - fsx * 2, y: tip.y + sy * 1.5 },
              r: 0.5,
              color: steel,
            });
        } else
          shapes.unshift({
            a: pts[0],
            b: pts[pts.length - 1],
            r: 0.55,
            color: steel,
            d: stringDepth,
          });
      }
      for (const sh of shapes) sh.d ??= fa.b.d + 0.4;
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
      for (const sh of shapes) sh.d ??= fa.a.d + (fa.b.d - fa.a.d) * 0.6 + 0.6;
    }
  }
  shapes.sort((s1, s2) => (s1.d || 0) - (s2.d || 0));
  const gear: DepthMap = { depth: new Float32Array(F * F), head: new Uint8Array(F * F) };
  // Headwear frames the face rather than outlining a hole in front of it.
  const open =
    slot === 'helmet' && style !== 'wizard'
      ? (x: number, y: number) => eyeOpening(x, y) || Math.hypot(x - hd.x, y - hd.y) < headR - 0.3
      : undefined;
  raster(
    buf,
    shapes,
    { shadeBottom: [base, shade], open, innerEdges: !(slot === 'chest' && style === 'robe') },
    gear,
  );
  // Hide what the body stands in front of (and anything over the face for torso gear), then
  // outline the cut so the edge stays crisp.
  const body = bodyDepth(sk, `${anim}|${frame}|${dir}|${bkey}`),
    level = BODY_LEVEL.includes(slot),
    cut = new Uint8Array(F * F);
  for (let i = 0; i < F * F; i++) {
    if (!buf[i * 4 + 3] || body.depth[i] === -Infinity) continue;
    if (body.depth[i] > gear.depth[i] + OCCLUDE || (level && body.head[i])) {
      buf[i * 4 + 3] = 0;
      cut[i] = 1;
    }
  }
  for (let y = 0; y < F; y++)
    for (let x = 0; x < F; x++) {
      const i = y * F + x;
      if (!buf[i * 4 + 3]) continue;
      const touches = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ].some(([xx, yy]) => xx >= 0 && yy >= 0 && xx < F && yy < F && cut[yy * F + xx]);
      if (touches) buf.set([27, 26, 36], i * 4);
    }
}

export const frameCount = (anim: AnimId) => ANIMS[anim].frames;
