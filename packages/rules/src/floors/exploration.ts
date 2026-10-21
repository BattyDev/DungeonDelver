import { clone } from '../clone';
import type { FloorDef, FloorState, Point } from '../types';
import { pushBlock, samePoint, walkable } from './pressure-plates';
import { isSolved } from './puzzles';
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
export function createFloor(def: FloorDef): FloorState {
  return {
    id: def.id,
    position: { ...def.spawn },
    puzzle: clone(def.puzzle),
    patrols: def.patrols.map((p) => ({
      id: p.id,
      position: { ...p.path[0] },
      waypoint: 0,
      pauseTicks: 0,
      defeated: false,
    })),
    clueRead: false,
  };
}
export function canWalk(def: FloorDef, state: FloorState, p: Point): boolean {
  return (
    walkable(def, p) &&
    (!samePoint(p, def.stairs) || isSolved(state.puzzle)) &&
    !(state.puzzle.type === 'plates' && state.puzzle.blocks.some((b) => samePoint(b, p)))
  );
}
export const PLAYER_RADIUS = 0.22;
const BLOCK_CLEARANCE = 0.36 + PLAYER_RADIUS;
function clearGeometry(def: FloorDef, state: FloorState, p: Point): boolean {
  return [-PLAYER_RADIUS, PLAYER_RADIUS].every((dx) =>
    [-PLAYER_RADIUS, PLAYER_RADIUS].every((dz) => {
      const tile = { x: Math.round(p.x + dx), z: Math.round(p.z + dz) };
      return walkable(def, tile) && (!samePoint(tile, def.stairs) || isSolved(state.puzzle));
    }),
  );
}
const overlapsBlock = (a: Point, b: Point) =>
  Math.abs(a.x - b.x) < BLOCK_CLEARANCE && Math.abs(a.z - b.z) < BLOCK_CLEARANCE;
/** Continuous positions, with enough clearance to keep the character out of walls and blocks. */
export function canOccupy(def: FloorDef, state: FloorState, p: Point): boolean {
  return (
    clearGeometry(def, state, p) &&
    !(state.puzzle.type === 'plates' && state.puzzle.blocks.some((b) => overlapsBlock(p, b)))
  );
}
/** Sweep small steps, sliding along walls. Puzzle stones still move one legal cell at a time. */
export function moveOnFloor(def: FloorDef, state: FloorState, dx: number, dz: number): FloorState {
  const length = Math.hypot(dx, dz);
  if (!Number.isFinite(length) || length === 0 || length > 1 + 1e-9) return state;
  const steps = Math.ceil(length / 0.1);
  let next = state;
  const pushed = new Set<number>();
  for (let i = 0; i < steps; i++) {
    for (const axis of ['x', 'z'] as const) {
      const delta = (axis === 'x' ? dx : dz) / steps;
      if (!delta) continue;
      const position = {
        ...next.position,
        [axis]: Math.round((next.position[axis] + delta) * 1e9) / 1e9,
      };
      if (!clearGeometry(def, next, position)) continue;
      if (next.puzzle.type === 'plates') {
        const index = next.puzzle.blocks.findIndex((b) => overlapsBlock(position, b));
        if (index >= 0) {
          const block = next.puzzle.blocks[index];
          const side = axis === 'x' ? 'z' : 'x';
          const direction = Math.sign(delta);
          // Approach the middle of a face; grazing a corner must not push a stone sideways.
          if (
            pushed.has(index) ||
            Math.abs(next.position[side] - block[side]) > 0.25 ||
            (block[axis] - next.position[axis]) * direction < 0.4
          )
            continue;
          const from = { ...block, [axis]: block[axis] - direction };
          const puzzle = pushBlock(
            next.puzzle,
            def,
            from,
            index,
            axis === 'x' ? direction : 0,
            axis === 'z' ? direction : 0,
          );
          if (puzzle === next.puzzle) continue;
          next = { ...next, puzzle };
          pushed.add(index);
        }
      }
      if (canOccupy(def, next, position)) next = { ...next, position };
    }
  }
  return next;
}
/** Walls block detection; sample a line at quarter-tile increments. */
export function lineOfSight(def: FloorDef, a: Point, b: Point): boolean {
  const steps = Math.ceil(distance(a, b) * 4);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (
      !walkable(def, { x: Math.round(a.x + (b.x - a.x) * t), z: Math.round(a.z + (b.z - a.z) * t) })
    )
      return false;
  }
  return true;
}
export function encounterAt(
  def: FloorDef,
  state: FloorState,
  stealth: boolean,
  sneak: boolean,
): string | undefined {
  return state.patrols.find((p) => {
    if (p.defeated || p.pauseTicks > 0) return false;
    const source = def.patrols.find((d) => d.id === p.id)!;
    const radius = source.radius * (stealth ? 0.6 : 1) * (sneak ? 0.6 : 1);
    return (
      distance(state.position, p.position) <= Math.max(0.65, radius) &&
      lineOfSight(def, state.position, p.position)
    );
  })?.id;
}
export function tickPatrols(def: FloorDef, state: FloorState): FloorState {
  return {
    ...state,
    patrols: state.patrols.map((p) => {
      if (p.defeated) return p;
      if (p.pauseTicks > 0) return { ...p, pauseTicks: p.pauseTicks - 1 };
      const path = def.patrols.find((d) => d.id === p.id)!.path;
      let waypoint = p.waypoint;
      let target = path[waypoint];
      if (distance(p.position, target) < 0.06) {
        waypoint = (waypoint + 1) % path.length;
        target = path[waypoint];
      }
      const d = distance(p.position, target);
      const step = Math.min(0.11, d);
      return {
        ...p,
        waypoint,
        position: d
          ? {
              x: p.position.x + ((target.x - p.position.x) / d) * step,
              z: p.position.z + ((target.z - p.position.z) / d) * step,
            }
          : { ...p.position },
      };
    }),
  };
}
