import type { PuzzleState } from '../types';
type State=Extract<PuzzleState,{type:'key'}>;
export function keyHunt(s:State,event:'guardDefeated'|'collectKey'):State {
 if(event==='guardDefeated')return {...s,guardDefeated:true};
 return s.guardDefeated?{...s,collected:true}:s;
}
export const keySolved=(s:State)=>s.collected;
