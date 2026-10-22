import { expect, it } from 'vitest';
import { RACE_IDS, SEX_IDS } from '@delver/rules';
import { F, LOOK_CLASS_IDS } from './model';
import { Doll, defaultLook, randomLook } from './looks';
import { blockGear, skeleton } from './pose';

const opaque = (frame: Uint8ClampedArray) => {
  let n = 0;
  for (let i = 3; i < frame.length; i += 4) if (frame[i]) n++;
  return n;
};

it.each(RACE_IDS)('draws every %s sex and class, standing on the ground row', (race) => {
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
      expect(Math.min(...rows), `${race}${sex} ${cls} top`).toBeGreaterThan(0);
    }
});

it('keeps default headwear in frame and helm openings clear of the eyes in every direction', () => {
  const buf = new Uint8ClampedArray(F * F * 4);
  for (const race of RACE_IDS)
    for (const sex of SEX_IDS)
      for (let dir = 0; dir < 8; dir++)
        for (const style of ['helm', 'kabuto', 'wizard']) {
          const body = `${race}${sex}`;
          // Peak idle breathing is the highest head position.
          blockGear(buf, 'idle', 2, dir, body, 'helmet', '#7b8798', style);
          for (let x = 0; x < F; x++) expect(buf[x * 4 + 3], `${body} ${style}/${dir} top`).toBe(0);
          if (style === 'wizard') continue;
          const sk = skeleton('idle', 2, dir, body),
            h = sk.headLocal;
          for (const side of [-1, 1]) {
            const eye = sk.toScreen({
              x: h.x + side * sk.HR * 0.38,
              y: h.y - sk.HR * 0.05,
              z: h.z + sk.HR * 0.9,
            });
            if (eye.d <= sk.head.d + sk.HR * 0.3) continue;
            const i = (Math.floor(eye.y) * F + Math.floor(eye.x)) * 4;
            expect(buf[i + 3], `${body} ${style}/${dir} eye`).toBe(0);
          }
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

it('keeps the drawn bowstring behind the bow arm', () => {
  const bow = new Uint8ClampedArray(F * F * 4);
  let checked = 0;
  for (const race of RACE_IDS)
    for (const sex of SEX_IDS)
      for (const frame of [2, 3]) {
        const body = `${race}${sex}`;
        const sk = skeleton('shoot', frame, 2, body);
        const arm = sk.segs.find((s) => s.part === 'forearm' && s.side === 'L')!;
        const dx = arm.b.x - arm.a.x,
          dy = arm.b.y - arm.a.y;
        const radius = 2.3 * sk.b.bulk * sk.b.scale;
        blockGear(bow, 'shoot', frame, 2, body, 'weapon', '#a8662a', 'bow');
        for (let y = 0; y < F; y++)
          for (let x = 0; x < F; x++) {
            const px = x + 0.5,
              py = y + 0.5;
            const t = ((px - arm.a.x) * dx + (py - arm.a.y) * dy) / (dx * dx + dy * dy);
            // Inside the forearm, away from the nocked arrow and the grip.
            if (t < 0 || t > 0.9 || Math.abs(py - arm.b.y) < 1.5) continue;
            if (Math.hypot(px - arm.a.x - t * dx, py - arm.a.y - t * dy) > radius - 0.4) continue;
            checked++;
            const i = (y * F + x) * 4;
            const string = bow[i + 3] && bow[i] === 196 && bow[i + 1] === 193 && bow[i + 2] === 210;
            expect(!!string, `${body} shoot ${frame}: string over arm at ${x},${y}`).toBe(false);
          }
      }
  expect(checked).toBeGreaterThan(50);
});
