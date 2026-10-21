import { clone } from '../clone';
import type { FloorDef, FloorState, Point } from '../types';
import { samePoint, walkable } from './pressure-plates';
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
