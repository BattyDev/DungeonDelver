import type { ClassId, Effect, Item, Loadout, Slot, Stats } from './types';
const item = (
  id: string,
  name: string,
  classId: ClassId,
  slot: Slot,
  description: string,
  modifiers: Partial<Stats> = {},
  effect?: Effect,
): Item => ({ id, name, classId, slot, description, modifiers, ...(effect ? { effect } : {}) });
export const ITEMS: Item[] = [
  item('longsword', 'Longsword', 'knight', 'weapon', '+4 ATK', { atk: 4 }),
  item('war-hammer', 'War Hammer', 'knight', 'weapon', '+8 ATK, −2 SPD', { atk: 8, spd: -2 }),
  item('tower-shield', 'Tower Shield', 'knight', 'offhand', '+8 DEF, −1 SPD', { def: 8, spd: -1 }),
  item('buckler', 'Buckler', 'knight', 'offhand', '+3 DEF, +2 SPD', { def: 3, spd: 2 }),
  item('plate-mail', 'Plate Mail', 'knight', 'armor', '+30 HP, −2 SPD', { hp: 30, spd: -2 }),
  item('chain-mail', 'Chain Mail', 'knight', 'armor', '+15 HP', { hp: 15 }),
  item(
    'taunt-totem',
    'Taunt Totem',
    'knight',
    'trinket',
    'Shield Bash makes enemies target you next turn',
    {},
    'taunt',
  ),
  item('iron-heart', 'Iron Heart', 'knight', 'trinket', 'Regain 5% HP each turn', {}, 'regen'),
  item('oak-staff', 'Oak Staff', 'cleric', 'weapon', '+5 MAG', { mag: 5 }),
  item('mace', 'Mace', 'cleric', 'weapon', '+3 ATK, +2 MAG', { atk: 3, mag: 2 }),
  item('prayer-book', 'Prayer Book', 'cleric', 'offhand', 'Mend heals 20% more', {}, 'mendBoost'),
  item(
    'censer',
    'Censer',
    'cleric',
    'offhand',
    'Mend also heals the next most hurt ally for half',
    {},
    'cleaveHeal',
  ),
  item('robes', 'Robes', 'cleric', 'armor', '+15 MP', { mp: 15 }),
  item('padded-vest', 'Padded Vest', 'cleric', 'armor', '+4 DEF, +10 HP', { def: 4, hp: 10 }),
  item('holy-symbol', 'Holy Symbol', 'cleric', 'trinket', '+1 potion per floor', {}, 'extraPotion'),
  item(
    'phoenix-feather',
    'Phoenix Feather',
    'cleric',
    'trinket',
    'First ally to fall revives at 25% HP, once per run',
    {},
    'revive',
  ),
  item(
    'twin-daggers',
    'Twin Daggers',
    'rogue',
    'weapon',
    '+3 SPD; attacks hit twice at 60%',
    { spd: 3 },
    'doubleHit',
  ),
  item('greataxe', 'Greataxe', 'rogue', 'weapon', '+9 ATK, −3 SPD', { atk: 9, spd: -3 }),
  item(
    'throwing-knives',
    'Throwing Knives',
    'rogue',
    'offhand',
    'Power Strike also hits a second enemy',
    {},
    'cleave',
  ),
  item(
    'parrying-dagger',
    'Parrying Dagger',
    'rogue',
    'offhand',
    '+3 DEF; 25% chance to counter',
    { def: 3 },
    'counter',
  ),
  item('leather', 'Leather', 'rogue', 'armor', '+3 SPD', { spd: 3 }),
  item(
    'shadow-cloak',
    'Shadow Cloak',
    'rogue',
    'armor',
    'Enemy detection radius −40%',
    {},
    'stealth',
  ),
  item('lucky-coin', 'Lucky Coin', 'rogue', 'trinket', '15% crit chance', {}, 'crit'),
  item(
    'smoke-bomb',
    'Smoke Bomb',
    'rogue',
    'trinket',
    'One guaranteed Flee per floor',
    {},
    'smoke',
  ),
];
export const SLOTS: Slot[] = ['weapon', 'offhand', 'armor', 'trinket'];
export function defaultLoadout(classId: ClassId, alternate = false): Loadout {
  return Object.fromEntries(
    SLOTS.map((slot) => [
      slot,
      ITEMS.filter((i) => i.classId === classId && i.slot === slot)[alternate ? 1 : 0].id,
    ]),
  ) as Loadout;
}
export function equipment(loadout: Loadout): Item[] {
  return SLOTS.map((slot) => ITEMS.find((i) => i.id === loadout[slot])!).filter(Boolean);
}
