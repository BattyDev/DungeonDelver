import { it,expect } from 'vitest';
import { getFloor } from '../content/floors';
import { clone } from '../clone';
import { platesSolved,pushBlock,walkable,samePoint } from './pressure-plates';
import type { Point } from '../types';
it('floor 1 is solvable with reachable, legal pushes',()=>{
 const def=getFloor(1);const initial=clone(def.puzzle);if(initial.type!=='plates')throw Error();let s=initial;let player=def.spawn;
 function walkTo(target:Point){const queue=[player];const seen=new Set([`${player.x},${player.z}`]);for(let n=0;n<queue.length;n++){const p=queue[n];if(samePoint(p,target)){player=p;return;}for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const q={x:p.x+dx,z:p.z+dz},key=`${q.x},${q.z}`;if(walkable(def,q)&&!s.blocks.some(b=>samePoint(b,q))&&!seen.has(key)){seen.add(key);queue.push(q);}}}throw Error('Unreachable pushing position');}
 for(const index of [0,1]){const b=s.blocks[index];walkTo({x:b.x,z:b.z+1});for(let i=0;i<2;i++){const old=s.blocks[index];const next=pushBlock(s,def,player,index,0,-1);expect(next).not.toBe(s);s=next;player=old;}}
 expect(platesSolved(s)).toBe(true);expect(platesSolved(initial)).toBe(false);
});
it('rejects remote, diagonal and wall pushes',()=>{const def=getFloor(1),s=def.puzzle;if(s.type!=='plates')throw Error();expect(pushBlock(s,def,def.spawn,0,0,-1)).toBe(s);expect(pushBlock(s,def,{x:3,z:5},0,1,-1)).toBe(s);const wall={...s,blocks:[{x:1,z:1}]};expect(pushBlock(wall,def,{x:1,z:2},0,0,-1)).toBe(wall);});
