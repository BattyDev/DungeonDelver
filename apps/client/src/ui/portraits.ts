import type { Look } from '../paperdoll/looks';
import { bodyKey, F } from '../paperdoll/model';
import type { BodyKey } from '../paperdoll/model';
import {
  PORTRAIT_KEY,
  PORTRAIT_TIMING,
  portraitPlayback,
  readPortraits,
  resolvePortrait,
  validPortraitBody,
} from '../paperdoll/portraits';
import { escapeHtml as esc } from './icons';
import {
  defaultPortrait,
  loadDefaultPortraits,
  onDefaultPortraits,
} from '../paperdoll/default-portraits';

export function portraitHtml(
  look: Pick<Look, 'race' | 'sex'>,
  person = '',
  className = '',
  label = 'Portrait',
  animated = false,
) {
  return `<canvas width="64" height="64" class="pixel-art painted-portrait ${esc(className)}" data-portrait-body="${bodyKey(look.race, look.sex)}" data-portrait-person="${esc(person)}" data-portrait-animate="${animated}" role="img" aria-label="${esc(label)}"></canvas>`;
}
let entries = readPortraits(),
  revision = 0;
const invalidate = () => {
  entries = readPortraits();
  revision++;
};
window.addEventListener('portraits-updated', invalidate);
// Faces without a painted portrait switch to the painted defaults once the strip has loaded.
onDefaultPortraits(() => revision++);
void loadDefaultPortraits();
window.addEventListener('storage', (e) => {
  if (e.key === PORTRAIT_KEY || e.key === null) invalidate();
});
interface Playback {
  revision: number;
  start: number;
  shown: number;
  images: HTMLImageElement[];
  body: BodyKey;
  timing: typeof PORTRAIT_TIMING;
  count: number;
}
const players = new WeakMap<HTMLCanvasElement, Playback>();
const decoded = new Map<string, HTMLImageElement>();
const imageFor = (url: string) => {
  let image = decoded.get(url);
  if (!image) {
    image = new Image();
    image.src = url;
    decoded.set(url, image);
  }
  return image;
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
/** Called by the game's one animation loop, including while a character is speaking in a modal. */
export function tickPortraits(root: ParentNode, ms: number) {
  for (const canvas of root.querySelectorAll<HTMLCanvasElement>('canvas[data-portrait-body]')) {
    const body = canvas.dataset.portraitBody;
    if (!validPortraitBody(body)) continue;
    let p = players.get(canvas);
    if (!p || p.revision !== revision) {
      const entry = resolvePortrait(entries, body, canvas.dataset.portraitPerson);
      p = {
        revision,
        start: ms,
        shown: -1,
        body,
        images: entry?.frames.map(imageFor) ?? [],
        count: entry?.frames.length ?? 1,
        timing: entry
          ? { fps: entry.fps, loops: entry.loops, restMs: entry.restMs }
          : PORTRAIT_TIMING,
      };
      players.set(canvas, p);
      canvas
        .getContext('2d')!
        .putImageData(new ImageData(new Uint8ClampedArray(defaultPortrait(body)), F, F), 0, 0);
    }
    const frame =
      !reduced.matches && canvas.dataset.portraitAnimate === 'true'
        ? portraitPlayback(ms - p.start, p.count, p.timing).frame
        : 0;
    canvas.dataset.portraitFrame = String(frame);
    if (frame === p.shown) continue;
    const img = p.images[frame];
    if (!img) {
      p.shown = frame;
      continue;
    }
    if (!img.complete || img.naturalWidth !== F || img.naturalHeight !== F) continue;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, F, F);
    ctx.drawImage(img, 0, 0);
    p.shown = frame;
  }
}
