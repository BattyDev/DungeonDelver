import type { FloorDef, PatrolDef } from '../types';
const patrol = (
  id: string,
  enemyTypes: string[],
  path: [number, number][],
  radius = 2.3,
  boss = false,
): PatrolDef => ({ id, enemyTypes, path: path.map(([x, z]) => ({ x, z })), radius, boss });
/** A loop around a rectangle's edge, for patrols that sweep a room. */
const loop = (x0: number, z0: number, x1: number, z1: number): [number, number][] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];
const W = 41,
  H = 27;
/** Carves rooms ([x, z, width, depth]) out of solid rock, then raises pillars and shelves. */
function carve(rooms: [number, number, number, number][], pillars: [number, number][] = []) {
  const grid = Array.from({ length: H }, () => Array<string>(W).fill('#'));
  for (const [x, z, w, d] of rooms)
    for (let r = z; r < z + d; r++) for (let c = x; c < x + w; c++) grid[r][c] = '.';
  for (const [x, z] of pillars) grid[z][x] = '#';
  return grid.map((row) => row.join(''));
}
const row = (z: number, x0: number, x1: number, skip: number[] = []): [number, number][] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i): [number, number] => [x0 + i, z]).filter(
    ([x]) => !skip.includes(x),
  );

export const FLOORS: FloorDef[] = [
  {
    id: 1,
    title: 'The Overgrown Halls',
    subtitle: 'Stone remembers the weight of footsteps.',
    level: 1,
    // Entry hall (SW), west gallery, north hall, the sealed vault in the middle, a south passage and the east wing.
    map: carve(
      [
        [1, 17, 10, 9],
        [1, 1, 10, 13],
        [4, 14, 2, 3],
        [14, 1, 26, 6],
        [11, 3, 3, 2],
        [14, 10, 13, 9],
        [19, 7, 2, 3],
        [11, 22, 19, 3],
        [20, 19, 2, 3],
        [30, 9, 10, 17],
        [34, 7, 2, 2],
      ],
      [
        [17, 12],
        [23, 12],
        [20, 13],
        [15, 15],
        [25, 15],
        [3, 4],
        [8, 4],
        [3, 9],
        [8, 9],
        [33, 13],
        [36, 13],
        [33, 20],
        [36, 20],
      ],
    ),
    spawn: { x: 3, z: 23 },
    stairs: { x: 38, z: 2 },
    // Resetting the stones leaves you at the vault's south door, not back at the entrance.
    restart: { x: 20, z: 20 },
    clue: { x: 2, z: 18 },
    hint: 'Three stones, three seals, all inside the vault. Pillars stand in the way: walk each stone around them before pushing it home. Reset the stones if one sticks in a corner.',
    notes:
      'Stand behind a stone and walk into it to push. The vault sits between the north hall and the south passage. You can reset the stones if they get stuck.',
    puzzle: {
      type: 'plates',
      blocks: [
        { x: 17, z: 15 },
        { x: 20, z: 16 },
        { x: 23, z: 15 },
      ],
      plates: [
        { x: 15, z: 11 },
        { x: 20, z: 11 },
        { x: 25, z: 11 },
      ],
    },
    puzzlePoints: [
      { x: 17, z: 15 },
      { x: 20, z: 16 },
      { x: 23, z: 15 },
    ],
    puzzleLabels: ['West stone', 'Middle stone', 'East stone'],
    patrols: [
      patrol('moss', ['slime', 'slime'], loop(2, 6, 6, 11)),
      patrol('wings', ['bat', 'slime'], loop(16, 2, 26, 5)),
      patrol('roots', ['slime', 'bat'], loop(13, 23, 27, 23), 2.1),
      patrol('nest', ['bat', 'bat', 'slime'], loop(31, 15, 38, 24)),
      patrol('gate', ['slime', 'slime', 'bat'], loop(29, 2, 37, 5)),
    ],
  },
  {
    id: 2,
    title: 'The Runic Archive',
    subtitle: 'Read before you reach.',
    level: 2,
    map: carve(
      [
        [1, 18, 12, 8],
        [1, 1, 12, 13],
        [5, 14, 2, 4],
        [16, 8, 10, 11],
        [13, 10, 3, 2],
        [13, 21, 8, 2],
        [19, 19, 2, 4],
        [16, 1, 24, 4],
        [20, 5, 2, 3],
        [29, 8, 11, 18],
        [26, 12, 3, 2],
        [35, 5, 2, 3],
      ],
      [
        ...row(4, 2, 11, [6, 7]),
        ...row(8, 2, 11, [4, 5, 9]),
        ...row(11, 3, 10, [6]),
        ...row(12, 30, 38, [33, 34]),
        ...row(17, 30, 38, [35, 36]),
        ...row(21, 30, 38, [31, 32]),
        [18, 11],
        [23, 11],
        [18, 15],
        [23, 15],
      ],
    ),
    spawn: { x: 3, z: 23 },
    stairs: { x: 38, z: 2 },
    clue: { x: 2, z: 19 },
    hint: 'The tide turns before the sun can rise. The moon wakes only once the sun has set. A star follows the moon, and the comet always comes last. A wrong pull resets the sequence.',
    notes:
      'Five levers hide across the archive: Sun in the west stacks, Tide by the entrance, Moon in the east wing, Star in the north stacks and Comet in the reading room.',
    puzzle: { type: 'levers', sequence: [1, 0, 2, 3, 4], progress: 0 },
    puzzlePoints: [
      { x: 2, z: 2 },
      { x: 11, z: 24 },
      { x: 38, z: 24 },
      { x: 17, z: 2 },
      { x: 24, z: 17 },
    ],
    puzzleLabels: ['Sun', 'Tide', 'Moon', 'Star', 'Comet'],
    patrols: [
      patrol('bones', ['skeleton', 'bat'], loop(2, 5, 11, 7)),
      patrol('archive', ['skeleton', 'skeleton', 'wisp'], loop(17, 9, 24, 17)),
      patrol('stacks', ['wisp', 'bat'], loop(18, 2, 33, 3)),
      patrol('readers', ['skeleton', 'wisp'], loop(30, 9, 38, 11)),
      patrol('vault', ['skeleton', 'skeleton', 'bat'], loop(30, 22, 38, 25), 2.1),
    ],
  },
  {
    id: 3,
    title: 'The Ember Cloister',
    subtitle: 'One flame changes its neighbors.',
    level: 3,
    // A cloister walk around a central garth, with chapels off each side.
    map: carve(
      [
        [1, 19, 9, 7],
        [10, 22, 5, 2],
        [15, 18, 11, 8],
        [26, 22, 5, 2],
        [31, 14, 9, 12],
        [34, 9, 3, 5],
        [28, 1, 12, 8],
        [16, 1, 12, 3],
        [15, 4, 2, 14],
        [1, 1, 15, 8],
        [4, 9, 3, 10],
        [19, 8, 4, 6],
        [20, 14, 2, 4],
      ],
      [
        [18, 20],
        [22, 20],
        [18, 24],
        [22, 24],
        [31, 4],
        [36, 4],
        [5, 3],
        [10, 3],
        [5, 6],
        [10, 6],
      ],
    ),
    spawn: { x: 2, z: 24 },
    stairs: { x: 38, z: 2 },
    clue: { x: 2, z: 20 },
    hint: 'Seven flames burn in a chain from the south hall to the west chapel, each bound to the next, and the garth flame binds the second and the fifth. Light all seven. The carved hint reads: NEVER THE ENDS.',
    notes:
      'Braziers are numbered around the cloister from the entrance: 1 in the south hall, 2–3 in the east chapel, 4–5 in the north rooms, 6 in the west chapel, and 7 in the garth at the centre.',
    puzzle: {
      type: 'braziers',
      lit: [false, false, false, false, false, false, false],
      neighbors: [[1], [0, 2, 6], [1, 3], [2, 4], [3, 5, 6], [4], [1, 4]],
    },
    puzzlePoints: [
      { x: 20, z: 22 },
      { x: 33, z: 18 },
      { x: 38, z: 23 },
      { x: 33, z: 6 },
      { x: 18, z: 2 },
      { x: 3, z: 4 },
      { x: 21, z: 11 },
    ],
    puzzleLabels: ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Garth'],
    patrols: [
      patrol('embers', ['wisp', 'cultist'], loop(2, 2, 13, 7)),
      patrol('choir', ['cultist', 'skeleton', 'wisp'], loop(16, 19, 24, 25)),
      patrol('chapel', ['cultist', 'wisp'], loop(32, 15, 38, 24)),
      patrol('cinders', ['wisp', 'wisp', 'bat'], loop(29, 2, 38, 7)),
      patrol('garth', ['skeleton', 'cultist'], loop(19, 8, 22, 13), 2.0),
    ],
  },
  {
    id: 4,
    title: 'The Warden’s Keep',
    subtitle: 'The final door has a keeper.',
    level: 4,
    map: carve(
      [
        [1, 20, 14, 6],
        [6, 13, 3, 7],
        [1, 7, 14, 6],
        [15, 9, 11, 9],
        [15, 22, 25, 3],
        [26, 12, 14, 10],
        [31, 9, 3, 3],
        [18, 1, 22, 8],
        [6, 1, 12, 3],
        [6, 4, 3, 3],
      ],
      [
        [18, 11],
        [22, 11],
        [18, 15],
        [22, 15],
        [29, 15],
        [36, 15],
        [29, 19],
        [36, 19],
        [22, 4],
        [26, 4],
        [30, 4],
      ],
    ),
    spawn: { x: 2, z: 24 },
    stairs: { x: 38, z: 2 },
    clue: { x: 2, z: 21 },
    hint: 'The Warden walks the great hall and holds the brass key. Defeat it, then carry the key from its pedestal in the far west tower to open the stairs.',
    notes:
      'The Warden patrols the north great hall. The key pedestal stands in the western tower at the end of the north passage.',
    puzzle: { type: 'key', guardDefeated: false, collected: false },
    puzzlePoints: [{ x: 7, z: 2 }],
    puzzleLabels: ['Brass key'],
    patrols: [
      patrol('gate', ['skeleton', 'cultist'], loop(2, 8, 13, 11)),
      patrol('watch', ['wisp', 'bat'], loop(16, 10, 24, 16)),
      patrol('yard', ['cultist', 'skeleton'], loop(16, 22, 38, 24), 2.1),
      patrol('barracks', ['skeleton', 'wisp'], loop(27, 13, 38, 20)),
      patrol('tower', ['bat', 'wisp'], loop(7, 1, 16, 3), 2.0),
      patrol('warden', ['warden', 'skeleton'], loop(20, 6, 36, 6), 2.7, true),
    ],
  },
];
export const getFloor = (id: number): FloorDef => {
  const f = FLOORS.find((f) => f.id === id);
  if (!f) throw new Error(`Unknown floor ${id}`);
  return f;
};
