import { CLASS_IDS, LEGACY_CLASS_IDS, RACE_IDS, SEX_IDS } from './classes';
import { ITEMS, SLOTS } from './items';
import { getFloor } from './content/floors';
import { walkable } from './floors/pressure-plates';
import type { SaveData } from './types';
export const SAVE_VERSION = 1 as const;
type Obj = Record<string, unknown>;
const object = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const text = (x: unknown): x is string => typeof x === 'string';
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const nonnegative = (x: unknown): x is number => num(x) && x >= 0;
const integer = (x: unknown): x is number => nonnegative(x) && Number.isInteger(x);
const array = (x: unknown, test: (v: unknown) => boolean): boolean =>
  Array.isArray(x) && x.every(test);
const point = (x: unknown): boolean => object(x) && num(x.x) && num(x.z);
const strings = (x: unknown) => array(x, text);
const stats = (x: unknown): boolean =>
  object(x) &&
  ['hp', 'mp', 'atk', 'mag', 'def', 'spd'].every((k) => nonnegative(x[k])) &&
  num(x.hp) &&
  x.hp > 0;
const weights = (x: unknown): boolean =>
  object(x) &&
  ['attack', 'skill', 'item', 'defend', 'flee'].every((k) => nonnegative(x[k])) &&
  Object.values(x).some((n) => num(n) && n > 0);
function profile(x: unknown): boolean {
  return (
    object(x) &&
    x.version === 1 &&
    ['tank', 'healer', 'dps'].includes(String(x.role)) &&
    integer(x.samples) &&
    object(x.buckets) &&
    Object.values(x.buckets).every(
      (v) =>
        object(v) && ['attack', 'skill', 'item', 'defend', 'flee'].every((k) => nonnegative(v[k])),
    ) &&
    weights(x.defaults) &&
    num(x.healingThreshold) &&
    x.healingThreshold >= 0 &&
    x.healingThreshold <= 1
  );
}
function character(x: unknown): boolean {
  return (
    object(x) &&
    text(x.id) &&
    text(x.ownerId) &&
    text(x.name) &&
    CLASS_IDS.includes(x.classId as never) &&
    integer(x.xp) &&
    text(x.color) &&
    (x.appearance === undefined ||
      (object(x.appearance) &&
        RACE_IDS.includes(x.appearance.race as never) &&
        SEX_IDS.includes(x.appearance.sex as never))) &&
    object(x.loadout) &&
    SLOTS.every((slot) =>
      ITEMS.some(
        (i) => i.id === (x.loadout as Obj)[slot] && i.classId === x.classId && i.slot === slot,
      ),
    )
  );
}
function ghost(x: unknown): boolean {
  return (
    object(x) &&
    text(x.id) &&
    text(x.ownerId) &&
    character(x.character) &&
    profile(x.profile) &&
    text(x.style) &&
    integer(x.price) &&
    typeof x.community === 'boolean' &&
    text(x.dialogue) &&
    integer(x.runs) &&
    integer(x.revives) &&
    integer(x.deepestFloor)
  );
}
const action = (x: unknown): boolean =>
  object(x) &&
  (['defend', 'flee'].includes(String(x.type)) ||
    (['attack', 'skill', 'item'].includes(String(x.type)) && text(x.target)));
function decision(x: unknown): boolean {
  return (
    object(x) &&
    text(x.actorId) &&
    action(x.action) &&
    object(x.context) &&
    ['ownHpPct', 'mpPct', 'lowestAllyHpPct'].every(
      (k) =>
        num((x.context as Obj)[k]) &&
        Number((x.context as Obj)[k]) >= 0 &&
        Number((x.context as Obj)[k]) <= 1,
    ) &&
    integer(x.context.enemyCount) &&
    typeof x.context.bossPresent === 'boolean' &&
    integer(x.context.turnNumber)
  );
}
function fighter(x: unknown): boolean {
  return (
    object(x) &&
    text(x.id) &&
    text(x.name) &&
    ['party', 'enemy'].includes(String(x.team)) &&
    CLASS_IDS.includes(x.classId as never) &&
    stats(x.stats) &&
    nonnegative(x.hp) &&
    object(x.stats) &&
    num(x.stats.hp) &&
    x.hp <= x.stats.hp &&
    nonnegative(x.mp) &&
    num(x.stats.mp) &&
    x.mp <= x.stats.mp &&
    array(x.effects, (v) =>
      [
        'taunt',
        'regen',
        'mendBoost',
        'cleaveHeal',
        'extraPotion',
        'revive',
        'doubleHit',
        'cleave',
        'counter',
        'stealth',
        'crit',
        'smoke',
      ].includes(String(v)),
    ) &&
    profile(x.profile) &&
    typeof x.player === 'boolean' &&
    typeof x.boss === 'boolean' &&
    typeof x.defending === 'boolean' &&
    integer(x.tauntTurns) &&
    integer(x.xp) &&
    integer(x.gold)
  );
}
function resources(x: unknown): boolean {
  return (
    object(x) && integer(x.potions) && typeof x.smokeUsed === 'boolean' && strings(x.feathersUsed)
  );
}
function progress(x: unknown): boolean {
  return (
    object(x) &&
    character(x.player) &&
    integer(x.gold) &&
    array(x.hires, ghost) &&
    (x.hires as unknown[]).length <= 3 &&
    array(x.unlockedPortals, (p) => p === 5) &&
    (x.checkpoint === 0 || x.checkpoint === 5) &&
    integer(x.rng) &&
    x.rng <= 4294967295 &&
    array(x.decisions, decision) &&
    integer(x.completedRuns)
  );
}
function puzzle(x: unknown, id: number): boolean {
  if (!object(x)) return false;
  const initial = getFloor(id).puzzle;
  if (x.type !== initial.type) return false;
  if (initial.type === 'plates')
    return (
      array(x.blocks, point) &&
      (x.blocks as unknown[]).length === initial.blocks.length &&
      JSON.stringify(x.plates) === JSON.stringify(initial.plates)
    );
  if (initial.type === 'levers')
    return (
      JSON.stringify(x.sequence) === JSON.stringify(initial.sequence) &&
      integer(x.progress) &&
      x.progress <= initial.sequence.length
    );
  if (initial.type === 'braziers')
    return (
      array(x.lit, (v) => typeof v === 'boolean') &&
      (x.lit as unknown[]).length === initial.lit.length &&
      JSON.stringify(x.neighbors) === JSON.stringify(initial.neighbors)
    );
  return (
    typeof x.guardDefeated === 'boolean' &&
    typeof x.collected === 'boolean' &&
    (!x.collected || x.guardDefeated === true)
  );
}
function floor(x: unknown): boolean {
  if (
    !object(x) ||
    !integer(x.id) ||
    x.id < 1 ||
    x.id > 4 ||
    !point(x.position) ||
    !puzzle(x.puzzle, x.id) ||
    typeof x.clueRead !== 'boolean'
  )
    return false;
  const def = getFloor(x.id),
    position = x.position as { x: number; z: number };
  if (!walkable(def, { x: Math.round(position.x), z: Math.round(position.z) })) return false;
  return (
    array(
      x.patrols,
      (p) =>
        object(p) &&
        def.patrols.some((d) => d.id === p.id) &&
        point(p.position) &&
        integer(p.waypoint) &&
        p.waypoint < def.patrols.find((d) => d.id === p.id)!.path.length &&
        integer(p.pauseTicks) &&
        typeof p.defeated === 'boolean' &&
        (p.home === undefined || point(p.home)),
    ) && (x.patrols as unknown[]).length === def.patrols.length
  );
}
function run(x: unknown): boolean {
  return (
    object(x) &&
    array(x.party, fighter) &&
    (x.party as unknown[]).length >= 1 &&
    (x.party as unknown[]).length <= 4 &&
    resources(x.resources) &&
    integer(x.unbankedGold) &&
    object(x.floors) &&
    Object.values(x.floors).every(floor)
  );
}
function combat(x: unknown): boolean {
  if (
    !object(x) ||
    !array(x.fighters, fighter) ||
    !strings(x.order) ||
    !integer(x.cursor) ||
    !integer(x.round) ||
    !integer(x.rng) ||
    !resources(x.resources) ||
    !['active', 'victory', 'wipe', 'fled'].includes(String(x.outcome)) ||
    !strings(x.messages) ||
    !array(x.decisions, decision)
  )
    return false;
  const fighters = x.fighters as Obj[],
    order = x.order as string[];
  return (
    fighters.some((f) => f.team === 'party') &&
    fighters.some((f) => f.team === 'enemy') &&
    new Set(fighters.map((f) => f.id)).size === fighters.length &&
    order.length > 0 &&
    new Set(order).size === order.length &&
    order.every((id) => fighters.some((f) => f.id === id)) &&
    x.cursor < order.length &&
    (x.outcome !== 'active' ||
      fighters.some((f) => f.id === order[x.cursor as number] && num(f.hp) && f.hp > 0))
  );
}
/** Saves from before the five classes name knights, clerics and rogues; rename them in place. */
function migrateClasses(x: unknown): void {
  if (Array.isArray(x)) x.forEach(migrateClasses);
  else if (object(x))
    for (const [k, v] of Object.entries(x)) {
      if (k === 'classId' && typeof v === 'string' && LEGACY_CLASS_IDS[v])
        x[k] = LEGACY_CLASS_IDS[v];
      else migrateClasses(v);
    }
}
export function parseSave(raw: string): SaveData {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Save is not valid JSON.');
  }
  if (!object(value) || value.version !== SAVE_VERSION)
    throw new Error('This save version is unsupported. Your stored save has been preserved.');
  const s = value.state;
  if (!object(s)) throw new Error('Save state is missing.');
  migrateClasses(s);
  let valid = s.phase === 'classSelect';
  if (s.phase === 'hub' || s.phase === 'safeRoom') valid = progress(s.progress);
  if (s.phase === 'floor' || s.phase === 'combat') {
    valid = progress(s.progress) && run(s.run) && floor(s.floor);
    if (valid && object(s.run) && object(s.progress)) {
      const party = s.run.party as Obj[],
        hires = s.progress.hires as Obj[],
        player = s.progress.player as Obj;
      valid =
        party.filter((f) => f.player).length === 1 &&
        party.some((f) => f.player && f.id === player.id) &&
        party.every((f) => f.player || hires.some((g) => g.id === f.id));
    }
    if (s.phase === 'combat')
      valid =
        valid &&
        text(s.patrolId) &&
        object(s.floor) &&
        getFloor(Number(s.floor.id)).patrols.some((p) => p.id === s.patrolId) &&
        combat(s.combat);
  }
  if (!valid)
    throw new Error('Save data is incomplete or invalid. Your stored save has been preserved.');
  return value as unknown as SaveData;
}
export function serializeSave(state: SaveData['state']): string {
  return JSON.stringify({ version: SAVE_VERSION, state });
}
