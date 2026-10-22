// The default dialogue faces: ten painted busts (five races × female/male) in one 320 × 128 strip,
// rebuilt from the generated reference by tools/portraits/slice_defaults.py.
import { F, PX, RACES } from './model';
import type { BodyKey } from './model';
import { portraitPixels } from './portraits';

const RACE_ORDER = Object.keys(RACES);
let faces: Map<BodyKey, Uint8ClampedArray> | undefined;
let loading: Promise<void> | undefined;
const listeners = new Set<() => void>();

/** Starts loading the strip (once) and resolves when the painted faces are ready. */
export function loadDefaultPortraits(): Promise<void> {
  loading ??= (async () => {
    const image = new Image();
    image.src = new URL('portraits/defaults-v2.png', document.baseURI).href;
    await image.decode();
    if (image.naturalWidth !== F * RACE_ORDER.length || image.naturalHeight !== F * 2)
      throw Error('Default portrait atlas must contain ten 64 × 64 portraits.');
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0);
    const map = new Map<BodyKey, Uint8ClampedArray>();
    RACE_ORDER.forEach((race, column) =>
      (['F', 'M'] as const).forEach((sex, row) => {
        const data = ctx.getImageData(column * F, row * F, F, F).data;
        map.set(`${race}${sex}` as BodyKey, new Uint8ClampedArray(data));
      }),
    );
    faces = map;
    listeners.forEach((fn) => fn());
  })().catch(() => {
    // Without the strip, the drawn faces from portraitPixels() stand in.
  });
  return loading;
}
/** Called once the painted faces arrive, so already-drawn portraits can update. */
export const onDefaultPortraits = (fn: () => void) => listeners.add(fn);
/** The finished default face for a body: the painted bust once loaded, the drawn one until then. */
export function defaultPortrait(body: BodyKey): Uint8ClampedArray {
  const face = faces?.get(body);
  if (!face || face.length !== PX) return portraitPixels(body);
  return face.slice();
}
