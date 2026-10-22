// Looks sent from the Paper Doll Studio to the game. Both pages share an origin, so localStorage carries them.
import type { AnimId, BodyKey, LookClass } from './model';

export const WARDROBE_KEY = 'dungeon-delver.wardrobe.v1';
/** Session flag set when walking through the wardrobe, so the studio opens on your character and the return lands beside it. */
export const RETURN_KEY = 'dungeon-delver.return';

/** One sheet per animation: columns are frames, rows follow `dirs` (8 for walking, the combat camera for combat). */
export interface WardrobeEntry {
  body: BodyKey;
  cls: LookClass;
  updated: number;
  anims: Partial<Record<AnimId, { dirs: number[]; sheet: string }>>;
}
export type Wardrobe = Record<string, WardrobeEntry>;
export const wardrobeId = (body: BodyKey, cls: LookClass) => `${body}|${cls}`;

export function readWardrobe(): Wardrobe {
  try {
    const raw = localStorage.getItem(WARDROBE_KEY);
    const data: unknown = raw ? JSON.parse(raw) : {};
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Wardrobe) : {};
  } catch {
    return {};
  }
}
/** Throws when storage is unavailable or full; callers report that to the user. */
export function writeWardrobe(entry: WardrobeEntry) {
  const all = readWardrobe();
  all[wardrobeId(entry.body, entry.cls)] = entry;
  localStorage.setItem(WARDROBE_KEY, JSON.stringify(all));
}
export function removeWardrobe(body: BodyKey, cls: LookClass) {
  const all = readWardrobe();
  delete all[wardrobeId(body, cls)];
  localStorage.setItem(WARDROBE_KEY, JSON.stringify(all));
}
