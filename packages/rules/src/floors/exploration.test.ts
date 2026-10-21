import { expect, it } from 'vitest';
import { getFloor } from '../content/floors';
import { canOccupy, createFloor, moveOnFloor } from './exploration';
import { isSolved } from './puzzles';

it('moves freely in small diagonal increments, deterministically and without mutation', () => {
  const def = getFloor(1);
  const floor = createFloor(def);
  const next = moveOnFloor(def, floor, 0.06, -0.08);
  expect(next.position).toEqual({ x: 2.06, z: 9.92 });
  expect(moveOnFloor(def, floor, 0.06, -0.08)).toEqual(next);
  expect(floor.position).toEqual(def.spawn);
  for (const [dx, dz] of [
    [NaN, 0],
    [Infinity, 0],
    [2, 0],
    [1, 1],
    [0, 0],
  ])
    expect(moveOnFloor(def, floor, dx, dz)).toBe(floor);
});

it('sweeps into walls without tunneling and slides along their faces', () => {
  const def = getFloor(1);
  let floor = { ...createFloor(def), position: { x: 8, z: 4 } };
  for (let i = 0; i < 30; i++) floor = moveOnFloor(def, floor, 0.06, 0.02);
  expect(floor.position.x).toBeLessThanOrEqual(8.28);
  expect(floor.position.z).toBeCloseTo(4.6);
  expect(canOccupy(def, floor, floor.position)).toBe(true);
  const corner = { ...createFloor(def), position: { x: 8.25, z: 5.25 } };
  const next = moveOnFloor(def, corner, 0.7, 0.7);
  expect(next.position.x).toBeLessThanOrEqual(8.28);
  expect(next.position.z).toBeLessThanOrEqual(5.28);
});

it('keeps unsolved stairs solid and admits the player after the seal opens', () => {
  const def = getFloor(1);
  const floor = { ...createFloor(def), position: { x: 18, z: 3 } };
  expect(moveOnFloor(def, floor, 0, -1).position.z).toBeGreaterThanOrEqual(2.72);
  if (floor.puzzle.type !== 'plates') throw Error();
  const solved = { ...floor, puzzle: { ...floor.puzzle, blocks: floor.puzzle.plates } };
  expect(moveOnFloor(def, solved, 0, -1).position).toEqual({ x: 18, z: 2 });
});

it('solves the plate puzzle with continuous walking while retaining legal grid pushes', () => {
  const def = getFloor(1);
  let floor = createFloor(def);
  for (const x of [4, 6]) {
    floor = { ...floor, position: { x: x + 0.1, z: 5 } };
    for (let i = 0; i < 40; i++) floor = moveOnFloor(def, floor, 0, -0.05);
    expect(floor.position.z).toBeCloseTo(3);
  }
  expect(isSolved(floor.puzzle)).toBe(true);
  const offCenter = { ...createFloor(def), position: { x: 4.4, z: 5 } };
  expect(moveOnFloor(def, offCenter, 0, -1).puzzle).toEqual(def.puzzle);
});
