import { CLASSES } from './classes';
import { defaultLoadout } from './items';
import { createFighter } from './combat';
import { getFloor } from './content/floors';
import { createFloor } from './floors/exploration';
import type { Appearance, Character, ClassId, Fighter, Progress, RunState } from './types';
export const STARTING_GOLD = 120;
export function newProgress(
  name: string,
  classId: ClassId,
  seed: number,
  appearance?: Appearance,
): Progress {
  const player: Character = {
    id: 'player',
    ownerId: 'local-player',
    name: name.trim().slice(0, 24) || 'Delver',
    classId,
    xp: 0,
    color: CLASSES[classId].color,
    loadout: defaultLoadout(classId),
    ...(appearance ? { appearance: { ...appearance } } : {}),
  };
  return {
    player,
    gold: STARTING_GOLD,
    hires: [],
    unlockedPortals: [],
    checkpoint: 0,
    rng: seed >>> 0,
    decisions: [],
    completedRuns: 0,
  };
}
/**
 * After a won encounter the living catch their breath: 4 MP and a tenth of their HP. The fallen
 * stay down until the next floor or a potion.
 */
export function recoverAfterVictory(party: Fighter[]): Fighter[] {
  return party.map((f) => ({
    ...f,
    mp: Math.min(f.stats.mp, f.mp + 4),
    hp: f.hp > 0 ? Math.min(f.stats.hp, f.hp + Math.round(f.stats.hp * 0.1)) : f.hp,
  }));
}
export function startRun(progress: Progress): RunState {
  const party = [
    createFighter(progress.player, 1, true),
    ...progress.hires.map((g) => createFighter(g.character, 1, false, g.profile)),
  ];
  return {
    party,
    resources: {
      potions: 3 + party.filter((f) => f.effects.includes('extraPotion')).length,
      smokeUsed: false,
      feathersUsed: [],
    },
    unbankedGold: 0,
    floors: { 1: createFloor(getFloor(1)) },
  };
}
export function syncParty(party: Fighter[], progress: Progress, level: number): Fighter[] {
  return party.map((old) => {
    const character = old.player
      ? progress.player
      : progress.hires.find((g) => g.id === old.id)!.character;
    const next = createFighter(character, level, old.player, old.profile);
    next.hp = old.hp === 0 ? 0 : Math.max(1, next.stats.hp - (old.stats.hp - old.hp));
    next.mp = Math.max(0, next.stats.mp - (old.stats.mp - old.mp));
    return next;
  });
}
export function endRun(progress: Progress, run: RunState, success: boolean): Progress {
  return {
    ...progress,
    gold: progress.gold + (success ? run.unbankedGold : 0),
    hires: [],
    checkpoint: success ? 5 : progress.checkpoint,
    unlockedPortals: success ? [5] : progress.unlockedPortals,
    completedRuns: progress.completedRuns + (success ? 1 : 0),
  };
}
