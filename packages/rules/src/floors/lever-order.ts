import type { PuzzleState } from '../types';
type State = Extract<PuzzleState, { type: 'levers' }>;
export function pullLever(s: State, index: number): State {
  if (
    index < 0 ||
    index >= s.sequence.length ||
    !Number.isInteger(index) ||
    s.progress === s.sequence.length
  )
    return s;
  return {
    ...s,
    progress: s.sequence[s.progress] === index ? s.progress + 1 : s.sequence[0] === index ? 1 : 0,
  };
}
export const leversSolved = (s: State) => s.progress === s.sequence.length;
