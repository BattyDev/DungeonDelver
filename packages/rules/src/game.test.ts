import { describe, it, expect } from 'vitest';
import { transition } from './game';
import { FLOORS, getFloor } from './content/floors';
import { GHOSTS } from './content/ghosts';
import { createFloor, canWalk, encounterAt, lineOfSight } from './floors/exploration';
import { walkable } from './floors/pressure-plates';
import { isSolved } from './floors/puzzles';
import { createEnemy } from './content/enemies';
import { startCombat, activeFighter, resolveTurn } from './combat';
import { chooseAction } from './ai';
import { newProgress, startRun } from './progression';
import type { GameState } from './types';
function game(): GameState {
  return transition(
    { phase: 'classSelect' },
    { type: 'newGame', name: 'Test', classId: 'knight', seed: 42 },
  );
}
describe('progression and exploration', () => {
  it('can afford a full average party and never recruits twice or over capacity', () => {
    let s = game();
    for (const ghostId of ['ghost-1', 'ghost-2', 'ghost-4'])
      s = transition(s, { type: 'hire', ghostId });
    if (s.phase === 'classSelect') throw Error();
    expect(s.progress.hires).toHaveLength(3);
    expect(s.progress.gold).toBe(36);
    expect(transition(s, { type: 'hire', ghostId: 'ghost-8' })).toBe(s);
  });
  it('restricts gear to class and hub, starts and resets', () => {
    const s = game();
    expect(transition(s, { type: 'equip', itemId: 'mace' })).toBe(s);
    const f = transition(s, { type: 'startRun' });
    expect(f.phase).toBe('floor');
    expect(transition(f, { type: 'equip', itemId: 'buckler' })).toBe(f);
    expect(transition(f, { type: 'reset' })).toEqual({ phase: 'classSelect' });
  });
  it('all floor interaction points and stairs are reachable, and unsolved stairs stay locked', () => {
    for (const def of FLOORS) {
      const state = createFloor(def);
      expect(isSolved(state.puzzle)).toBe(false);
      expect(canWalk(def, state, def.stairs)).toBe(false);
      const queue = [def.spawn],
        seen = new Set([`${def.spawn.x},${def.spawn.z}`]);
      for (let i = 0; i < queue.length; i++) {
        const p = queue[i];
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const q = { x: p.x + dx, z: p.z + dz },
            key = `${q.x},${q.z}`;
          if (walkable(def, q) && !seen.has(key)) {
            seen.add(key);
            queue.push(q);
          }
        }
      }
      for (const p of [def.clue, def.stairs, ...def.puzzlePoints])
        expect(seen.has(`${p.x},${p.z}`)).toBe(true);
    }
  });
  it('detection respects walls, stealth and flee grace', () => {
    const def = getFloor(1),
      f = createFloor(def);
    f.position = { x: 5, z: 7 };
    expect(encounterAt(def, f, false, false)).toBe('moss');
    expect(encounterAt(def, f, true, true)).toBeUndefined();
    f.patrols[0].pauseTicks = 90;
    expect(encounterAt(def, f, false, false)).toBeUndefined();
    expect(lineOfSight(def, { x: 8, z: 1 }, { x: 10, z: 1 })).toBe(false);
  });
  it('wipe keeps XP and banked gold and dismisses hires', () => {
    let s = transition(game(), { type: 'hire', ghostId: 'ghost-1' });
    s = transition(s, { type: 'startRun' });
    if (s.phase !== 'floor') throw Error();
    s.progress.player.xp = 123;
    s.run.unbankedGold = 99;
    s.run.party = s.run.party.map((f) => ({ ...f, hp: 1, stats: { ...f.stats, spd: 1 } }));
    const enemy = createEnemy('warden', 'killer', 4);
    enemy.stats.atk = 999;
    enemy.stats.spd = 99;
    let c: GameState = {
      ...s,
      phase: 'combat',
      patrolId: 'moss',
      combat: startCombat(s.run.party, [enemy], 7, s.run.resources),
    };
    for (let n = 0; c.phase === 'combat' && n < 10; n++) {
      const actor = activeFighter(c.combat);
      c = transition(
        c,
        actor.player ? { type: 'combat', action: { type: 'defend' } } : { type: 'aiTurn' },
      );
    }
    expect(c.phase).toBe('hub');
    if (c.phase === 'classSelect') throw Error();
    expect(c.progress.player.xp).toBe(123);
    expect(c.progress.hires).toHaveLength(0);
    expect(c.progress.gold).toBe(88);
  });
  it('floor 5 banks loot, unlocks portal, and supports round-trip travel', () => {
    let s = transition(game(), { type: 'startRun' });
    if (s.phase !== 'floor') throw Error();
    s.floor = createFloor(getFloor(4));
    s.floor.position = { x: 18, z: 3 };
    s.floor.puzzle = { type: 'key', guardDefeated: true, collected: true };
    s.run.unbankedGold = 50;
    const safe = transition(s, { type: 'interact' });
    expect(safe.phase).toBe('safeRoom');
    if (safe.phase === 'classSelect') throw Error();
    expect(safe.progress.gold).toBe(170);
    expect(safe.progress.unlockedPortals).toEqual([5]);
    const hub = transition(safe, { type: 'portal' });
    expect(hub.phase).toBe('hub');
    expect(transition(hub, { type: 'portal' }).phase).toBe('safeRoom');
  });
  it('a balanced default party defeats the key guard across seeds', () => {
    for (const seed of [1, 42, 100, 888]) {
      let p = newProgress('P', 'knight', seed);
      p = { ...p, hires: [GHOSTS[1], GHOSTS[2], GHOSTS[4]] };
      const run = startRun(p);
      const party = run.party.map((f) => ({ ...f, hp: f.stats.hp, mp: f.stats.mp }));
      let c = startCombat(
        party,
        [createEnemy('warden', 'boss', 1), createEnemy('skeleton', 'add', 1)],
        seed,
        run.resources,
      );
      for (let n = 0; n < 500 && c.outcome === 'active'; n++) {
        const a = chooseAction(c);
        c = resolveTurn({ ...c, rng: a.seed }, a.action);
      }
      expect(c.outcome).toBe('victory');
    }
  });
});
