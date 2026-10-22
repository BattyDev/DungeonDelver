import { expect, it } from 'vitest';
import { ANIMS, F, PX } from './model';
import { blockGear, raster, skeleton } from './pose';

// A floating head can look plausible in a single still. Follow the actual alpha
// silhouette in every pose, including the turn diagonals and falling frames.
it.each(['human', 'orc', 'elf', 'dwarf', 'gnome'])(
  'keeps the %s body connected through every animation and angle',
  (race) => {
    const buf = new Uint8ClampedArray(PX);
    for (const sex of ['F', 'M'])
      for (const [anim, def] of Object.entries(ANIMS))
        for (let dir = 0; dir < 8; dir++)
          for (let f = 0; f < def.frames; f++) {
            blockGear(buf, anim as keyof typeof ANIMS, f, dir, `${race}${sex}`, 'base', '#000000');
            const remaining = new Set<number>();
            for (let i = 0; i < F * F; i++) if (buf[i * 4 + 3]) remaining.add(i);
            const sizes: number[] = [];
            while (remaining.size) {
              const stack = [remaining.values().next().value!];
              remaining.delete(stack[0]);
              let size = 0;
              while (stack.length) {
                const i = stack.pop()!;
                size++;
                for (const j of [
                  i - F,
                  i + F,
                  ...(i % F ? [i - 1] : []),
                  ...(i % F < F - 1 ? [i + 1] : []),
                ])
                  if (remaining.delete(j)) stack.push(j);
              }
              sizes.push(size);
            }
            expect(sizes.length, `${race}${sex} ${anim}/${dir}/${f}: ${sizes}`).toBe(1);
          }
  },
  30000,
);

it('interpolates crossing limbs per pixel and joins round capsule ends', () => {
  const buf = new Uint8ClampedArray(PX);
  raster(
    buf,
    [
      { a: { x: 10, y: 20 }, b: { x: 30, y: 20 }, r: 2, color: [100, 0, 0], depthEnds: [-5, 5] },
      { a: { x: 10, y: 20 }, b: { x: 30, y: 20 }, r: 2, color: [0, 100, 0], d: 0 },
    ],
    { innerEdges: false },
  );
  expect([...buf.slice((20 * F + 12) * 4, (20 * F + 12) * 4 + 3)]).toEqual([0, 100, 0]);
  expect([...buf.slice((20 * F + 28) * 4, (20 * F + 28) * 4 + 3)]).toEqual([100, 0, 0]);
  expect(buf[(20 * F + 9) * 4 + 3]).toBe(255);
});

it('makes the female waist read through fitted armour on every race', () => {
  let narrower = 0;
  for (const race of ['human', 'orc', 'elf', 'dwarf', 'gnome']) {
    // Both rigs retain their race's height and head size.
    const fs = skeleton('idle', 0, 0, `${race}F`),
      ms = skeleton('idle', 0, 0, `${race}M`);
    expect(fs.HR).toBe(ms.HR);
    expect(fs.k).toBe(ms.k);
    for (const style of ['plate', 'leather']) {
      const width = (sex: string) => {
        const sk = skeleton('idle', 0, 0, `${race}${sex}`),
          torso = sk.segs.find((s) => s.part === 'torso')!;
        const y = Math.floor(torso.a.y + (torso.b.y - torso.a.y) * 0.48);
        const buf = new Uint8ClampedArray(PX);
        blockGear(buf, 'idle', 0, 0, `${race}${sex}`, 'chest', '#7b8798', style);
        let left = 32,
          right = 32;
        while (left > 0 && buf[(y * F + left - 1) * 4 + 3]) left--;
        while (right < F - 1 && buf[(y * F + right + 1) * 4 + 3]) right++;
        return right - left + 1;
      };
      const female = width('F'),
        male = width('M');
      // A one-pixel outline quantizes the smallest waist to the same width
      // in some rows. It must never get wider, and the larger rigs must read.
      expect(female, `${race} ${style} waist`).toBeLessThanOrEqual(male);
      if (female < male) narrower++;
    }
  }
  expect(narrower).toBeGreaterThanOrEqual(8);
});

it('rotates the wizard hat with a fallen head', () => {
  const body = 'humanF',
    sk = skeleton('death', 5, 6, body);
  const buf = new Uint8ClampedArray(PX);
  blockGear(buf, 'death', 5, 6, body, 'helmet', '#24365e', 'wizard');
  const pixels: { x: number; y: number }[] = [];
  for (let y = 0; y < F; y++)
    for (let x = 0; x < F; x++) if (buf[(y * F + x) * 4 + 3]) pixels.push({ x, y });
  // In the last frame, local up points to the right: the crown extends in
  // that direction rather than standing vertically above the fallen head.
  expect(Math.max(...pixels.map((p) => p.x)) - sk.head.x).toBeGreaterThan(sk.HR);
  expect(Math.min(...pixels.map((p) => p.y))).toBeGreaterThan(sk.head.y - sk.HR * 1.7);
});
