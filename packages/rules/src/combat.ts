import { clone } from './clone';
import { CLASSES } from './classes';
import { context, roleProfile } from './ai';
import { equipment } from './items';
import { deriveStats } from './stats';
import { random } from './rng';
import type {
  Action,
  BehaviorProfile,
  Character,
  CombatState,
  Fighter,
  RunResources,
} from './types';
export function createFighter(
  c: Character,
  level: number,
  player = false,
  profile?: BehaviorProfile,
): Fighter {
  const stats = deriveStats(c, level);
  return {
    id: c.id,
    name: c.name,
    team: 'party',
    classId: c.classId,
    stats,
    hp: stats.hp,
    mp: stats.mp,
    effects: equipment(c.loadout).flatMap((i) => (i.effect ? [i.effect] : [])),
    profile: profile ?? roleProfile(CLASSES[c.classId].role),
    player,
    boss: false,
    defending: false,
    tauntTurns: 0,
    xp: 0,
    gold: 0,
  };
}
export function initiative(fighters: readonly Fighter[]): string[] {
  return [...fighters]
    .filter((f) => f.hp > 0)
    .sort((a, b) => b.stats.spd - a.stats.spd || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((f) => f.id);
}
export function startCombat(
  party: Fighter[],
  enemies: Fighter[],
  rng: number,
  resources: RunResources,
): CombatState {
  const fighters = clone([...party, ...enemies]);
  for (const f of fighters) {
    f.defending = false;
    f.tauntTurns = 0;
  }
  return {
    fighters,
    order: initiative(fighters),
    cursor: 0,
    round: 1,
    rng,
    resources: clone(resources),
    outcome: 'active',
    messages: ['An encounter begins.'],
    decisions: [],
  };
}
export function activeFighter(s: CombatState): Fighter {
  return s.fighters.find((f) => f.id === s.order[s.cursor])!;
}
function valid(s: CombatState, a: Action): boolean {
  if (s.outcome !== 'active') return false;
  const actor = activeFighter(s);
  if (!actor || actor.hp <= 0) return false;
  if (a.type === 'flee') return actor.player;
  if (a.type === 'defend') return true;
  const target = s.fighters.find((f) => f.id === a.target);
  if (!target || target.hp <= 0) return false;
  if (a.type === 'item')
    return (
      actor.team === 'party' &&
      s.resources.potions > 0 &&
      target.team === actor.team &&
      target.hp < target.stats.hp
    );
  if (a.type === 'skill' && actor.mp < CLASSES[actor.classId].cost) return false;
  return (
    target.team ===
    (a.type === 'skill' && actor.classId === 'cleric'
      ? actor.team
      : actor.team === 'party'
        ? 'enemy'
        : 'party')
  );
}
export function resolveTurn(state: CombatState, action: Action): CombatState {
  if (!valid(state, action)) return state;
  const s = clone(state),
    actor = activeFighter(s);
  if (actor.player)
    s.decisions.push({
      actorId: actor.id,
      context: context(state, activeFighter(state)),
      action: { ...action },
    });
  actor.defending = false;
  const say = (m: string) => s.messages.push(m);
  const roll = () => {
    const r = random(s.rng);
    s.rng = r.seed;
    return r.value;
  };
  const heal = (target: Fighter, amount: number) => {
    const gained = Math.min(target.stats.hp - target.hp, Math.round(amount));
    target.hp += gained;
    return gained;
  };
  const revive = (target: Fighter) => {
    if (target.hp > 0 || target.team !== 'party') return;
    const bearer = s.fighters.find(
      (f) =>
        f.team === 'party' &&
        f.effects.includes('revive') &&
        !s.resources.feathersUsed.includes(f.id),
    );
    if (bearer) {
      s.resources.feathersUsed.push(bearer.id);
      target.hp = Math.max(1, Math.round(target.stats.hp * 0.25));
      say(`Phoenix Feather revives ${target.name}.`);
    }
  };
  const damage = (source: Fighter, target: Fighter, power: number, allowCounter = true) => {
    if (target.hp <= 0) return;
    const crit = source.effects.includes('crit') && roll() < 0.15;
    const amount = Math.max(
      1,
      Math.round(
        (source.stats.atk * power - target.stats.def * 0.55) *
          (crit ? 1.5 : 1) *
          (target.defending ? 0.5 : 1),
      ),
    );
    target.hp = Math.max(0, target.hp - amount);
    say(`${source.name} hits ${target.name} for ${amount}${crit ? ' • critical' : ''}.`);
    revive(target);
    if (allowCounter && target.hp > 0 && target.effects.includes('counter') && roll() < 0.25) {
      say(`${target.name} counters!`);
      damage(target, source, 0.75, false);
    }
  };
  if (actor.effects.includes('regen')) {
    const gained = heal(actor, Math.max(1, Math.round(actor.stats.hp * 0.05)));
    if (gained) say(`${actor.name} regains ${gained} HP.`);
  }
  if (action.type === 'flee') {
    const smoke =
      !s.resources.smokeUsed &&
      s.fighters.some((f) => f.team === 'party' && f.hp > 0 && f.effects.includes('smoke'));
    if (smoke || roll() < 0.5) {
      s.outcome = 'fled';
      if (smoke) s.resources.smokeUsed = true;
      say(smoke ? 'Smoke Bomb! The party escapes.' : 'The party escapes.');
    } else say('Escape failed.');
  } else if (action.type === 'defend') {
    actor.defending = true;
    say(`${actor.name} takes a defensive stance.`);
  } else {
    const target = s.fighters.find((f) => f.id === action.target)!;
    if (action.type === 'item') {
      s.resources.potions--;
      say(
        `${actor.name} uses a potion. ${target.name} recovers ${heal(target, target.stats.hp * 0.5)} HP.`,
      );
    } else if (action.type === 'attack') {
      if (actor.effects.includes('doubleHit')) {
        damage(actor, target, 0.6);
        if (actor.hp > 0) damage(actor, target, 0.6);
      } else damage(actor, target, 1);
    } else {
      actor.mp -= CLASSES[actor.classId].cost;
      say(`${actor.name} uses ${CLASSES[actor.classId].skill}.`);
      if (actor.classId === 'cleric') {
        const amount = (actor.stats.mag * 2 + 18) * (actor.effects.includes('mendBoost') ? 1.2 : 1);
        say(`${target.name} recovers ${heal(target, amount)} HP.`);
        if (actor.effects.includes('cleaveHeal')) {
          const other = s.fighters
            .filter((f) => f.team === actor.team && f.id !== target.id && f.hp > 0)
            .sort((a, b) => a.hp / a.stats.hp - b.hp / b.stats.hp)[0];
          if (other) say(`${other.name} recovers ${heal(other, amount / 2)} HP.`);
        }
      } else {
        damage(actor, target, actor.classId === 'rogue' ? 1.8 : 1.25);
        if (actor.classId === 'knight' && actor.effects.includes('taunt')) actor.tauntTurns = 2;
        if (actor.classId === 'rogue' && actor.effects.includes('cleave')) {
          const other = s.fighters.find(
            (f) => f.team !== actor.team && f.id !== target.id && f.hp > 0,
          );
          if (other && actor.hp > 0) damage(actor, other, 1.8);
        }
      }
    }
  }
  if (actor.tauntTurns > 0) actor.tauntTurns--;
  if (s.outcome === 'active') {
    if (!s.fighters.some((f) => f.team === 'enemy' && f.hp > 0)) s.outcome = 'victory';
    else if (!s.fighters.some((f) => f.team === 'party' && f.hp > 0)) s.outcome = 'wipe';
  }
  if (s.outcome === 'active') {
    let attempts = 0;
    do {
      s.cursor++;
      if (s.cursor >= s.order.length) {
        s.cursor = 0;
        s.round++;
      }
      attempts++;
    } while (
      s.fighters.find((f) => f.id === s.order[s.cursor])!.hp <= 0 &&
      attempts <= s.order.length
    );
  }
  s.messages = s.messages.slice(-24);
  return s;
}
