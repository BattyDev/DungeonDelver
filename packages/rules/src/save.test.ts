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
it('loads existing tile positions and preserves fractional walking positions exactly', () => {
  let state = transition(
    transition(
      { phase: 'classSelect' },
      { type: 'newGame', name: 'P', classId: 'rogue', seed: 42 },
    ),
    { type: 'startRun' },
  );
  expect(parseSave(serializeSave(state)).state).toEqual(state);
  state = transition(state, { type: 'move', dx: 0.06, dz: -0.08 });
  expect(parseSave(serializeSave(state)).state).toEqual(state);
  if (state.phase !== 'floor') throw Error();
  expect(state.floor.position).toEqual({ x: 3.06, z: 22.92 });
  state.floor.position = { x: 12.1, z: 1.2 };
  expect(() => parseSave(serializeSave(state))).toThrow();
});
it('keeps the chosen race and sex, and rejects unknown bodies', () => {
  const hub = transition(
    { phase: 'classSelect' },
    {
      type: 'newGame',
      name: 'Gnome',
      classId: 'cleric',
      seed: 3,
      appearance: { race: 'gnome', sex: 'M' },
    },
  );
  expect(parseSave(serializeSave(hub)).state).toEqual(hub);
  if (hub.phase !== 'hub') throw Error();
  expect(hub.progress.player.appearance).toEqual({ race: 'gnome', sex: 'M' });
  const changed = transition(hub, { type: 'changeClass', classId: 'knight' });
  if (changed.phase !== 'hub') throw Error();
  expect(changed.progress.player.appearance).toEqual({ race: 'gnome', sex: 'M' });
  (hub.progress.player.appearance as { race: string }).race = 'troll';
  expect(() => parseSave(serializeSave(hub))).toThrow();
});
