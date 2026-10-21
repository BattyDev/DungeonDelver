import { it, expect } from 'vitest';
import { getFloor } from '../content/floors';
import { toggleBrazier, braziersSolved } from './braziers';
it('floor 3 is solvable and each interaction toggles only itself and neighbors', () => {
  const p = getFloor(3).puzzle;
  if (p.type !== 'braziers') throw Error();
  expect(toggleBrazier(p, 0).lit).toEqual([true, true, false, false, false]);
  expect(toggleBrazier(toggleBrazier(p, 0), 0)).toEqual(p);
  expect(braziersSolved(toggleBrazier(toggleBrazier(p, 0), 3))).toBe(true);
  expect(toggleBrazier(p, -1)).toBe(p);
});
