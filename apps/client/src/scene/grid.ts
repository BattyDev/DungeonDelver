import type { Point } from '@delver/rules';

const RADIUS = 0.22;
export const open = (map: string[], x: number, z: number) =>
  map[z]?.[x] !== undefined && map[z][x] !== '#';
/** Whether a character of the usual size fits at a continuous position. */
export function canStand(map: string[], p: Point): boolean {
  return [-RADIUS, RADIUS].every((dx) =>
    [-RADIUS, RADIUS].every((dz) => open(map, Math.round(p.x + dx), Math.round(p.z + dz))),
  );
}
/** Sweeps small steps along each axis so walls stop movement and the character slides along them. */
export function moveOnGrid(map: string[], from: Point, dx: number, dz: number): Point {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
  let p = { ...from };
  for (let i = 0; i < steps; i++)
    for (const axis of ['x', 'z'] as const) {
      const delta = (axis === 'x' ? dx : dz) / steps;
      if (!delta) continue;
      const next = { ...p, [axis]: p[axis] + delta };
      if (canStand(map, next)) p = next;
    }
  return p;
}
/** True when a straight walk from a to b stays on open ground. */
export function clearLine(map: string[], a: Point, b: Point): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.15);
  for (let i = 1; i <= steps; i++)
    if (!canStand(map, { x: a.x + ((b.x - a.x) * i) / steps, z: a.z + ((b.z - a.z) * i) / steps }))
      return false;
  return true;
}
