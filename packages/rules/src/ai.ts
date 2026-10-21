import { clone } from './clone';
import { weighted } from './rng';
import { CLASSES } from './classes';
import type {
  Action,
  ActionType,
  BehaviorProfile,
  CombatState,
  ContextSnapshot,
  DecisionLog,
  Fighter,
  Role,
  Weights,
} from './types';
export const weights = (attack = 7, skill = 3, defend = 1, item = 0, flee = 0): Weights => ({
  attack,
  skill,
  defend,
  item,
  flee,
});
export function roleProfile(role: Role): BehaviorProfile {
  return {
    version: 1,
    role,
    samples: 0,
    buckets: {},
    defaults:
      role === 'healer'
        ? weights(3, 5, 1, 1)
        : role === 'tank'
          ? weights(6, 4, 2)
          : weights(7, 5, 1),
    healingThreshold: 0.65,
  };
}
export function context(state: CombatState, actor: Fighter): ContextSnapshot {
  const allies = state.fighters.filter((f) => f.team === actor.team && f.hp > 0);
  const enemies = state.fighters.filter((f) => f.team !== actor.team && f.hp > 0);
  return {
    ownHpPct: actor.hp / actor.stats.hp,
    mpPct: actor.stats.mp ? actor.mp / actor.stats.mp : 0,
    lowestAllyHpPct: Math.min(...allies.map((f) => f.hp / f.stats.hp)),
    enemyCount: enemies.length,
    bossPresent: enemies.some((f) => f.boss),
    turnNumber: state.round,
  };
}
const band = (v: number) => (v < 0.25 ? 'critical' : v <= 0.5 ? 'hurt' : 'healthy');
export function bucket(c: ContextSnapshot): string {
  return `${band(c.ownHpPct)}|${band(c.mpPct)}|${band(c.lowestAllyHpPct)}|${c.enemyCount > 1 ? 'group' : 'single'}|${c.bossPresent ? 'boss' : 'normal'}|${c.turnNumber <= 3 ? 'early' : 'late'}`;
}
export function learn(profile: BehaviorProfile, logs: readonly DecisionLog[]): BehaviorProfile {
  const next = clone(profile);
  for (const log of logs) {
    const key = bucket(log.context);
    next.buckets[key] ??= weights(0, 0, 0, 0, 0);
    next.buckets[key][log.action.type]++;
    next.samples++;
  }
  return next;
}
export function chooseAction(state: CombatState): { action: Action; seed: number } {
  const actor = state.fighters.find((f) => f.id === state.order[state.cursor])!;
  const friends = state.fighters
    .filter((f) => f.team === actor.team && f.hp > 0)
    .sort((a, b) => a.hp / a.stats.hp - b.hp / b.stats.hp);
  const enemies = state.fighters.filter((f) => f.team !== actor.team && f.hp > 0);
  const taunter = enemies.find((f) => f.tauntTurns > 0);
  const target = taunter ?? [...enemies].sort((a, b) => a.hp - b.hp)[0];
  if (!target) return { action: { type: 'defend' }, seed: state.rng };
  const canSkill = actor.mp >= CLASSES[actor.classId].cost;
  const key = bucket(context(state, actor));
  const learned = actor.profile.buckets[key];
  const count = learned ? Object.values(learned).reduce((a, b) => a + b, 0) : 0;
  let w = { ...(count >= 5 ? learned : actor.profile.defaults) };
  if (
    count < 5 &&
    actor.classId === 'cleric' &&
    friends[0].hp / friends[0].stats.hp < actor.profile.healingThreshold &&
    canSkill
  )
    w = weights(1, 30, 0, 1);
  if (!canSkill || (actor.classId === 'cleric' && friends[0].hp >= friends[0].stats.hp))
    w.skill = 0;
  if (
    actor.team === 'enemy' ||
    state.resources.potions === 0 ||
    friends[0].hp / friends[0].stats.hp > 0.6
  )
    w.item = 0;
  w.flee = 0;
  if (Object.values(w).every((n) => n <= 0)) w.attack = 1; // Companions do not end the player's run by fleeing.
  const picked = weighted<ActionType>(
    state.rng,
    Object.entries(w).map(([a, n]) => [a as ActionType, n]),
  );
  const ally = friends[0];
  const action: Action =
    picked.value === 'defend'
      ? { type: 'defend' }
      : picked.value === 'item'
        ? { type: 'item', target: ally.id }
        : picked.value === 'skill'
          ? { type: 'skill', target: actor.classId === 'cleric' ? ally.id : target.id }
          : { type: 'attack', target: target.id };
  return { action, seed: picked.seed };
}
