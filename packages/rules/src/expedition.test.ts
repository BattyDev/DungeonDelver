import { it, expect } from 'vitest';
import { newProgress, startRun, syncParty } from './progression';
import { GHOSTS } from './content/ghosts';
import { CLASS_IDS } from './classes';
import { FLOORS } from './content/floors';
import { createEnemy } from './content/enemies';
import { startCombat, resolveTurn } from './combat';
import { chooseAction } from './ai';
import { parseSave, serializeSave } from './save';
import type { GameState } from './types';
it('a balanced party can clear every shipped encounter across four floors', () => {
  for (const classId of CLASS_IDS)
    for (const seed of [7, 42, 2026]) {
      const progress = newProgress('Delver', classId, seed);
      // A tank, a healer and damage dealers to fill the rest of the party.
      progress.hires =
        classId === 'tank'
          ? [GHOSTS[1], GHOSTS[2], GHOSTS[4]]
          : classId === 'healer'
            ? [GHOSTS[0], GHOSTS[2], GHOSTS[4]]
            : [GHOSTS[0], GHOSTS[1], classId === 'samurai' ? GHOSTS[4] : GHOSTS[2]];
      const run = startRun(progress);
      let rng = seed,
        totalTurns = 0;
      for (const floor of FLOORS) {
        if (floor.id > 1) {
          run.party = syncParty(run.party, progress, floor.level);
          run.resources.smokeUsed = false;
          run.resources.potions +=
            1 + run.party.filter((f) => f.effects.includes('extraPotion')).length;
        }
        for (const encounter of floor.patrols) {
          let combat = startCombat(
            run.party,
            encounter.enemyTypes.map((type, i) =>
              createEnemy(type, `${encounter.id}-${i}`, floor.level),
            ),
            rng,
            run.resources,
          );
          for (let n = 0; n < 1000 && combat.outcome === 'active'; n++) {
            const picked = chooseAction(combat);
            combat = resolveTurn({ ...combat, rng: picked.seed }, picked.action);
            totalTurns++;
          }
          expect(
            combat.outcome,
            `${classId}, seed ${seed}, floor ${floor.id}, encounter ${encounter.id}`,
          ).toBe('victory');
          run.party = combat.fighters
            .filter((f) => f.team === 'party')
            .map((f) => ({ ...f, mp: Math.min(f.stats.mp, f.mp + 4) }));
          run.resources = combat.resources;
          rng = combat.rng;
        }
      }
      expect(totalTurns).toBeGreaterThan(50);
    }
});
it('combat saves resume the exact same next turn', () => {
  const progress = newProgress('P', 'samurai', 22),
    run = startRun(progress);
  const floor = run.floors[1];
  const combat = startCombat(run.party, [createEnemy('bat', 'moss-0', 1)], 22, run.resources);
  const state: GameState = { phase: 'combat', progress, run, floor, patrolId: 'moss', combat };
  const loaded = parseSave(serializeSave(state)).state;
  if (loaded.phase !== 'combat') throw Error();
  const a = chooseAction(combat);
  expect(resolveTurn({ ...loaded.combat, rng: a.seed }, a.action)).toEqual(
    resolveTurn({ ...combat, rng: a.seed }, a.action),
  );
});
