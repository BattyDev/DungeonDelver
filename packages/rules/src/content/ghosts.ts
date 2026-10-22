import { CLASSES } from '../classes';
import { roleProfile, weights } from '../ai';
import { defaultLoadout, ITEMS, SLOTS } from '../items';
import type { ClassId, Ghost } from '../types';
const entries: [string, ClassId, string, number, boolean][] = [
  ['Alder', 'tank', 'Steadfast guardian', 28, false],
  ['Mira', 'healer', 'Cautious healer', 32, false],
  ['Nyx', 'samurai', 'Reckless duelist', 25, false],
  ['Bram', 'tank', 'Iron sentinel', 26, true],
  ['Sable', 'archer', 'Patient marksman', 27, true],
  ['Juniper', 'healer', 'Merciful keeper', 30, true],
  ['Rook', 'mage', 'Storm caller', 24, false],
  ['Wren', 'archer', 'Daring scout', 29, false],
  ['Pebble', 'tank', 'Community • simple guardian', 0, true],
  ['Flint', 'tank', 'Community • watchful guard', 2, false],
  ['Fern', 'healer', 'Community • apprentice healer', 0, true],
  ['Clover', 'healer', 'Community • kind acolyte', 2, false],
  ['Pip', 'samurai', 'Community • eager blade', 0, true],
  ['Moth', 'mage', 'Community • quiet spark', 0, false],
];
export const GHOSTS: Ghost[] = entries.map(([name, classId, style, price, alternate], i) => {
  const community = i >= 8;
  const profile = roleProfile(CLASSES[classId].role);
  if (name === 'Mira') profile.healingThreshold = 0.85;
  if (name === 'Nyx') profile.defaults = weights(3, 12, 0);
  if (name === 'Bram') profile.defaults = weights(4, 8, 3);
  if (name === 'Rook') profile.defaults = weights(3, 10, 1);
  if (community) {
    profile.defaults = weights(9, 2, 1);
    profile.healingThreshold = 0.45;
  }
  const loadout = defaultLoadout(classId, alternate);
  if (!community) {
    const mask = [0, 0, 0, 15, 15, 15, 6, 9][i];
    SLOTS.forEach((slot, j) => {
      loadout[slot] = ITEMS.filter((item) => item.classId === classId && item.slot === slot)[
        (mask >> j) & 1
      ].id;
    });
  }
  return {
    id: `ghost-${i}`,
    ownerId: `owner-${i}`,
    character: {
      id: `ghost-${i}`,
      ownerId: `owner-${i}`,
      name,
      classId,
      xp: 100 * i,
      loadout,
      color: CLASSES[classId].color,
    },
    profile,
    style,
    price,
    community,
    dialogue: community
      ? 'Every great expedition starts with a small step.'
      : [
          'Keep close. I know these stones.',
          'We all come home. That is the plan.',
          'A little danger keeps the spirit sharp.',
        ][i % 3],
    runs: community ? 0 : 12 + i * 7,
    revives: classId === 'healer' ? 8 + i : 0,
    deepestFloor: community ? 1 : 5,
  };
});
