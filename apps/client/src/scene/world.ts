import * as THREE from 'three';
import { CLASSES, GHOSTS, getFloor, isSolved, ENEMIES } from '@delver/rules';
import type { GameState, Point } from '@delver/rules';
import { makeSprite } from './sprites';
export type WorldClick={kind:'ground';point:Point}|{kind:'ghost';id:string}|{kind:'interact'};
export class World {
 private renderer:THREE.WebGLRenderer;
 private scene=new THREE.Scene();
 private camera=new THREE.OrthographicCamera(-14,14,11,-11,0.1,120);
 private room=new THREE.Group();
 private actors=new THREE.Group();
 private player?:THREE.Sprite;
 private ghostSprites:THREE.Sprite[]=[];
 private enemies=new Map<string,THREE.Sprite>();
 private labels:HTMLButtonElement[]=[];
 private raycaster=new THREE.Raycaster();
 private key='';
 private state:GameState={phase:'classSelect'};
 private target:Point={x:10,z:9};
 private resizeObserver:ResizeObserver;
 private plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
 private portal?:THREE.Mesh;
 constructor(private host:HTMLElement,private onClick:(click:WorldClick)=>void){
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  this.renderer.setClearColor('#101e23');this.renderer.outputColorSpace=THREE.SRGBColorSpace;
  this.host.append(this.renderer.domElement);this.renderer.domElement.setAttribute('aria-label','Dungeon exploration. Move with WASD, arrows, or tap the floor.');
  this.scene.add(this.room,this.actors,new THREE.AmbientLight('#b7d5ca',2.2));
  const sun=new THREE.DirectionalLight('#fff0cf',3);sun.position.set(5,16,8);this.scene.add(sun);
  this.camera.position.set(10,23,26);this.camera.lookAt(10,0,6);
  this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);
  this.renderer.domElement.addEventListener('pointerup',e=>this.click(e));this.resize();
 }
 private resize(){const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);const aspect=w/h;const height=Math.max(17,25/aspect);this.camera.left=-height*aspect/2;this.camera.right=height*aspect/2;this.camera.top=height/2;this.camera.bottom=-height/2;this.camera.updateProjectionMatrix();}
 private box(x:number,z:number,w:number,d:number,height:number,color:string,y=0){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,height,d),new THREE.MeshStandardMaterial({color,roughness:0.92}));mesh.position.set(x,y+height/2,z);this.room.add(mesh);return mesh;}
 private marker(x:number,z:number,color:string,r=0.34){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,0.08,32),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:0.35}));mesh.position.set(x,0.08,z);this.room.add(mesh);return mesh;}
 private clear(){for(const group of [this.room,this.actors]){group.traverse(obj=>{const mesh=obj as THREE.Mesh;if(mesh.geometry)mesh.geometry.dispose();if(mesh.material){for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material])mat.dispose();}});group.clear();}this.labels.forEach(l=>l.remove());this.labels=[];this.ghostSprites=[];this.enemies.clear();this.portal=undefined;}
 setState(s:GameState,hubPosition:Point){
  this.state=s;const key=s.phase==='floor'||s.phase==='combat'?`floor-${s.floor.id}`:s.phase==='safeRoom'?'safe':'hub';
  if(key!==this.key){this.key=key;this.build(s);}
  if(s.phase==='classSelect')return;
  this.target=(s.phase==='floor'||s.phase==='combat')?s.floor.position:hubPosition;
  if(!this.player){this.player=makeSprite(s.progress.player.classId,s.progress.player.color);this.actors.add(this.player);this.player.position.set(this.target.x,0.95,this.target.z);}
  const material=this.player.material as THREE.SpriteMaterial;
  if(this.player.userData.classId!==s.progress.player.classId){const replacement=makeSprite(s.progress.player.classId,s.progress.player.color);material.map=(replacement.material as THREE.SpriteMaterial).map;material.needsUpdate=true;this.player.userData.classId=s.progress.player.classId;}
  if(s.phase==='floor'||s.phase==='combat'){
   const def=getFloor(s.floor.id);
   for(const p of s.floor.patrols){const actor=this.enemies.get(p.id);if(actor){actor.visible=!p.defeated;actor.position.set(p.position.x,0.95,p.position.z);}}
   this.room.children.filter(o=>o.userData.dynamic).forEach(o=>{this.room.remove(o);const m=o as THREE.Mesh;m.geometry?.dispose();(m.material as THREE.Material)?.dispose();});
   const p=s.floor.puzzle;
   if(p.type==='plates'){for(const plate of p.plates){const m=this.marker(plate.x,plate.z,'#e1b565',0.42);m.userData.dynamic=true;}for(const b of p.blocks){const m=this.box(b.x,b.z,0.72,0.72,0.7,'#9fa38a');m.userData.dynamic=true;}}
   if(p.type==='levers')def.puzzlePoints.forEach((pt,i)=>{const m=this.marker(pt.x,pt.z,p.sequence.slice(0,p.progress).includes(i)?'#9ee7b3':'#e2b15b');m.userData.dynamic=true;const pole=this.box(pt.x,pt.z,.12,.12,.7,'#d1b36d');pole.userData.dynamic=true;});
   if(p.type==='braziers')def.puzzlePoints.forEach((pt,i)=>{const m=this.marker(pt.x,pt.z,p.lit[i]?'#ffa851':'#53646b',0.35);m.userData.dynamic=true;const bowl=this.box(pt.x,pt.z,.5,.5,.4,'#5b6965');bowl.userData.dynamic=true;if(p.lit[i]){const flame=this.marker(pt.x,pt.z,'#ffc876',0.22);flame.position.y=.6;flame.userData.dynamic=true;}});
   if(p.type==='key'&&!p.collected){const pt=def.puzzlePoints[0];const m=this.marker(pt.x,pt.z,p.guardDefeated?'#f5d37d':'#a55f63');m.userData.dynamic=true;}
   const door=this.box(def.stairs.x,def.stairs.z,.9,.25,isSolved(p)?.15:1.6,isSolved(p)?'#88d6ba':'#aa8255');door.userData.dynamic=true;
  }
 }
 private build(s:GameState){
  this.clear();this.player=undefined;
  const dungeon=s.phase==='floor'||s.phase==='combat';const def=dungeon?getFloor(s.floor.id):undefined;
  const map=def?.map??Array.from({length:13},(_,z)=>z===0||z===12?'#####################':'#...................#');
  map.forEach((row,z)=>[...row].forEach((tile,x)=>{
   if(tile==='#'){// Keep front boundary low so the party stays visible.
    const height=z===12?.25:.85;this.box(x,z,.98,.98,height,dungeon?'#3a4945':'#495a52');
   }else this.box(x,z,.96,.96,.12,(x+z)%3===0?(dungeon?'#30413b':'#4a5b4b'):(dungeon?'#293a35':'#405243'),-.12);
  }));
  if(def&&dungeon){
   this.marker(def.clue.x,def.clue.z,'#a7c5d0');this.box(def.clue.x,def.clue.z,.55,.5,.55,'#879a89');
   this.marker(def.stairs.x,def.stairs.z,'#a6dec2',.65);
   def.patrols.forEach(p=>{const enemyDef=ENEMIES[p.enemyTypes[0]];const sprite=makeSprite(enemyDef.classId,p.boss?'#e7a373':'#c7828c',true);if(p.boss)sprite.scale.multiplyScalar(1.5);this.actors.add(sprite);this.enemies.set(p.id,sprite);});
  }else{
   // Hall pillars, moss garden and gathering rug.
   for(const x of [2,18])for(const z of [2,10]){this.box(x,z,.65,.65,2,'#667369');this.box(x,z,.95,.95,.2,'#8a9180',2);}
   this.box(10,6,7,4,.03,'#354a49');this.box(10,6,6.8,3.8,.04,'#526458');
   this.marker(17,2,'#a7d9c7',.9);
   this.portal=new THREE.Mesh(new THREE.TorusGeometry(.85,.12,12,48),new THREE.MeshStandardMaterial({color:'#91e9cb',emissive:'#60d8ba',emissiveIntensity:.8}));this.portal.position.set(17,1.1,2);this.room.add(this.portal);
   this.marker(17,10,'#dfb567',.8);
   if(s.phase!=='safeRoom'){
    GHOSTS.filter(g=>!g.community).forEach((g,i)=>{const sprite=makeSprite(g.character.classId,g.character.color);sprite.userData.ghostId=g.id;this.ghostSprites.push(sprite);this.actors.add(sprite);const button=document.createElement('button');button.className='world-label';button.innerHTML=`<span>${g.character.name}</span><small>${CLASSES[g.character.classId].name}</small>`;button.addEventListener('click',()=>this.onClick({kind:'ghost',id:g.id}));this.host.append(button);this.labels[i]=button;});
   }
  }
 }
 animate(time:number){
  if(this.player){this.player.position.x+=(this.target.x-this.player.position.x)*.22;this.player.position.z+=(this.target.z-this.player.position.z)*.22;this.player.position.y=.94+Math.sin(time*2.5)*.035;}
  this.ghostSprites.forEach((sprite,i)=>{const base=this.ghostPoint(i,time);sprite.position.set(base.x,.94+Math.sin(time*2+i)*.05,base.z);const projected=new THREE.Vector3(base.x,1.9,base.z).project(this.camera);const label=this.labels[i];label.style.left=`${(projected.x*.5+.5)*this.host.clientWidth}px`;label.style.top=`${(-projected.y*.5+.5)*this.host.clientHeight}px`;});
  if(this.portal)this.portal.rotation.y=Math.sin(time*.6)*.25;
  this.renderer.render(this.scene,this.camera);
 }
 ghostPoint(i:number,time:number):Point {return {x:[4,8,12,16,3,7,13,17][i]+Math.sin(time*.18+i*2)*.7,z:(i<4?3.7:7.5)+Math.cos(time*.16+i)*.5};}
 private click(e:PointerEvent){const r=this.renderer.domElement.getBoundingClientRect();const mouse=new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);this.raycaster.setFromCamera(mouse,this.camera);const hit=this.raycaster.intersectObjects(this.ghostSprites)[0];if(hit){this.onClick({kind:'ghost',id:hit.object.userData.ghostId as string});return;}const point=new THREE.Vector3();if(this.raycaster.ray.intersectPlane(this.plane,point)){const p={x:Math.round(point.x),z:Math.round(point.z)};if(this.state.phase==='floor'){const def=getFloor(this.state.floor.id);if(Math.hypot(p.x-def.stairs.x,p.z-def.stairs.z)<1||def.puzzlePoints.some(q=>q.x===p.x&&q.z===p.z)||(p.x===def.clue.x&&p.z===def.clue.z)){this.onClick({kind:'ground',point:p});return;}}this.onClick({kind:'ground',point:p});}}
}
