import {
  CLASSES,
  ENEMIES,
  CLASS_IDS,
  GHOSTS,
  ITEMS,
  SLOTS,
  deriveStats,
  equipment,
  levelFromXp,
  transition,
  getFloor,
  isSolved,
  activeFighter,
  distance,
  canOccupy,
} from '@delver/rules';
import type { GameState, GameCommand, ClassId, Point, Ghost, Fighter, Action } from '@delver/rules';
import { World } from './scene/world';
import type { Storage } from './storage/storage';
import type { WorldClick } from './scene/world';
import { spriteTexture, enemyTexture } from './scene/sprites';
import { Keyboard } from './input/keyboard';
import { icon, escapeHtml as esc } from './ui/icons';
const avatar = (classId: ClassId) =>
  `<span class="avatar" style="--class-color:${CLASSES[classId].color}">${CLASSES[classId].glyph}</span>`;
const classCopy: Record<ClassId, string> = {
  knight: 'Hold the line. Protect your party with steel and stubborn resolve.',
  cleric: 'Keep hope alive. Mend your allies and bring everyone home.',
  rogue: 'Strike first. Slip past danger, or cut straight through it.',
};
export class Controller {
  state: GameState = { phase: 'classSelect' };
  private selectedClass: ClassId = 'knight';
  private world?: World;
  private keyboard: Keyboard;
  private hubPosition: Point = { x: 10, z: 10 };
  private path: Point[] = [];
  private modal?: HTMLElement;
  private toastTimer = 0;
  private lastFrame = 0;
  private motionTime = 0;
  private lastMap = 0;
  private lastTick = 0;
  private lastAI = 0;
  private sneak = false;
  private selectedTarget = '';
  private shell = false;
  private time = 0;
  private paused = false;
  private saveTimer = 0;
  private saveQueue: Promise<void> = Promise.resolve();
  private saveBlocked = false;
  private resetting = false;
  constructor(
    private root: HTMLElement,
    private storage: Storage,
    initial: GameState = { phase: 'classSelect' },
    warning?: string,
  ) {
    this.state = initial;
    this.saveBlocked = !!warning;
    this.keyboard = new Keyboard(
      () => this.interact(),
      () => this.closeModal(),
    );
    root.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (target) this.handle(target);
    });
    this.render();
    requestAnimationFrame((t) => this.frame(t));
    document.addEventListener('visibilitychange', () => {
      this.paused = document.hidden;
      if (document.hidden) this.saveNow();
    });
    window.addEventListener('pagehide', () => this.saveNow());
    if (warning)
      this.openModal(
        `<span class="eyebrow">Save could not be loaded</span><h2>Your save is preserved.</h2><p class="muted">${esc(warning)}</p><p class="muted">You can play without saving, or confirm Reset Game to delete the stored save.</p><div class="modal-actions"><button data-action="close">Play without saving</button><button data-action="request-reset">Reset Game</button></div>`,
      );
  }
  private dispatch(command: GameCommand) {
    const previous = this.state;
    this.state = transition(this.state, command);
    if (previous === this.state) return;
    this.scheduleSave();
    const lightweight = command.type === 'tick' || command.type === 'move';
    if (command.type === 'startRun') {
      this.path = [];
      this.toast('Your expedition begins. Keep a healer close.');
    }
    if (previous.phase === 'combat' && this.state.phase !== 'combat') {
      this.selectedTarget = '';
      this.path = [];
      if (this.state.phase === 'hub' || this.state.phase === 'safeRoom')
        this.toast('Party wiped. XP kept; unbanked gold lost. Your hires have returned home.');
      else if (this.state.phase === 'floor')
        this.toast(
          this.state.floor.patrols.find((p) => p.id === previous.patrolId)?.defeated
            ? 'Encounter cleared. XP earned; gold added to your run.'
            : 'You escaped. The patrol pauses briefly. Move away!',
        );
    }
    if (previous.phase === 'floor' && this.state.phase === 'safeRoom') {
      this.toast('Sanctuary reached. Gold banked, hires dismissed, portal unlocked.');
      this.hubPosition = { x: 10, z: 8 };
    }
    if (!lightweight || previous.phase !== this.state.phase) this.render();
    else {
      this.updateWorld();
      if (command.type === 'move' && performance.now() - this.lastMap > 150) {
        this.renderLeft();
        this.lastMap = performance.now();
      }
      this.renderInteraction();
    }
  }
  private render() {
    if (this.state.phase === 'classSelect') {
      this.renderClassSelect();
      return;
    }
    if (!this.shell) {
      this.root.innerHTML = `<div class="shell"><header class="topbar"><div class="brand">${icon('compass')}<span>Dungeon <em>Delver</em></span></div><div class="location"><span>The expedition</span><span>/</span><span id="location-name">The Gathering Hall</span></div><div class="top-actions"><span id="gold" class="gold"></span><span class="save-status" id="save-status">Offline adventure</span><button class="subtle" data-action="settings" aria-label="Settings">${icon('gear')}</button></div></header><div class="game-layout"><aside class="sidebar left" id="left"></aside><section class="stage-wrap"><div class="stage" id="stage"></div><div class="stage-footer" id="stage-footer"></div></section><aside class="sidebar right" id="right"></aside></div></div>`;
      try {
        this.world = new World(this.root.querySelector('#stage')!, (click) =>
          this.worldClick(click),
        );
      } catch (e) {
        this.toast('WebGL could not start. Enable hardware acceleration and reload.');
        console.error(e);
      }
      this.shell = true;
    }
    this.root.querySelector('#gold')!.innerHTML =
      `${icon('coin', 16)} ${this.state.progress.gold}<small> gold</small>`;
    this.root.querySelector('#location-name')!.textContent =
      this.state.phase === 'hub'
        ? 'The Gathering Hall'
        : this.state.phase === 'safeRoom'
          ? 'The Stillwater Sanctuary'
          : `Floor ${this.state.floor.id}`;
    this.renderLeft();
    this.renderRight();
    this.renderStageChrome();
    this.updateWorld();
    this.renderCombat();
    this.showSaveStatus();
  }
  private renderClassSelect() {
    if (this.shell) {
      this.world?.dispose();
      this.world = undefined;
    }
    this.shell = false;
    const name = this.root.querySelector<HTMLInputElement>('#player-name')?.value ?? '';
    this.root.innerHTML = `<div class="class-screen"><header><div class="brand">${icon('compass')}<span>Dungeon <em>Delver</em></span></div><span>A SOLO ADVENTURE. A SHARED SPIRIT.</span></header><section class="class-content"><div class="intro"><div><span class="eyebrow">Your first descent</span><h1>Some journeys<br>need <em>company.</em></h1></div><p>Beyond the hall, an old dungeon stirs.<br>Choose your calling, gather a party of adventurers, and find out what waits beneath.</p></div><div class="class-cards">${CLASS_IDS.map(
      (id) => {
        const c = CLASSES[id];
        const image = (spriteTexture(id, c.color).image as HTMLCanvasElement).toDataURL();
        return `<button class="class-card ${this.selectedClass === id ? 'selected' : ''}" data-action="select-class" data-id="${id}" style="--class-color:${c.color}" aria-pressed="${this.selectedClass === id}"><div class="class-art"><img src="${image}" alt="${c.name} adventurer"><span class="selection-mark">${this.selectedClass === id ? icon('check', 13) : ''}</span></div><div class="class-card-body"><span class="eyebrow" style="color:${c.color}">${c.role === 'dps' ? 'Damage dealer' : c.role}</span><h2>${c.name}</h2><p>${classCopy[id]}</p><div class="class-skill">${icon(id === 'knight' ? 'shield' : id === 'cleric' ? 'heart' : 'sword', 15)} ${c.skill}<span class="muted">· ${c.cost} MP</span></div></div></button>`;
      },
    ).join(
      '',
    )}</div><form id="new-game" class="start-form"><div><label for="player-name">What should we call you?</label><input id="player-name" name="name" placeholder="Your adventurer’s name" maxlength="24" autocomplete="nickname" value="${esc(name)}" required></div><button class="primary" type="submit">Enter the Gathering Hall ${icon('arrow', 18)}</button></form><div class="class-bottom">${icon('companion', 15)} You control one hero. Your three companions have minds of their own.</div></section><footer><span>FIVE FLOORS. FOUR SOULS. ONE WAY DOWN.</span><span>Offline · Saved on this device</span></footer></div>`;
    this.root.querySelector('#new-game')!.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = this.root.querySelector<HTMLInputElement>('#player-name')!.value;
      this.dispatch({
        type: 'newGame',
        name,
        classId: this.selectedClass,
        seed: crypto.getRandomValues(new Uint32Array(1))[0],
      });
    });
  }
  private renderLeft() {
    if (this.state.phase === 'classSelect') return;
    const s = this.state;
    const dungeon = s.phase === 'floor' || s.phase === 'combat';
    const current = dungeon ? s.floor.id : s.phase === 'safeRoom' ? 5 : 0;
    this.root.querySelector('#left')!.innerHTML =
      `<span class="eyebrow">The expedition</span><h2>A little deeper.<br>A little braver.</h2><p>Gather your party. Follow the runes. Come home together.</p><div class="floor-list">${['Gathering Hall', 'Overgrown Halls', 'Runic Archive', 'Ember Cloister', 'Warden’s Keep', 'Stillwater Sanctuary'].map((name, i) => `<div class="floor-row ${i === current ? 'current' : ''}"><span class="floor-number">${i === 0 ? icon('companion', 13) : i === 5 ? icon('compass', 13) : i}</span><span>${name}<small>${i === 0 ? 'RECRUIT & PREPARE' : i === 5 ? 'SAFE FLOOR' : 'DUNGEON FLOOR'}</small></span>${i === current ? icon('arrow', 13) : i === 5 && s.progress.unlockedPortals.includes(5) ? icon('check', 13) : ''}</div>`).join('')}</div>${dungeon ? this.mapHtml() : ''}<div class="objective"><span class="eyebrow">${dungeon ? 'Floor objective' : 'Your next step'}</span><p>${dungeon ? this.puzzleDescription() : s.phase === 'safeRoom' ? 'You made it. Your checkpoint and hub portal are unlocked. Return whenever you like.' : 'Recruit up to three ghosts, choose your equipment, then take the eastern stairs.'}</p></div><div class="legend"><span><i class="dot"></i> ${dungeon ? 'You & puzzle objects' : 'Your calling'}</span><span><i class="dot green"></i> ${dungeon ? 'Stairs to the next floor' : 'Portal to sanctuary'}</span><span><i class="dot red"></i> ${dungeon ? 'Enemy patrol' : 'A little danger below'}</span></div>`;
  }
  private mapHtml() {
    const s = this.state;
    if (s.phase !== 'floor' && s.phase !== 'combat') return '';
    const def = getFloor(s.floor.id);
    return `<div class="mini-map" aria-label="Floor map" style="grid-template-columns:repeat(21,1fr)">${def.map.map((row, z) => [...row].map((t, x) => `<i class="${Math.round(s.floor.position.x) === x && Math.round(s.floor.position.z) === z ? 'player' : def.stairs.x === x && def.stairs.z === z ? 'goal' : def.clue.x === x && def.clue.z === z ? 'clue' : s.floor.patrols.some((p) => !p.defeated && Math.round(p.position.x) === x && Math.round(p.position.z) === z) ? 'foe' : t === '#' ? 'wall' : ''}"></i>`).join('')).join('')}</div>`;
  }
  private puzzleDescription() {
    const s = this.state;
    if (s.phase !== 'floor' && s.phase !== 'combat') return '';
    if (isSolved(s.floor.puzzle)) return 'The seal is broken. Find the green stairs and descend.';
    const type = s.floor.puzzle.type;
    return type === 'plates'
      ? 'Push the two stone blocks onto the gold pressure plates.'
      : type === 'levers'
        ? 'Find the rune tablet, then pull the levers in its order.'
        : type === 'braziers'
          ? 'Light all five braziers. Each flame toggles its neighbors.'
          : 'Defeat the Key Warden, then collect the key from its pedestal.';
  }
  private renderRight() {
    const s = this.state;
    if (s.phase === 'classSelect') return;
    const p = s.progress;
    const characters = [p.player, ...p.hires.map((g) => g.character)];
    const party =
      s.phase === 'combat'
        ? s.combat.fighters.filter((f) => f.team === 'party')
        : s.phase === 'floor'
          ? s.run.party
          : undefined;
    const roles = characters.map((c) => CLASSES[c.classId].role);
    this.root.querySelector('#right')!.innerHTML =
      `<section><div class="party-head"><h3>Your company</h3><span class="pill">${characters.length} / 4</span></div><div class="party-list">${characters
        .map((c, i) => {
          const fighter = party?.find((f) => f.id === c.id);
          return `<div class="party-member">${avatar(c.classId)}<div class="details"><strong>${esc(c.name)}${i === 0 ? ' <small style="display:inline;color:var(--gold)">YOU</small>' : ''}</strong><small>${CLASSES[c.classId].name} · ${fighter ? `${fighter.hp}/${fighter.stats.hp} HP` : `Level ${levelFromXp(c.xp)}`}</small>${fighter ? `<div class="bar"><span style="width:${(fighter.hp / fighter.stats.hp) * 100}%"></span></div>` : ''}</div>${i > 0 && s.phase === 'hub' ? `<button class="subtle" data-action="dismiss" data-id="${c.id}" aria-label="Dismiss ${esc(c.name)}">${icon('close', 12)}</button>` : ''}</div>`;
        })
        .join(
          '',
        )}${Array.from({ length: 4 - characters.length }, () => `<button class="empty-slot" data-action="roster"><span>+</span><span>An open party slot</span></button>`).join('')}</div><div class="composition"><span class="${roles.includes('tank') ? 'ready' : 'missing'}">${icon('shield', 12)} ${roles.includes('tank') ? 'Tank ready' : 'Tank missing'}</span><span class="${roles.includes('healer') ? 'ready' : 'missing'}">${icon('heart', 12)} ${roles.includes('healer') ? 'Healer ready' : 'Healer missing'}</span></div></section>${s.phase === 'hub' ? `<section class="loadout-link"><button class="wide" data-action="loadout">${icon('sword', 15)} Manage loadout ${icon('arrow', 14)}</button></section><section class="community-link"><h3>Never descend alone</h3><p class="recruit-prompt">${icon('companion', 17)} Tap a wandering adventurer to meet them, or find an affordable companion below.</p><button class="wide" data-action="roster">Browse companions ${icon('arrow', 14)}</button></section>` : s.phase === 'floor' || s.phase === 'combat' ? `<section><span class="eyebrow right-title">Expedition supplies</span><p class="right-title" style="margin:12px 0 0">${s.phase === 'combat' ? s.combat.resources.potions : s.run.resources.potions} potions · ${s.run.unbankedGold} unbanked gold<br>${p.player.xp} XP earned</p></section>` : ''}<section class="depart">${s.phase === 'hub' ? `<button class="primary wide" data-action="depart">${icon('stairs', 17)} Begin descent ${icon('arrow', 16)}</button><p>Floors 1–4 · Sanctuary at floor 5</p>${p.unlockedPortals.includes(5) ? `<button class="wide" style="margin-top:10px" data-action="portal">${icon('compass', 16)} Sanctuary portal</button>` : ''}` : s.phase === 'safeRoom' ? `<button class="primary wide" data-action="portal">${icon('compass', 16)} Return to the hub</button><p>Portal unlocked. Your progress is safe.</p>` : `<button class="wide" data-action="journal">${icon('book', 16)} Floor journal</button><p>Wipe: keep XP, lose unbanked gold.</p>`}</section>`;
  }
  private renderStageChrome() {
    const s = this.state;
    if (s.phase === 'classSelect') return;
    const stage = this.root.querySelector('#stage')!;
    stage
      .querySelectorAll('.stage-heading,.stage-badge,.touch-controls,.safe-banner')
      .forEach((e) => e.remove());
    const dungeon = s.phase === 'floor' || s.phase === 'combat';
    const def = dungeon ? getFloor(s.floor.id) : undefined;
    stage.insertAdjacentHTML(
      'beforeend',
      `<div class="stage-heading"><span class="eyebrow">${dungeon ? `Floor 0${s.floor.id}` : s.phase === 'safeRoom' ? 'Floor 05 · Safe room' : 'Floor 00 · Safe haven'}</span><h1>${def?.title ?? (s.phase === 'safeRoom' ? 'Stillwater Sanctuary' : 'The Gathering Hall')}</h1><p>${def?.subtitle ?? (s.phase === 'safeRoom' ? 'A quiet place, well earned.' : 'Even the bravest souls need good company.')}</p></div><div class="stage-badge">${icon(dungeon ? 'sword' : 'shield', 12)} ${dungeon ? 'EXPLORATION' : 'NO ENEMIES HERE'}</div><div class="touch-controls"><div class="dpad"><button data-dir="0,-1" aria-label="Move north">↑</button><button data-dir="-1,0" aria-label="Move west">←</button><button data-dir="0,1" aria-label="Move south">↓</button><button data-dir="1,0" aria-label="Move east">→</button></div>${dungeon ? `<button class="sneak-toggle ${this.sneak ? 'on' : ''}" data-action="sneak">Sneak</button>` : ''}</div>${s.phase === 'safeRoom' ? `<div class="safe-banner">${icon('compass', 32)}<span class="eyebrow" style="display:block;margin-top:14px">Checkpoint reached</span><h2>A moment of stillness.</h2><p>Your gold is banked. Your company has returned home. The way here will always be open.</p></div>` : ''}`,
    );
    stage.querySelectorAll<HTMLElement>('[data-dir]').forEach((button) => {
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const [dx, dz] = button.dataset.dir!.split(',').map(Number);
        this.path = [];
        this.keyboard.held.add(dx === 1 ? 'd' : dx === -1 ? 'a' : dz === 1 ? 's' : 'w');
        button.setPointerCapture(e.pointerId);
      });
      const release = () => this.keyboard.held.clear();
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
    });
    this.root.querySelector('#stage-footer')!.innerHTML =
      `<div class="key-hints"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move <span>·</span><kbd>E</kbd> interact ${dungeon ? '<span>·</span><kbd>Shift</kbd> sneak' : ''}</div><span class="floor-description muted" style="font-size:10px">${dungeon ? 'Tap the floor to move. Touch a patrol to fight.' : 'Tap an adventurer to meet them. Tap the floor to wander.'}</span><button data-action="${dungeon ? 'journal' : 'roster'}">${icon(dungeon ? 'book' : 'companion', 14)} ${dungeon ? 'Journal' : 'Companions'}</button>`;
    this.renderInteraction();
  }
  private updateWorld() {
    this.world?.setState(this.state, this.hubPosition);
  }
  private renderInteraction() {
    const stage = this.root.querySelector('#stage');
    if (!stage) return;
    stage.querySelector('.interaction')?.remove();
    if (this.state.phase === 'combat') return;
    const label = this.nearbyLabel();
    if (label)
      stage.insertAdjacentHTML(
        'beforeend',
        `<button class="interaction" data-action="interact">${icon('compass', 15)} ${label} <kbd>E</kbd></button>`,
      );
  }
  private nearbyLabel(): string | undefined {
    const s = this.state;
    if (s.phase === 'floor') {
      const def = getFloor(s.floor.id),
        p = s.floor.position;
      if (distance(p, def.stairs) <= 1.1)
        return isSolved(s.floor.puzzle)
          ? 'Descend to the next floor'
          : 'Stairs sealed • solve the puzzle';
      if (distance(p, def.clue) <= 1.5) return 'Read the rune tablet';
      const i = def.puzzlePoints.findIndex((pt) => distance(p, pt) <= 1.5);
      if (i >= 0) {
        if (s.floor.puzzle.type === 'levers') return `Pull ${['Sun', 'Moon', 'Star'][i]} lever`;
        if (s.floor.puzzle.type === 'braziers') return `Toggle brazier ${i + 1}`;
        if (s.floor.puzzle.type === 'key')
          return s.floor.puzzle.guardDefeated
            ? 'Collect the brass key'
            : 'The Warden guards this key';
      }
    } else if (s.phase === 'hub') {
      if (distance(this.hubPosition, { x: 17, z: 10 }) < 2) return 'Begin the descent';
      if (distance(this.hubPosition, { x: 17, z: 2 }) < 2)
        return s.progress.unlockedPortals.includes(5)
          ? 'Travel to sanctuary'
          : 'Sanctuary portal • not yet unlocked';
      const nearest = this.nearestGhost();
      if (nearest) return `Meet ${nearest.character.name}`;
    } else if (s.phase === 'safeRoom') return 'Return to the Gathering Hall';
    return undefined;
  }
  private nearestGhost(): Ghost | undefined {
    if (!this.world) return;
    return GHOSTS.filter((g) => !g.community).find(
      (_, i) => distance(this.hubPosition, this.world!.ghostPoint(i, this.time)) < 1.8,
    );
  }
  private interact() {
    if (this.modal || this.state.phase === 'combat' || this.state.phase === 'classSelect') return;
    const s = this.state;
    if (s.phase === 'hub') {
      if (distance(this.hubPosition, { x: 17, z: 10 }) < 2) {
        this.depart();
        return;
      }
      if (distance(this.hubPosition, { x: 17, z: 2 }) < 2) {
        if (s.progress.unlockedPortals.includes(5)) this.dispatch({ type: 'portal' });
        else this.toast('Reach floor 5 to awaken this portal.');
        return;
      }
      const g = this.nearestGhost();
      if (g) this.openGhost(g.id);
      return;
    }
    if (s.phase === 'safeRoom') {
      this.dispatch({ type: 'portal' });
      return;
    }
    const def = getFloor(s.floor.id);
    if (distance(s.floor.position, def.clue) <= 1.5) {
      this.dispatch({ type: 'interact' });
      this.openJournal();
      return;
    }
    const index = def.puzzlePoints.findIndex((p) => distance(s.floor.position, p) <= 1.5);
    if (index >= 0 && s.floor.puzzle.type === 'levers') {
      this.dispatch({ type: 'puzzle', action: { type: 'lever', index } });
      this.toast(
        this.state.phase === 'floor' && isSolved(this.state.floor.puzzle)
          ? 'The seal opens. Find the green stairs.'
          : 'The lever clicks. Check your journal for rune order.',
      );
      return;
    }
    if (index >= 0 && s.floor.puzzle.type === 'braziers') {
      this.dispatch({ type: 'puzzle', action: { type: 'brazier', index } });
      return;
    }
    if (distance(s.floor.position, def.stairs) <= 1.1 && !isSolved(s.floor.puzzle)) {
      this.toast('These stairs are sealed. Solve the floor puzzle first.');
      return;
    }
    this.dispatch({ type: 'interact' });
  }
  private depart() {
    if (this.state.phase !== 'hub') return;
    const chars = [
      this.state.progress.player,
      ...this.state.progress.hires.map((g) => g.character),
    ];
    const roles = chars.map((c) => CLASSES[c.classId].role);
    if (chars.length < 4 || !roles.includes('healer') || !roles.includes('tank')) {
      this.openModal(
        `<span class="eyebrow">A word before you go</span><h2>Company helps.</h2><p class="muted">A full party with a tank and healer has the best chance below. You can still venture out as you are.</p><div class="modal-actions"><button data-action="roster">Find companions</button><button class="primary" data-action="confirm-depart">Descend anyway ${icon('arrow', 15)}</button></div>`,
      );
      return;
    }
    this.dispatch({ type: 'startRun' });
  }
  private worldClick(click: WorldClick) {
    if (this.modal || this.state.phase === 'combat') return;
    if (click.kind === 'ghost') {
      this.openGhost(click.id);
      return;
    }
    if (click.kind === 'interact') {
      this.interact();
      return;
    }
    const goal = click.point;
    this.path = this.findPath(goal);
    if (!this.path.length && this.state.phase === 'floor') {
      const def = getFloor(this.state.floor.id);
      if (
        [def.clue, def.stairs, ...def.puzzlePoints].some(
          (p) => p.x === Math.round(goal.x) && p.z === Math.round(goal.z),
        ) &&
        distance(this.state.floor.position, goal) <= 1.5
      )
        this.interact();
    }
  }
  private findPath(goal: Point): Point[] {
    const s = this.state;
    if (s.phase === 'classSelect' || s.phase === 'combat') return [];
    const position = s.phase === 'floor' ? s.floor.position : this.hubPosition;
    const start = { x: Math.round(position.x), z: Math.round(position.z) };
    const destination = goal;
    goal = { x: Math.round(goal.x), z: Math.round(goal.z) };
    const def = s.phase === 'floor' ? getFloor(s.floor.id) : undefined;
    const pass = (p: Point) =>
      p.x >= 1 &&
      p.x <= 19 &&
      p.z >= 1 &&
      p.z <= 11 &&
      (def && s.phase === 'floor' ? canOccupy(def, s.floor, p) : true);
    const interactable =
      def &&
      ((def.stairs.x === goal.x && def.stairs.z === goal.z) ||
        def.puzzlePoints.some((p) => p.x === goal.x && p.z === goal.z));
    const key = (p: Point) => `${p.x},${p.z}`;
    const queue = [start];
    const previous = new Map<string, Point | undefined>([[key(start), undefined]]);
    let end: Point | undefined;
    for (let n = 0; n < queue.length; n++) {
      const p = queue[n];
      if (
        (p.x === goal.x && p.z === goal.z) ||
        (!pass(goal) && interactable && distance(p, goal) <= 1)
      ) {
        end = p;
        break;
      }
      for (const [dx, dz] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]) {
        const q = { x: p.x + dx, z: p.z + dz };
        if (pass(q) && !previous.has(key(q))) {
          queue.push(q);
          previous.set(key(q), p);
        }
      }
    }
    if (!end) return [];
    const path: Point[] = [];
    while (end && key(end) !== key(start)) {
      path.unshift(end);
      end = previous.get(key(end));
    }
    if (distance(position, start) > 0.001) path.unshift(start);
    if (pass(goal) && pass(destination)) path.push(destination);
    // Pull a route taut across open space, retaining clearance at corridor corners.
    const clear = (a: Point, b: Point) => {
      const steps = Math.ceil(distance(a, b) / 0.1);
      for (let i = 1; i <= steps; i++) {
        const p = { x: a.x + ((b.x - a.x) * i) / steps, z: a.z + ((b.z - a.z) * i) / steps };
        if (!pass(p) || (def && s.phase === 'floor' && !canOccupy(def, s.floor, p))) return false;
      }
      return true;
    };
    const smooth: Point[] = [];
    let from = position;
    for (let i = 0; i < path.length; ) {
      let farthest = i;
      for (let j = i; j < path.length; j++) if (clear(from, path[j])) farthest = j;
      smooth.push(path[farthest]);
      from = path[farthest];
      i = farthest + 1;
    }
    return smooth;
  }
  private move(dx: number, dz: number) {
    if (this.modal || this.state.phase === 'combat' || this.state.phase === 'classSelect') return;
    if (this.state.phase === 'floor') {
      this.dispatch({ type: 'move', dx, dz, sneak: this.isSneaking() });
      return;
    }
    const p = { x: this.hubPosition.x + dx, z: this.hubPosition.z + dz };
    const next = {
      x: Math.max(0.75, Math.min(19.25, p.x)),
      z: Math.max(0.75, Math.min(11.25, p.z)),
    };
    if (distance(next, this.hubPosition) > 0) {
      this.hubPosition = next;
      this.updateWorld();
      this.renderInteraction();
    }
  }
  private isSneaking() {
    return this.sneak || this.keyboard.held.has('shift');
  }
  private frame(ms: number) {
    this.time = ms / 1000;
    const delta = this.lastFrame ? Math.min((ms - this.lastFrame) / 1000, 0.05) : 0;
    this.lastFrame = ms;
    if (!this.paused && !this.modal) {
      this.motionTime += delta;
      while (this.motionTime >= 1 / 60) {
        this.motionTime -= 1 / 60;
        const step = (this.isSneaking() ? 2.5 : 4.5) / 60;
        const direction = this.keyboard.direction();
        if (direction) {
          this.path = [];
          this.move(direction[0] * step, direction[1] * step);
        } else if (this.path.length) {
          const current =
            this.state.phase === 'floor' ? this.state.floor.position : this.hubPosition;
          const next = this.path[0];
          const remaining = distance(current, next);
          if (remaining > 0.001) {
            const amount = Math.min(step, remaining) / remaining;
            this.move((next.x - current.x) * amount, (next.z - current.z) * amount);
          }
          const after = this.state.phase === 'floor' ? this.state.floor.position : this.hubPosition;
          if (distance(after, next) < 0.001) {
            this.path.shift();
            if (!this.path.length) this.interact();
          } else if (distance(current, after) < 0.00001) this.path = [];
        }
      }
      if (this.state.phase === 'floor' && ms - this.lastTick >= 100) {
        this.dispatch({ type: 'tick', sneak: this.isSneaking() });
        this.lastTick = ms;
      }
      if (
        this.state.phase === 'combat' &&
        !activeFighter(this.state.combat).player &&
        ms - this.lastAI >= 800
      ) {
        this.dispatch({ type: 'aiTurn' });
        this.lastAI = ms;
      }
    } else this.motionTime = 0;
    this.world?.animate(this.time);
    requestAnimationFrame((t) => this.frame(t));
  }
  private openModal(html: string) {
    this.closeModal();
    this.path = [];
    this.keyboard.held.clear();
    this.modal = document.createElement('div');
    this.modal.className = 'modal-backdrop';
    this.modal.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-label="Dungeon Delver"><div class="modal-header"><span class="eyebrow">Dungeon Delver</span><button data-action="close" class="subtle" aria-label="Close dialog">${icon('close', 18)}</button></div>${html}</section>`;
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.closeModal();
        return;
      }
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (target) this.handle(target);
    });
    document.body.append(this.modal);
    this.modal.querySelector<HTMLElement>('button')?.focus();
    this.modal.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const items = [
        ...this.modal!.querySelectorAll<HTMLElement>('button:not(:disabled),input,select'),
      ];
      if (e.shiftKey && document.activeElement === items[0]) {
        e.preventDefault();
        items.at(-1)?.focus();
      } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
        e.preventDefault();
        items[0]?.focus();
      }
    });
  }
  private closeModal() {
    this.modal?.remove();
    this.modal = undefined;
    this.keyboard?.held.clear();
  }
  private openGhost(id: string) {
    const g = GHOSTS.find((g) => g.id === id);
    if (!g || this.state.phase === 'classSelect') return;
    const stats = deriveStats(g.character, 1);
    const hired = this.state.progress.hires.some((h) => h.id === id);
    const full = this.state.progress.hires.length >= 3;
    const canHire =
      this.state.phase === 'hub' && !hired && !full && this.state.progress.gold >= g.price;
    this.openModal(
      `<div class="ghost-title">${avatar(g.character.classId)}<div><span class="eyebrow">${g.community ? 'Community companion' : `Offline snapshot of @${esc(g.character.name.toLowerCase())}`}</span><h2>${g.character.name}</h2><small>${CLASSES[g.character.classId].name} · ${g.style}</small></div></div><blockquote>“${g.dialogue}”</blockquote><div class="stat-grid">${[
        ['HP', stats.hp],
        ['ATK', stats.atk],
        ['DEF', stats.def],
        ['Runs', g.runs],
        ['Revives', g.revives],
        ['Deepest floor', g.deepestFloor],
      ]
        .map(([label, value]) => `<div><strong>${value}</strong>${label}</div>`)
        .join('')}</div><h3>What they bring</h3><div class="gear-list">${equipment(
        g.character.loadout,
      )
        .map(
          (i) =>
            `<div class="gear-row"><strong>${i.name}</strong><small>${i.description}</small></div>`,
        )
        .join(
          '',
        )}</div><div class="modal-actions"><span class="gold">${icon('coin', 18)} ${g.price} gold <small>up front</small></span><button class="primary" data-action="hire" data-id="${g.id}" ${canHire ? '' : 'disabled'}>${hired ? 'Already in party' : full ? 'Party is full' : this.state.progress.gold < g.price ? 'Not enough gold' : this.state.phase !== 'hub' ? 'Hire in the hub' : 'Hire companion'} ${icon('arrow', 16)}</button></div>`,
    );
  }
  private openRoster() {
    if (this.state.phase === 'classSelect') return;
    const hires = this.state.progress.hires;
    this.openModal(
      `<span class="eyebrow">A companion for every journey</span><h2>Find your company.</h2><p class="muted">Real character. Borrowed courage. Fees are paid up front; companions stay for one run.</p><h3>Wandering adventurers</h3><div class="roster">${GHOSTS.filter(
        (g) => !g.community,
      )
        .map((g) => this.rosterRow(g, hires))
        .join(
          '',
        )}</div><h3>Community companions</h3><p class="muted">Simple tactics, a small price. Two companions of every role, always available.</p><div class="roster">${GHOSTS.filter(
        (g) => g.community,
      )
        .map((g) => this.rosterRow(g, hires))
        .join('')}</div>`,
    );
  }
  private rosterRow(g: Ghost, hires: Ghost[]) {
    return `<button data-action="ghost" data-id="${g.id}"><span>${g.character.name}<small>${CLASSES[g.character.classId].name} · ${g.style}</small></span><span class="gold">${hires.some((h) => h.id === g.id) ? icon('check', 16) : `${g.price} ${icon('coin', 13)}`}</span></button>`;
  }
  private openLoadout() {
    if (this.state.phase !== 'hub') return;
    const c = this.state.progress.player;
    this.openModal(
      `<span class="eyebrow">Prepared for the depths</span><h2>Your loadout.</h2><p class="muted">Choose one item in each slot. Equipment and class can only change in the hub.</p><label for="class-change" class="eyebrow">Calling</label><select id="class-change">${CLASS_IDS.map((id) => `<option value="${id}" ${id === c.classId ? 'selected' : ''}>${CLASSES[id].name}</option>`).join('')}</select>${SLOTS.map(
        (slot) =>
          `<h3>${slot === 'offhand' ? 'Off-hand' : slot[0].toUpperCase() + slot.slice(1)}</h3><div class="gear-options">${ITEMS.filter(
            (i) => i.classId === c.classId && i.slot === slot,
          )
            .map(
              (i) =>
                `<button class="gear-option ${c.loadout[slot] === i.id ? 'selected' : ''}" data-action="equip" data-id="${i.id}"><strong>${i.name}</strong><small>${i.description}</small></button>`,
            )
            .join('')}</div>`,
      ).join(
        '',
      )}<button class="primary wide" data-action="close">Ready for adventure ${icon('check', 15)}</button>`,
    );
    this.modal!.querySelector<HTMLSelectElement>('#class-change')!.addEventListener(
      'change',
      (e) => {
        this.dispatch({
          type: 'changeClass',
          classId: (e.target as HTMLSelectElement).value as ClassId,
        });
        this.openLoadout();
      },
    );
  }
  private openJournal() {
    const s = this.state;
    if (s.phase !== 'floor' && s.phase !== 'combat') return;
    const def = getFloor(s.floor.id);
    this.openModal(
      `<span class="eyebrow">Floor ${def.id} · Field notes</span><h2>${def.title}</h2><p>${this.puzzleDescription()}</p><div class="notice">${s.floor.clueRead ? def.hint : 'A rune tablet is marked by a pale blue stone on your map. Walk up to it and interact to read the clue.'}</div><p class="muted" style="margin-top:18px">${s.floor.puzzle.type === 'levers' ? `Lever order entered: ${s.floor.puzzle.progress} / 3. Sun, Moon and Star are arranged from west to east.` : s.floor.puzzle.type === 'braziers' ? 'Braziers are numbered from west to east, then north: 1 through 5.' : s.floor.puzzle.type === 'plates' ? 'Stand behind a block and move toward it to push. You can reset the stones if they get stuck.' : 'The key pedestal is in the Warden’s northern chamber.'}</p>${s.floor.puzzle.type === 'plates' ? '<button data-action="restart-puzzle">Reset stones to starting positions</button>' : ''}<div class="divider"></div><p class="muted">Hold Shift or toggle Sneak to reduce detection. Shadow Cloak reduces detection a further 40%. Tap the floor to walk; enemies may interrupt.</p><button class="primary wide" data-action="close">Back to the expedition ${icon('arrow', 15)}</button>`,
    );
  }
  private renderCombat() {
    const stage = this.root.querySelector('#stage');
    stage?.querySelector('.combat-overlay')?.remove();
    const s = this.state;
    if (s.phase !== 'combat' || !stage) return;
    const c = s.combat,
      actor = activeFighter(c),
      isPlayer = actor.player;
    const enemies = c.fighters.filter((f) => f.team === 'enemy' && f.hp > 0);
    if (!c.fighters.some((f) => f.hp > 0 && f.id === this.selectedTarget))
      this.selectedTarget = enemies[0]?.id ?? '';
    const fighterHtml = (f: Fighter) =>
      `<button class="fighter ${actor.id === f.id ? 'active' : ''} ${f.hp <= 0 ? 'dead' : ''} ${this.selectedTarget === f.id ? 'targeted' : ''}" data-action="target" data-id="${f.id}" ${f.hp <= 0 ? 'disabled' : ''}>${f.team === 'enemy' ? `<span class="avatar hostile-avatar"><img src="${(enemyTexture(Object.keys(ENEMIES).find((type) => ENEMIES[type].name === f.name) ?? 'cultist').image as HTMLCanvasElement).toDataURL()}" alt=""></span>` : avatar(f.classId)}<div class="fighter-info"><strong>${esc(f.name)} ${f.boss ? '♛' : ''}${f.player ? ' · YOU' : ''}</strong><div class="bar"><span style="width:${(f.hp / f.stats.hp) * 100}%"></span></div><small>${f.hp} / ${f.stats.hp} HP</small><div class="bar mp"><span style="width:${f.stats.mp ? (f.mp / f.stats.mp) * 100 : 0}%"></span></div><small>${f.mp} MP ${f.defending ? '· Guarding' : ''}${f.tauntTurns ? '· Taunting' : ''}</small></div></button>`;
    stage.insertAdjacentHTML(
      'beforeend',
      `<section class="combat-overlay" aria-label="Combat"><div class="combat-heading"><div><span class="eyebrow">Floor ${s.floor.id} · Encounter</span><h2>${c.fighters.some((f) => f.boss) ? 'The Key Warden' : 'Stand together.'}</h2></div><span class="pill">ROUND ${c.round}</span></div><div class="turn-banner">${icon('sword', 14)} ${isPlayer ? 'Your turn. Choose an action and a target.' : `${esc(actor.name)} is acting…`}</div><div class="combatants"><div class="combat-team">${c.fighters
        .filter((f) => f.team === 'party')
        .map(fighterHtml)
        .join('')}</div><div class="combat-team enemy-team">${c.fighters
        .filter((f) => f.team === 'enemy')
        .map(fighterHtml)
        .join('')}</div></div><div class="combat-log" aria-live="polite">${c.messages
        .slice(-5)
        .map((m) => `<p>${esc(m)}</p>`)
        .join(
          '',
        )}</div><div class="combat-menu"><button class="primary" data-action="attack" ${isPlayer ? '' : 'disabled'}>${icon('sword', 14)} Attack</button><button data-action="skill" ${isPlayer && actor.mp >= CLASSES[actor.classId].cost ? '' : 'disabled'}>${CLASSES[s.progress.player.classId].skill} · ${CLASSES[s.progress.player.classId].cost}</button><button data-action="potion" ${isPlayer && c.resources.potions > 0 ? '' : 'disabled'}>Potion (${c.resources.potions})</button><button data-action="defend" ${isPlayer ? '' : 'disabled'}>${icon('shield', 14)} Defend</button><button data-action="flee" ${isPlayer ? '' : 'disabled'}>Flee</button></div><small style="font-size:9px">Select an enemy for attacks, or an ally for Mend and potions. Flee: 50%, or guaranteed with an unused Smoke Bomb.</small></section>`,
    );
  }
  private combatAction(type: Action['type']) {
    const s = this.state;
    if (s.phase !== 'combat' || !activeFighter(s.combat).player) return;
    const actor = activeFighter(s.combat);
    let action: Action;
    if (type === 'defend' || type === 'flee') action = { type };
    else {
      const friendly = type === 'item' || (type === 'skill' && actor.classId === 'cleric');
      const selected = s.combat.fighters.find(
        (f) =>
          f.id === this.selectedTarget && f.hp > 0 && f.team === (friendly ? 'party' : 'enemy'),
      );
      const fallback = s.combat.fighters
        .filter((f) => f.hp > 0 && f.team === (friendly ? 'party' : 'enemy'))
        .sort((a, b) => (friendly ? a.hp / a.stats.hp - b.hp / b.stats.hp : a.hp - b.hp))[0];
      const target = selected ?? fallback;
      if (!target) return;
      if (type === 'item' && target.hp === target.stats.hp) {
        this.toast('Choose an injured ally for the potion.');
        return;
      }
      action = { type, target: target.id };
    }
    this.dispatch({ type: 'combat', action });
    this.lastAI = performance.now();
  }
  private handle(el: HTMLElement) {
    const id = el.dataset.id ?? '';
    switch (el.dataset.action) {
      case 'select-class':
        this.selectedClass = id as ClassId;
        this.renderClassSelect();
        break;
      case 'close':
        this.closeModal();
        break;
      case 'settings':
        this.openSettings();
        break;
      case 'request-reset':
        this.confirmReset();
        break;
      case 'confirm-reset':
        void this.resetGame();
        break;
      case 'roster':
        this.openRoster();
        break;
      case 'ghost':
        this.openGhost(id);
        break;
      case 'hire':
        this.dispatch({ type: 'hire', ghostId: id });
        this.closeModal();
        this.toast('A new adventurer joins your company.');
        break;
      case 'dismiss':
        this.dispatch({ type: 'dismiss', ghostId: id });
        this.toast('Companion dismissed. Hire fees are not refunded.');
        break;
      case 'loadout':
        this.openLoadout();
        break;
      case 'equip':
        this.dispatch({ type: 'equip', itemId: id });
        this.openLoadout();
        break;
      case 'depart':
        this.depart();
        break;
      case 'confirm-depart':
        this.closeModal();
        this.dispatch({ type: 'startRun' });
        break;
      case 'portal':
        this.closeModal();
        this.dispatch({ type: 'portal' });
        break;
      case 'interact':
        this.interact();
        break;
      case 'journal':
        this.openJournal();
        break;
      case 'restart-puzzle':
        this.dispatch({ type: 'puzzle', action: { type: 'restart' } });
        this.closeModal();
        this.toast('The stones return to their original positions.');
        break;
      case 'sneak':
        this.sneak = !this.sneak;
        el.classList.toggle('on', this.sneak);
        break;
      case 'target':
        this.selectedTarget = id;
        this.renderCombat();
        break;
      case 'attack':
        this.combatAction('attack');
        break;
      case 'skill':
        this.combatAction('skill');
        break;
      case 'potion':
        this.combatAction('item');
        break;
      case 'defend':
        this.combatAction('defend');
        break;
      case 'flee':
        this.combatAction('flee');
        break;
    }
  }
  private openSettings() {
    this.openModal(
      `<span class="eyebrow">Around the campfire</span><h2>Take your time.</h2><p class="muted">Your expedition is paused while a dialog is open. Move with WASD or arrows, interact with E or Enter, and hold Shift to sneak. On touch screens, tap the floor or use the arrows.</p><p class="muted">Hire fees are paid up front. A wipe keeps XP and banked gold, loses unbanked gold, and dismisses companions.</p><button class="primary wide" data-action="close">Continue expedition ${icon('arrow', 15)}</button><div class="divider"></div><button class="wide" data-action="request-reset">Reset Game</button><small style="display:block;margin-top:9px">Deletes this device’s character, progress and combat logs.</small>`,
    );
  }
  private scheduleSave() {
    if (this.saveBlocked || this.resetting || this.state.phase === 'classSelect' || this.saveTimer)
      return;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = 0;
      this.saveNow();
    }, 750);
  }
  private saveNow() {
    if (this.saveBlocked || this.resetting || this.state.phase === 'classSelect') return;
    clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    const data = {
      version: 1 as const,
      state: JSON.parse(JSON.stringify(this.state)) as GameState,
    };
    this.saveQueue = this.saveQueue
      .then(() => this.storage.save(data))
      .then(() => this.showSaveStatus())
      .catch((error: unknown) => {
        this.saveBlocked = true;
        this.showSaveStatus();
        this.toast(
          `Saving unavailable: ${error instanceof Error ? error.message : 'storage error'}. Your game continues in memory.`,
        );
      });
  }
  private showSaveStatus() {
    const el = this.root.querySelector('#save-status');
    if (el) el.textContent = this.saveBlocked ? 'Not saving' : 'Saved on this device';
  }
  private confirmReset() {
    this.openModal(
      `<span class="eyebrow">Start over</span><h2>Reset your journey?</h2><p class="muted">This permanently deletes your character, gold, XP, unlocked portals and decision logs on this device. You will return to class select.</p><div class="modal-actions"><button data-action="close">Keep my journey</button><button class="primary" data-action="confirm-reset">Yes, reset game</button></div>`,
    );
  }
  private async resetGame() {
    this.resetting = true;
    clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    await this.saveQueue;
    try {
      await this.storage.clear();
      this.closeModal();
      this.saveBlocked = false;
      this.state = transition(this.state, { type: 'reset' });
      this.path = [];
      this.hubPosition = { x: 10, z: 10 };
      this.render();
      this.toast('Game reset. A new journey awaits.');
    } catch (error) {
      this.toast(
        `Could not delete the save: ${error instanceof Error ? error.message : 'storage error'}. Your current journey is preserved.`,
      );
    } finally {
      this.resetting = false;
    }
  }
  private toast(message: string) {
    document.querySelector('.toast')?.remove();
    clearTimeout(this.toastTimer);
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    document.body.append(toast);
    this.toastTimer = window.setTimeout(() => toast.remove(), 4500);
  }
}
