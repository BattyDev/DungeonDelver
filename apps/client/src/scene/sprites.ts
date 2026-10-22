import * as THREE from 'three';
import { pixelate } from './pixels';
import { billboard } from './billboard';
import type { Billboard } from './billboard';

const cache = new Map<string, THREE.CanvasTexture>();
type Pen = CanvasRenderingContext2D;
function polygon(c: Pen, points: number[][], color: string) {
  c.fillStyle = color;
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
  c.stroke();
}
function ellipse(c: Pen, x: number, y: number, rx: number, ry: number, color: string) {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
  c.stroke();
}
function texture(key: string, draw: (c: Pen) => void): THREE.CanvasTexture {
  const found = cache.get(key);
  if (found) return found;
  const canvas = document.createElement('canvas');
  canvas.dataset.key = key;
  canvas.width = 160;
  canvas.height = 220;
  const c = canvas.getContext('2d')!;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = '#172127';
  c.lineWidth = 4;
  // Grounded silhouettes and a contact shadow, rather than a glowing spirit body.
  c.save();
  c.strokeStyle = 'transparent';
  ellipse(c, 80, 205, 43, 8, '#00000040');
  c.restore();
  draw(c);
  const result = new THREE.CanvasTexture(canvas);
  result.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, result);
  return result;
}

export function enemyTexture(type: string): THREE.CanvasTexture {
  return texture(`enemy-${type}`, (c) => {
    switch (type) {
      case 'slime':
        c.fillStyle = '#71914e';
        c.beginPath();
        c.moveTo(28, 190);
        c.bezierCurveTo(12, 139, 47, 111, 76, 118);
        c.bezierCurveTo(102, 93, 139, 132, 135, 188);
        c.quadraticCurveTo(86, 215, 28, 190);
        c.fill();
        c.stroke();
        c.strokeStyle = 'transparent';
        ellipse(c, 57, 139, 14, 8, '#b4cc81');
        c.fillStyle = '#283329';
        c.fillRect(57, 162, 9, 10);
        c.fillRect(97, 160, 9, 10);
        c.fillRect(73, 181, 22, 5);
        break;
      case 'bat':
        polygon(
          c,
          [
            [73, 121],
            [30, 81],
            [9, 90],
            [14, 140],
            [35, 124],
            [48, 151],
            [66, 140],
          ],
          '#725779',
        );
        polygon(
          c,
          [
            [87, 121],
            [130, 81],
            [151, 90],
            [146, 140],
            [125, 124],
            [112, 151],
            [94, 140],
          ],
          '#725779',
        );
        ellipse(c, 80, 137, 22, 32, '#403444');
        polygon(
          c,
          [
            [60, 124],
            [61, 92],
            [79, 111],
            [98, 91],
            [100, 125],
          ],
          '#403444',
        );
        c.fillStyle = '#f2c78f';
        c.fillRect(67, 124, 7, 6);
        c.fillRect(87, 124, 7, 6);
        polygon(
          c,
          [
            [71, 140],
            [76, 151],
            [80, 140],
          ],
          '#eee5ce',
        );
        polygon(
          c,
          [
            [83, 140],
            [88, 151],
            [92, 140],
          ],
          '#eee5ce',
        );
        break;
      case 'skeleton':
        c.strokeStyle = '#d6cbb1';
        c.lineWidth = 9;
        for (const [x, z] of [
          [59, 193],
          [99, 193],
        ]) {
          c.beginPath();
          c.moveTo(80, 113);
          c.lineTo(x, 149);
          c.lineTo(x, z);
          c.stroke();
        }
        c.beginPath();
        c.moveTo(80, 102);
        c.lineTo(80, 151);
        c.moveTo(49, 117);
        c.lineTo(111, 117);
        c.moveTo(49, 117);
        c.lineTo(34, 159);
        c.moveTo(111, 117);
        c.lineTo(126, 159);
        c.stroke();
        c.lineWidth = 5;
        for (const y of [117, 129, 141]) {
          c.beginPath();
          c.moveTo(63, y);
          c.lineTo(97, y);
          c.stroke();
        }
        c.strokeStyle = '#172127';
        c.lineWidth = 4;
        ellipse(c, 80, 76, 27, 30, '#ded4ba');
        c.fillStyle = '#302e2d';
        c.fillRect(61, 68, 14, 14);
        c.fillRect(86, 68, 14, 14);
        polygon(
          c,
          [
            [80, 84],
            [74, 94],
            [86, 94],
          ],
          '#302e2d',
        );
        c.fillStyle = '#ded4ba';
        c.fillRect(66, 94, 28, 13);
        c.fillStyle = '#403b34';
        for (const x of [71, 80, 89]) c.fillRect(x, 97, 3, 10);
        polygon(
          c,
          [
            [129, 151],
            [137, 87],
            [143, 80],
            [148, 89],
            [141, 155],
          ],
          '#9ca9a8',
        );
        break;
      case 'wisp':
        polygon(
          c,
          [
            [78, 193],
            [36, 157],
            [48, 124],
            [37, 104],
            [69, 113],
            [83, 59],
            [102, 112],
            [127, 93],
            [117, 137],
            [135, 153],
          ],
          '#d78147',
        );
        polygon(
          c,
          [
            [79, 176],
            [60, 148],
            [80, 108],
            [101, 149],
          ],
          '#f5cc78',
        );
        c.fillStyle = '#49332b';
        c.fillRect(67, 139, 8, 8);
        c.fillRect(88, 139, 8, 8);
        break;
      case 'warden':
        polygon(
          c,
          [
            [37, 96],
            [17, 115],
            [30, 191],
            [130, 191],
            [143, 115],
            [123, 96],
          ],
          '#62404a',
        );
        polygon(
          c,
          [
            [45, 98],
            [115, 98],
            [122, 165],
            [39, 165],
          ],
          '#666c72',
        );
        polygon(
          c,
          [
            [44, 98],
            [23, 83],
            [25, 123],
            [51, 119],
          ],
          '#9b8263',
        );
        polygon(
          c,
          [
            [116, 98],
            [139, 83],
            [137, 123],
            [109, 119],
          ],
          '#9b8263',
        );
        polygon(
          c,
          [
            [53, 78],
            [53, 42],
            [66, 35],
            [81, 25],
            [96, 35],
            [109, 42],
            [109, 78],
            [96, 98],
            [66, 98],
          ],
          '#9b8263',
        );
        c.fillStyle = '#26272e';
        c.fillRect(59, 61, 43, 15);
        c.fillStyle = '#f19174';
        c.fillRect(63, 65, 13, 5);
        c.fillRect(85, 65, 13, 5);
        c.fillStyle = '#303439';
        c.fillRect(44, 176, 28, 28);
        c.fillRect(89, 176, 28, 28);
        c.strokeStyle = '#e5b865';
        c.lineWidth = 7;
        c.beginPath();
        c.arc(80, 130, 10, 0, Math.PI * 2);
        c.moveTo(80, 140);
        c.lineTo(80, 158);
        c.lineTo(89, 158);
        c.stroke();
        break;
      default: // Veiled Acolyte: angular hood, masked face and a hostile red staff.
        polygon(
          c,
          [
            [54, 91],
            [106, 91],
            [127, 196],
            [33, 196],
          ],
          '#76434f',
        );
        polygon(
          c,
          [
            [48, 89],
            [53, 53],
            [80, 30],
            [107, 53],
            [112, 89],
            [97, 108],
            [63, 108],
          ],
          '#4e303d',
        );
        polygon(
          c,
          [
            [63, 65],
            [97, 65],
            [94, 91],
            [66, 91],
          ],
          '#241f2a',
        );
        c.fillStyle = '#f3aa85';
        c.fillRect(66, 73, 8, 5);
        c.fillRect(86, 73, 8, 5);
        c.strokeStyle = '#a77a6f';
        c.lineWidth = 7;
        c.beginPath();
        c.moveTo(130, 94);
        c.lineTo(130, 202);
        c.stroke();
        c.strokeStyle = '#172127';
        c.lineWidth = 4;
        polygon(
          c,
          [
            [130, 66],
            [144, 86],
            [130, 107],
            [116, 86],
          ],
          '#d96561',
        );
        break;
    }
  });
}
/** Enemies are drawn smooth, then pixelated to sit with the pixel-art world and characters. */
export function makeEnemySprite(type: string): Billboard {
  // Stand on the contact shadow near the bottom of the drawing.
  return billboard(
    pixelate(enemyTexture(type).image as HTMLCanvasElement, 44),
    1.25,
    1.72,
    12 / 220,
  );
}
