import { it, expect } from 'vitest';
import { getFloor } from '../content/floors';
import { pushBlock } from './pressure-plates';
it('rejects remote, diagonal and wall pushes', () => {
  const def = getFloor(1),
    s = def.puzzle;
  if (s.type !== 'plates') throw Error();
  expect(pushBlock(s, def, def.spawn, 0, 0, -1)).toBe(s);
  expect(pushBlock(s, def, { x: 3, z: 5 }, 0, 1, -1)).toBe(s);
  const wall = { ...s, blocks: [{ x: 1, z: 1 }] };
  expect(pushBlock(wall, def, { x: 1, z: 2 }, 0, 0, -1)).toBe(wall);
});
