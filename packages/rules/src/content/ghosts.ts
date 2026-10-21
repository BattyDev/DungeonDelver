import { CLASSES } from '../classes';
import { roleProfile, weights } from '../ai';
import { defaultLoadout } from '../items';
import type { ClassId, Ghost } from '../types';
const entries: [string,ClassId,string,number,boolean][] = [
 ['Alder','knight','Steadfast guardian',28,false],['Mira','cleric','Cautious healer',32,false],['Nyx','rogue','Reckless rogue',25,false],['Bram','knight','Iron sentinel',26,true],['Sable','rogue','Patient duelist',27,true],['Juniper','cleric','Merciful keeper',30,true],['Rook','knight','Shield first',24,false],['Wren','rogue','Daring scout',29,false],
 ['Pebble','knight','Community • simple guardian',2,true],['Flint','knight','Community • watchful guard',2,false],['Fern','cleric','Community • apprentice healer',2,true],['Clover','cleric','Community • kind acolyte',2,false],['Pip','rogue','Community • eager scout',2,true],['Moth','rogue','Community • quiet scout',2,false],
];
export const GHOSTS: Ghost[] = entries.map(([name,classId,style,price,alternate],i)=>{
 const community=i>=8; const profile=roleProfile(CLASSES[classId].role);
 if (name==='Mira') profile.healingThreshold=0.85;
 if (name==='Nyx') profile.defaults=weights(3,12,0);
 if (name==='Bram' || name==='Rook') profile.defaults=weights(4,8,3);
 if (community) { profile.defaults=weights(9,2,1); profile.healingThreshold=0.45; }
 return {id:`ghost-${i}`,ownerId:`owner-${i}`,character:{id:`ghost-${i}`,ownerId:`owner-${i}`,name,classId,xp:100*i,loadout:defaultLoadout(classId,alternate),color:CLASSES[classId].color},profile,style,price,community,dialogue:community?'Every great expedition starts with a small step.': ['Keep close. I know these stones.','We all come home. That is the plan.','A little danger keeps the spirit sharp.'][i%3],runs:community?0:12+i*7,revives:classId==='cleric'?8+i:0,deepestFloor:community?1:5};
});
