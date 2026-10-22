// The Gathering Hall: a client-side hub of several rooms. The rules only know "hub", so its layout,
// walking and points of interest live here.
import type { Point } from '@delver/rules';
import type { PropId } from './pixels';

const W = 52,
  H = 34;
type Rect = [number, number, number, number];
export interface HallRoom {
  name: string;
  rect: Rect;
  floor: 'stone' | 'wood';
}
export const HALL_ROOMS: HallRoom[] = [
  { name: 'Changing Room', rect: [1, 1, 11, 8], floor: 'wood' },
  { name: 'Portal Sanctum', rect: [17, 1, 16, 8], floor: 'stone' },
  { name: 'Armory', rect: [38, 1, 13, 8], floor: 'wood' },
  { name: 'The Tavern', rect: [1, 12, 12, 15], floor: 'wood' },
  { name: 'Great Hall', rect: [16, 12, 20, 15], floor: 'stone' },
  { name: 'Descent', rect: [39, 12, 12, 15], floor: 'stone' },
  { name: 'Moss Garden', rect: [16, 29, 20, 4], floor: 'stone' },
];
const DOORS: Rect[] = [
  [5, 9, 3, 3],
  [23, 9, 4, 3],
  [43, 9, 3, 3],
  [13, 17, 3, 4],
  [36, 17, 3, 4],
  [24, 27, 4, 2],
];
const PILLARS: [number, number][] = [
  [19, 15],
  [32, 15],
  [19, 23],
  [32, 23],
];
export const HALL_MAP: string[] = (() => {
  const grid = Array.from({ length: H }, () => Array<string>(W).fill('#'));
  for (const [x, z, w, d] of [...HALL_ROOMS.map((r) => r.rect), ...DOORS])
    for (let r = z; r < z + d; r++) for (let c = x; c < x + w; c++) grid[r][c] = '.';
  for (const [x, z] of PILLARS) grid[z][x] = '#';
  return grid.map((row) => row.join(''));
})();
export const HALL = {
  spawn: { x: 25.5, z: 24 },
  stairs: { x: 47, z: 19 },
  portal: { x: 24.5, z: 3.5 },
  wardrobe: { x: 4, z: 2 },
  armory: { x: 44, z: 2.5 },
  /** Where returning from the sanctuary or the changing room puts you. */
  sanctuaryReturn: { x: 24.5, z: 6 },
  changingReturn: { x: 6, z: 6 },
};
/** The carpet runs down the middle of the Great Hall. */
export const hallCarpet = (x: number, z: number) => x >= 22 && x <= 29 && z >= 13 && z <= 25;
export const hallRoomAt = (p: Point): HallRoom | undefined =>
  HALL_ROOMS.find(
    ({ rect: [x, z, w, d] }) =>
      p.x >= x - 0.5 && p.x < x + w - 0.5 && p.z >= z - 0.5 && p.z < z + d - 0.5,
  );
/** Hand-placed furniture: [prop, x, z]. Wall props are placed on the tile in front of a wall. */
export const HALL_PROPS: [PropId, number, number][] = [
  ['wardrobe', 4, 1.2],
  ['mirror', 8, 1.2],
  ['chest', 10.5, 2],
  ['plant', 1.5, 7],
  ['table', 4, 16],
  ['table', 9, 16],
  ['table', 4, 22],
  ['table', 9, 22],
  ['counter', 6.5, 12.6],
  ['barrel', 1.4, 13],
  ['barrel', 11.6, 13],
  ['barrel', 1.4, 25.6],
  ['crate', 11.6, 25.6],
  ['rack', 40, 1.2],
  ['rack', 48, 1.2],
  ['chest', 44, 1.4],
  ['crate', 50, 7],
  ['barrel', 38.6, 7],
  ['plant', 16.6, 12.6],
  ['plant', 34.4, 12.6],
  ['plant', 16.6, 25.6],
  ['plant', 34.4, 25.6],
  ['crate', 49.6, 13],
  ['barrel', 49.6, 14],
  ['barrel', 39.4, 25.6],
  ['plant', 17, 30],
  ['plant', 21, 31.6],
  ['plant', 30, 31.6],
  ['plant', 35, 30],
  ['mushroom', 26, 31.8],
  ['mushroom', 19, 29.4],
  ['tablet', 32, 29.6],
  ['banner', 20, 1.2],
  ['banner', 29, 1.2],
  ['banner', 21, 12.2],
  ['banner', 30, 12.2],
];
const RAND_POINT_TRIES = 30;
/** A random open point inside a room, for wanderers. */
export function randomPointIn(room: HallRoom, rand: () => number = Math.random): Point {
  const [x, z, w, d] = room.rect;
  for (let i = 0; i < RAND_POINT_TRIES; i++) {
    const p = { x: x + 0.5 + rand() * (w - 2), z: z + 0.5 + rand() * (d - 2) };
    if (HALL_MAP[Math.round(p.z)]?.[Math.round(p.x)] === '.') return p;
  }
  return { x: x + w / 2, z: z + d / 2 };
}
