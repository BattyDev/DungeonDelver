import { it, expect } from 'vitest';
import { transition } from './game';
import { parseSave, serializeSave } from './save';
import type { GameState } from './types';
it('round-trips class select, hub and exploration without losing RNG or resources', () => {
  const start: GameState = { phase: 'classSelect' };
  const hub = transition(start, { type: 'newGame', name: 'Saved', classId: 'cleric', seed: 0 });
  const floor = transition(hub, { type: 'startRun' });
  for (const state of [start, hub, floor])
    expect(parseSave(serializeSave(state)).state).toEqual(state);
});
it('rejects malformed, future, and structurally invalid saves', () => {
  for (const raw of ['broken', 'null', '{"version":99}', '{"version":1,"state":{"phase":"floor"}}'])
    expect(() => parseSave(raw)).toThrow();
  let state = transition(
    { phase: 'classSelect' },
    { type: 'newGame', name: 'X', classId: 'rogue', seed: 1 },
  );
  if (state.phase === 'classSelect') throw Error();
  state.progress.player.loadout.weapon = 'oak-staff';
  expect(() => parseSave(serializeSave(state))).toThrow();
});
