import * as THREE from 'three';
import { CLASSES, GHOSTS, getFloor, isSolved, ENEMIES } from '@delver/rules';
import type { GameState, Point } from '@delver/rules';
import { makeSprite, makeEnemySprite } from './sprites';
export type WorldClick =
  | { kind: 'ground'; point: Point }
  | { kind: 'ghost'; id: string }
  | { kind: 'interact' };
export class World {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(46, 1, 0.1, 120);
  private room = new THREE.Group();
  private actors = new THREE.Group();
  private player?: THREE.Sprite;
  private ghostSprites: THREE.Sprite[] = [];
  private enemies = new Map<string, THREE.Sprite>();
  private rings = new Map<string, THREE.Mesh>();
  private followers = new Map<string, THREE.Sprite>();
  private labels: HTMLButtonElement[] = [];
  private enemyLabels = new Map<string, HTMLDivElement>();
  private friendlyMarkers: THREE.Mesh[] = [];
  private threatMarkers = new Map<string, THREE.Mesh>();
  private playerMarker?: THREE.Mesh;
  private raycaster = new THREE.Raycaster();
  private key = '';
  private state: GameState = { phase: 'classSelect' };
  private target: Point = { x: 10, z: 9 };
  private resizeObserver: ResizeObserver;
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private portal?: THREE.Mesh;
  constructor(
    private host: HTMLElement,
    private onClick: (click: WorldClick) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor('#101e23');
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Dungeon exploration. Move with WASD, arrows, or tap the floor.',
    );
    this.scene.add(this.room, this.actors, new THREE.AmbientLight('#b7d5ca', 2.2));
    const sun = new THREE.DirectionalLight('#fff0cf', 3);
    sun.position.set(5, 16, 8);
    this.scene.add(sun);
    this.camera.position.set(10, 12, 19);
    this.camera.lookAt(10, 0, 6);
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
  private box(x: number, z: number, w: number, d: number, height: number, color: string, y = 0) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, height, d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.92 }),
    );
    mesh.position.set(x, y + height / 2, z);
    this.room.add(mesh);
    return mesh;
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
    this.room.add(mesh);
    return mesh;
  }
  private marker(x: number, z: number, color: string, r = 0.34) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, 0.08, 32),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35 }),
    );
    mesh.position.set(x, 0.08, z);
    this.room.add(mesh);
    return mesh;
  }
  private clear() {
    for (const group of [this.room, this.actors]) {
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
            mat.dispose();
        }
      });
      group.clear();
    }
    this.labels.forEach((l) => l.remove());
    this.labels = [];
    this.enemyLabels.forEach((l) => l.remove());
    this.enemyLabels.clear();
    this.friendlyMarkers = [];
    this.threatMarkers.clear();
    this.playerMarker = undefined;
    this.ghostSprites = [];
    this.enemies.clear();
    this.rings.clear();
    this.followers.clear();
    this.portal = undefined;
  }
  setState(s: GameState, hubPosition: Point) {
    this.state = s;
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
    if (!this.player) {
      this.player = makeSprite(s.progress.player.classId, s.progress.player.color);
      this.actors.add(this.player);
      this.player.position.set(this.target.x, 0.82, this.target.z);
      this.playerMarker = this.affiliationMarker('#e5ba72', 32);
    }
    const material = this.player.material as THREE.SpriteMaterial;
    if (this.player.userData.classId !== s.progress.player.classId) {
      const replacement = makeSprite(s.progress.player.classId, s.progress.player.color);
      material.map = (replacement.material as THREE.SpriteMaterial).map;
      material.needsUpdate = true;
      this.player.userData.classId = s.progress.player.classId;
    }
    if (s.phase === 'hub')
      GHOSTS.filter((g) => !g.community).forEach((g, i) => {
        const detail = this.labels[i]?.querySelector('small');
        if (detail)
          detail.textContent = `${CLASSES[g.character.classId].name} · ${s.progress.hires.some((h) => h.id === g.id) ? 'In party' : 'Recruit'}`;
      });
    if (s.phase === 'floor' || s.phase === 'combat') {
      const def = getFloor(s.floor.id);
      for (const p of s.floor.patrols) {
        const actor = this.enemies.get(p.id);
        if (actor) {
          actor.visible = !p.defeated;
          actor.position.set(p.position.x, 0.82 * (actor.scale.y / 1.72), p.position.z);
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
      }
      for (const f of s.run.party) {
        const sprite = this.followers.get(f.id);
        if (sprite) {
          sprite.visible = f.hp > 0;
          sprite.position.set(
            s.floor.position.x -
              0.55 +
              (this.followers.size > 1 ? [...this.followers.keys()].indexOf(f.id) * 0.5 : 0),
            0.66,
            s.floor.position.z + 0.65,
          );
        }
      }
      this.room.children
        .filter((o) => o.userData.dynamic)
        .forEach((o) => {
          this.room.remove(o);
          const m = o as THREE.Mesh;
          m.geometry?.dispose();
          (m.material as THREE.Material)?.dispose();
        });
      const p = s.floor.puzzle;
      if (p.type === 'plates') {
        for (const plate of p.plates) {
          const m = this.marker(plate.x, plate.z, '#e1b565', 0.42);
          m.userData.dynamic = true;
        }
        for (const b of p.blocks) {
          const m = this.box(b.x, b.z, 0.72, 0.72, 0.7, '#9fa38a');
          m.userData.dynamic = true;
        }
      }
      if (p.type === 'levers')
        def.puzzlePoints.forEach((pt, i) => {
          const m = this.marker(
            pt.x,
            pt.z,
            p.sequence.slice(0, p.progress).includes(i) ? '#9ee7b3' : '#e2b15b',
          );
          m.userData.dynamic = true;
          const pole = this.box(pt.x, pt.z, 0.12, 0.12, 0.7, '#d1b36d');
          pole.userData.dynamic = true;
        });
      if (p.type === 'braziers')
        def.puzzlePoints.forEach((pt, i) => {
          const m = this.marker(pt.x, pt.z, p.lit[i] ? '#ffa851' : '#53646b', 0.35);
          m.userData.dynamic = true;
          const bowl = this.box(pt.x, pt.z, 0.5, 0.5, 0.4, '#5b6965');
          bowl.userData.dynamic = true;
          if (p.lit[i]) {
            const flame = this.marker(pt.x, pt.z, '#ffc876', 0.22);
            flame.position.y = 0.6;
            flame.userData.dynamic = true;
          }
        });
      if (p.type === 'key' && !p.collected) {
        const pt = def.puzzlePoints[0];
        const m = this.marker(pt.x, pt.z, p.guardDefeated ? '#f5d37d' : '#a55f63');
        m.userData.dynamic = true;
      }
      const door = this.box(
        def.stairs.x,
        def.stairs.z,
        0.9,
        0.25,
        isSolved(p) ? 0.15 : 1.6,
        isSolved(p) ? '#88d6ba' : '#aa8255',
      );
      door.userData.dynamic = true;
    }
  }
  private build(s: GameState) {
    this.clear();
    this.player = undefined;
    const dungeon = s.phase === 'floor' || s.phase === 'combat';
    const def = dungeon ? getFloor(s.floor.id) : undefined;
    const map =
      def?.map ??
      Array.from({ length: 13 }, (_, z) =>
        z === 0 || z === 12 ? '#####################' : '#...................#',
      );
    map.forEach((row, z) =>
      [...row].forEach((tile, x) => {
        if (tile === '#') {
          // Keep front boundary low so the party stays visible.
          const height = z === 12 ? 0.25 : 1.15;
          this.box(x, z, 0.98, 0.98, height, dungeon ? '#3a4945' : '#495a52');
        } else
          this.box(
            x,
            z,
            0.96,
            0.96,
            0.12,
            (x + z) % 3 === 0 ? (dungeon ? '#30413b' : '#4a5b4b') : dungeon ? '#293a35' : '#405243',
            -0.12,
          );
      }),
    );
    if (def && dungeon) {
      this.marker(def.clue.x, def.clue.z, '#a7c5d0');
      this.box(def.clue.x, def.clue.z, 0.55, 0.5, 0.55, '#879a89');
      this.marker(def.stairs.x, def.stairs.z, '#a6dec2', 0.65);
      def.patrols.forEach((p) => {
        const enemyDef = ENEMIES[p.enemyTypes[0]];
        const sprite = makeEnemySprite(p.enemyTypes[0]);
        if (p.boss) sprite.scale.multiplyScalar(1.5);
        this.actors.add(sprite);
        this.enemies.set(p.id, sprite);
        sprite.userData.labelOffset =
          p.enemyTypes[0] === 'slime' ? 0.24 : p.enemyTypes[0] === 'bat' ? 0.48 : 0.86;
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
        this.room.add(ring);
        this.rings.set(p.id, ring);
      });
      for (const f of s.run.party.filter((f) => !f.player)) {
        const sprite = makeSprite(f.classId, CLASSES[f.classId].color);
        sprite.scale.multiplyScalar(0.8);
        this.actors.add(sprite);
        this.followers.set(f.id, sprite);
      }
    } else {
      // Hall pillars, moss garden and gathering rug.
      for (const x of [2, 18])
        for (const z of [2, 10]) {
          this.box(x, z, 0.65, 0.65, 2, '#667369');
          this.box(x, z, 0.95, 0.95, 0.2, '#8a9180', 2);
        }
      this.box(10, 6, 7, 4, 0.03, '#354a49');
      this.box(10, 6, 6.8, 3.8, 0.04, '#526458');
      this.marker(17, 2, '#a7d9c7', 0.9);
      this.portal = new THREE.Mesh(
        new THREE.TorusGeometry(0.85, 0.12, 12, 48),
        new THREE.MeshStandardMaterial({
          color: '#91e9cb',
          emissive: '#60d8ba',
          emissiveIntensity: 0.8,
        }),
      );
      this.portal.position.set(17, 1.1, 2);
      this.room.add(this.portal);
      this.marker(17, 10, '#dfb567', 0.8);
      if (s.phase !== 'safeRoom') {
        GHOSTS.filter((g) => !g.community).forEach((g, i) => {
          const sprite = makeSprite(g.character.classId, g.character.color);
          sprite.userData.ghostId = g.id;
          this.ghostSprites.push(sprite);
          this.actors.add(sprite);
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
          this.labels[i] = button;
          this.friendlyMarkers[i] = this.affiliationMarker('#86cfc2', 4);
        });
      }
    }
  }
  animate(time: number) {
    const dungeon = this.state.phase === 'floor' || this.state.phase === 'combat';
    const center = dungeon
      ? { x: Math.max(4, Math.min(16, this.target.x)), z: Math.max(3, Math.min(10, this.target.z)) }
      : { x: Math.max(8, Math.min(12, this.target.x)), z: 6 };
    this.camera.position.lerp(
      new THREE.Vector3(center.x, dungeon ? 10 : 14, center.z + (dungeon ? 11 : 15)),
      0.045,
    );
    this.camera.lookAt(center.x, 0, center.z - 1);

    if (this.player) {
      this.player.position.x += (this.target.x - this.player.position.x) * 0.22;
      this.player.position.z += (this.target.z - this.player.position.z) * 0.22;
      this.player.position.y = 0.82;
      this.playerMarker?.position.set(this.player.position.x, 0.04, this.player.position.z);
    }
    this.ghostSprites.forEach((sprite, i) => {
      const base = this.ghostPoint(i, time);
      sprite.position.set(base.x, 0.82, base.z);
      this.friendlyMarkers[i]?.position.set(base.x, 0.04, base.z);
      const projected = new THREE.Vector3(base.x, 1.9, base.z).project(this.camera);
      const label = this.labels[i];
      label.style.left = `${(projected.x * 0.5 + 0.5) * this.host.clientWidth}px`;
      label.style.top = `${(-projected.y * 0.5 + 0.5) * this.host.clientHeight}px`;
    });
    for (const [id, label] of this.enemyLabels) {
      const sprite = this.enemies.get(id)!;
      const pos = new THREE.Vector3(
        sprite.position.x,
        sprite.position.y + Number(sprite.userData.labelOffset) * (sprite.scale.y / 1.72),
        sprite.position.z,
      ).project(this.camera);
      const halfWidth = label.offsetWidth / 2 + 6;
      label.style.left = `${Math.max(halfWidth, Math.min(this.host.clientWidth - halfWidth, (pos.x * 0.5 + 0.5) * this.host.clientWidth))}px`;
      label.style.top = `${(-pos.y * 0.5 + 0.5) * this.host.clientHeight}px`;
      label.style.visibility =
        pos.z > 1 || pos.z < -1 || Math.abs(pos.x) > 1.08 || Math.abs(pos.y) > 1.08
          ? 'hidden'
          : 'visible';
    }
    if (this.portal) this.portal.rotation.y = Math.sin(time * 0.6) * 0.25;
    this.renderer.render(this.scene, this.camera);
  }
  ghostPoint(i: number, time: number): Point {
    const x = [4, 8, 12, 16, 3, 7, 13, 17][i],
      z = i < 4 ? 3.7 : 7.5;
    const offsets = [
      [-0.65, -0.4],
      [0.65, -0.4],
      [0.65, 0.4],
      [-0.65, 0.4],
    ];
    const phase = (time * 0.22 + i * 0.7) % 4,
      index = Math.floor(phase),
      t = phase - index;
    const a = offsets[index],
      b = offsets[(index + 1) % 4];
    return { x: x + a[0] + (b[0] - a[0]) * t, z: z + a[1] + (b[1] - a[1]) * t };
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
    const hit = this.raycaster.intersectObjects(this.ghostSprites)[0];
    if (hit) {
      this.onClick({ kind: 'ghost', id: hit.object.userData.ghostId as string });
      return;
    }
    const point = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.plane, point)) {
      const p = { x: Math.round(point.x), z: Math.round(point.z) };
      if (this.state.phase === 'floor') {
        const def = getFloor(this.state.floor.id);
        if (
          Math.hypot(p.x - def.stairs.x, p.z - def.stairs.z) < 1 ||
          def.puzzlePoints.some((q) => q.x === p.x && q.z === p.z) ||
          (p.x === def.clue.x && p.z === def.clue.z)
        ) {
          this.onClick({ kind: 'ground', point: p });
          return;
        }
      }
      this.onClick({ kind: 'ground', point: p });
    }
  }
}
