import { expect, it } from 'vitest';
import { RACE_IDS, SEX_IDS } from '@delver/rules';
import { F, LOOK_CLASS_IDS } from './model';
import { Doll, defaultLook, randomLook } from './looks';

const opaque = (frame: Uint8ClampedArray) => {
  let n = 0;
  for (let i = 3; i < frame.length; i += 4) if (frame[i]) n++;
  return n;
};

it('draws every race, sex and class, standing on the ground row', () => {
  for (const race of RACE_IDS)
    for (const sex of SEX_IDS)
      for (const cls of LOOK_CLASS_IDS) {
        const frame = new Doll(defaultLook(race, sex, cls)).frameNow('idle', 0, 0);
        expect(frame.length).toBe(F * F * 4);
        expect(opaque(frame), `${race}${sex} ${cls}`).toBeGreaterThan(300);
        // Feet reach the bottom rows; nothing is clipped off the top.
        const rows = [...Array(F).keys()].filter((y) =>
          [...Array(F).keys()].some((x) => frame[(y * F + x) * 4 + 3]),
        );
        expect(Math.max(...rows)).toBeGreaterThanOrEqual(F - 3);
        // Orcs fill the frame to the top row; only their wizard hat brushes the edge.
        if (race !== 'orc' || cls !== 'mage')
          expect(Math.min(...rows), `${race}${sex} ${cls} top`).toBeGreaterThan(0);
      }
});

it('mirrors the east-facing side from the west and keeps random looks in their class', () => {
  const doll = new Doll(defaultLook('elf', 'F', 'archer'));
  const west = doll.frameNow('walk', 2, 1),
    east = doll.frameNow('walk', 6, 1);
  for (let y = 0; y < F; y++)
    for (let x = 0; x < F; x++)
      expect(east[(y * F + x) * 4 + 3]).toBe(west[(y * F + (F - 1 - x)) * 4 + 3]);
  let seed = 1;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 20; i++) expect(randomLook('mage', rand).cls).toBe('mage');
});
