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
  }
> = {
  knight: {
    name: 'Knight',
    role: 'tank',
    glyph: '✦',
    color: '#dfb567',
    skill: 'Shield Bash',
    cost: 5,
    base: { hp: 110, mp: 25, atk: 15, mag: 3, def: 9, spd: 8 },
  },
  cleric: {
    name: 'Cleric',
    role: 'healer',
    glyph: '✚',
    color: '#87d9c2',
    skill: 'Mend',
    cost: 6,
    base: { hp: 80, mp: 65, atk: 9, mag: 16, def: 5, spd: 10 },
  },
  rogue: {
    name: 'Rogue',
    role: 'dps',
    glyph: '◆',
    color: '#ba9ce8',
    skill: 'Power Strike',
    cost: 5,
    base: { hp: 85, mp: 30, atk: 18, mag: 3, def: 5, spd: 14 },
  },
};
export const CLASS_IDS: ClassId[] = ['knight', 'cleric', 'rogue'];
export const RACE_IDS: Race[] = ['human', 'orc', 'elf', 'dwarf', 'gnome'];
export const SEX_IDS: Sex[] = ['F', 'M'];
