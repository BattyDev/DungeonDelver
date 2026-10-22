// Procedural pixel art for the world: tiles, walls and props, drawn at the same pixel scale as the
// 64 px character frames so everything reads as one sprite set.
import * as THREE from 'three';

export type ThemeId = 'hall' | 'overgrown' | 'archive' | 'ember' | 'keep';
export interface Theme {
  floor: [string, string, string, string];
  grout: string;
  wall: [string, string, string];
  mortar: string;
  cap: string;
  accent: string;
  /** Second accent, e.g. banner trim and rug borders. */
  trim: string;
  moss?: string;
  clear: string;
  ambient: string;
  props: PropId[];
  /** Isolated wall tiles inside rooms are drawn as this. */
  pillar: 'pillar' | 'shelf';
}
export const THEMES: Record<ThemeId, Theme> = {
  hall: {
    floor: ['#6b5a46', '#76634d', '#5f5040', '#826d54'],
    grout: '#3c3128',
    wall: ['#7a6a58', '#8a7964', '#66584a'],
    mortar: '#463a30',
    cap: '#2e2620',
    accent: '#9c3b34',
    trim: '#e5ba72',
    clear: '#120f0d',
    ambient: '#ffe2bd',
    props: ['barrel', 'crate', 'plant', 'table', 'banner', 'torch'],
    pillar: 'pillar',
  },
  overgrown: {
    floor: ['#4c5a4a', '#56654f', '#46523f', '#5d6b55'],
    grout: '#2c352b',
    wall: ['#5d665a', '#6b7566', '#4f574c'],
    mortar: '#323a30',
    cap: '#1d241c',
    accent: '#4d6b2c',
    trim: '#b5d17a',
    moss: '#5f8a3a',
    clear: '#0c120e',
    ambient: '#c9e3c0',
    props: ['plant', 'mushroom', 'bones', 'torch', 'barrel'],
    pillar: 'pillar',
  },
  archive: {
    floor: ['#4a5466', '#535e72', '#434c5d', '#5c687d'],
    grout: '#2a303c',
    wall: ['#5a6276', '#687186', '#4c5366'],
    mortar: '#30364a',
    cap: '#1b1f2a',
    accent: '#3f5f9e',
    trim: '#e8c547',
    clear: '#0c0e14',
    ambient: '#c8d4ff',
    props: ['candle', 'books', 'banner', 'torch', 'crate'],
    pillar: 'shelf',
  },
  ember: {
    floor: ['#6a4538', '#784f40', '#5d3c31', '#82584a'],
    grout: '#3a221c',
    wall: ['#8a6450', '#9a735d', '#765443'],
    mortar: '#4a2f25',
    cap: '#2a1813',
    accent: '#b0383b',
    trim: '#f2cf7a',
    clear: '#140b09',
    ambient: '#ffcfaa',
    props: ['candle', 'banner', 'torch', 'bones', 'barrel'],
    pillar: 'pillar',
  },
  keep: {
    floor: ['#44454c', '#4d4f57', '#3d3e45', '#565862'],
    grout: '#25262b',
    wall: ['#565862', '#62656f', '#4a4c55'],
    mortar: '#2c2d33',
    cap: '#18191d',
    accent: '#6e1f24',
    trim: '#c4c1d2',
    clear: '#0b0b0e',
    ambient: '#d6d8ff',
    props: ['rack', 'banner', 'torch', 'barrel', 'crate', 'bones'],
    pillar: 'pillar',
  },
};
export const floorTheme = (id: number): ThemeId =>
  (['overgrown', 'archive', 'ember', 'keep'] as const)[(id - 1) % 4];

type RGBA = [number, number, number, number];
const rgb = (hex: string, a = 255): RGBA => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
  a,
];
const shadeHex = (hex: string, k: number) => {
  const [r, g, b] = rgb(hex);
  const f = (v: number) =>
    Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k)));
  return `#${[f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};
const OUTLINE = '#1b1a24';

/** A tiny pixel canvas with drawing helpers and a seeded RNG. */
class Pix {
  readonly canvas = document.createElement('canvas');
  private img: ImageData;
  private seed: number;
  constructor(
    readonly w: number,
    readonly h: number,
    seed = 1,
  ) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.img = new ImageData(w, h);
    this.seed = seed >>> 0 || 1;
  }
  rand() {
    this.seed = (this.seed + 0x6d2b79f5) >>> 0;
    let t = this.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  pick<T>(xs: readonly T[]) {
    return xs[Math.floor(this.rand() * xs.length)];
  }
  px(x: number, y: number, c: string, a = 255) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4,
      v = rgb(c, a);
    this.img.data.set(v, i);
  }
  get(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.img.data[(y * this.w + x) * 4 + 3];
  }
  rect(x: number, y: number, w: number, h: number, c: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: string) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const dx = (x + 0.5 - cx) / rx,
          dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, c);
      }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.px(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
  }
  /** Speckles existing opaque pixels with lighter and darker variants. */
  noise(amount: number, colors: string[]) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (this.get(x, y) && this.rand() < amount) this.px(x, y, this.pick(colors));
  }
  /** One-pixel dark outline around everything opaque. */
  outline(c = OUTLINE) {
    const solid = (x: number, y: number) => this.get(x, y) > 0;
    const edge: [number, number][] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (
          !solid(x, y) &&
          (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1))
        )
          edge.push([x, y]);
    for (const [x, y] of edge) this.px(x, y, c);
  }
  done() {
    this.canvas.getContext('2d')!.putImageData(this.img, 0, 0);
    return this.canvas;
  }
}
const cache = new Map<string, THREE.CanvasTexture>();
function texture(key: string, make: () => HTMLCanvasElement, repeat = false) {
  let t = cache.get(key);
  if (!t) {
    t = new THREE.CanvasTexture(make());
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    cache.set(key, t);
  }
  return t;
}

/** 32 × 32 flagstones; variants shuffle the stone layout. */
export function floorTexture(
  id: ThemeId,
  variant: number,
  kind: 'stone' | 'wood' | 'carpet' = 'stone',
) {
  const th = THEMES[id];
  return texture(`floor-${id}-${variant}-${kind}`, () => {
    const p = new Pix(32, 32, 17 + variant * 131 + id.length * 7);
    if (kind === 'wood') {
      const planks = ['#7a5232', '#86603b', '#6e4a2d', '#8f6842'];
      for (let row = 0; row < 4; row++) {
        const c = planks[(row + variant) % 4],
          off = (row * 11 + variant * 5) % 32;
        p.rect(0, row * 8, 32, 8, c);
        p.rect(0, row * 8 + 7, 32, 1, '#4a311e');
        p.rect(off, row * 8, 1, 7, '#4a311e');
        p.px((off + 4) % 32, row * 8 + 3, '#4a311e');
      }
      p.noise(0.12, ['#94704a', '#6a4529']);
      return p.done();
    }
    if (kind === 'carpet') {
      p.rect(0, 0, 32, 32, th.accent);
      p.noise(0.18, [shadeHex(th.accent, 0.82), shadeHex(th.accent, 1.12)]);
      for (let i = 0; i < 32; i += 4) {
        p.px(i, (i + variant * 3) % 32, th.trim);
        p.px((i + 2) % 32, (i + 16 + variant) % 32, shadeHex(th.trim, 0.8));
      }
      return p.done();
    }
    p.rect(0, 0, 32, 32, th.grout);
    // Two rows of uneven flagstones.
    const rows = variant % 2 ? [0, 14, 32] : [0, 18, 32];
    for (let r = 0; r < 2; r++) {
      let x = (variant * 7 + r * 9) % 12;
      const y0 = rows[r],
        y1 = rows[r + 1];
      p.rect(0, y0, x, y1 - y0 - 1, p.pick(th.floor));
      while (x < 32) {
        const w = 9 + Math.floor(p.rand() * 9);
        const c = p.pick(th.floor);
        p.rect(x + 1, y0 + 1, Math.min(w, 32 - x) - 1, y1 - y0 - 2, c);
        p.rect(x + 1, y0 + 1, Math.min(w, 32 - x) - 1, 1, shadeHex(c, 1.12));
        x += w;
      }
    }
    p.noise(0.1, [shadeHex(th.floor[0], 0.85), shadeHex(th.floor[1], 1.1)]);
    if (th.moss) {
      for (let i = 0; i < 14 + variant * 3; i++) {
        const x = Math.floor(p.rand() * 32),
          y = rows[1 + Math.floor(p.rand() * 2)] - 1;
        p.px(x, y, th.moss);
        p.px(x + 1, y, th.moss);
        if (p.rand() < 0.5) p.px(x, y - 1, shadeHex(th.moss, 1.2));
      }
    }
    if (variant === 3) p.line(5, 5, 12, 10, shadeHex(th.grout, 0.9));
    return p.done();
  });
}
/** Brick face for wall sides, 32 × 32 per tile. */
export function wallTexture(id: ThemeId, variant = 0) {
  const th = THEMES[id];
  return texture(`wall-${id}-${variant}`, () => {
    const p = new Pix(32, 32, 91 + variant * 37);
    p.rect(0, 0, 32, 32, th.mortar);
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 0 : 8;
      for (let x = -off; x < 32; x += 16) {
        const c = p.pick(th.wall);
        p.rect(x + 1, row * 8 + 1, 15, 6, c);
        p.rect(x + 1, row * 8 + 1, 15, 1, shadeHex(c, 1.15));
        p.rect(x + 1, row * 8 + 6, 15, 1, shadeHex(c, 0.82));
      }
    }
    p.noise(0.06, [shadeHex(th.wall[0], 0.8), shadeHex(th.wall[1], 1.15)]);
    if (th.moss && variant)
      for (let x = 0; x < 32; x++) {
        const len = Math.floor(p.rand() * (variant === 2 ? 14 : 6));
        for (let y = 0; y < len; y++) p.px(x, y, y > len - 2 ? shadeHex(th.moss, 0.8) : th.moss);
      }
    // Darken toward the floor for a little grounding.
    p.rect(0, 30, 32, 2, shadeHex(th.mortar, 0.75));
    return p.done();
  });
}
export function capTexture(id: ThemeId) {
  const th = THEMES[id];
  return texture(`cap-${id}`, () => {
    const p = new Pix(16, 16, 5);
    p.rect(0, 0, 16, 16, th.cap);
    p.noise(0.2, [shadeHex(th.cap, 1.3), shadeHex(th.cap, 0.8)]);
    p.rect(0, 0, 16, 1, shadeHex(th.wall[1], 0.7));
    return p.done();
  });
}
/** Bookshelf face for archive stacks. */
export function shelfTexture() {
  return texture('shelf', () => {
    const p = new Pix(32, 32, 77);
    p.rect(0, 0, 32, 32, '#4a311e');
    const spines = ['#6e1f24', '#24365e', '#4d6b2c', '#a8662a', '#d8d0b8', '#3f5f9e', '#b0383b'];
    for (let shelf = 0; shelf < 3; shelf++) {
      const y = 2 + shelf * 10;
      let x = 2;
      while (x < 30) {
        const w = 2 + Math.floor(p.rand() * 2),
          h = 6 + Math.floor(p.rand() * 2),
          c = p.pick(spines);
        p.rect(x, y + 8 - h, w, h, c);
        p.px(x, y + 8 - h + 1, shadeHex(c, 1.3));
        x += w + (p.rand() < 0.15 ? 2 : 0);
      }
      p.rect(0, y + 8, 32, 2, '#6b4a32');
    }
    p.rect(0, 0, 2, 32, '#6b4a32');
    p.rect(30, 0, 2, 32, '#6b4a32');
    return p.done();
  });
}

export type PropId =
  | 'torch'
  | 'banner'
  | 'barrel'
  | 'crate'
  | 'plant'
  | 'mushroom'
  | 'bones'
  | 'candle'
  | 'books'
  | 'table'
  | 'rack'
  | 'wardrobe'
  | 'mirror'
  | 'tablet'
  | 'lever'
  | 'leverOn'
  | 'brazier'
  | 'brazierLit'
  | 'pedestal'
  | 'pedestalEmpty'
  | 'stone'
  | 'chest'
  | 'stairsDown'
  | 'counter';
export interface Prop {
  texture: THREE.CanvasTexture;
  /** World size, at the characters' pixel scale. */
  w: number;
  h: number;
  /** Props that hang on a wall rather than stand on the floor. */
  wall?: boolean;
  glow?: boolean;
}
/** World units per pixel, matching a 64 px character frame drawn 1.85 units tall. */
export const PIXEL = 1.85 / 64;

function drawProp(id: PropId, theme: Theme, frame: number): Pix {
  const flame = (p: Pix, x: number, y: number, s = 1) => {
    const lick = frame % 2;
    p.ellipse(x, y - 2 * s, 2.6 * s, 4 * s + lick, '#f0a04a');
    p.ellipse(x, y - 1.5 * s, 1.6 * s, 2.6 * s + lick * 0.5, '#f2cf7a');
    p.px(x, y - 4 * s - lick, '#fff3c4');
  };
  switch (id) {
    case 'torch': {
      const p = new Pix(10, 22);
      p.rect(4, 10, 2, 11, '#6e3f18');
      p.rect(3, 9, 4, 2, '#4a4a55');
      flame(p, 5, 9);
      p.outline();
      return p;
    }
    case 'banner': {
      const p = new Pix(18, 36);
      p.rect(1, 1, 16, 2, '#6e3f18');
      p.rect(2, 3, 14, 26, theme.accent);
      for (let y = 29; y < 34; y++) p.rect(2 + (y - 29), y, 14 - (y - 29) * 2, 1, theme.accent);
      p.rect(2, 3, 14, 1, theme.trim);
      p.rect(2, 3, 1, 26, shadeHex(theme.accent, 0.75));
      p.ellipse(9, 14, 3.5, 3.5, theme.trim);
      p.ellipse(9, 14, 1.8, 1.8, theme.accent);
      p.outline();
      return p;
    }
    case 'barrel': {
      const p = new Pix(22, 28);
      p.ellipse(11, 14, 10, 13, '#7a5232');
      for (const x of [5, 10, 15]) p.rect(x, 2, 1, 24, '#5a3a22');
      p.rect(1, 6, 20, 2, '#4a4a55');
      p.rect(1, 20, 20, 2, '#4a4a55');
      p.ellipse(11, 3, 8, 2, '#8f6842');
      p.noise(0.08, ['#86603b', '#6e4a2d']);
      p.outline();
      return p;
    }
    case 'crate': {
      const p = new Pix(24, 24);
      p.rect(1, 1, 22, 22, '#86603b');
      for (const y of [1, 11, 21]) p.rect(1, y, 22, 2, '#6b4a32');
      p.rect(1, 1, 2, 22, '#6b4a32');
      p.rect(21, 1, 2, 22, '#6b4a32');
      p.line(3, 3, 21, 21, '#6b4a32');
      p.noise(0.08, ['#94704a', '#6e4a2d']);
      p.outline();
      return p;
    }
    case 'plant': {
      const p = new Pix(22, 32);
      p.rect(6, 22, 10, 9, '#a8662a');
      p.rect(5, 21, 12, 2, '#c07a3a');
      const leaf = ['#4d6b2c', '#6b8f3a', '#8fb354'];
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + (i - 4) * 0.33,
          len = 10 + (i % 3) * 3;
        for (let t = 2; t < len; t++)
          p.ellipse(11 + Math.cos(a) * t, 21 + Math.sin(a) * t, 1.6, 1.6, leaf[i % 3]);
      }
      p.outline();
      return p;
    }
    case 'mushroom': {
      const p = new Pix(18, 14);
      for (const [x, s] of [
        [5, 1],
        [12, 1.3],
        [9, 0.8],
      ] as const) {
        p.rect(x - 1, 13 - 6 * s, 2, 6 * s, '#e6dcc0');
        p.ellipse(x, 13 - 6 * s, 3.5 * s, 2.2 * s, '#b0383b');
        p.px(x - 1, 12 - 6 * s, '#f3f1f7');
      }
      p.outline();
      return p;
    }
    case 'bones': {
      const p = new Pix(22, 12);
      p.ellipse(7, 6, 4, 3.5, '#e6dcc0');
      p.px(6, 6, OUTLINE);
      p.px(8, 6, OUTLINE);
      p.rect(11, 8, 9, 2, '#d8d0b8');
      p.ellipse(11, 9, 1.5, 1.5, '#e6dcc0');
      p.ellipse(20, 9, 1.5, 1.5, '#e6dcc0');
      p.outline();
      return p;
    }
    case 'candle': {
      const p = new Pix(14, 20);
      for (const [x, h] of [
        [4, 8],
        [9, 11],
      ] as const) {
        p.rect(x - 1, 19 - h, 3, h, '#f3f1f7');
        p.px(x + 1, 19 - h, '#d8d0b8');
        flame(p, x, 19 - h, 0.6);
      }
      p.outline();
      return p;
    }
    case 'books': {
      const p = new Pix(20, 14);
      const c = ['#6e1f24', '#24365e', '#4d6b2c', '#a8662a'];
      for (let i = 0; i < 4; i++) p.rect(2 + (i % 2), 11 - i * 3, 15, 3, c[i]);
      for (let i = 0; i < 4; i++) p.rect(3 + (i % 2), 11 - i * 3 + 1, 13, 1, '#f3f1f7');
      p.outline();
      return p;
    }
    case 'table': {
      const p = new Pix(40, 24);
      p.rect(1, 6, 38, 5, '#86603b');
      p.rect(1, 6, 38, 1, '#a07850');
      p.rect(3, 11, 3, 12, '#6b4a32');
      p.rect(34, 11, 3, 12, '#6b4a32');
      p.rect(9, 2, 5, 4, '#d8d0b8');
      p.rect(26, 3, 4, 3, '#a8662a');
      p.outline();
      return p;
    }
    case 'counter': {
      const p = new Pix(56, 26);
      p.rect(1, 4, 54, 21, '#6b4a32');
      p.rect(1, 4, 54, 3, '#a07850');
      for (let x = 6; x < 54; x += 10) p.rect(x, 9, 1, 15, '#4a311e');
      p.rect(8, 0, 4, 4, '#d8d0b8');
      p.rect(40, 0, 6, 4, '#a8662a');
      p.outline();
      return p;
    }
    case 'rack': {
      const p = new Pix(26, 30);
      p.rect(2, 4, 22, 2, '#6b4a32');
      p.rect(2, 24, 22, 2, '#6b4a32');
      p.rect(3, 4, 2, 24, '#6b4a32');
      p.rect(21, 4, 2, 24, '#6b4a32');
      for (const x of [8, 13, 18]) {
        p.rect(x, 1, 1, 25, '#c4c1d2');
        p.rect(x - 1, 18, 3, 1, '#e8c547');
      }
      p.outline();
      return p;
    }
    case 'wardrobe': {
      const p = new Pix(36, 56);
      p.rect(2, 3, 32, 52, '#6e3f18');
      p.rect(2, 3, 32, 3, '#8f6842');
      p.rect(4, 8, 13, 44, '#86603b');
      p.rect(19, 8, 13, 44, '#86603b');
      p.rect(15, 28, 2, 4, '#e8c547');
      p.rect(19, 28, 2, 4, '#e8c547');
      // A sleeve peeking out of the doors.
      p.rect(17, 40, 2, 10, theme.accent);
      p.rect(0, 0, 36, 3, '#4a311e');
      p.outline();
      return p;
    }
    case 'mirror': {
      const p = new Pix(22, 46);
      p.ellipse(11, 20, 9, 17, '#e8c547');
      p.ellipse(11, 20, 7, 15, '#9fc3d6');
      p.line(7, 12, 9, 8, '#e6f2f7');
      p.line(8, 16, 12, 9, '#e6f2f7');
      p.rect(9, 37, 4, 7, '#a8662a');
      p.rect(5, 43, 12, 2, '#a8662a');
      p.outline();
      return p;
    }
    case 'tablet': {
      const p = new Pix(20, 26);
      p.rect(3, 4, 14, 20, '#879a89');
      p.ellipse(10, 5, 7, 4, '#879a89');
      p.rect(2, 22, 16, 3, '#5e6b60');
      for (let y = 8; y < 20; y += 3)
        for (let x = 6; x < 15; x += 3) if ((x + y) % 2) p.px(x, y, '#a7e1f5');
      p.outline();
      return p;
    }
    case 'lever':
    case 'leverOn': {
      const p = new Pix(18, 26);
      p.rect(3, 18, 12, 7, '#5e5b70');
      p.rect(3, 18, 12, 1, '#8d8aa0');
      const on = id === 'leverOn';
      p.line(9, 19, on ? 15 : 3, 5, '#a8662a');
      p.ellipse(on ? 15 : 3, 5, 2.4, 2.4, on ? '#9ee7b3' : '#e2b15b');
      p.outline();
      return p;
    }
    case 'brazier':
    case 'brazierLit': {
      const p = new Pix(22, 30);
      p.rect(10, 16, 2, 12, '#4a4a55');
      p.rect(6, 27, 10, 2, '#4a4a55');
      p.ellipse(11, 15, 9, 4, '#5e5b70');
      p.rect(3, 12, 16, 3, '#5e5b70');
      p.rect(3, 12, 16, 1, '#8d8aa0');
      if (id === 'brazierLit') flame(p, 11, 13, 1.6);
      else for (const x of [7, 11, 14]) p.px(x, 11, '#3a3848');
      p.outline();
      return p;
    }
    case 'pedestal':
    case 'pedestalEmpty': {
      const p = new Pix(20, 28);
      p.rect(5, 10, 10, 16, '#8d8aa0');
      p.rect(3, 8, 14, 3, '#c4c1d2');
      p.rect(3, 25, 14, 3, '#5e5b70');
      if (id === 'pedestal') {
        p.ellipse(8, 4, 2.5, 2.5, '#e8c547');
        p.rect(10, 3, 7, 2, '#e8c547');
        p.px(15, 5, '#e8c547');
        p.px(13, 5, '#e8c547');
      }
      p.outline();
      return p;
    }
    case 'stone': {
      const p = new Pix(32, 32, 9);
      p.rect(1, 1, 30, 30, '#9fa38a');
      p.rect(1, 1, 30, 3, '#bfc3a8');
      p.rect(1, 27, 30, 4, '#7d816a');
      p.noise(0.12, ['#8b8f78', '#b2b69a']);
      p.line(6, 10, 14, 14, '#7d816a');
      p.outline('#3a3d32');
      return p;
    }
    case 'chest': {
      const p = new Pix(26, 20);
      p.rect(1, 6, 24, 13, '#86603b');
      p.ellipse(13, 6, 12, 5, '#a07850');
      p.rect(1, 9, 24, 2, '#e8c547');
      p.rect(11, 9, 4, 5, '#e8c547');
      p.outline();
      return p;
    }
    case 'stairsDown': {
      const p = new Pix(32, 32);
      for (let i = 0; i < 6; i++) p.rect(0, i * 5, 32, 5, shadeHex('#5e5b70', 1 - i * 0.14));
      for (let i = 0; i < 6; i++) p.rect(0, i * 5, 32, 1, '#8d8aa0');
      return p;
    }
  }
}
const PROP_META: Partial<Record<PropId, { wall?: boolean; glow?: boolean }>> = {
  torch: { wall: true, glow: true },
  banner: { wall: true },
  mirror: {},
  candle: { glow: true },
  brazierLit: { glow: true },
};
/** A prop sprite texture. Animated props (flames) have two frames. */
export function prop(id: PropId, themeId: ThemeId, frame = 0): Prop {
  const th = THEMES[themeId];
  const key = `prop-${id}-${themeId}-${frame}`;
  let w = 0,
    h = 0;
  const t = texture(key, () => {
    const p = drawProp(id, th, frame);
    return p.done();
  });
  w = t.image.width;
  h = t.image.height;
  return { texture: t, w: w * PIXEL, h: h * PIXEL, ...PROP_META[id] };
}
export const ANIMATED_PROPS: PropId[] = ['torch', 'candle', 'brazierLit'];

/** 7 × 7 icons for named levers, painted at double size on the lever's plaque. */
const GLYPHS: Record<string, string[]> = {
  sun: ['#..#..#', '.#...#.', '..###..', '#.###.#', '..###..', '.#...#.', '#..#..#'],
  moon: ['..###..', '.##....', '##.....', '##.....', '##.....', '.##....', '..###..'],
  star: ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'],
  tide: ['.......', '.##..##', '#..##..', '.......', '.##..##', '#..##..', '.......'],
  comet: ['....###', '...####', '..#####', '.#.###.', '#.#....', '.#.....', '#......'],
};
/** A lever with its symbol on the base plaque, thrown forward when `on`. */
export function leverTexture(name: string, on: boolean, themeId: ThemeId) {
  return texture(`lever-${name}-${on}-${themeId}`, () => {
    const p = new Pix(28, 38);
    p.rect(2, 20, 24, 17, '#2e2c3a');
    p.rect(2, 20, 24, 1, '#8d8aa0');
    p.rect(3, 21, 22, 15, '#3a3848');
    const icon = GLYPHS[name.toLowerCase()];
    const ink = on ? '#9ee7b3' : '#e8c547';
    if (icon)
      icon.forEach((row, y) =>
        [...row].forEach((c, x) => {
          if (c === '#') p.rect(7 + x * 2, 22 + y * 2, 2, 2, ink);
        }),
      );
    p.line(14, 20, on ? 24 : 4, 5, '#a8662a');
    p.ellipse(on ? 24 : 4, 5, 2.8, 2.8, on ? '#9ee7b3' : '#e2b15b');
    p.outline();
    return p.done();
  });
}
