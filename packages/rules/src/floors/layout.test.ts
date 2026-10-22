import { it, expect } from 'vitest';
import { FLOORS } from '../content/floors';
import { lineOfSight } from './exploration';
import { pushBlock, samePoint, walkable } from './pressure-plates';
import { toggleBrazier, braziersSolved } from './braziers';
import type { FloorDef, Point, PuzzleState } from '../types';

const key = (p: Point) => `${p.x},${p.z}`;
const steps = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
function reachable(def: FloorDef, from: Point, blocked: (p: Point) => boolean = () => false) {
  const seen = new Set([key(from)]),
    queue = [from];
  for (let n = 0; n < queue.length; n++)
    for (const [dx, dz] of steps) {
      const q = { x: queue[n].x + dx, z: queue[n].z + dz };
      if (walkable(def, q) && !blocked(q) && !seen.has(key(q))) {
        seen.add(key(q));
        queue.push(q);
      }
    }
  return seen;
}

it('every floor is several rooms, all connected, with legal patrol routes', () => {
  for (const def of FLOORS) {
    const open = def.map
      .join('')
      .split('')
      .filter((t) => t === '.').length;
    expect(open, `floor ${def.id} size`).toBeGreaterThan(273 * 2);
    expect(def.patrols.length).toBeGreaterThanOrEqual(4);
    const all = reachable(def, def.spawn);
    for (const p of [def.stairs, def.clue, ...def.puzzlePoints])
      expect(all.has(key(p)), `floor ${def.id} point ${key(p)}`).toBe(true);
    expect(def.puzzleLabels.length).toBe(def.puzzlePoints.length);
    if (def.restart) {
      expect(all.has(key(def.restart)), `floor ${def.id} restart`).toBe(true);
      if (def.puzzle.type === 'plates')
        expect(def.puzzle.blocks.some((b) => samePoint(b, def.restart!))).toBe(false);
    }
    for (const p of def.patrols)
      p.path.forEach((a, i) => {
        const b = p.path[(i + 1) % p.path.length];
        expect(walkable(def, a), `floor ${def.id} ${p.id} waypoint ${key(a)}`).toBe(true);
        expect(lineOfSight(def, a, b) || samePoint(a, b), `floor ${def.id} ${p.id} leg`).toBe(true);
      });
    // Puzzle pieces are spread across the floor, not clustered in one corner.
    const pieces = [
      ...def.puzzlePoints,
      ...(def.puzzle.type === 'plates' ? def.puzzle.plates : []),
    ];
    const xs = pieces.map((p) => p.x);
    if (pieces.length > 2) expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(7);
  }
});

it('floor 3 braziers need at least four touches', () => {
  const p = FLOORS[2].puzzle as Extract<PuzzleState, { type: 'braziers' }>;
  let best = Infinity;
  for (let mask = 0; mask < 1 << p.lit.length; mask++) {
    let s = p;
    for (let i = 0; i < p.lit.length; i++) if (mask & (1 << i)) s = toggleBrazier(s, i);
    if (braziersSolved(s)) best = Math.min(best, mask.toString(2).replace(/0/g, '').length);
  }
  expect(best).toBeGreaterThanOrEqual(4);
  expect(best).toBeLessThan(Infinity);
  // The carved hint's touches solve it.
  let s = p;
  for (const i of [1, 2, 3, 4, 6]) s = toggleBrazier(s, i);
  expect(braziersSolved(s)).toBe(true);
});

it('floor 1 stones reach their plates by a 19-push route the player can walk', () => {
  const def = FLOORS[0];
  let s = def.puzzle as Extract<PuzzleState, { type: 'plates' }>;
  let player = def.spawn;
  // Found by a breadth-first search over pushes; no shorter solution exists inside the vault.
  const route: [number, string][] = [
    [0, 'W'],
    [0, 'N'],
    [0, 'N'],
    [0, 'W'],
    [0, 'N'],
    [0, 'N'],
    [2, 'E'],
    [2, 'N'],
    [2, 'N'],
    [2, 'E'],
    [2, 'N'],
    [2, 'N'],
    [1, 'E'],
    [1, 'N'],
    [1, 'N'],
    [1, 'N'],
    [1, 'N'],
    [1, 'N'],
    [1, 'W'],
  ];
  const dirs: Record<string, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
  for (const [index, d] of route) {
    const [dx, dz] = dirs[d],
      block = s.blocks[index];
    const from = { x: block.x - dx, z: block.z - dz };
    const region = reachable(def, player, (q) => s.blocks.some((b) => samePoint(b, q)));
    expect(region.has(key(from)), `reach ${key(from)}`).toBe(true);
    const next = pushBlock(s, def, from, index, dx, dz);
    expect(next).not.toBe(s);
    s = next;
    player = block;
  }
  expect(s.plates.every((p) => s.blocks.some((b) => samePoint(p, b)))).toBe(true);
});
