import { clone } from './clone';
import { CLASSES, RACE_IDS, SEX_IDS } from './classes';
import { ITEMS, defaultLoadout } from './items';
import { GHOSTS } from './content/ghosts';
import { getFloor } from './content/floors';
import { createEnemy } from './content/enemies';
import { activeFighter, resolveTurn, startCombat } from './combat';
import { chooseAction } from './ai';
import { endRun, newProgress, startRun, syncParty } from './progression';
import { createFloor, distance, encounterAt, moveOnFloor, tickPatrols } from './floors/exploration';
import { pullLever } from './floors/lever-order';
import { toggleBrazier } from './floors/braziers';
import { keyHunt } from './floors/key-hunt';
import { isSolved } from './floors/puzzles';
import type { GameState, GameCommand } from './types';
type Exploring = Extract<GameState, { phase: 'floor' }>;
function encounter(s: Exploring, sneak: boolean): GameState {
  const def = getFloor(s.floor.id);
  const id = encounterAt(
    def,
    s.floor,
    s.run.party.some((f) => f.effects.includes('stealth')),
    sneak,
  );
  if (!id) return s;
  const p = def.patrols.find((p) => p.id === id)!;
  return {
    ...s,
    phase: 'combat',
    patrolId: id,
    combat: startCombat(
      s.run.party,
      p.enemyTypes.map((type, i) => createEnemy(type, `${id}-${i}`, def.level)),
      s.progress.rng,
      s.run.resources,
    ),
  };
}
function settle(s: Extract<GameState, { phase: 'combat' }>): GameState {
  const c = s.combat;
  if (c.outcome === 'active') return s;
  const progress = {
    ...s.progress,
    rng: c.rng,
    decisions: [...s.progress.decisions, ...c.decisions],
  };
  const run = {
    ...s.run,
    party: c.fighters.filter((f) => f.team === 'party'),
    resources: c.resources,
  };
  if (c.outcome === 'wipe')
    return {
      phase: progress.checkpoint === 5 ? 'safeRoom' : 'hub',
      progress: endRun(progress, run, false),
    };
  const patrol = s.floor.patrols.find((p) => p.id === s.patrolId)!;
  const floor = {
    ...s.floor,
    patrols: s.floor.patrols.map((p) =>
      p.id === patrol.id
        ? { ...p, defeated: c.outcome === 'victory', pauseTicks: c.outcome === 'fled' ? 45 : 0 }
        : p,
    ),
  };
  if (c.outcome === 'victory') {
    const enemies = c.fighters.filter((f) => f.team === 'enemy');
    progress.player = {
      ...progress.player,
      xp: progress.player.xp + enemies.reduce((n, f) => n + f.xp, 0),
    };
    run.unbankedGold += enemies.reduce((n, f) => n + f.gold, 0);
    // Small encounter recovery keeps the four-floor expedition viable without a shop.
    run.party = run.party.map((f) => ({ ...f, mp: Math.min(f.stats.mp, f.mp + 4) }));
    if (
      getFloor(floor.id).patrols.find((p) => p.id === patrol.id)!.boss &&
      floor.puzzle.type === 'key'
    )
      floor.puzzle = keyHunt(floor.puzzle, 'guardDefeated');
  }
  run.floors = { ...run.floors, [floor.id]: floor };
  return { phase: 'floor', progress, run, floor };
}
export function transition(state: GameState, command: GameCommand): GameState {
  if (command.type === 'reset') return { phase: 'classSelect' };
  if (command.type === 'newGame')
    return state.phase === 'classSelect'
      ? {
          phase: 'hub',
          progress: newProgress(command.name, command.classId, command.seed, command.appearance),
        }
      : state;
  if (state.phase === 'classSelect') return state;
  if (command.type === 'hire') {
    if (state.phase !== 'hub' || state.progress.hires.length >= 3) return state;
    const ghost = GHOSTS.find((g) => g.id === command.ghostId);
    if (
      !ghost ||
      ghost.ownerId === state.progress.player.ownerId ||
      state.progress.hires.some((g) => g.ownerId === ghost.ownerId) ||
      state.progress.gold < ghost.price
    )
      return state;
    return {
      ...state,
      progress: {
        ...state.progress,
        gold: state.progress.gold - ghost.price,
        hires: [...state.progress.hires, clone(ghost)],
      },
    };
  }
  if (command.type === 'dismiss')
    return state.phase === 'hub'
      ? {
          ...state,
          progress: {
            ...state.progress,
            hires: state.progress.hires.filter((g) => g.id !== command.ghostId),
          },
        }
      : state;
  if (command.type === 'equip') {
    const item = ITEMS.find((i) => i.id === command.itemId);
    if (state.phase !== 'hub' || !item || item.classId !== state.progress.player.classId)
      return state;
    return {
      ...state,
      progress: {
        ...state.progress,
        player: {
          ...state.progress.player,
          loadout: { ...state.progress.player.loadout, [item.slot]: item.id },
        },
      },
    };
  }
  if (command.type === 'changeAppearance') {
    const { race, sex } = command.appearance ?? {};
    // Like class and gear, a new look is chosen in the hub, and only from known bodies.
    if (state.phase !== 'hub' || !RACE_IDS.includes(race) || !SEX_IDS.includes(sex)) return state;
    return {
      ...state,
      progress: {
        ...state.progress,
        player: { ...state.progress.player, appearance: { race, sex } },
      },
    };
  }
  if (command.type === 'changeClass') {
    if (state.phase !== 'hub') return state;
    return {
      ...state,
      progress: {
        ...state.progress,
        player: {
          ...state.progress.player,
          classId: command.classId,
          color: CLASSES[command.classId].color,
          loadout: defaultLoadout(command.classId),
        },
      },
    };
  }
  if (command.type === 'portal') {
    if (state.phase === 'safeRoom') return { phase: 'hub', progress: state.progress };
    if (state.phase === 'hub' && state.progress.unlockedPortals.includes(5))
      return { phase: 'safeRoom', progress: state.progress };
    return state;
  }
  if (command.type === 'startRun') {
    if (state.phase !== 'hub') return state;
    const run = startRun(state.progress);
    return { phase: 'floor', progress: state.progress, run, floor: run.floors[1] };
  }
  if (state.phase === 'combat') {
    if (command.type === 'combat') {
      if (!activeFighter(state.combat).player) return state;
      const combat = resolveTurn(state.combat, command.action);
      return combat === state.combat ? state : settle({ ...state, combat });
    }
    if (command.type === 'aiTurn') {
      if (activeFighter(state.combat).player) return state;
      const picked = chooseAction(state.combat);
      return settle({
        ...state,
        combat: resolveTurn({ ...state.combat, rng: picked.seed }, picked.action),
      });
    }
    return state;
  }
  if (state.phase !== 'floor') return state;
  const s = clone(state),
    def = getFloor(s.floor.id);
  if (command.type === 'tick') {
    s.floor = tickPatrols(def, s.floor);
    s.run.floors[s.floor.id] = s.floor;
    return encounter(s, command.sneak);
  }
  if (command.type === 'move') {
    const { dx, dz } = command;
    const floor = moveOnFloor(def, s.floor, dx, dz);
    if (floor === s.floor) return state;
    s.floor = floor;
    s.run.floors[s.floor.id] = s.floor;
    return encounter(s, !!command.sneak);
  }
  if (command.type === 'puzzle') {
    // All puzzle interactions require proximity. Boss progress comes only from combat settlement.
    const p = s.floor.puzzle,
      a = command.action;
    if (a.type === 'restart' && p.type === 'plates') {
      s.floor.puzzle = clone(def.puzzle);
      s.floor.position = { ...(def.restart ?? def.spawn) };
    } else if (
      a.type === 'lever' &&
      p.type === 'levers' &&
      def.puzzlePoints[a.index] &&
      distance(s.floor.position, def.puzzlePoints[a.index]) <= 1.5
    )
      s.floor.puzzle = pullLever(p, a.index);
    else if (
      a.type === 'brazier' &&
      p.type === 'braziers' &&
      def.puzzlePoints[a.index] &&
      distance(s.floor.position, def.puzzlePoints[a.index]) <= 1.5
    )
      s.floor.puzzle = toggleBrazier(p, a.index);
    else return state;
    s.run.floors[s.floor.id] = s.floor;
    return s;
  }
  if (command.type === 'interact') {
    if (distance(s.floor.position, def.clue) <= 1.5) s.floor.clueRead = true;
    if (s.floor.puzzle.type === 'key' && distance(s.floor.position, def.puzzlePoints[0]) <= 1.5)
      s.floor.puzzle = keyHunt(s.floor.puzzle, 'collectKey');
    if (distance(s.floor.position, def.stairs) <= 1.1 && isSolved(s.floor.puzzle)) {
      if (def.id === 4) return { phase: 'safeRoom', progress: endRun(s.progress, s.run, true) };
      const next = getFloor(def.id + 1);
      s.run.party = syncParty(s.run.party, s.progress, next.level);
      s.run.resources = {
        ...s.run.resources,
        potions:
          s.run.resources.potions +
          1 +
          s.run.party.filter((f) => f.effects.includes('extraPotion')).length,
        smokeUsed: false,
      };
      s.floor = createFloor(next);
      s.run.floors[next.id] = s.floor;
    }
    return s;
  }
  return state;
}
