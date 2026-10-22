import { describe, it, expect } from 'vitest';
import { CLASSES, CLASS_IDS } from './classes';
import { ITEMS, SLOTS, defaultLoadout } from './items';
import { deriveStats } from './stats';
import { random } from './rng';
import { GHOSTS } from './content/ghosts';
describe('content and deterministic stats', () => {
  it('ships exactly two options for all twenty class slots', () => {
    expect(ITEMS).toHaveLength(40);
    for (const c of CLASS_IDS)
      for (const slot of SLOTS)
        expect(ITEMS.filter((i) => i.classId === c && i.slot === slot)).toHaveLength(2);
  });
  it('syncs to floor rather than earned level, then applies gear', () => {
    const c = {
      id: 'p',
      ownerId: 'p',
      name: 'P',
      classId: 'tank' as const,
      xp: 0,
      color: '#fff',
      loadout: defaultLoadout('tank'),
    };
    expect(deriveStats(c, 1)).toEqual({ hp: 140, mp: 25, atk: 19, mag: 3, def: 17, spd: 5 });
    expect(deriveStats({ ...c, xp: 999999 }, 1)).toEqual(deriveStats(c, 1));
    expect(deriveStats(c, 4).hp).toBe(182);
  });
  it('replays RNG exactly and advances even a zero seed', () => {
    expect(random(0)).toEqual(random(0));
    expect(random(0).seed).not.toBe(0);
    expect(random(random(0).seed).value).not.toBe(random(0).value);
  });
  it('has eight distinct fake players and two cheap ghosts per role', () => {
    expect(GHOSTS.filter((g) => !g.community)).toHaveLength(8);
    for (const role of ['tank', 'healer', 'dps'])
      expect(
        GHOSTS.filter((g) => g.community && CLASSES[g.character.classId].role === role),
      ).toHaveLength(2);
    // Every class can be met as a companion.
    for (const c of CLASS_IDS) expect(GHOSTS.some((g) => g.character.classId === c)).toBe(true);
    expect(new Set(GHOSTS.map((g) => g.character.name)).size).toBe(14);
  });
});
