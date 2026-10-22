import { it, expect } from 'vitest';
import { getFloor } from '../content/floors';
import { toggleBrazier, braziersSolved } from './braziers';
import { transition } from '../game';
import { createFloor } from './exploration';
it('floor 3 is solvable and each interaction toggles only itself and neighbors', () => {
  const p = getFloor(3).puzzle;
  if (p.type !== 'braziers') throw Error();
  expect(toggleBrazier(p, 0).lit).toEqual([true, true, false, false, false, false, false]);
  expect(toggleBrazier(toggleBrazier(p, 0), 0)).toEqual(p);
  expect(braziersSolved([1, 2, 3, 4, 6].reduce(toggleBrazier, p))).toBe(true);
  expect(toggleBrazier(p, -1)).toBe(p);
});

it('floor 3 flames and floor 2 levers can be put back to the start without moving the player', () => {
  for (const id of [2, 3]) {
    let s = transition(
      transition(
        { phase: 'classSelect' },
        { type: 'newGame', name: 'R', classId: 'tank', seed: 1 },
      ),
      { type: 'startRun' },
    );
    if (s.phase !== 'floor') throw Error();
    const def = getFloor(id);
    s.floor = {
      ...createFloor(def),
      position: { ...def.puzzlePoints[def.puzzle.type === 'levers' ? 1 : 0] },
    };
    s.run.floors[id] = s.floor;
    s = transition(s, {
      type: 'puzzle',
      action:
        def.puzzle.type === 'levers' ? { type: 'lever', index: 1 } : { type: 'brazier', index: 0 },
    });
    if (s.phase !== 'floor') throw Error();
    expect(s.floor.puzzle).not.toEqual(def.puzzle);
    const at = s.floor.position;
    s = transition(s, { type: 'puzzle', action: { type: 'restart' } });
    if (s.phase !== 'floor') throw Error();
    expect(s.floor.puzzle).toEqual(def.puzzle);
    expect(s.floor.position).toEqual(at);
  }
});
