// Who looks like what in the hall. Looks are rolled at random once per browser session, so
// a hired companion keeps their face for the whole visit.
import { CLASSES } from '@delver/rules';
import type { ClassId, Ghost } from '@delver/rules';
import { GAME_CLASS_LOOK, LOOK_CLASS_IDS } from '../paperdoll/model';
import { randomLook } from '../paperdoll/looks';
import type { Look } from '../paperdoll/looks';

const KEY = 'dungeon-delver.hall-looks';
let rolled: Record<string, Look> | undefined;
function looks(): Record<string, Look> {
  if (rolled) return rolled;
  try {
    rolled = JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Record<string, Look>;
  } catch {
    rolled = {};
  }
  return rolled;
}
function remember(id: string, make: () => Look): Look {
  const all = looks();
  if (!all[id]) {
    all[id] = make();
    try {
      sessionStorage.setItem(KEY, JSON.stringify(all));
    } catch {
      // Without session storage the hall simply rerolls on reload.
    }
  }
  return all[id];
}
export const ghostLook = (ghost: Pick<Ghost, 'id'> & { character: { classId: ClassId } }) =>
  remember(ghost.id, () => randomLook(GAME_CLASS_LOOK[ghost.character.classId]));
/** Look for a party member by fighter or character id (ghost ids match their characters). */
export const lookById = (id: string, classId: ClassId) =>
  remember(id, () => randomLook(GAME_CLASS_LOOK[classId]));
/** Background adventurers: every studio class, race and sex, cycled so the hall shows them all. */
export const WANDERER_COUNT = 20;
export const wandererLook = (i: number) =>
  remember(`wanderer-${i}`, () => randomLook(LOOK_CLASS_IDS[i % LOOK_CLASS_IDS.length]));
export const classColor = (classId: ClassId) => CLASSES[classId].color;
