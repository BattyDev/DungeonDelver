import * as THREE from 'three';
import { F } from '../paperdoll/model';
import { creatureFor, isFlying } from '../paperdoll/creatures';
import { DollSprite } from './doll-sprite';

const cache = new Map<string, THREE.CanvasTexture>();
/** The same native-resolution idle art used by animated enemies and turn-order portraits. */
export function enemyTexture(type: string): THREE.CanvasTexture {
  let texture = cache.get(type);
  if (!texture) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = F;
    canvas
      .getContext('2d')!
      .putImageData(new ImageData(creatureFor(type).frameNow('idle', 0, 0).slice(), F, F), 0, 0);
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    cache.set(type, texture);
  }
  return texture;
}
export function makeEnemySprite(type: string): DollSprite {
  return new DollSprite(creatureFor(type), undefined, !isFlying(type));
}
