export class Keyboard {
 held=new Set<string>();
 constructor(private interact:()=>void,private close:()=>void){
  window.addEventListener('keydown',e=>{if((e.target as HTMLElement).matches('input,select,textarea'))return;const key=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key))e.preventDefault();this.held.add(key);if(!e.repeat&&['e','enter',' '].includes(key))this.interact();if(key==='escape')this.close();});
  window.addEventListener('keyup',e=>this.held.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>this.held.clear());
 }
 direction():[number,number]|undefined {if(this.held.has('w')||this.held.has('arrowup'))return [0,-1];if(this.held.has('s')||this.held.has('arrowdown'))return [0,1];if(this.held.has('a')||this.held.has('arrowleft'))return [-1,0];if(this.held.has('d')||this.held.has('arrowright'))return [1,0];return undefined;}
}
