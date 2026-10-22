import { expect, it } from 'vitest';
import { F, PX, RACES, hexRgb, splitBody } from './model';
import {
  PORTRAIT_BODIES,
  PORTRAIT_KEY,
  PORTRAIT_DRAFT_KEY,
  PORTRAIT_TIMING,
  portraitPixels,
  portraitPlayback,
  portraitKey,
  readPortraits,
  writePortrait,
  resolvePortrait,
  validPortrait,
} from './portraits';
import type { Portrait } from './portraits';
import { stroke, fill } from '../studio/portrait-paint';

const png = 'data:image/png;base64,aGVhZA==';
const entry = (body: Portrait['body'] = 'humanF'): Portrait => ({
  body,
  frames: [png],
  ...PORTRAIT_TIMING,
  updated: 1,
});
function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    data,
  };
}

it('supplies ten distinct native-resolution head shapes and finished dialogue defaults', () => {
  const shapes = new Set<string>(),
    faces = new Set<string>();
  for (const body of PORTRAIT_BODIES) {
    const shape = portraitPixels(body, false),
      face = portraitPixels(body);
    expect(shape.length).toBe(PX);
    expect(face.length).toBe(PX);
    let count = 0;
    for (let i = 3; i < PX; i += 4) {
      expect([0, 255]).toContain(shape[i]);
      if (shape[i]) count++;
    }
    expect(count).toBeGreaterThan(900);
    expect(shape).not.toEqual(face);
    shapes.add(Buffer.from(shape).toString('base64'));
    faces.add(Buffer.from(face).toString('base64'));
  }
  expect(shapes.size).toBe(10);
  expect(faces.size).toBe(10);
});
it('keeps the fallback hair behind the visible female neck', () => {
  for (const body of PORTRAIT_BODIES.filter((body) => body.endsWith('F'))) {
    const pixels = portraitPixels(body);
    const neck = (51 * F + 32) * 4;
    expect([...pixels.slice(neck, neck + 4)]).toEqual([
      ...hexRgb(RACES[splitBody(body).race].skin[1]),
      255,
    ]);
  }
});
it('plays three full loops then holds precisely on frame one before repeating', () => {
  const t = { fps: 8, loops: 3, restMs: 4000 };
  expect(portraitPlayback(125, 16, t)).toMatchObject({ frame: 1, resting: false, loop: 1 });
  expect(portraitPlayback(2000, 16, t)).toMatchObject({ frame: 0, loop: 2 });
  expect(portraitPlayback(5999, 16, t)).toMatchObject({ frame: 15, resting: false, loop: 3 });
  expect(portraitPlayback(6000, 16, t)).toMatchObject({ frame: 0, resting: true });
  expect(portraitPlayback(9999, 16, t)).toMatchObject({ frame: 0, resting: true });
  expect(portraitPlayback(10125, 16, t)).toMatchObject({ frame: 1, resting: false, loop: 1 });
  for (let count = 1; count <= 16; count++)
    for (const ms of [0, 300, 2700, 5900, 10000, 100000]) {
      const p = portraitPlayback(ms, count, t);
      expect(p.frame).toBeGreaterThanOrEqual(0);
      expect(p.frame).toBeLessThan(count);
      if (count === 1) expect(p.frame).toBe(0);
    }
});
it('separates draft, body defaults and individual portraits without altering sprite or game saves', () => {
  const store = storage();
  store.setItem('dungeon-delver.save', 'expedition');
  store.setItem('dungeon-delver.wardrobe.v1', 'sprite art');
  const shared = entry(),
    own = { ...entry(), frames: [png, png], updated: 2 };
  writePortrait('', shared, store);
  writePortrait('ghost-0', own, store);
  writePortrait('', { ...entry('orcM'), updated: 3 }, store, PORTRAIT_DRAFT_KEY);
  const all = readPortraits(store);
  expect(resolvePortrait(all, 'humanF', 'ghost-0')).toEqual(own);
  expect(resolvePortrait(all, 'humanF', 'ghost-1')).toEqual(shared);
  expect(resolvePortrait(all, 'orcM', 'ghost-0')).toBeUndefined();
  expect(readPortraits(store, PORTRAIT_DRAFT_KEY)[portraitKey('orcM')].updated).toBe(3);
  expect(store.getItem('dungeon-delver.save')).toBe('expedition');
  expect(store.getItem('dungeon-delver.wardrobe.v1')).toBe('sprite art');
});
it('rejects oversized or malformed portraits and tolerates broken saved data', () => {
  const store = storage();
  expect(validPortrait({ ...entry(), frames: Array(17).fill(png) })).toBe(false);
  expect(validPortrait({ ...entry(), frames: [] })).toBe(false);
  expect(validPortrait({ ...entry(), frames: ['data:image/svg+xml,<svg/>'] })).toBe(false);
  expect(validPortrait({ ...entry(), fps: 0 })).toBe(false);
  expect(validPortrait({ ...entry(), restMs: 0 })).toBe(false);
  expect(() => writePortrait('', { ...entry(), frames: [] }, store)).toThrow();
  store.setItem(PORTRAIT_KEY, 'broken');
  expect(readPortraits(store)).toEqual({});
  store.setItem(PORTRAIT_KEY, JSON.stringify({ version: 1, entries: { bad: {}, good: entry() } }));
  expect(Object.keys(readPortraits(store))).toEqual(['good']);
});
it('paints continuous strokes with exact even-size symmetry, erases, and fills only a connected region', () => {
  const buf = new Uint8ClampedArray(PX);
  stroke(buf, [8, 8], [15, 15], [255, 0, 0, 255], 2, true);
  for (let y = 0; y < F; y++)
    for (let x = 0; x < F; x++)
      expect(buf[(y * F + x) * 4 + 3]).toBe(buf[(y * F + F - 1 - x) * 4 + 3]);
  expect(buf[(10 * F + 10) * 4]).toBe(255);
  stroke(buf, [10, 10], [10, 10], [0, 0, 0, 0]);
  expect(buf[(10 * F + 10) * 4 + 3]).toBe(0);
  const box = new Uint8ClampedArray(PX);
  for (const [a, b] of [
    [
      [20, 20],
      [30, 20],
    ],
    [
      [30, 20],
      [30, 30],
    ],
    [
      [30, 30],
      [20, 30],
    ],
    [
      [20, 30],
      [20, 20],
    ],
  ] as const)
    stroke(box, [...a], [...b], [1, 1, 1, 255]);
  fill(box, 25, 25, [20, 40, 60, 255]);
  expect([...box.slice((25 * F + 25) * 4, (25 * F + 25) * 4 + 4)]).toEqual([20, 40, 60, 255]);
  expect(box[3]).toBe(0);
  expect(box[(20 * F + 20) * 4]).toBe(1);
});
