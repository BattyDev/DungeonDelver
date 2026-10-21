import * as THREE from 'three';
import { CLASSES } from '@delver/rules';
import type { ClassId } from '@delver/rules';
const cache=new Map<string,THREE.CanvasTexture>();
export function spriteTexture(classId:ClassId,color:string,enemy=false):THREE.CanvasTexture {
 const key=`${classId}-${color}-${enemy}`;if(cache.has(key))return cache.get(key)!;
 const canvas=document.createElement('canvas');canvas.width=160;canvas.height=220;
 const c=canvas.getContext('2d')!;
 const glow=c.createRadialGradient(80,125,6,80,125,78);glow.addColorStop(0,`${color}44`);glow.addColorStop(1,`${color}00`);c.fillStyle=glow;c.fillRect(0,0,160,220);
 c.shadowColor=color;c.shadowBlur=16;
 c.fillStyle=color;c.beginPath();c.moveTo(39,173);c.quadraticCurveTo(42,114,53,104);c.quadraticCurveTo(28,74,48,48);c.quadraticCurveTo(80,14,111,48);c.quadraticCurveTo(131,74,107,104);c.quadraticCurveTo(125,121,122,173);c.lineTo(108,163);c.lineTo(94,180);c.lineTo(80,167);c.lineTo(65,181);c.lineTo(52,164);c.closePath();c.fill();
 c.shadowBlur=0;
 c.fillStyle=enemy?'#251820':'#17292c';c.beginPath();c.ellipse(80,77,23,20,0,0,Math.PI*2);c.fill();
 c.fillStyle='#e9fff3';c.fillRect(65,74,7,5);c.fillRect(87,74,7,5);
 if(classId==='knight'){c.strokeStyle='#f8ead2';c.lineWidth=7;c.beginPath();c.moveTo(45,64);c.lineTo(80,42);c.lineTo(115,64);c.stroke();c.fillStyle='#607e7c';c.beginPath();c.moveTo(33,119);c.lineTo(53,111);c.lineTo(65,119);c.lineTo(61,146);c.lineTo(47,158);c.lineTo(34,145);c.fill();}
 if(classId==='cleric'){c.strokeStyle='#dfd9ae';c.lineWidth=5;c.beginPath();c.moveTo(122,106);c.lineTo(122,176);c.stroke();c.strokeStyle='#f8fff1';c.beginPath();c.arc(122,99,10,0,Math.PI*2);c.stroke();}
 if(classId==='rogue'){c.fillStyle='#eee9ff';c.beginPath();c.moveTo(31,118);c.lineTo(20,150);c.lineTo(40,139);c.fill();c.beginPath();c.moveTo(127,118);c.lineTo(138,150);c.lineTo(118,139);c.fill();}
 c.fillStyle='#173036';c.font='bold 29px Georgia';c.textAlign='center';c.fillText(CLASSES[classId].glyph,80,137);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;cache.set(key,texture);return texture;
}
export function makeSprite(classId:ClassId,color:string,enemy=false):THREE.Sprite {
 const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:spriteTexture(classId,color,enemy),transparent:true,depthWrite:false}));sprite.scale.set(1.25,1.72,1);return sprite;
}
