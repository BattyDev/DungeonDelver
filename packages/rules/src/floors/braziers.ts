import type { PuzzleState } from '../types';
type State = Extract<PuzzleState, { type: 'braziers' }>;
export function toggleBrazier(s: State, index: number): State {
  if (!Number.isInteger(index) || index < 0 || index >= s.lit.length) return s;
  const toggles = [index, ...s.neighbors[index]];
  return { ...s, lit: s.lit.map((lit, i) => (toggles.includes(i) ? !lit : lit)) };
}
export const braziersSolved = (s: State) => s.lit.every(Boolean);
