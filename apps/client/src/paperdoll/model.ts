// Shared tables for the Paper Doll Studio and the game's character sprites.
// Frames are 64 × 64; directions follow the export row order S, SW, W, NW, N, NE, E, SE.
import type { ClassId, Race, Sex } from '@delver/rules';

export const F = 64;
export const PX = F * F * 4;
const R2 = Math.SQRT1_2;

/** f = facing vector on the ground: x right, z toward the camera (matches the game world). */
export const DIRS = [
  { k: 'S', name: 'south (toward camera)', f: [0, 1] },
  { k: 'SW', name: 'southwest', f: [-R2, R2] },
  { k: 'W', name: 'west', f: [-1, 0] },
  { k: 'NW', name: 'northwest', f: [-R2, -R2] },
  { k: 'N', name: 'north (away from camera)', f: [0, -1] },
  { k: 'NE', name: 'northeast', f: [R2, -R2] },
  { k: 'E', name: 'east', f: [1, 0] },
  { k: 'SE', name: 'southeast', f: [R2, R2] },
] as const;
/** NE, E and SE are drawn by flipping NW, W and SW. */
export const MIRROR_SRC: Record<number, number> = { 5: 3, 6: 2, 7: 1 };

export type AnimId =
  | 'idle'
  | 'walk'
  | 'attack'
  | 'block'
  | 'hurt'
  | 'death'
  | 'heal'
  | 'shoot'
  | 'dodge'
  | 'cast'
  | 'channel'
  | 'slash'
  | 'parry';
export interface AnimDef {
  label: string;
  frames: number;
  combat: boolean;
  fps: number;
  loop: boolean;
  notes: string[];
}
export const ANIMS: Record<AnimId, AnimDef> = {
  idle: {
    label: 'Idle',
    frames: 4,
    combat: false,
    fps: 5,
    loop: true,
    notes: [
      'Neutral stance',
      'Inhale: chest and shoulders rise',
      'Peak: shoulders highest',
      'Exhale: settling down',
    ],
  },
  walk: {
    label: 'Walk',
    frames: 6,
    combat: false,
    fps: 10,
    loop: true,
    notes: [
      'Contact: left foot forward',
      'Down: weight on left leg',
      'Passing: right leg swings through',
      'Contact: right foot forward',
      'Down: weight on right leg',
      'Passing: left leg swings through',
    ],
  },
  attack: {
    label: 'Attack',
    frames: 6,
    combat: true,
    fps: 12,
    loop: false,
    notes: [
      'Ready: fist at chest',
      'Wind-up: arm behind head',
      'Peak: arm overhead',
      'Strike: swing down, step in',
      'Follow-through: arm low',
      'Recover',
    ],
  },
  block: {
    label: 'Block',
    frames: 3,
    combat: true,
    fps: 8,
    loop: false,
    notes: ['Bracing: shield arm rising', 'Block: forearm up, knees bent', 'Hold: impact shift'],
  },
  hurt: {
    label: 'Hurt',
    frames: 3,
    combat: true,
    fps: 10,
    loop: false,
    notes: ['Impact: head snaps back', 'Stagger back', 'Recover'],
  },
  death: {
    label: 'Death',
    frames: 6,
    combat: true,
    fps: 8,
    loop: false,
    notes: [
      'Hit: arms flung out',
      'Knees buckle',
      'Drop to knees',
      'Falling',
      'Hit the ground',
      'Lying still',
    ],
  },
  heal: {
    label: 'Heal',
    frames: 4,
    combat: true,
    fps: 7,
    loop: false,
    notes: [
      'Gather: staff low, palm open',
      'Raise: staff lifting, off hand forward',
      'Peak: staff high, healing light',
      'Release: lowering',
    ],
  },
  shoot: {
    label: 'Shoot',
    frames: 6,
    combat: true,
    fps: 10,
    loop: false,
    notes: [
      'Nock: arrow to string, bow low',
      'Raise: bow arm up',
      'Draw: string hand pulls back',
      'Anchor: full draw at the cheek',
      'Release: string hand snaps back',
      'Recover',
    ],
  },
  dodge: {
    label: 'Dodge',
    frames: 4,
    combat: true,
    fps: 10,
    loop: false,
    notes: ['Crouch: knees bend', 'Hop back: lean away, arms out', 'Land', 'Recover'],
  },
  cast: {
    label: 'Cast',
    frames: 5,
    combat: true,
    fps: 9,
    loop: false,
    notes: [
      'Ready: hands low',
      'Gather: hands meet at the chest',
      'Thrust: both hands forward',
      'Hold: spell leaves the hands',
      'Recover',
    ],
  },
  channel: {
    label: 'Channel',
    frames: 4,
    combat: true,
    fps: 6,
    loop: true,
    notes: ['Staff overhead, off hand forward', 'Power swells', 'Peak', 'Power swells'],
  },
  slash: {
    label: 'Slash',
    frames: 6,
    combat: true,
    fps: 12,
    loop: false,
    notes: [
      'Ready: two-handed grip at the hip',
      'Wind-up: katana overhead',
      'Cut begins',
      'Strike: blade forward, deep step',
      'Follow-through: blade low',
      'Recover',
    ],
  },
  parry: {
    label: 'Parry',
    frames: 3,
    combat: true,
    fps: 8,
    loop: false,
    notes: ['Rise: blade lifting', 'Parry: blade up across the body', 'Hold: impact shift'],
  },
};

/** Studio classes. The game's three classes borrow the look of tank, healer and samurai. */
export type LookClass = 'tank' | 'healer' | 'archer' | 'mage' | 'samurai';
export const LOOK_CLASSES: Record<LookClass, { label: string; anims: AnimId[] }> = {
  tank: { label: 'Tank', anims: ['idle', 'walk', 'attack', 'block', 'hurt', 'death'] },
  healer: { label: 'Healer', anims: ['idle', 'walk', 'heal', 'attack', 'hurt', 'death'] },
  archer: { label: 'Archer', anims: ['idle', 'walk', 'shoot', 'dodge', 'hurt', 'death'] },
  mage: { label: 'Mage', anims: ['idle', 'walk', 'cast', 'channel', 'hurt', 'death'] },
  samurai: { label: 'Samurai', anims: ['idle', 'walk', 'slash', 'parry', 'hurt', 'death'] },
};
export const LOOK_CLASS_IDS = Object.keys(LOOK_CLASSES) as LookClass[];
export const GAME_CLASS_LOOK: Record<ClassId, LookClass> = {
  knight: 'tank',
  cleric: 'healer',
  rogue: 'samurai',
};

export type Slot =
  | 'base'
  | 'hair'
  | 'beard'
  | 'helmet'
  | 'chest'
  | 'gloves'
  | 'pants'
  | 'boots'
  | 'back'
  | 'weapon'
  | 'offhand';
export type SlotCategory = 'body' | 'hair' | 'armor' | 'weapon';
export const SLOT_CAT: Record<Slot, SlotCategory> = {
  base: 'body',
  hair: 'hair',
  beard: 'hair',
  helmet: 'armor',
  chest: 'armor',
  gloves: 'armor',
  pants: 'armor',
  boots: 'armor',
  back: 'armor',
  weapon: 'weapon',
  offhand: 'weapon',
};
/** Block-in shapes available per slot. The first is the default. */
export const STYLES: Record<Slot, [string, string][]> = {
  base: [['body', 'Body']],
  beard: [['full', 'Full beard']],
  hair: [
    ['short', 'Short crop'],
    ['ponytail', 'Ponytail'],
    ['long', 'Long'],
    ['bun', 'Bun'],
  ],
  helmet: [
    ['helm', 'Helm'],
    ['hood', 'Hood'],
    ['wizard', 'Wizard hat'],
    ['kabuto', 'Kabuto'],
  ],
  chest: [
    ['plate', 'Plate'],
    ['leather', 'Leather'],
    ['robe', 'Robe'],
    ['lamellar', 'Lamellar'],
  ],
  gloves: [['gloves', 'Gloves']],
  pants: [
    ['trousers', 'Trousers'],
    ['hakama', 'Hakama'],
  ],
  boots: [['boots', 'Boots']],
  back: [
    ['quiver', 'Quiver'],
    ['cape', 'Cape'],
  ],
  weapon: [
    ['sword', 'Sword'],
    ['mace', 'Mace'],
    ['staff', 'Staff'],
    ['wand', 'Wand'],
    ['bow', 'Bow'],
    ['katana', 'Katana'],
  ],
  offhand: [
    ['shield', 'Shield'],
    ['tome', 'Tome'],
    ['orb', 'Orb'],
  ],
};

/** slot, style, color, directions drawn behind the body, starts hidden. */
export type PresetGear = [Slot, string, string, number[]?, boolean?];
const BEHIND_E = [5, 6, 7],
  BEHIND_W = [1, 2, 3],
  BEHIND_S = [0, 1, 7];
export const PRESETS: Record<LookClass, { name: string; gear: PresetGear[] }> = {
  tank: {
    name: 'Iron Guard',
    gear: [
      ['pants', 'trousers', '#24365e'],
      ['boots', 'boots', '#3e2a1e'],
      ['chest', 'plate', '#7b8798'],
      ['gloves', 'gloves', '#6b4a32'],
      ['helmet', 'helm', '#7b8798', undefined, true],
      ['offhand', 'shield', '#3f5f9e', BEHIND_E],
      ['weapon', 'sword', '#b3bdc9', BEHIND_W],
    ],
  },
  healer: {
    name: 'Cleric',
    gear: [
      ['boots', 'boots', '#6b4a32'],
      ['chest', 'robe', '#d8d0b8'],
      ['gloves', 'gloves', '#a89f86'],
      ['helmet', 'hood', '#d8d0b8'],
      ['offhand', 'tome', '#6e1f24', BEHIND_E],
      ['weapon', 'staff', '#6b4a32', BEHIND_W],
    ],
  },
  archer: {
    name: 'Ranger',
    gear: [
      ['pants', 'trousers', '#4a5568'],
      ['boots', 'boots', '#3e2a1e'],
      ['chest', 'leather', '#6b4a32'],
      ['gloves', 'gloves', '#3e2a1e'],
      ['helmet', 'hood', '#4d6b2c'],
      ['back', 'quiver', '#6e3f18', BEHIND_S],
      ['weapon', 'bow', '#a8662a', BEHIND_E],
    ],
  },
  mage: {
    name: 'Arcanist',
    gear: [
      ['boots', 'boots', '#3a3848'],
      ['chest', 'robe', '#24365e'],
      ['helmet', 'wizard', '#3f5f9e'],
      ['offhand', 'orb', '#e8c547', BEHIND_E],
      ['weapon', 'staff', '#6e3f18', BEHIND_W],
    ],
  },
  samurai: {
    name: 'Ronin',
    gear: [
      ['pants', 'hakama', '#2a2730'],
      ['boots', 'boots', '#3e2a1e'],
      ['chest', 'lamellar', '#b0383b'],
      ['gloves', 'gloves', '#3a3848'],
      ['helmet', 'kabuto', '#6e1f24', undefined, true],
      ['weapon', 'katana', '#c4c1d2', BEHIND_W],
    ],
  },
};

export interface RaceDef {
  label: string;
  scale: number;
  bulk: number;
  head: number;
  skin: [string, string];
  hair: string;
  ears: 'orc' | 'elf' | 'gnome' | null;
  tusks?: boolean;
}
export const RACES: Record<Race, RaceDef> = {
  human: {
    label: 'Human',
    scale: 0.9,
    bulk: 1.0,
    head: 1.0,
    skin: ['#c08660', '#e6b48e'],
    hair: '#5a3a22',
    ears: null,
  },
  orc: {
    label: 'Orc',
    scale: 1.0,
    bulk: 1.3,
    head: 0.95,
    skin: ['#6b8f3a', '#8fb354'],
    hair: '#2a2730',
    ears: 'orc',
    tusks: true,
  },
  elf: {
    label: 'Elf',
    scale: 0.95,
    bulk: 0.82,
    head: 0.95,
    skin: ['#d9a37e', '#f1cdb0'],
    hair: '#e8c547',
    ears: 'elf',
  },
  dwarf: {
    label: 'Dwarf',
    scale: 0.72,
    bulk: 1.38,
    head: 1.15,
    skin: ['#b97a55', '#e0a982'],
    hair: '#a8462a',
    ears: null,
  },
  gnome: {
    label: 'Gnome',
    scale: 0.58,
    bulk: 0.95,
    head: 1.38,
    skin: ['#d4977a', '#f2c3a6'],
    hair: '#c4c1d2',
    ears: 'gnome',
  },
};
export const SEXES: Record<Sex, { label: string; shoulder: number; hip: number; bulk: number }> = {
  F: { label: 'Female', shoulder: 0.92, hip: 1.08, bulk: 0.94 },
  M: { label: 'Male', shoulder: 1.1, hip: 0.94, bulk: 1.0 },
};
export const PALETTE = [
  '#1b1a24',
  '#3a3848',
  '#5e5b70',
  '#8d8aa0',
  '#c4c1d2',
  '#f3f1f7',
  '#4a4a55',
  '#2a2730',
  '#4d6b2c',
  '#6b8f3a',
  '#8fb354',
  '#b5d17a',
  '#8a5a3c',
  '#c08660',
  '#e6b48e',
  '#f6d7bd',
  '#4a5568',
  '#7b8798',
  '#b3bdc9',
  '#24365e',
  '#3f5f9e',
  '#6e1f24',
  '#b0383b',
  '#e8c547',
  '#6e3f18',
  '#a8662a',
  '#d9994a',
  '#f2cf7a',
  '#a89f86',
  '#d8d0b8',
  '#3e2a1e',
  '#6b4a32',
];

export type BodyKey = `${Race}${Sex}`;
export const bodyKey = (race: Race, sex: Sex): BodyKey => `${race}${sex}`;
export const splitBody = (key: string): { race: Race; sex: Sex } => ({
  race: key.slice(0, -1) as Race,
  sex: key.slice(-1) as Sex,
});
export type BodyDef = RaceDef & { shoulder: number; hip: number };
export function bodyDef(key: string): BodyDef {
  const { race, sex } = splitBody(key);
  const r = RACES[race],
    s = SEXES[sex];
  return { ...r, bulk: r.bulk * s.bulk, shoulder: s.shoulder, hip: s.hip };
}
export const hexRgb = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
export const rgbHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

/** Nearest of the eight directions for a ground vector (x right, z toward the camera). */
export function dirIndex(x: number, z: number): number {
  let best = 0,
    bestDot = -Infinity;
  DIRS.forEach((d, i) => {
    const dot = d.f[0] * x + d.f[1] * z;
    if (dot > bestDot) {
      bestDot = dot;
      best = i;
    }
  });
  return best;
}
