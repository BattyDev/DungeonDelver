// Portrait projects are independent of sprite sheets and game saves.
import { F, PX, RACES, bodyKey, hexRgb, splitBody } from './model';
import type { BodyKey } from './model';

export const PORTRAIT_KEY = 'dungeon-delver.portraits.v1';
export const PORTRAIT_DRAFT_KEY = 'dungeon-delver.portrait-drafts.v1';
export const MAX_PORTRAIT_FRAMES = 16;
export const PORTRAIT_TIMING = { fps: 8, loops: 3, restMs: 4000 };
export interface Portrait {
  body: BodyKey;
  frames: string[];
  fps: number;
  loops: number;
  restMs: number;
  updated: number;
}
export type Portraits = Record<string, Portrait>;
type Store = Pick<Storage, 'getItem' | 'setItem'>;
export const portraitKey = (body: BodyKey, person = '') =>
  person ? `person:${person}|${body}` : `body:${body}`;
export function validPortraitBody(value: unknown): value is BodyKey {
  return typeof value === 'string' && /^(human|orc|elf|dwarf|gnome)[FM]$/.test(value);
}
export function validPortrait(value: unknown): value is Portrait {
  if (!value || typeof value !== 'object') return false;
  const p = value as Portrait;
  return (
    validPortraitBody(p.body) &&
    Array.isArray(p.frames) &&
    p.frames.length >= 1 &&
    p.frames.length <= MAX_PORTRAIT_FRAMES &&
    p.frames.every(
      (f) => typeof f === 'string' && f.startsWith('data:image/png;base64,') && f.length < 200_000,
    ) &&
    Number.isInteger(p.fps) &&
    p.fps >= 1 &&
    p.fps <= 12 &&
    Number.isInteger(p.loops) &&
    p.loops >= 1 &&
    p.loops <= 6 &&
    Number.isInteger(p.restMs) &&
    p.restMs >= 1000 &&
    p.restMs <= 10000 &&
    Number.isFinite(p.updated)
  );
}
export function readPortraits(store?: Store, key = PORTRAIT_KEY): Portraits {
  try {
    const data = JSON.parse((store ?? localStorage).getItem(key) ?? '{}');
    if (!data || data.version !== 1 || !data.entries || typeof data.entries !== 'object') return {};
    const entries: Portraits = Object.create(null);
    for (const [key, p] of Object.entries(data.entries)) if (validPortrait(p)) entries[key] = p;
    return entries;
  } catch {
    return {};
  }
}
/** Keep unrelated portraits, sprite sheets and the expedition save intact. Throws on quota errors. */
export function writePortrait(
  person: string,
  portrait: Portrait,
  store: Store = localStorage,
  key = PORTRAIT_KEY,
) {
  if (!validPortrait(portrait))
    throw Error('Invalid portrait project. Use 1–16 PNG frames and valid timing.');
  const entries = readPortraits(store, key);
  entries[portraitKey(portrait.body, person)] = portrait;
  store.setItem(key, JSON.stringify({ version: 1, entries }));
  if (typeof window !== 'undefined' && key === PORTRAIT_KEY)
    window.dispatchEvent(new Event('portraits-updated'));
}
export function resolvePortrait(
  entries: Portraits,
  body: BodyKey,
  person = '',
): Portrait | undefined {
  const specific = entries[portraitKey(body, person)],
    shared = entries[portraitKey(body)];
  return (
    (specific?.body === body ? specific : undefined) ?? (shared?.body === body ? shared : undefined)
  );
}
/** Three loops, then land on frame zero for a few seconds; one-frame portraits stay still. */
export function portraitPlayback(elapsedMs: number, count: number, timing = PORTRAIT_TIMING) {
  const frames = Math.max(1, Math.min(MAX_PORTRAIT_FRAMES, Math.floor(count)));
  if (frames === 1) return { frame: 0, resting: true, loop: 0 };
  const fps = Math.max(1, Math.min(12, timing.fps)),
    loops = Math.max(1, Math.min(6, timing.loops));
  const active = ((frames * 1000) / fps) * loops;
  const t = Math.max(0, elapsedMs) % (active + Math.max(1000, timing.restMs));
  return t >= active
    ? { frame: 0, resting: true, loop: loops }
    : {
        frame: Math.floor((t * fps) / 1000) % frames,
        resting: false,
        loop: Math.floor((t * fps) / 1000 / frames) + 1,
      };
}

type RGB = [number, number, number];
/** Native 64px busts: a paintable head shape, plus a finished default face for dialogue. */
export function portraitPixels(body: BodyKey, finished = true): Uint8ClampedArray {
  const { race, sex } = splitBody(body),
    r = RACES[race],
    female = sex === 'F';
  const buf = new Uint8ClampedArray(PX),
    dark: RGB = [27, 26, 36],
    skin = hexRgb(r.skin[1]),
    shade = hexRgb(r.skin[0]);
  const hair = hexRgb(r.hair),
    light = skin.map((v) => Math.min(255, v + 18)) as RGB;
  const put = (x: number, y: number, c: RGB) => {
    if (x >= 0 && y >= 0 && x < F && y < F) buf.set([...c, 255], (y * F + x) * 4);
  };
  const rect = (x: number, y: number, w: number, h: number, c: RGB) => {
    for (let yy = Math.floor(y); yy < y + h; yy++)
      for (let xx = Math.floor(x); xx < x + w; xx++) put(xx, yy, c);
  };
  const ellipse = (cx: number, cy: number, rx: number, ry: number, c: RGB) => {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
        if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) put(x, y, c);
  };
  const poly = (points: number[][], c: RGB) => {
    for (let y = 0; y < F; y++)
      for (let x = 0; x < F; x++) {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          const [ax, ay] = points[i],
            [bx, by] = points[j];
          if (
            ay > y + 0.5 !== by > y + 0.5 &&
            x + 0.5 < ((bx - ax) * (y + 0.5 - ay)) / (by - ay) + ax
          )
            inside = !inside;
        }
        if (inside) put(x, y, c);
      }
  };
  const width = { human: 16, orc: 19, elf: 14, dwarf: 18, gnome: 16 }[race] - (female ? 2 : 0);
  const height = { human: 20, orc: 20, elf: 21, dwarf: 18, gnome: 19 }[race];
  const cy = race === 'gnome' ? 28 : 29;
  const shoulders =
    (female ? 22 : 26) + (race === 'orc' || race === 'dwarf' ? 2 : race === 'gnome' ? -3 : 0);
  // Back hair belongs behind the bust, especially the exposed neck below the chin.
  if (finished && female) {
    ellipse(32, 28, width + 3, height + 4, dark);
    poly(
      [
        [32 - width - 3, 27],
        [32 + width + 3, 27],
        [32 + width + 4, 57],
        [32 + width - 2, 54],
        [32 - width + 1, 58],
        [32 - width - 4, 53],
      ],
      hair,
    );
  }
  poly(
    [
      [32 - shoulders, 63],
      [34 - shoulders, 56],
      [26, 49],
      [38, 49],
      [30 + shoulders, 56],
      [32 + shoulders, 63],
    ],
    [64, 77, 85],
  );
  poly(
    [
      [26, 44],
      [38, 44],
      [39, 54],
      [32, 58],
      [25, 54],
    ],
    shade,
  );
  rect(28, 44, 8, 9, skin);
  for (const side of [-1, 1]) {
    const x = 32 + side * width;
    if (race === 'elf' || race === 'orc') {
      const length = race === 'elf' ? 10 : 7;
      poly(
        [
          [x - side * 2, 25],
          [x + side * length, race === 'elf' ? 17 : 22],
          [x + side * (length - 2), 29],
          [x, 36],
        ],
        dark,
      );
      poly(
        [
          [x, 26],
          [x + side * (length - 2), 21],
          [x + side * (length - 3), 28],
          [x, 33],
        ],
        skin,
      );
      poly(
        [
          [x + side, 28],
          [x + side * (length - 3), 24],
          [x, 32],
        ],
        shade,
      );
    } else {
      ellipse(x + side * (race === 'gnome' ? 2 : 0), 30, race === 'gnome' ? 6 : 3, 6, dark);
      ellipse(x + side * (race === 'gnome' ? 2 : 0), 30, race === 'gnome' ? 5 : 2, 4, shade);
    }
  }
  const face = [
    [32 - width, cy - 10],
    [32 - width * 0.8, cy - height + 2],
    [32, cy - height],
    [32 + width * 0.8, cy - height + 2],
    [32 + width, cy - 10],
    [32 + width, cy + 6],
    [32 + width * (female ? 0.62 : 0.82), cy + height * 0.74],
    [32 + width * 0.3, cy + height],
    [32 - width * 0.3, cy + height],
    [32 - width * (female ? 0.62 : 0.82), cy + height * 0.74],
    [32 - width, cy + 6],
  ];
  poly(face, dark);
  poly(
    face.map(([x, y]) => [32 + (x - 32) * 0.93, cy + (y - cy) * 0.95]),
    skin,
  );
  poly(
    [
      [33 - width, cy - 8],
      [35 - width, cy + 5],
      [32 - width * 0.5, cy + height * 0.83],
      [29, cy + height * 0.93],
      [32 - width * 0.65, cy + height * 0.82],
      [33 - width, cy + 5],
    ],
    shade,
  );
  if (finished) {
    // Hairline/temples leave a broad uninterrupted face to paint over.
    poly(
      [
        [32 - width - 1, cy - 8],
        [32 - width * 0.8, cy - height],
        [32 + width * 0.8, cy - height],
        [32 + width + 1, cy - 8],
        [32 + width - 2, cy - 12],
        [35, cy - height + 5],
        [30, cy - height + 8],
        [27, cy - height + 5],
        [34 - width, cy - 10],
      ],
      hair,
    );
    for (const side of [-1, 1]) {
      const ex = 32 + side * (race === 'gnome' ? 6 : 7);
      rect(ex - 3, cy - 5, 6, 2, hair);
      rect(ex - 2, cy - 1, 4, race === 'gnome' ? 4 : 3, [231, 231, 214]);
      rect(ex - 1, cy - 1, 2, 3, dark);
      if (female) rect(ex + (side < 0 ? -3 : 2), cy - 1, 1, 1, dark);
    }
    poly(
      [
        [31, cy + 2],
        [30, cy + 8],
        [34, cy + 8],
        [33, cy + 3],
      ],
      shade,
    );
    rect(32, cy + 3, 1, 4, light);
    rect(29, cy + 13, 6, 1, shade);
    rect(30, cy + 14, 4, 1, dark);
    if (race === 'orc') {
      for (const side of [-1, 1])
        poly(
          [
            [32 + side * 7, cy + 15],
            [32 + side * 6, cy + 9],
            [32 + side * 4, cy + 15],
          ],
          [240, 236, 220],
        );
    }
    if (race === 'dwarf' && !female) {
      poly(
        [
          [16, 37],
          [23, 42],
          [28, 39],
          [32, 42],
          [36, 39],
          [41, 42],
          [48, 37],
          [45, 54],
          [38, 61],
          [26, 61],
          [19, 54],
        ],
        hair,
      );
      rect(29, 43, 6, 1, dark);
      for (const x of [23, 28, 36, 41]) rect(x, 48, 1, 6, shade);
    }
  }
  // One-pixel silhouette outline, matching the sprites without enlarging their pixels.
  const mask = buf.slice();
  for (let y = 0; y < F; y++)
    for (let x = 0; x < F; x++) {
      if (mask[(y * F + x) * 4 + 3]) continue;
      if (
        [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ].some(([xx, yy]) => xx >= 0 && yy >= 0 && xx < F && yy < F && mask[(yy * F + xx) * 4 + 3])
      )
        put(x, y, dark);
    }
  return buf;
}
export const PORTRAIT_BODIES = Object.keys(RACES).flatMap((r) =>
  ['F', 'M'].map((s) => bodyKey(r as keyof typeof RACES, s as 'F' | 'M')),
);
