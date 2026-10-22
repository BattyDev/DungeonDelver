// The corner map: floors are revealed as you see them; the hall is shown whole, with its landmarks.
import { distance, getFloor, isSolved, lineOfSight } from '@delver/rules';
import type { GameState, Point } from '@delver/rules';
import { HALL, HALL_MAP } from '../scene/hall';

const KEY = 'dungeon-delver.fog';
const SIGHT = 6.5;
const TILE = 4;
type Live = Exclude<GameState, { phase: 'classSelect' }>;

export class Minimap {
  private fog = new Map<number, Uint8Array>();
  private saveTimer = 0;
  constructor() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>;
      for (const [id, bits] of Object.entries(raw))
        this.fog.set(
          Number(id),
          Uint8Array.from(bits, (c) => (c === '1' ? 1 : 0)),
        );
    } catch {
      // A lost fog map only hides what was already explored.
    }
  }
  /** A new expedition starts unexplored. */
  reset() {
    this.fog.clear();
    this.persist();
  }
  private persist() {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      const out: Record<string, string> = {};
      for (const [id, bits] of this.fog) out[id] = bits.join('');
      try {
        localStorage.setItem(KEY, JSON.stringify(out));
      } catch {
        // Storage full: the map simply resets on reload.
      }
    }, 600);
  }
  /** Marks everything in line of sight around the player. */
  reveal(floorId: number, at: Point) {
    const def = getFloor(floorId),
      w = def.map[0].length,
      h = def.map.length;
    let bits = this.fog.get(floorId);
    if (!bits) {
      bits = new Uint8Array(w * h);
      this.fog.set(floorId, bits);
    }
    let changed = false;
    const r = Math.ceil(SIGHT);
    for (let z = Math.round(at.z) - r; z <= Math.round(at.z) + r; z++)
      for (let x = Math.round(at.x) - r; x <= Math.round(at.x) + r; x++) {
        if (x < 0 || z < 0 || x >= w || z >= h || bits[z * w + x]) continue;
        const p = { x, z };
        if (distance(p, at) > SIGHT) continue;
        // Walls show when the floor in front of them is seen.
        const open = def.map[z][x] !== '#';
        const target = open
          ? p
          : [
              { x: x + 1, z },
              { x: x - 1, z },
              { x, z: z + 1 },
              { x, z: z - 1 },
            ].find((q) => def.map[q.z]?.[q.x] === '.' && lineOfSight(def, at, q));
        if (target && lineOfSight(def, at, target)) {
          bits[z * w + x] = 1;
          changed = true;
        }
      }
    if (changed) this.persist();
  }
  draw(canvas: HTMLCanvasElement, s: Live, hub: Point) {
    const dungeon = s.phase === 'floor' || s.phase === 'combat';
    const map = dungeon ? getFloor(s.floor.id).map : HALL_MAP;
    const w = map[0].length,
      h = map.length;
    if (canvas.width !== w * TILE) canvas.width = w * TILE;
    if (canvas.height !== h * TILE) canvas.height = h * TILE;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bits = dungeon ? this.fog.get(s.floor.id) : undefined;
    const seen = (x: number, z: number) => !dungeon || !!bits?.[z * w + x];
    const cell = (x: number, z: number, color: string, inset = 0) => {
      ctx.fillStyle = color;
      ctx.fillRect(x * TILE + inset, z * TILE + inset, TILE - inset * 2, TILE - inset * 2);
    };
    const dot = (p: Point, color: string, r = 2.4) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x * TILE + TILE / 2, p.z * TILE + TILE / 2, r, 0, Math.PI * 2);
      ctx.fill();
    };
    map.forEach((row, z) =>
      [...row].forEach((t, x) => {
        if (!seen(x, z)) return;
        if (t === '#') {
          const edge = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].some(([dx, dz]) => map[z + dz]?.[x + dx] === '.');
          if (edge) cell(x, z, '#5f726b');
        } else cell(x, z, '#2b4540');
      }),
    );
    if (dungeon) {
      const def = getFloor(s.floor.id),
        p = s.floor.puzzle;
      const show = (q: Point) => seen(Math.round(q.x), Math.round(q.z));
      if (show(def.stairs))
        cell(def.stairs.x, def.stairs.z, isSolved(p) ? '#88d6ba' : '#aa8255', 0.5);
      if (show(def.clue)) dot(def.clue, '#a7e1f5');
      if (p.type === 'plates') {
        p.plates.filter(show).forEach((q) => cell(q.x, q.z, '#e1b565', 0.5));
        p.blocks.filter(show).forEach((q) => cell(q.x, q.z, '#c4c1a8', 1));
      } else
        def.puzzlePoints.filter(show).forEach((q, i) => {
          const done =
            p.type === 'levers'
              ? p.sequence.slice(0, p.progress).includes(i)
              : p.type === 'braziers'
                ? p.lit[i]
                : p.collected;
          dot(q, done ? '#9ee7b3' : p.type === 'braziers' ? '#f0a04a' : '#e5ba72', 2);
        });
      // Patrols only appear while you can actually see them.
      for (const patrol of s.floor.patrols)
        if (
          !patrol.defeated &&
          distance(patrol.position, s.floor.position) <= SIGHT &&
          lineOfSight(def, s.floor.position, patrol.position)
        )
          dot(patrol.position, '#ef8877', 2.2);
      dot(s.floor.position, '#e5ba72', 2.8);
    } else {
      dot(HALL.stairs, '#dfb567', 3);
      dot(HALL.portal, '#91e9cb', 3);
      dot({ x: HALL.wardrobe.x, z: HALL.wardrobe.z + 1 }, '#c48ae0', 3);
      dot({ x: HALL.armory.x, z: HALL.armory.z + 0.5 }, '#86b2e0', 3);
      dot(hub, '#e5ba72', 2.8);
    }
  }
}
