import { expect, it } from 'vitest';
import { transition } from './game';
import { newProgress, startRun } from './progression';
import { startCombat } from './combat';
import { createEnemy } from './content/enemies';
import { GHOSTS } from './content/ghosts';
import { parseSave } from './save';
import type { GameState } from './types';

function encounter(): Extract<GameState, { phase: 'combat' }> {
  const progress = newProgress('Finisher', 'tank', 42);
  const run = startRun(progress),
    floor = run.floors[1];
  const enemy = createEnemy('slime', 'moss-0', 1);
  enemy.hp = 1;
  const combat = startCombat(run.party, [enemy], 42, run.resources);
  combat.order = ['player', 'moss-0'];
  combat.cursor = 0;
  combat.fighters.find((f) => f.player)!.stats.atk = 999;
  return { phase: 'combat', progress, run, floor, patrolId: 'moss', combat };
}

it('preserves the final hit for presentation, survives reload and awards victory exactly once', () => {
  const start = encounter();
  const action = { type: 'attack', target: 'moss-0' } as const;
  const immediate = transition(start, { type: 'combat', action });
  const pending = transition(start, { type: 'combat', action, deferSettlement: true });
  if (pending.phase !== 'combat') throw Error('Final combat frame was discarded');
  expect(pending.combat.outcome).toBe('victory');
  expect(pending.combat.fighters.find((f) => f.id === 'moss-0')!.hp).toBe(0);
  expect(pending.progress.player.xp).toBe(start.progress.player.xp);
  expect(transition(pending, { type: 'aiTurn', deferSettlement: true })).toBe(pending);
  expect(transition(pending, { type: 'combat', action, deferSettlement: true })).toBe(pending);
  const restored = parseSave(JSON.stringify({ version: 1, state: pending })).state;
  const settled = transition(restored, { type: 'finishCombat' });
  expect(settled).toEqual(immediate);
  expect(transition(settled, { type: 'finishCombat' })).toEqual(settled);
  expect(transition(start, { type: 'finishCombat' })).toBe(start);
});

it('also retains a companion final blow before settling', () => {
  const start = encounter();
  start.progress.hires = [GHOSTS[0]];
  const run = startRun(start.progress);
  start.run = run;
  start.combat = startCombat(run.party, [createEnemy('slime', 'moss-0', 1)], 42, run.resources);
  start.combat.fighters.find((f) => f.id === 'moss-0')!.hp = 1;
  const companion = start.combat.fighters.find((f) => f.id === GHOSTS[0].id)!;
  companion.stats.atk = 999;
  companion.profile.defaults = { attack: 1, skill: 0, item: 0, defend: 0, flee: 0 };
  start.combat.order = [companion.id, 'player', 'moss-0'];
  start.combat.cursor = 0;
  const pending = transition(start, { type: 'aiTurn', deferSettlement: true });
  expect(pending.phase).toBe('combat');
  if (pending.phase === 'combat') expect(pending.combat.outcome).toBe('victory');
  expect(transition(pending, { type: 'finishCombat' }).phase).toBe('floor');
});

it.each(['wipe', 'fled'] as const)('settles a presented %s once', (outcome) => {
  const pending = encounter();
  pending.combat.outcome = outcome;
  if (outcome === 'wipe')
    pending.combat.fighters.filter((f) => f.team === 'party').forEach((f) => (f.hp = 0));
  const settled = transition(pending, { type: 'finishCombat' });
  expect(settled.phase).toBe(outcome === 'wipe' ? 'hub' : 'floor');
  expect(transition(settled, { type: 'finishCombat' })).toEqual(settled);
});
