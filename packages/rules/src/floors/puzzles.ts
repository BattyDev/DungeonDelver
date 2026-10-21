import type { PuzzleState } from '../types';
import { platesSolved } from './pressure-plates';
import { leversSolved } from './lever-order';
import { braziersSolved } from './braziers';
import { keySolved } from './key-hunt';
export function isSolved(p: PuzzleState): boolean {
  switch (p.type) {
    case 'plates':
      return platesSolved(p);
    case 'levers':
      return leversSolved(p);
    case 'braziers':
      return braziersSolved(p);
    case 'key':
      return keySolved(p);
  }
}
