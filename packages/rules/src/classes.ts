import type { ClassId, Race, Role, Sex, Stats } from './types';
export const CLASSES: Record<
  ClassId,
  {
    name: string;
    role: Role;
    glyph: string;
    color: string;
    skill: string;
    cost: number;
    base: Stats;
    /** Damage multiplier for the skill; the healer's skill heals instead. */
    power: number;
    /** Deals damage from MAG instead of ATK, for attacks and the skill alike. */
    magic?: boolean;
    /** The skill mostly ignores the target's DEF. */
    pierce?: boolean;
  }
> = {
  tank: {
    name: 'Tank',
    role: 'tank',
    glyph: '✦',
    color: '#dfb567',
    skill: 'Shield Bash',
    cost: 5,
    base: { hp: 110, mp: 25, atk: 15, mag: 3, def: 9, spd: 8 },
    power: 1.25,
  },
  healer: {
    name: 'Healer',
    role: 'healer',
    glyph: '✚',
    color: '#87d9c2',
    skill: 'Mend',
    cost: 6,
    base: { hp: 80, mp: 65, atk: 9, mag: 16, def: 5, spd: 10 },
    power: 0,
  },
  archer: {
    name: 'Archer',
    role: 'dps',
    glyph: '➶',
    color: '#b5d17a',
    skill: 'Piercing Shot',
    cost: 5,
    base: { hp: 86, mp: 30, atk: 17, mag: 3, def: 5, spd: 15 },
    power: 1.6,
    pierce: true,
  },
  mage: {
    name: 'Mage',
    role: 'dps',
    glyph: '✷',
    color: '#9daedb',
    skill: 'Arcane Bolt',
    cost: 7,
    base: { hp: 72, mp: 60, atk: 6, mag: 17, def: 3, spd: 11 },
    power: 1.8,
    magic: true,
  },
  samurai: {
    name: 'Samurai',
    role: 'dps',
    glyph: '◆',
    color: '#e08a82',
    skill: 'Iai Slash',
    cost: 5,
    base: { hp: 85, mp: 30, atk: 18, mag: 3, def: 5, spd: 14 },
    power: 1.8,
  },
};
export const CLASS_IDS: ClassId[] = ['tank', 'healer', 'archer', 'mage', 'samurai'];
/** Class ids before the five studio classes, mapped to their successors for old saves. */
export const LEGACY_CLASS_IDS: Record<string, ClassId> = {
  knight: 'tank',
  cleric: 'healer',
  rogue: 'samurai',
};
export const RACE_IDS: Race[] = ['human', 'orc', 'elf', 'dwarf', 'gnome'];
export const SEX_IDS: Sex[] = ['F', 'M'];
