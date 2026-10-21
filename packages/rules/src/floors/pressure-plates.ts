import type { FloorDef, Point, PuzzleState } from '../types';
export const samePoint=(a:Point,b:Point)=>a.x===b.x&&a.z===b.z;
export const walkable=(floor:FloorDef,p:Point)=>floor.map[p.z]?.[p.x]!==undefined&&floor.map[p.z][p.x]!=='#';
export function pushBlock(state:Extract<PuzzleState,{type:'plates'}>,floor:FloorDef,player:Point,index:number,dx:number,dz:number): typeof state {
 const block=state.blocks[index];
 if(!block || Math.abs(dx)+Math.abs(dz)!==1 || !samePoint({x:player.x+dx,z:player.z+dz},block))return state;
 const target={x:block.x+dx,z:block.z+dz};
 if(!walkable(floor,target)||samePoint(target,floor.stairs)||state.blocks.some(p=>samePoint(p,target)))return state;
 return {...state,blocks:state.blocks.map((p,i)=>i===index?target:p)};
}
export const platesSolved=(s:Extract<PuzzleState,{type:'plates'}>)=>s.plates.every(p=>s.blocks.some(b=>samePoint(p,b)));
