import { it, expect } from 'vitest';
import { getFloor } from '../content/floors';
import { pullLever, leversSolved } from './lever-order';
it('floor 2 solves in the engraved order and rejects wrong order', () => {
  const p = getFloor(2).puzzle;
  if (p.type !== 'levers') throw Error();
  let s = p;
  for (const index of [1, 0, 2, 3, 4]) s = pullLever(s, index);
  expect(leversSolved(s)).toBe(true);
  expect(leversSolved(p)).toBe(false);
  expect(pullLever(pullLever(p, 1), 2).progress).toBe(0);
  expect(pullLever(p, 99)).toBe(p);
});
