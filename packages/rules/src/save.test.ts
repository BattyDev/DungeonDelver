import { it, expect } from 'vitest';
import { transition } from './game';
import { parseSave, serializeSave } from './save';
import type { GameState } from './types';
it('round-trips class select, hub and exploration without losing RNG or resources', () => {
  const start: GameState = { phase: 'classSelect' };
  const hub = transition(start, { type: 'newGame', name: 'Saved', classId: 'healer', seed: 0 });
  const floor = transition(hub, { type: 'startRun' });
  for (const state of [start, hub, floor])
    expect(parseSave(serializeSave(state)).state).toEqual(state);
});
it('rejects malformed, future, and structurally invalid saves', () => {
  for (const raw of ['broken', 'null', '{"version":99}', '{"version":1,"state":{"phase":"floor"}}'])
    expect(() => parseSave(raw)).toThrow();
  let state = transition(
    { phase: 'classSelect' },
    { type: 'newGame', name: 'X', classId: 'samurai', seed: 1 },
  );
  if (state.phase === 'classSelect') throw Error();
  state.progress.player.loadout.weapon = 'oak-staff';
  expect(() => parseSave(serializeSave(state))).toThrow();
});
it('loads existing tile positions and preserves fractional walking positions exactly', () => {
  let state = transition(
    transition(
      { phase: 'classSelect' },
      { type: 'newGame', name: 'P', classId: 'samurai', seed: 42 },
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
      classId: 'healer',
      seed: 3,
      appearance: { race: 'gnome', sex: 'M' },
    },
  );
  expect(parseSave(serializeSave(hub)).state).toEqual(hub);
  if (hub.phase !== 'hub') throw Error();
  expect(hub.progress.player.appearance).toEqual({ race: 'gnome', sex: 'M' });
  const changed = transition(hub, { type: 'changeClass', classId: 'tank' });
  if (changed.phase !== 'hub') throw Error();
  expect(changed.progress.player.appearance).toEqual({ race: 'gnome', sex: 'M' });
  const restyled = transition(changed, {
    type: 'changeAppearance',
    appearance: { race: 'elf', sex: 'F' },
  });
  if (restyled.phase !== 'hub') throw Error();
  expect(restyled.progress.player.appearance).toEqual({ race: 'elf', sex: 'F' });
  expect(restyled.progress.player.classId).toBe('tank');
  expect(parseSave(serializeSave(restyled)).state).toEqual(restyled);
  // Unknown bodies are ignored, and so is changing anywhere but the hub.
  expect(
    transition(restyled, {
      type: 'changeAppearance',
      appearance: { race: 'troll', sex: 'F' } as never,
    }),
  ).toBe(restyled);
  const below = transition(restyled, { type: 'startRun' });
  expect(
    transition(below, { type: 'changeAppearance', appearance: { race: 'orc', sex: 'M' } }),
  ).toBe(below);
  (hub.progress.player.appearance as { race: string }).race = 'troll';
  expect(() => parseSave(serializeSave(hub))).toThrow();
});
it('loads saves from before the five classes, renaming knights, clerics and rogues', () => {
  const hub = transition(
    { phase: 'classSelect' },
    { type: 'newGame', name: 'Old', classId: 'tank', seed: 5 },
  );
  if (hub.phase !== 'hub') throw Error();
  const hired = transition(hub, { type: 'hire', ghostId: 'ghost-2' });
  // Write the save the way the previous version did.
  const old = serializeSave(hired)
    .replace(/"classId":"tank"/g, '"classId":"knight"')
    .replace(/"classId":"samurai"/g, '"classId":"rogue"');
  expect(old).toContain('"knight"');
  const loaded = parseSave(old).state;
  if (loaded.phase !== 'hub') throw Error();
  expect(loaded.progress.player.classId).toBe('tank');
  expect(loaded.progress.hires[0].character.classId).toBe('samurai');
});
