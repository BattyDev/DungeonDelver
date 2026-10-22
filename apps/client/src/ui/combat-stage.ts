// The battlefield above the combat menu: the party faces the enemy line and acts out each turn.
import { ENEMIES, activeFighter } from '@delver/rules';
import type { CombatState, Fighter, Progress } from '@delver/rules';
import { ANIMS, F, MIRROR_SRC } from '../paperdoll/model';
import type { AnimId, LookClass } from '../paperdoll/model';
import { COMBAT_DIR, characterLook, dollFor } from '../paperdoll/looks';
import type { FrameSource } from '../paperdoll/looks';
import { creatureFor, isFlying } from '../paperdoll/creatures';
import { lookById } from '../scene/cast';
import { floorTexture, floorTheme, wallTexture } from '../scene/pixels';

const W = 300,
  H = 140,
  HORIZON = 50;
const PARTY_SPOTS: [number, number][] = [
  [106, 108],
  [74, 92],
  [72, 130],
  [40, 112],
];
const ENEMY_SPOTS: [number, number][] = [
  [196, 108],
  [230, 92],
  [232, 130],
  [264, 112],
];
const ATTACK: Record<LookClass, AnimId> = {
  tank: 'attack',
  healer: 'attack',
  archer: 'shoot',
  mage: 'cast',
  samurai: 'slash',
};
const SKILL: Record<LookClass, AnimId> = {
  tank: 'attack',
  healer: 'heal',
  archer: 'shoot',
  mage: 'channel',
  samurai: 'slash',
};
const GUARD: Record<LookClass, AnimId | undefined> = {
  tank: 'block',
  healer: undefined,
  archer: 'dodge',
  mage: 'channel',
  samurai: 'parry',
};
/** Seconds before a target reacts, so the blow lands first. */
const HIT_DELAY = 0.28;

interface Actor {
  id: string;
  enemy: boolean;
  x: number;
  y: number;
  doll?: FrameSource;
  cls?: LookClass;
  creature?: string;
  scale: number;
  height: number;
  anim: AnimId;
  clock: number;
  hold: boolean;
  delay?: { anim: AnimId; at: number; hold: boolean };
  lunge: number;
  dead: boolean;
  hp: number;
  health?: { from: number; to: number; at: number };
}
interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
}

export class CombatStage {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private actors = new Map<string, Actor>();
  private floats: Float[] = [];
  private status = new Map<string, Fighter>();
  private time = 0;
  private finishAt = Infinity;
  /** The final impact, death frames, and a short held pose have been shown. */
  get readyToLeave() {
    return this.time >= this.finishAt;
  }
  private backdrop: HTMLCanvasElement;
  private sprite = document.createElement('canvas');
  selected = '';
  activeId = '';
  constructor(
    combat: CombatState,
    progress: Progress,
    floorId: number,
    private onSelect: (id: string) => void,
  ) {
    this.canvas.width = W;
    this.canvas.height = H;
    this.canvas.className = 'battlefield-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.ctx = this.canvas.getContext('2d')!;
    this.sprite.width = this.sprite.height = F;
    this.backdrop = this.paintBackdrop(floorId);
    const party = combat.fighters.filter((f) => f.team === 'party'),
      enemies = combat.fighters.filter((f) => f.team === 'enemy');
    party.forEach((f, i) => {
      const look = f.player ? characterLook(progress.player, true) : lookById(f.id, f.classId);
      const doll = dollFor(look);
      const anims: (AnimId | undefined)[] = [
        'idle',
        'hurt',
        'death',
        ATTACK[look.cls],
        SKILL[look.cls],
        GUARD[look.cls],
      ];
      for (const anim of anims)
        if (anim) doll.request(anim, MIRROR_SRC[COMBAT_DIR] ?? COMBAT_DIR, true);
      this.add(f, PARTY_SPOTS[i % 4], { doll, cls: look.cls, scale: 1 });
    });
    enemies.forEach((f, i) => {
      const type = Object.keys(ENEMIES).find((t) => ENEMIES[t].name === f.name) ?? 'cultist';
      this.add(f, ENEMY_SPOTS[i % 4], { doll: creatureFor(type), creature: type, scale: 1 });
    });
    this.activeId = combat.outcome === 'active' ? activeFighter(combat).id : '';
    if (combat.outcome !== 'active') this.finishAt = 0.5;
    this.setFighters(combat.fighters);
    this.canvas.addEventListener('pointerup', (e) => this.click(e));
  }
  private add(f: Fighter, [x, y]: [number, number], extra: Partial<Actor>) {
    const dead = f.hp <= 0;
    this.actors.set(f.id, {
      id: f.id,
      enemy: f.team === 'enemy',
      x,
      y,
      scale: 1,
      height: 54,
      anim: dead ? 'death' : 'idle',
      clock: dead ? 99 : Math.random() * 3,
      hold: dead,
      lunge: 0,
      dead,
      hp: f.hp,
      ...extra,
    });
    const actor = this.actors.get(f.id)!;
    const idle = actor.doll?.frameNow('idle', actor.enemy ? 2 : COMBAT_DIR, 0);
    if (idle) {
      const top = idle.findIndex((v, i) => i % 4 === 3 && v > 0);
      actor.height = top < 0 ? 54 : 62 - Math.floor(top / (F * 4));
    }
  }
  private paintBackdrop(floorId: number) {
    const theme = floorTheme(floorId);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    const wall = wallTexture(theme, 1).image as HTMLCanvasElement;
    for (let x = 0; x < W; x += 32) for (let y = 0; y < HORIZON; y += 32) ctx.drawImage(wall, x, y);
    for (let y = HORIZON; y < H; y += 32)
      for (let x = -((y / 32) % 2) * 16; x < W; x += 32)
        ctx.drawImage(
          floorTexture(theme, Math.floor((x + y) / 32) % 4).image as HTMLCanvasElement,
          x,
          y,
        );
    // Shade the wall base and fade the far floor so the line-up reads in front.
    const g = ctx.createLinearGradient(0, HORIZON - 6, 0, HORIZON + 30);
    g.addColorStop(0, '#000000aa');
    g.addColorStop(1, '#00000000');
    ctx.fillStyle = g;
    ctx.fillRect(0, HORIZON - 6, W, 36);
    ctx.fillStyle = '#00000033';
    ctx.fillRect(0, 0, W, HORIZON);
    return c;
  }
  /** Current health and mana, drawn as bars over each fighter. */
  setFighters(fighters: Fighter[]) {
    this.status = new Map(fighters.map((f) => [f.id, f]));
  }
  /** Works out what the last turn did from the before and after states, and animates it. */
  update(prev: CombatState, next: CombatState) {
    const actorId = activeFighter(prev).id;
    this.activeId = next.outcome === 'active' ? activeFighter(next).id : '';
    if (next.outcome !== 'active') {
      this.selected = '';
      this.finishAt =
        this.time +
        (next.outcome === 'fled' ? 0.5 : HIT_DELAY + ANIMS.death.frames / ANIMS.death.fps + 0.5);
    }
    const before = new Map(prev.fighters.map((f) => [f.id, f]));
    const actorBefore = before.get(actorId),
      actorAfter = next.fighters.find((f) => f.id === actorId);
    let hitFoes = false,
      healedAllies = false;
    for (const f of next.fighters) {
      const p = before.get(f.id),
        a = this.actors.get(f.id);
      if (!p || !a) continue;
      const d = f.hp - p.hp;
      if (d) a.health = { from: a.hp, to: f.hp, at: this.time + HIT_DELAY };
      if (d < 0) {
        if (actorBefore && f.team !== actorBefore.team) hitFoes = true;
        this.float(a, `-${-d}`, '#ff8a80');
        const dying = f.hp <= 0;
        a.delay = { anim: dying ? 'death' : 'hurt', at: this.time + HIT_DELAY, hold: dying };
      } else if (d > 0) {
        if (actorBefore && f.team === actorBefore.team) healedAllies = true;
        this.float(a, `+${d}`, '#9ee7b3');
      }
    }
    const actor = this.actors.get(actorId);
    if (!actor || !actorBefore || !actorAfter || actor.dead) return;
    const usedSkill = actorAfter.mp < actorBefore.mp;
    if (hitFoes || healedAllies) {
      if (actor.cls)
        this.play(actor, usedSkill || healedAllies ? SKILL[actor.cls] : ATTACK[actor.cls]);
      else this.play(actor, 'attack');
      if (hitFoes) actor.lunge = 1;
    } else if (actorAfter.defending && actor.cls) {
      const guard = GUARD[actor.cls];
      if (guard) this.play(actor, guard);
    }
  }
  private play(a: Actor, anim: AnimId, hold = false) {
    a.anim = anim;
    a.clock = 0;
    a.hold = hold;
  }
  private float(a: Actor, text: string, color: string) {
    this.floats.push({
      x: a.x + (Math.random() * 10 - 5),
      y: a.y - a.height - 4,
      text,
      color,
      t: -HIT_DELAY,
    });
  }
  draw(dt: number) {
    this.time += dt;
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.backdrop, 0, 0);
    const list = [...this.actors.values()].sort((a, b) => a.y - b.y);
    for (const a of list) {
      if (a.health && this.time >= a.health.at) {
        const t = Math.min(1, (this.time - a.health.at) / 0.22);
        a.hp = a.health.from + (a.health.to - a.health.from) * t;
        if (t === 1) a.health = undefined;
      }
      if (a.delay && this.time >= a.delay.at) {
        a.dead = a.delay.hold;
        this.play(a, a.delay.anim, a.delay.hold);
        a.delay = undefined;
      }
      a.lunge = Math.max(0, a.lunge - dt * 2.4);
      const ring = a.id === this.selected ? '#9ee7b3' : a.id === this.activeId ? '#e5ba72' : '';
      if (!a.creature || !isFlying(a.creature)) {
        ctx.fillStyle = '#00000055';
        ctx.beginPath();
        ctx.ellipse(a.x, a.y, 12 * a.scale, 3 * a.scale, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (ring) {
        ctx.strokeStyle = ring;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(a.x, a.y, 17 * a.scale, 5 * a.scale, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // A lunge steps toward the other line and back.
      const step = Math.sin(Math.min(1, 1 - a.lunge) * Math.PI) * 16 * (a.enemy ? -1 : 1);
      if (a.doll) this.drawDoll(a, step, dt);
    }
    for (const a of list) this.drawBars(a);
    this.floats = this.floats.filter((f) => f.t < 1.2);
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const f of this.floats) {
      f.t += dt;
      if (f.t < 0) continue;
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.2);
      ctx.fillStyle = '#1b1a24';
      ctx.fillText(f.text, f.x + 1, f.y - f.t * 18 + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - f.t * 18);
      ctx.globalAlpha = 1;
    }
  }
  private drawDoll(a: Actor, step: number, dt: number) {
    const def = ANIMS[a.anim];
    a.clock += dt * def.fps;
    if (!a.hold && !def.loop && a.clock >= def.frames) this.play(a, 'idle');
    const cur = ANIMS[a.anim];
    const f = cur.loop
      ? Math.floor(a.clock) % cur.frames
      : Math.min(cur.frames - 1, Math.floor(a.clock));
    // Combat art is drawn facing the combat camera (east), toward the enemy line.
    const dir = a.enemy ? 2 : COMBAT_DIR;
    const frame =
      (a.hold ? a.doll!.frameNow(a.anim, dir, f) : a.doll!.frame(a.anim, dir, f)) ??
      a.doll!.frame('idle', dir, 0) ??
      a.doll!.frameNow('idle', dir, 0);
    this.sprite.getContext('2d')!.putImageData(new ImageData(frame.slice(), F, F), 0, 0);
    this.ctx.drawImage(this.sprite, Math.round(a.x - 32 + step), Math.round(a.y - 62));
  }
  private drawBars(a: Actor) {
    const f = this.status.get(a.id);
    if (!f) return;
    const ctx = this.ctx,
      w = 26,
      x = Math.round(a.x - w / 2),
      y = Math.round(a.y - a.height - 4);
    ctx.fillStyle = '#0b1416';
    ctx.fillRect(x - 1, y - 1, w + 2, f.stats.mp ? 6 : 4);
    ctx.fillStyle = a.enemy ? '#d9706a' : '#8fd6a8';
    ctx.fillRect(x, y, Math.round((w * a.hp) / f.stats.hp), 2);
    if (a.hp <= 0) {
      ctx.font = 'bold 6px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0b1416';
      ctx.fillText('0 HP', a.x + 1, y - 2);
      ctx.fillStyle = '#f3f1f7';
      ctx.fillText('0 HP', a.x, y - 3);
    }
    if (f.stats.mp) {
      ctx.fillStyle = '#8ea6e6';
      ctx.fillRect(x, y + 3, Math.round((w * f.mp) / f.stats.mp), 1);
    }
    if (f.defending || f.tauntTurns) {
      ctx.fillStyle = f.tauntTurns ? '#e5ba72' : '#9fc3d6';
      ctx.fillRect(x + w + 2, y, 2, 2);
    }
  }
  private click(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W,
      y = ((e.clientY - r.top) / r.height) * H;
    let best: Actor | undefined,
      bestD = 30;
    for (const a of this.actors.values()) {
      if (a.dead) continue;
      const d = Math.hypot(a.x - x, a.y - 22 - y);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    if (best) this.onSelect(best.id);
  }
}
