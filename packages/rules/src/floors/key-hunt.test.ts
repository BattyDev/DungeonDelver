import { it, expect } from 'vitest';
import { getFloor } from '../content/floors';
import { keyHunt, keySolved } from './key-hunt';
it('floor 4 requires defeating the guard before taking its key', () => {
  const p = getFloor(4).puzzle;
  if (p.type !== 'key') throw Error();
  expect(keyHunt(p, 'collectKey')).toBe(p);
  expect(keySolved(keyHunt(keyHunt(p, 'guardDefeated'), 'collectKey'))).toBe(true);
  expect(keySolved(p)).toBe(false);
});
