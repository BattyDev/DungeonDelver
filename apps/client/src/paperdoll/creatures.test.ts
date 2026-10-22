import { expect, it } from 'vitest';
import { ANIMS, F, PX } from './model';
import { CREATURE_IDS, creatureFor } from './creatures';

it.each(CREATURE_IDS)(
  'draws %s animations at native resolution with binary alpha and visible reactions',
  (type) => {
    const source = creatureFor(type);
    for (const anim of ['idle', 'walk', 'attack', 'hurt', 'death'] as const)
      for (const dir of [0, 2, 4, 6])
        for (let f = 0; f < ANIMS[anim].frames; f++) {
          const frame = source.frameNow(anim, dir, f);
          expect(frame.length).toBe(PX);
          let opaque = 0;
          for (let i = 3; i < PX; i += 4) {
            if (frame[i] === 255) opaque++;
            else if (frame[i] !== 0) throw new Error(`${type} ${anim} has soft alpha`);
          }
          expect(opaque, `${type} ${anim}/${dir}/${f}`).toBeGreaterThan(35);
        }
    const idle = source.frameNow('idle', 0, 0);
    expect(source.frameNow('idle', 0, 1), `${type} breathes/flaps/flickers`).not.toEqual(idle);
    expect(source.frameNow('hurt', 0, 0), `${type} hurt`).not.toEqual(idle);
    expect(source.frameNow('death', 0, 5), `${type} falls`).not.toEqual(idle);
    expect(source.frameNow('idle', 4, 0), `${type} turns`).not.toEqual(idle);
  },
);

it('mirrors creatures using the same direction convention as adventurers', () => {
  for (const type of CREATURE_IDS) {
    const source = creatureFor(type);
    const west = source.frameNow('walk', 2, 1),
      east = source.frameNow('walk', 6, 1);
    for (let y = 0; y < F; y++)
      for (let x = 0; x < F; x++) {
        const a = (y * F + x) * 4,
          b = (y * F + F - 1 - x) * 4;
        for (let c = 0; c < 4; c++)
          if (east[a + c] !== west[b + c]) throw new Error(`${type} mirror mismatch`);
      }
  }
});
