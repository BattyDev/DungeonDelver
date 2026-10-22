import { describe, it, expect } from 'vitest';
import { createFighter, resolveTurn, startCombat, activeFighter } from './combat';
import { defaultLoadout } from './items';
import { createEnemy } from './content/enemies';
import { chooseAction, learn, roleProfile } from './ai';
import type { ClassId, CombatState } from './types';
const fighter = (classId: ClassId = 'samurai', alternate = false) =>
  createFighter(
    {
      id: 'p',
      ownerId: 'p',
      name: 'Player',
      classId,
      xp: 0,
      color: '#fff',
      loadout: defaultLoadout(classId, alternate),
    },
    1,
    true,
  );
const battle = (classId: ClassId = 'samurai', alternate = false) =>
  startCombat([fighter(classId, alternate)], [createEnemy('slime', 'e', 1)], 42, {
    potions: 2,
    smokeUsed: false,
    feathersUsed: [],
  });
function playerTurn(s: CombatState) {
  s.order = ['p', 'e'];
  s.cursor = 0;
  return s;
}
describe('combat', () => {
  it('is immutable, replayable, speed ordered and logs pre-action context', () => {
    const s = battle();
    const before = structuredClone(s);
    const a = { type: 'attack' as const, target: 'e' };
    expect(resolveTurn(s, a)).toEqual(resolveTurn(s, a));
    expect(s).toEqual(before);
    expect(activeFighter(s).id).toBe('p');
    const next = resolveTurn(s, a);
    expect(next.decisions[0].context).toEqual({
      ownHpPct: 1,
      mpPct: 1,
      lowestAllyHpPct: 1,
      enemyCount: 1,
      bossPresent: false,
      turnNumber: 1,
    });
  });
  it('rejects illegal targets, unavailable MP and actions without consuming RNG', () => {
    const s = battle();
    expect(resolveTurn(s, { type: 'attack', target: 'p' })).toBe(s);
    s.fighters[0].mp = 0;
    expect(resolveTurn(s, { type: 'skill', target: 'e' })).toBe(s);
  });
  it('double daggers hit twice and cleaving skill hits a second enemy', () => {
    const s = battle();
    const next = resolveTurn(s, { type: 'attack', target: 'e' });
    expect(next.messages.filter((m) => m.includes('hits'))).toHaveLength(2);
    s.fighters.push(createEnemy('slime', 'e2', 1));
    const cleave = resolveTurn(s, { type: 'skill', target: 'e' });
    expect(cleave.fighters.find((f) => f.id === 'e2')!.hp).toBeLessThan(47);
  });
  it('smoke guarantees exactly one escape per floor', () => {
    const s = battle('samurai', true);
    const next = resolveTurn(s, { type: 'flee' });
    expect(next.outcome).toBe('fled');
    expect(next.resources.smokeUsed).toBe(true);
    expect(s.resources.smokeUsed).toBe(false);
  });
  it('unassisted flee approximates the specified 50 percent', () => {
    let escaped = 0;
    for (let seed = 0; seed < 1000; seed++) {
      const s = battle();
      s.rng = seed;
      if (resolveTurn(s, { type: 'flee' }).outcome === 'fled') escaped++;
    }
    expect(escaped).toBeGreaterThan(450);
    expect(escaped).toBeLessThan(550);
  });
  it('mend boosts by 20 percent and censer heals another ally', () => {
    const s = playerTurn(battle('healer'));
    s.fighters[0].hp = 1;
    const boosted = resolveTurn(s, { type: 'skill', target: 'p' });
    expect(boosted.fighters[0].hp).toBe(73);
    const c = playerTurn(battle('healer', true));
    const ally = fighter('tank');
    ally.id = 'ally';
    ally.hp = 1;
    c.fighters.push(ally);
    c.fighters[0].hp = 1;
    const healed = resolveTurn(c, { type: 'skill', target: 'ally' });
    expect(healed.fighters[0].hp).toBe(28);
  });
  it('phoenix revives the first fallen ally only once per run', () => {
    const s = playerTurn(battle('healer', true));
    s.order = ['e', 'p'];
    s.fighters[0].hp = 1;
    s.fighters[1].stats.atk = 100;
    const first = resolveTurn(s, { type: 'attack', target: 'p' });
    expect(first.fighters[0].hp).toBe(Math.round(first.fighters[0].stats.hp * 0.25));
    expect(first.resources.feathersUsed).toEqual(['p']);
    first.cursor = 0;
    const second = resolveTurn(first, { type: 'attack', target: 'p' });
    expect(second.outcome).toBe('wipe');
  });
  it('defend reduces damage and Iron Heart restores five percent', () => {
    const s = playerTurn(battle('tank', true));
    s.fighters[0].hp = 40;
    const d = resolveTurn(s, { type: 'defend' });
    expect(d.fighters[0].hp).toBe(46);
    const hit = resolveTurn(d, { type: 'attack', target: 'p' });
    const plain = structuredClone(d);
    plain.fighters[0].defending = false;
    const full = resolveTurn(plain, { type: 'attack', target: 'p' });
    expect(hit.fighters[0].hp).toBeGreaterThan(full.fighters[0].hp);
  });
  it('AI honors taunt and learns action counts without mutating profiles', () => {
    const s = battle();
    const tank = fighter('tank');
    tank.id = 'tank';
    tank.tauntTurns = 1;
    s.fighters.push(tank);
    s.cursor = 1;
    const picked = chooseAction(s);
    expect('target' in picked.action && picked.action.target).toBe('tank');
    const logged = resolveTurn(battle(), { type: 'attack', target: 'e' }).decisions;
    const p = roleProfile('dps');
    const next = learn(p, logged);
    expect(next.samples).toBe(1);
    expect(p.samples).toBe(0);
  });
});
it('Lucky Coin and Parrying Dagger use their specified seeded probabilities', () => {
  let criticals = 0,
    counters = 0;
  for (let seed = 0; seed < 1000; seed++) {
    const s = playerTurn(battle('tank'));
    s.rng = seed;
    s.fighters[0].effects = ['crit'];
    if (
      resolveTurn(s, { type: 'attack', target: 'e' }).messages.some((m) => m.includes('critical'))
    )
      criticals++;
    s.fighters[0].effects = [];
    s.fighters[1].effects = ['counter'];
    if (
      resolveTurn(s, { type: 'attack', target: 'e' }).messages.some((m) => m.includes('counters'))
    )
      counters++;
  }
  expect(criticals).toBeGreaterThan(120);
  expect(criticals).toBeLessThan(180);
  expect(counters).toBeGreaterThan(220);
  expect(counters).toBeLessThan(280);
});
it('learned unavailable actions fall back to a legal basic attack', () => {
  const s = battle();
  const actor = activeFighter(s);
  const base = resolveTurn(s, { type: 'attack', target: 'e' }).decisions[0];
  actor.profile = learn(
    roleProfile('dps'),
    Array.from({ length: 5 }, () => ({ ...base, action: { type: 'item' as const, target: 'p' } })),
  );
  s.resources.potions = 0;
  expect(chooseAction(s).action).toEqual({ type: 'attack', target: 'e' });
});
