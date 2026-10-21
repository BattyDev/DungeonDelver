import { roleProfile } from '../ai';
import type { Fighter, Stats } from '../types';
export const ENEMIES: Record<string, {name:string; stats:Stats; xp:number; gold:number; classId:Fighter['classId']; boss?:boolean}> = {
 slime:{name:'Moss Slime',stats:{hp:47,mp:0,atk:12,mag:1,def:3,spd:5},xp:22,gold:9,classId:'knight'},
 bat:{name:'Gloom Bat',stats:{hp:36,mp:0,atk:13,mag:1,def:2,spd:18},xp:20,gold:8,classId:'rogue'},
 skeleton:{name:'Hollow Sentry',stats:{hp:66,mp:15,atk:15,mag:2,def:7,spd:9},xp:30,gold:12,classId:'knight'},
 wisp:{name:'Ash Wisp',stats:{hp:49,mp:20,atk:14,mag:8,def:4,spd:12},xp:28,gold:11,classId:'rogue'},
 cultist:{name:'Veiled Acolyte',stats:{hp:64,mp:35,atk:12,mag:13,def:4,spd:10},xp:35,gold:15,classId:'cleric'},
 warden:{name:'The Key Warden',stats:{hp:330,mp:35,atk:23,mag:6,def:11,spd:9},xp:160,gold:65,classId:'knight',boss:true},
};
export function createEnemy(type:string,id:string,level:number):Fighter {
 const def=ENEMIES[type]; const n=level-1;
 const stats={...def.stats,hp:def.stats.hp+n*16,atk:def.stats.atk+n*3,def:def.stats.def+n*2};
 return {id,name:def.name,team:'enemy',classId:def.classId,stats,hp:stats.hp,mp:stats.mp,effects:[],profile:roleProfile(def.classId==='cleric'?'healer':'dps'),player:false,boss:!!def.boss,defending:false,tauntTurns:0,xp:def.xp*level,gold:def.gold};
}
