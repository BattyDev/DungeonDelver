import * as THREE from 'three';
import { CLASSES, GHOSTS, getFloor, isSolved, ENEMIES } from '@delver/rules';
import type { GameState, Ghost, Point } from '@delver/rules';
import { makeEnemySprite } from './sprites';
import { billboard } from './billboard';
import type { Billboard } from './billboard';
import { DollSprite } from './doll-sprite';
import { characterLook, pumpDolls } from '../paperdoll/looks';
import { ghostLook, lookById, wandererLook, WANDERER_COUNT } from './cast';
import {
  ANIMATED_PROPS,
  PIXEL,
  THEMES,
  leverTexture,
  capTexture,
  floorTexture,
  floorTheme,
  prop,
  shelfTexture,
  wallTexture,
} from './pixels';
import type { PropId, ThemeId } from './pixels';
import { HALL, HALL_MAP, HALL_PROPS, HALL_ROOMS, hallCarpet, randomPointIn } from './hall';
import type { HallRoom } from './hall';
import { canStand, clearLine, open } from './grid';

export type WorldClick =
  | { kind: 'ground'; point: Point }
  | { kind: 'ghost'; id: string }
  | { kind: 'interact' };

/** Wall height in tiles; walls are stacked one-tile blocks so brick pixels are never stretched. */
const WALL_H = 2;
const CUT_H = 0.18;
const FOLLOW_GAP = 0.85;
const hash = (x: number, z: number, salt = 0) => {
  let h = (x * 374761393 + z * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

interface Walker {
  doll: DollSprite;
  pos: Point;
  target: Point;
  wait: number;
  speed: number;
  room: HallRoom;
  ghost?: Ghost;
  label?: HTMLButtonElement;
  marker?: THREE.Mesh;
}
interface WallSet {
  meshes: THREE.InstancedMesh[];
  tiles: { x: number; z: number }[];
  heights: Float32Array;
  decor: Map<number, THREE.Object3D[]>;
}

export class World {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(46, 1, 0.1, 160);
  private level = new THREE.Group();
  private dynamic = new THREE.Group();
  private actors = new THREE.Group();
  private map: string[] = HALL_MAP;
  private theme: ThemeId = 'hall';
  private walls?: WallSet;
  private player?: DollSprite;
  private playerKey = '';
  private followers = new Map<string, DollSprite>();
  private trail: Point[] = [];
  private walkers: Walker[] = [];
  private enemies = new Map<string, Billboard>();
  private rings = new Map<string, THREE.Mesh>();
  private enemyLabels = new Map<string, HTMLDivElement>();
  private threatMarkers = new Map<string, THREE.Mesh>();
  private flickers: { sprite: Billboard; id: PropId }[] = [];
  /** Name tags for landmarks and puzzle pieces, shown when the player is within `range`. */
  private signs: { el: HTMLDivElement; at: THREE.Vector3; range: number }[] = [];
  /** Lever and brazier sprites by puzzle point, for feedback when one is used. */
  private puzzleSprites: Billboard[] = [];
  /** Each lever's resting and thrown art, so feedback can flash the right symbol. */
  private leverArt: { off: THREE.Texture; on: THREE.Texture }[] = [];
  private pulses: { mesh: THREE.Mesh; t: number }[] = [];
  private bumps: { sprite: Billboard; base: number; t: number }[] = [];
  private playerMarker?: THREE.Mesh;
  private torch = new THREE.PointLight('#ffcf8a', 14, 9, 1.6);
  private raycaster = new THREE.Raycaster();
  private key = '';
  private target: Point = { ...HALL.spawn };
  private cameraFocus = new THREE.Vector3();
  private cameraDistance = 8;
  private cameraReady = false;
  private lastAnimation?: number;
  private puzzleKey = '';
  private partyKey = '';
  private resizeObserver: ResizeObserver;
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private portal?: THREE.Mesh;
  private ambient = new THREE.AmbientLight('#ffffff', 1.7);
  constructor(
    private host: HTMLElement,
    private onClick: (click: WorldClick) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Dungeon exploration. Move with WASD, arrows, or tap the floor.',
    );
    this.scene.add(this.level, this.dynamic, this.actors, this.ambient, this.torch);
    const sun = new THREE.DirectionalLight('#fff0cf', 1.6);
    sun.position.set(-4, 16, 10);
    this.scene.add(sun);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.renderer.domElement.addEventListener('pointerup', (e) => this.click(e));
    this.resize();
  }
  private resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  private affiliationMarker(color: string, sides: number) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.31, 0.37, sides),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    this.level.add(mesh);
    return mesh;
  }
  private marker(x: number, z: number, color: string, r = 0.34) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, 0.06, 24),
      new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35 }),
    );
    mesh.position.set(x, 0.03, z);
    return mesh;
  }
  /** A billboard prop standing on the ground (or hung on a wall at `y`). */
  private propSprite(id: PropId, x: number, z: number, y = 0) {
    const p = prop(id, this.theme);
    const sprite = billboard(p.texture, p.w, p.h);
    sprite.position.set(x, y, z);
    if (ANIMATED_PROPS.includes(id)) this.flickers.push({ sprite, id });
    return sprite;
  }
  private clear() {
    for (const group of [this.level, this.dynamic, this.actors]) {
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (mesh.material)
          for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
            mat.dispose();
      });
      group.clear();
    }
    this.player?.dispose();
    this.followers.forEach((f) => f.dispose());
    this.walkers.forEach((w) => {
      w.doll.dispose();
      w.label?.remove();
    });
    this.enemyLabels.forEach((l) => l.remove());
    this.enemyLabels.clear();
    this.signs.forEach((sign) => sign.el.remove());
    this.signs = [];
    this.walkers = [];
    this.followers.clear();
    this.threatMarkers.clear();
    this.enemies.clear();
    this.rings.clear();
    this.flickers = [];
    this.player = undefined;
    this.playerKey = '';
    this.partyKey = '';
    this.playerMarker = undefined;
    this.walls = undefined;
    this.portal = undefined;
    this.cameraReady = false;
    this.puzzleKey = '';
  }
  setState(s: GameState, hubPosition: Point) {
    const key =
      s.phase === 'floor' || s.phase === 'combat'
        ? `floor-${s.floor.id}`
        : s.phase === 'safeRoom'
          ? 'safe'
          : 'hub';
    if (key !== this.key) {
      this.key = key;
      this.build(s);
    }
    if (s.phase === 'classSelect') return;
    this.target = s.phase === 'floor' || s.phase === 'combat' ? s.floor.position : hubPosition;
    const look = characterLook(s.progress.player, true);
    const lookKey = JSON.stringify(look);
    if (!this.player) {
      this.player = new DollSprite(look);
      // Drawn after the companions, which don't write depth, so the leader is never hidden behind
      // its own party; walls and strangers still cover it as usual.
      this.player.sprite.renderOrder = 1;
      this.actors.add(this.player.sprite);
      this.player.sprite.position.set(this.target.x, 0, this.target.z);
      this.playerMarker = this.affiliationMarker('#e5ba72', 32);
      this.trail = this.seedTrail(this.target);
    } else if (lookKey !== this.playerKey) this.player.setLook(look);
    this.playerKey = lookKey;
    this.syncParty(s);
    if (s.phase === 'hub')
      this.walkers.forEach((w) => {
        if (!w.ghost || !w.label) return;
        const hired = s.progress.hires.some((h) => h.id === w.ghost!.id);
        w.doll.sprite.visible = !hired;
        w.label.hidden = hired;
        if (w.marker) w.marker.visible = !hired;
        const detail = w.label.querySelector('small');
        if (detail)
          detail.textContent = `${CLASSES[w.ghost.character.classId].name} · ${hired ? 'In party' : 'Recruit'}`;
      });
    if (s.phase === 'floor' || s.phase === 'combat') this.syncFloor(s);
  }
  /** Companions trail the player in the hub and below. */
  private syncParty(s: Exclude<GameState, { phase: 'classSelect' }>) {
    const members =
      s.phase === 'floor' || s.phase === 'combat'
        ? s.run.party
            .filter((f) => !f.player)
            .map((f) => ({ id: f.id, classId: f.classId, alive: f.hp > 0 }))
        : s.phase === 'hub'
          ? s.progress.hires.map((g) => ({ id: g.id, classId: g.character.classId, alive: true }))
          : [];
    const key = members.map((m) => m.id).join(',');
    if (key !== this.partyKey) {
      this.partyKey = key;
      for (const [id, doll] of this.followers)
        if (!members.some((m) => m.id === id)) {
          this.actors.remove(doll.sprite);
          doll.dispose();
          this.followers.delete(id);
        }
      for (const m of members)
        if (!this.followers.has(m.id)) {
          const doll = new DollSprite(lookById(m.id, m.classId));
          doll.sprite.material.depthWrite = false;
          const at = this.trailPoint((this.followers.size + 1) * FOLLOW_GAP);
          doll.sprite.position.set(at.x, 0, at.z);
          this.actors.add(doll.sprite);
          this.followers.set(m.id, doll);
        }
    }
    for (const m of members) {
      const doll = this.followers.get(m.id);
      if (doll) doll.sprite.visible = m.alive;
    }
  }
  private syncFloor(s: Extract<GameState, { phase: 'floor' | 'combat' }>) {
    const def = getFloor(s.floor.id);
    for (const p of s.floor.patrols) {
      const actor = this.enemies.get(p.id);
      if (!actor) continue;
      actor.visible = !p.defeated;
      actor.position.set(p.position.x, 0, p.position.z);
      const label = this.enemyLabels.get(p.id);
      if (label) label.hidden = p.defeated;
      const marker = this.threatMarkers.get(p.id);
      if (marker) {
        marker.visible = !p.defeated;
        marker.position.set(p.position.x, 0.045, p.position.z);
      }
      const ring = this.rings.get(p.id);
      if (ring) {
        ring.visible = !p.defeated && p.pauseTicks === 0;
        ring.position.set(p.position.x, 0.035, p.position.z);
      }
    }
    const puzzleKey = JSON.stringify(s.floor.puzzle);
    if (puzzleKey === this.puzzleKey) return;
    this.puzzleKey = puzzleKey;
    this.dynamic.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.flickers = this.flickers.filter((f) => f.sprite.parent !== this.dynamic);
    this.dynamic.clear();
    const p = s.floor.puzzle;
    this.signs.forEach((sign) => sign.el.remove());
    this.signs = [];
    if (p.type === 'levers' || p.type === 'braziers' || p.type === 'key')
      def.puzzlePoints.forEach((pt, i) => {
        const done =
          p.type === 'levers'
            ? p.sequence.slice(0, p.progress).includes(i)
            : p.type === 'braziers'
              ? p.lit[i]
              : p.collected;
        const state =
          p.type === 'levers'
            ? done
              ? 'pulled'
              : 'lever'
            : p.type === 'braziers'
              ? done
                ? 'lit'
                : 'unlit'
              : p.collected
                ? 'taken'
                : p.guardDefeated
                  ? 'unguarded'
                  : 'guarded';
        this.sign(`${def.puzzleLabels[i]} · ${state}`, pt, 1.25, 4, done);
      });
    if (p.type === 'plates') {
      for (const plate of p.plates) {
        const covered = p.blocks.some((b) => b.x === plate.x && b.z === plate.z);
        this.dynamic.add(this.marker(plate.x, plate.z, covered ? '#9ee7b3' : '#e1b565', 0.44));
      }
      const stone = new THREE.MeshLambertMaterial({ map: prop('stone', this.theme).texture });
      for (const b of p.blocks) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.86, 0.86), stone);
        mesh.position.set(b.x, 0.43, b.z);
        this.dynamic.add(mesh);
      }
    }
    this.puzzleSprites = [];
    if (p.type === 'levers')
      def.puzzlePoints.forEach((pt, i) => {
        const art = {
          off: leverTexture(def.puzzleLabels[i], false, this.theme),
          on: leverTexture(def.puzzleLabels[i], true, this.theme),
        };
        this.leverArt[i] = art;
        const held = p.sequence.slice(0, p.progress).includes(i);
        const sprite = billboard(held ? art.on : art.off, 28 * PIXEL, 38 * PIXEL);
        sprite.position.set(pt.x, 0, pt.z);
        this.puzzleSprites[i] = sprite;
        this.dynamic.add(sprite);
      });
    if (p.type === 'braziers')
      def.puzzlePoints.forEach((pt, i) => {
        const sprite = this.propSprite(p.lit[i] ? 'brazierLit' : 'brazier', pt.x, pt.z);
        this.puzzleSprites[i] = sprite;
        this.dynamic.add(sprite);
      });
    if (p.type === 'key') {
      const pt = def.puzzlePoints[0];
      this.dynamic.add(this.propSprite(p.collected ? 'pedestalEmpty' : 'pedestal', pt.x, pt.z));
      if (!p.collected)
        this.dynamic.add(this.marker(pt.x, pt.z, p.guardDefeated ? '#f5d37d' : '#a55f63', 0.4));
    }
    const solved = isSolved(p);
    if (solved) {
      const stairs = new THREE.Mesh(
        new THREE.PlaneGeometry(0.98, 0.98),
        new THREE.MeshLambertMaterial({ map: prop('stairsDown', this.theme).texture }),
      );
      stairs.rotation.x = -Math.PI / 2;
      stairs.position.set(def.stairs.x, 0.01, def.stairs.z);
      this.dynamic.add(stairs, this.marker(def.stairs.x, def.stairs.z, '#a6dec2', 0.6));
    } else {
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(0.98, 1.6, 0.98),
        new THREE.MeshLambertMaterial({ map: wallTexture(this.theme, 0), color: '#c49a62' }),
      );
      door.position.set(def.stairs.x, 0.8, def.stairs.z);
      this.dynamic.add(door);
    }
  }
  private build(s: GameState) {
    this.clear();
    const dungeon = s.phase === 'floor' || s.phase === 'combat';
    const def = dungeon ? getFloor(s.floor.id) : undefined;
    this.map = def?.map ?? HALL_MAP;
    this.theme = def ? floorTheme(def.id) : 'hall';
    const theme = THEMES[this.theme];
    this.renderer.setClearColor(theme.clear);
    this.scene.fog = new THREE.Fog(theme.clear, 16, 34);
    this.ambient.color.set(theme.ambient);
    this.ambient.intensity = dungeon ? 1.25 : 1.8;
    this.torch.intensity = dungeon ? 16 : 6;
    this.buildTiles(dungeon);
    this.buildWalls(dungeon);
    if (def && dungeon) {
      this.level.add(this.propSprite('tablet', def.clue.x, def.clue.z - 0.2));
      this.level.add(this.marker(def.clue.x, def.clue.z, '#a7c5d0', 0.3));
      this.scatterProps([
        def.spawn,
        def.stairs,
        def.clue,
        ...def.puzzlePoints,
        ...(def.puzzle.type === 'plates' ? def.puzzle.plates : []),
      ]);
      def.patrols.forEach((p) => {
        const enemyDef = ENEMIES[p.enemyTypes[0]];
        const sprite = makeEnemySprite(p.enemyTypes[0]);
        if (p.boss) sprite.scale.multiplyScalar(1.5);
        this.actors.add(sprite);
        this.enemies.set(p.id, sprite);
        sprite.userData.labelOffset =
          p.enemyTypes[0] === 'slime' ? 0.7 : p.enemyTypes[0] === 'bat' ? 1.5 : 1.75;
        const marker = this.affiliationMarker('#ef8877', 3);
        this.threatMarkers.set(p.id, marker);
        const label = document.createElement('div');
        label.className = 'world-label enemy-label';
        label.dataset.affiliation = 'hostile';
        label.dataset.patrolId = p.id;
        label.innerHTML = `<span>! ${enemyDef.name}</span><small>${p.boss ? 'BOSS' : 'HOSTILE'} · ${p.enemyTypes.length} ${p.enemyTypes.length === 1 ? 'enemy' : 'enemies'}</small>`;
        this.host.append(label);
        this.enemyLabels.set(p.id, label);
        const radius =
          p.radius * (s.run.party.some((f) => f.effects.includes('stealth')) ? 0.6 : 1);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(radius - 0.025, radius, 64),
          new THREE.MeshBasicMaterial({
            color: p.boss ? '#dca579' : '#ce8590',
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        this.level.add(ring);
        this.rings.set(p.id, ring);
      });
    } else {
      for (const [id, x, z] of HALL_PROPS)
        this.level.add(this.propSprite(id, x, z, prop(id, this.theme).wall ? 0.9 : 0));
      this.level.add(this.marker(HALL.stairs.x, HALL.stairs.z, '#dfb567', 0.9));
      const stairs = new THREE.Mesh(
        new THREE.PlaneGeometry(1.9, 1.9),
        new THREE.MeshLambertMaterial({ map: prop('stairsDown', this.theme).texture }),
      );
      stairs.rotation.x = -Math.PI / 2;
      stairs.position.set(HALL.stairs.x, 0.07, HALL.stairs.z);
      this.level.add(stairs);
      this.level.add(this.marker(HALL.portal.x, HALL.portal.z, '#a7d9c7', 0.9));
      this.portal = new THREE.Mesh(
        new THREE.TorusGeometry(0.85, 0.12, 8, 24),
        new THREE.MeshLambertMaterial({
          color: '#91e9cb',
          emissive: '#60d8ba',
          emissiveIntensity: 0.9,
        }),
      );
      this.portal.position.set(HALL.portal.x, 1.1, HALL.portal.z);
      this.level.add(this.portal);
      this.level.add(this.marker(HALL.wardrobe.x, HALL.wardrobe.z + 1, '#c48ae0', 0.5));
      this.level.add(this.marker(HALL.armory.x, HALL.armory.z + 0.5, '#86b2e0', 0.5));
      if (s.phase !== 'safeRoom') this.buildWalkers();
      this.sign('Descent · stairs down', HALL.stairs, 1.4, 11);
      this.sign('Sanctuary portal', HALL.portal, 2.2, 11);
      this.sign(
        'Changing Room · wardrobe',
        { x: HALL.wardrobe.x, z: HALL.wardrobe.z + 0.2 },
        1.9,
        11,
      );
      this.sign('Armory · loadout', HALL.armory, 1.4, 11);
    }
  }
  private buildTiles(dungeon: boolean) {
    const groups = new Map<string, { texture: THREE.Texture; tiles: [number, number][] }>();
    this.map.forEach((row, z) =>
      [...row].forEach((t, x) => {
        if (t === '#') return;
        const variant = Math.floor(hash(x, z) * 4);
        let kind: 'stone' | 'wood' | 'carpet' = 'stone';
        if (!dungeon) {
          const room = HALL_ROOMS.find(
            ({ rect: [rx, rz, w, d] }) => x >= rx && x < rx + w && z >= rz && z < rz + d,
          );
          kind = hallCarpet(x, z) ? 'carpet' : (room?.floor ?? 'stone');
        }
        const key = `${kind}-${variant}`;
        if (!groups.has(key))
          groups.set(key, { texture: floorTexture(this.theme, variant, kind), tiles: [] });
        groups.get(key)!.tiles.push([x, z]);
      }),
    );
    const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const m = new THREE.Matrix4();
    for (const { texture, tiles } of groups.values()) {
      const mesh = new THREE.InstancedMesh(
        geometry.clone(),
        new THREE.MeshLambertMaterial({ map: texture }),
        tiles.length,
      );
      tiles.forEach(([x, z], i) => mesh.setMatrixAt(i, m.makeTranslation(x, 0, z)));
      this.level.add(mesh);
    }
    geometry.dispose();
  }
  private buildWalls(dungeon: boolean) {
    const map = this.map,
      theme = THEMES[this.theme];
    const tiles: { x: number; z: number; shelf: boolean }[] = [];
    map.forEach((row, z) =>
      [...row].forEach((t, x) => {
        if (t !== '#') return;
        let near = false;
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) if (open(map, x + dx, z + dz)) near = true;
        if (!near) return;
        const shelf = theme.pillar === 'shelf' && open(map, x, z - 1) && open(map, x, z + 1);
        tiles.push({ x, z, shelf });
      }),
    );
    const cap = new THREE.MeshLambertMaterial({ map: capTexture(this.theme) });
    const material = (variant: number, shelf: boolean) => {
      const side = new THREE.MeshLambertMaterial({
        map: shelf ? shelfTexture() : wallTexture(this.theme, variant),
      });
      return [side, side, cap, cap, side, side];
    };
    // Group by texture, one instanced mesh per group and per stacked layer.
    const groups = new Map<string, number[]>();
    tiles.forEach((t, i) => {
      const k = t.shelf ? 'shelf' : String(theme.moss ? Math.floor(hash(t.x, t.z, 3) * 3) : 0);
      groups.set(k, [...(groups.get(k) ?? []), i]);
    });
    const meshes: THREE.InstancedMesh[] = [];
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    for (const [k, list] of groups) {
      const mats = material(k === 'shelf' ? 0 : Number(k), k === 'shelf');
      for (let layer = 0; layer < WALL_H; layer++) {
        const mesh = new THREE.InstancedMesh(geometry, mats, list.length);
        mesh.userData = { list, layer };
        meshes.push(mesh);
        this.level.add(mesh);
      }
    }
    this.walls = {
      meshes,
      tiles,
      heights: new Float32Array(tiles.length).fill(WALL_H),
      decor: new Map(),
    };
    this.layoutWalls(true);
    // Torches and banners on the camera-facing side of walls, every few tiles.
    tiles.forEach((t, i) => {
      if (t.shelf || !open(map, t.x, t.z + 1) || open(map, t.x, t.z - 1)) return;
      const r = hash(t.x, t.z, 9);
      const id: PropId | undefined =
        r < (dungeon ? 0.16 : 0.2)
          ? 'torch'
          : r < 0.24 && theme.props.includes('banner')
            ? 'banner'
            : undefined;
      if (!id) return;
      const sprite = this.propSprite(id, t.x, t.z + 0.52, id === 'torch' ? 0.85 : 0.55);
      this.level.add(sprite);
      this.walls!.decor.set(i, [sprite]);
    });
  }
  /** Lowers walls that stand between the camera and the player, so rooms stay visible. */
  private layoutWalls(force = false, dt = 0) {
    const walls = this.walls;
    if (!walls) return;
    const f = this.cameraFocus,
      m = new THREE.Matrix4(),
      changed = new Set<number>();
    walls.tiles.forEach((t, i) => {
      const ahead = t.z - f.z;
      const cut =
        this.cameraReady && ahead > 0.45 && ahead < 10 && Math.abs(t.x - f.x) < 10 - ahead * 0.4;
      const goal = cut ? CUT_H : WALL_H;
      const h = walls.heights[i];
      if (!force && Math.abs(goal - h) < 0.002) return;
      walls.heights[i] = force ? goal : h + (goal - h) * Math.min(1, dt * 9);
      changed.add(i);
      walls.decor.get(i)?.forEach((d) => (d.visible = walls.heights[i] > 1.2));
    });
    if (!changed.size) return;
    for (const mesh of walls.meshes) {
      const { list, layer } = mesh.userData as { list: number[]; layer: number };
      list.forEach((i, j) => {
        if (!force && !changed.has(i)) return;
        const t = walls.tiles[i],
          h = Math.max(0, Math.min(1, walls.heights[i] - layer));
        if (h <= 0.001) m.makeScale(0, 0, 0);
        else m.makeScale(1, h, 1).setPosition(t.x, layer + h / 2, t.z);
        mesh.setMatrixAt(j, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  /** Floor clutter along the walls, kept away from anything the player needs to reach. */
  private scatterProps(keep: Point[]) {
    const theme = THEMES[this.theme],
      choices = theme.props.filter((id) => !prop(id, this.theme).wall);
    this.map.forEach((row, z) =>
      [...row].forEach((t, x) => {
        if (t === '#' || keep.some((p) => Math.abs(p.x - x) + Math.abs(p.z - z) <= 1)) return;
        const walls = [
          [0, -1],
          [-1, 0],
          [1, 0],
        ].filter(([dx, dz]) => !open(this.map, x + dx, z + dz));
        // Only against one wall: corridors and doorways stay clear.
        if (walls.length !== 1 || hash(x, z, 5) > 0.09) return;
        const [dx, dz] = walls[0];
        const id = choices[Math.floor(hash(x, z, 7) * choices.length)];
        this.level.add(this.propSprite(id, x + dx * 0.3, z + dz * 0.3));
      }),
    );
  }
  private buildWalkers() {
    const rooms = HALL_ROOMS;
    const recruitRooms = HALL_ROOMS.filter(
      (r) => r.name === 'The Tavern' || r.name === 'Great Hall',
    );
    GHOSTS.filter((g) => !g.community).forEach((g, i) => {
      const room = recruitRooms[i % 2];
      const w = this.walker(ghostLook(g), room, 0.9);
      w.ghost = g;
      const button = document.createElement('button');
      button.className = 'world-label friendly-label';
      button.dataset.affiliation = 'friendly';
      button.setAttribute(
        'aria-label',
        `Inspect ${g.character.name}, friendly ${CLASSES[g.character.classId].name}`,
      );
      button.innerHTML = `<span>${g.character.name}</span><small>${CLASSES[g.character.classId].name} · Recruit</small>`;
      button.addEventListener('click', () => this.onClick({ kind: 'ghost', id: g.id }));
      this.host.append(button);
      w.label = button;
      w.marker = this.affiliationMarker('#86cfc2', 4);
      w.doll.sprite.userData.ghostId = g.id;
    });
    for (let i = 0; i < WANDERER_COUNT; i++)
      this.walker(wandererLook(i), rooms[i % rooms.length], 1.1 + (i % 4) * 0.15);
  }
  private walker(look: ReturnType<typeof wandererLook>, room: HallRoom, speed: number): Walker {
    const pos = randomPointIn(room);
    const doll = new DollSprite(look);
    doll.sprite.position.set(pos.x, 0, pos.z);
    this.actors.add(doll.sprite);
    const w: Walker = { doll, pos, target: pos, wait: Math.random() * 3, speed, room };
    this.walkers.push(w);
    return w;
  }
  private stepWalkers(dt: number) {
    for (const w of this.walkers) {
      if (!w.doll.sprite.visible) continue;
      if (w.wait > 0) w.wait -= dt;
      else {
        const dx = w.target.x - w.pos.x,
          dz = w.target.z - w.pos.z,
          d = Math.hypot(dx, dz);
        if (d < 0.05) {
          w.wait = 1.5 + Math.random() * 4;
          for (let i = 0; i < 6; i++) {
            const next = randomPointIn(w.room);
            if (clearLine(this.map, w.pos, next)) {
              w.target = next;
              break;
            }
          }
        } else {
          const step = Math.min(d, w.speed * dt);
          w.pos = { x: w.pos.x + (dx / d) * step, z: w.pos.z + (dz / d) * step };
        }
      }
      w.doll.sprite.position.set(w.pos.x, 0, w.pos.z);
      w.marker?.position.set(w.pos.x, 0.04, w.pos.z);
      w.doll.update(dt);
    }
  }
  /** Before anyone has walked, companions line up into the most open direction. */
  private seedTrail(from: Point): Point[] {
    let best: [number, number] = [0, -1],
      bestLength = -1;
    for (const [dx, dz] of [
      [0, -1],
      [1, 0],
      [-1, 0],
      [0, 1],
    ] as const) {
      let length = 0;
      while (
        length < 4 &&
        canStand(this.map, { x: from.x + dx * (length + 0.25), z: from.z + dz * (length + 0.25) })
      )
        length += 0.25;
      if (length > bestLength) {
        bestLength = length;
        best = [dx, dz];
      }
    }
    return [{ ...from }, { x: from.x + best[0] * bestLength, z: from.z + best[1] * bestLength }];
  }
  /** A point `distance` back along the player's trail. */
  private trailPoint(distance: number): Point {
    let left = distance;
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1],
        b = this.trail[i],
        d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d >= left)
        return { x: a.x + ((b.x - a.x) * left) / d, z: a.z + ((b.z - a.z) * left) / d };
      left -= d;
    }
    return this.trail[this.trail.length - 1] ?? this.target;
  }
  animate(time: number) {
    const delta = Math.min(
      this.lastAnimation === undefined ? 1 / 60 : time - this.lastAnimation,
      0.05,
    );
    this.lastAnimation = time;
    pumpDolls();
    if (this.player) {
      const p = this.player.sprite.position;
      const follow = 1 - Math.exp(-24 * delta);
      p.x += (this.target.x - p.x) * follow;
      p.z += (this.target.z - p.z) * follow;
      p.y = 0;
      this.player.update(delta);
      this.playerMarker?.position.set(p.x, 0.04, p.z);
      this.torch.position.set(p.x, 2.2, p.z + 0.6);
      const head = this.trail[0];
      if (!head || Math.hypot(head.x - p.x, head.z - p.z) > 0.08) {
        this.trail.unshift({ x: p.x, z: p.z });
        if (this.trail.length > 120) this.trail.pop();
      }
      [...this.followers.values()].forEach((doll, i) => {
        const goal = this.trailPoint((i + 1) * FOLLOW_GAP);
        const q = doll.sprite.position,
          k = 1 - Math.exp(-10 * delta);
        q.x += (goal.x - q.x) * k;
        q.z += (goal.z - q.z) * k;
        doll.update(delta);
      });
    }
    this.stepWalkers(delta);
    // Frame the whole party: aim a little behind the leader and pull back as the line stretches.
    const lead = this.player?.sprite.position ?? new THREE.Vector3(this.target.x, 0, this.target.z);
    let spread = 0;
    const centre = lead.clone();
    for (const doll of this.followers.values())
      if (doll.sprite.visible) {
        spread = Math.max(spread, doll.sprite.position.distanceTo(lead));
        centre.add(doll.sprite.position);
      }
    const visible = 1 + [...this.followers.values()].filter((d) => d.sprite.visible).length;
    centre.divideScalar(visible);
    const focus = lead.clone().lerp(centre, 0.4);
    const distance = Math.min(13, 7.2 + spread * 0.85);
    if (!this.cameraReady) {
      this.cameraFocus.copy(focus);
      this.cameraDistance = distance;
      this.cameraReady = true;
      this.layoutWalls(true);
    } else {
      this.cameraFocus.lerp(focus, 1 - Math.exp(-6 * delta));
      this.cameraDistance += (distance - this.cameraDistance) * (1 - Math.exp(-2 * delta));
    }
    this.layoutWalls(false, delta);
    // Translate position and aim together: no abrupt rotation at room edges.
    const d = this.cameraDistance;
    this.camera.position.set(this.cameraFocus.x, 0.8 + d * 0.38, this.cameraFocus.z + d);
    this.camera.lookAt(this.cameraFocus.x, 0.75, this.cameraFocus.z - 0.6);
    const flicker = Math.floor(time * 6) % 2;
    for (const f of this.flickers) {
      const map = prop(f.id, this.theme, flicker).texture;
      if (f.sprite.material.map !== map) {
        f.sprite.material.map = map;
        f.sprite.material.needsUpdate = true;
      }
    }
    for (const w of this.walkers) {
      if (!w.label || w.label.hidden) continue;
      this.placeLabel(w.label, new THREE.Vector3(w.pos.x, 1.75, w.pos.z), false);
    }
    const leader = this.player?.sprite.position;
    const near = (x: number, z: number, range: number) =>
      !leader || Math.hypot(x - leader.x, z - leader.z) <= range;
    for (const sign of this.signs) {
      sign.el.hidden = !near(sign.at.x, sign.at.z, sign.range);
      if (!sign.el.hidden) this.placeLabel(sign.el, sign.at.clone(), false);
    }
    for (const [id, label] of this.enemyLabels) {
      const sprite = this.enemies.get(id)!;
      // Only nearby patrols are named, so a big floor isn't covered in tags.
      label.classList.toggle(
        'far',
        sprite.visible && !near(sprite.position.x, sprite.position.z, 7.5),
      );
      if (label.classList.contains('far')) continue;
      this.placeLabel(
        label,
        new THREE.Vector3(
          sprite.position.x,
          Number(sprite.userData.labelOffset) * (sprite.scale.y / 1.72),
          sprite.position.z,
        ),
        true,
      );
    }
    this.stepFeedback(delta);
    if (this.portal) this.portal.rotation.y = Math.sin(time * 0.6) * 0.25;
    this.renderer.render(this.scene, this.camera);
  }
  /**
   * Answers a lever or brazier: a ring flashes green (it held) or red (it sprang back), and the
   * piece jolts. A lever that sprang back is shown thrown for a moment first, so the pull reads.
   */
  puzzleFeedback(index: number, ok: boolean, color = ok ? '#9ee7b3' : '#ef8877') {
    const sprite = this.puzzleSprites[index];
    if (!sprite) return;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.34, 32),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(sprite.position.x, 0.07, sprite.position.z);
    this.level.add(ring);
    this.pulses.push({ mesh: ring, t: 0 });
    this.bumps.push({ sprite, base: sprite.scale.y, t: 0 });
    const art = this.leverArt[index];
    if (!ok && art && sprite.material.map === art.off) {
      sprite.material.map = art.on;
      window.setTimeout(() => {
        if (sprite.parent) sprite.material.map = art.off;
      }, 420);
    }
  }
  private stepFeedback(dt: number) {
    this.pulses = this.pulses.filter((p) => {
      p.t += dt;
      const k = p.t / 0.9;
      p.mesh.scale.setScalar(1 + k * 3.5);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * Math.max(0, 1 - k);
      if (k < 1) return true;
      this.level.remove(p.mesh);
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
      return false;
    });
    this.bumps = this.bumps.filter((b) => {
      b.t += dt;
      const k = Math.min(1, b.t / 0.45);
      b.sprite.scale.y = b.base * (1 + 0.14 * Math.sin(b.t * 28) * (1 - k));
      return k < 1;
    });
  }
  private sign(text: string, at: Point, height: number, range: number, done = false) {
    const el = document.createElement('div');
    el.className = 'world-sign' + (done ? ' done' : '');
    el.textContent = text;
    el.hidden = true;
    this.host.append(el);
    this.signs.push({ el, at: new THREE.Vector3(at.x, height, at.z), range });
  }
  private placeLabel(label: HTMLElement, at: THREE.Vector3, clamp: boolean) {
    const pos = at.project(this.camera);
    const halfWidth = label.offsetWidth / 2 + 6;
    const x = (pos.x * 0.5 + 0.5) * this.host.clientWidth;
    label.style.left = `${clamp ? Math.max(halfWidth, Math.min(this.host.clientWidth - halfWidth, x)) : x}px`;
    label.style.top = `${(-pos.y * 0.5 + 0.5) * this.host.clientHeight}px`;
    label.style.visibility =
      pos.z > 1 || pos.z < -1 || Math.abs(pos.x) > (clamp ? 1.08 : 0.97) || Math.abs(pos.y) > 1.08
        ? 'hidden'
        : 'visible';
  }
  /** Where a recruitable adventurer is standing in the hall right now. */
  ghostPosition(id: string): Point | undefined {
    const w = this.walkers.find((w) => w.ghost?.id === id && w.doll.sprite.visible);
    return w?.pos;
  }
  dispose() {
    this.resizeObserver.disconnect();
    this.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
  private click(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(mouse, this.camera);
    const recruits = this.walkers
      .filter((w) => w.ghost && w.doll.sprite.visible)
      .map((w) => w.doll.sprite);
    const hit = this.raycaster.intersectObjects(recruits)[0];
    if (hit) {
      this.onClick({ kind: 'ghost', id: hit.object.userData.ghostId as string });
      return;
    }
    const point = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.plane, point))
      this.onClick({ kind: 'ground', point: { x: point.x, z: point.z } });
  }
}
