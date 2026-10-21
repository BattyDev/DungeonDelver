import { CLASSES } from './classes';
import { equipment } from './items';
import type { Character, Stats } from './types';
export function deriveStats(character: Character, floorLevel: number): Stats {
 const base = CLASSES[character.classId].base;
 const n = Math.max(0, floorLevel - 1);
 const stats: Stats = { hp: base.hp+n*14, mp: base.mp+n*4, atk: base.atk+n*3, mag: base.mag+n*3, def: base.def+n*2, spd: base.spd };
 for (const item of equipment(character.loadout)) for (const key of Object.keys(item.modifiers) as (keyof Stats)[]) stats[key] += item.modifiers[key] ?? 0;
 stats.spd = Math.max(1, stats.spd);
 return stats;
}
export const levelFromXp = (xp: number): number => 1 + Math.floor(Math.sqrt(Math.max(0,xp) / 100));
