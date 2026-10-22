import {
  CLASSES,
  ENEMIES,
  CLASS_IDS,
  GHOSTS,
  RACE_IDS,
  SEX_IDS,
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
import type {
  GameState,
  GameCommand,
  ClassId,
  Point,
  Ghost,
  Fighter,
  Action,
  Race,
  Sex,
  Character,
} from '@delver/rules';
import { World } from './scene/world';
import type { Storage } from './storage/storage';
import type { WorldClick } from './scene/world';
import { enemyTexture } from './scene/sprites';
import { Keyboard } from './input/keyboard';
import { CombatStage } from './ui/combat-stage';
import { Minimap } from './ui/minimap';
import { icon, escapeHtml as esc } from './ui/icons';
import { HALL, HALL_MAP, hallRoomAt } from './scene/hall';
import { canStand, moveOnGrid } from './scene/grid';
import { lookById } from './scene/cast';
import { characterLook, defaultLook, lookImage, lookPortrait, pumpDolls } from './paperdoll/looks';
import type { Look } from './paperdoll/looks';
import { GAME_CLASS_LOOK, RACES, SEXES } from './paperdoll/model';
import { RETURN_KEY } from './paperdoll/wardrobe';
const avatarLook = (look: Look, classId: ClassId) =>
  `<span class="avatar portrait" style="--class-color:${CLASSES[classId].color}"><img src="${lookPortrait(look)}" alt=""></span>`;
const characterAvatar = (c: Pick<Character, 'id' | 'classId' | 'appearance'>, player: boolean) =>
  avatarLook(player ? characterLook(c, true) : lookById(c.id, c.classId), c.classId);
const classCopy: Record<ClassId, string> = {
  knight: 'Hold the line. Protect your party with steel and stubborn resolve.',
  cleric: 'Keep hope alive. Mend your allies and bring everyone home.',
  rogue: 'Strike first. Slip past danger, or cut straight through it.',
};
export class Controller {
  state: GameState = { phase: 'classSelect' };
  private selectedClass: ClassId = 'knight';
  private selectedRace: Race = 'human';
  private selectedSex: Sex = 'F';
  private world?: World;
  private keyboard: Keyboard;
  private hubPosition: Point = { ...HALL.spawn };
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
  private queuedAction?: Action;
  private combatStage?: CombatStage;
  private minimap = new Minimap();
  private hudCollapsed = false;
  private bannerTimer = 0;
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
    try {
      if (sessionStorage.getItem(RETURN_KEY) === 'changing')
        this.hubPosition = { ...HALL.changingReturn };
      sessionStorage.removeItem(RETURN_KEY);
    } catch {
      // Session storage is only a convenience here.
    }
    this.keyboard = new Keyboard(
      () => this.interact(),
      () => this.closeModal(),
      () => {
        if (this.state.phase === 'classSelect' || this.modal) return;
        this.hudCollapsed = !this.hudCollapsed;
        this.renderLeft();
      },
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
    if (previous.phase === 'combat' && this.state.phase === 'combat' && this.combatStage)
      this.combatStage.update(previous.combat, this.state.combat);
    if (this.state.phase !== 'combat') this.combatStage = undefined;
    if (command.type === 'startRun') {
      this.path = [];
      this.minimap.reset();
      this.toast('Your expedition begins. Keep a healer close.');
    }
    if (previous.phase === 'combat' && this.state.phase !== 'combat') {
      this.selectedTarget = '';
      this.queuedAction = undefined;
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
      this.hubPosition = { ...HALL.sanctuaryReturn };
    }
    if (!lightweight || previous.phase !== this.state.phase) this.render();
    else {
      this.updateWorld();
      if (performance.now() - this.lastMap > 150) {
        this.updateMinimap();
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
      this.root.innerHTML = `<div class="shell hud-shell"><header class="topbar"><div class="brand">${icon('compass')}<span>Dungeon <em>Delver</em></span></div><div class="location"><span>The expedition</span><span>/</span><span id="location-name">The Gathering Hall</span></div><div class="top-actions"><span id="gold" class="gold"></span><span class="save-status" id="save-status">Offline adventure</span><button class="subtle" data-action="settings" aria-label="Settings">${icon('gear')}</button></div></header><div class="game-layout"><section class="stage-wrap"><div class="stage" id="stage"></div><aside class="hud hud-left" id="left" aria-label="Expedition"></aside><aside class="hud hud-right" id="right" aria-label="Your company"></aside><div class="stage-footer" id="stage-footer"></div></section></div></div>`;
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
        ? `The Gathering Hall · ${hallRoomAt(this.hubPosition)?.name ?? 'Passage'}`
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
        const image = lookImage(
          {
            ...defaultLook(this.selectedRace, this.selectedSex, GAME_CLASS_LOOK[id]),
            custom: true,
          },
          'idle',
          7,
        );
        return `<button class="class-card ${this.selectedClass === id ? 'selected' : ''}" data-action="select-class" data-id="${id}" style="--class-color:${c.color}" aria-pressed="${this.selectedClass === id}"><div class="class-art"><img class="pixel-art" src="${image}" alt="${RACES[this.selectedRace].label} ${c.name}"><span class="selection-mark">${this.selectedClass === id ? icon('check', 13) : ''}</span></div><div class="class-card-body"><span class="eyebrow" style="color:${c.color}">${c.role === 'dps' ? 'Damage dealer' : c.role}</span><h2>${c.name}</h2><p>${classCopy[id]}</p><div class="class-skill">${icon(id === 'knight' ? 'shield' : id === 'cleric' ? 'heart' : 'sword', 15)} ${c.skill}<span class="muted">· ${c.cost} MP</span></div></div></button>`;
      },
    ).join(
      '',
    )}</div><div class="body-picker"><div role="group" aria-label="Race"><span class="eyebrow">Race</span>${RACE_IDS.map((r) => `<button type="button" class="chip ${this.selectedRace === r ? 'selected' : ''}" data-action="select-race" data-id="${r}" aria-pressed="${this.selectedRace === r}">${RACES[r].label}</button>`).join('')}</div><div role="group" aria-label="Sex"><span class="eyebrow">Sex</span>${SEX_IDS.map((x) => `<button type="button" class="chip ${this.selectedSex === x ? 'selected' : ''}" data-action="select-sex" data-id="${x}" aria-pressed="${this.selectedSex === x}">${SEXES[x].label}</button>`).join('')}</div><a class="chip studio-link" href="studio.html">${icon('gear', 13)} Edit sprites in the Changing Room</a></div><form id="new-game" class="start-form"><div><label for="player-name">What should we call you?</label><input id="player-name" name="name" placeholder="Your adventurer’s name" maxlength="24" autocomplete="nickname" value="${esc(name)}" required></div><button class="primary" type="submit">Enter the Gathering Hall ${icon('arrow', 18)}</button></form><div class="class-bottom">${icon('companion', 15)} You control one hero. Your three companions have minds of their own.</div></section><footer><span>FIVE FLOORS. FOUR SOULS. ONE WAY DOWN.</span><span>Offline · Saved on this device</span></footer></div>`;
    this.root.querySelector('#new-game')!.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = this.root.querySelector<HTMLInputElement>('#player-name')!.value;
      this.dispatch({
        type: 'newGame',
        name,
        classId: this.selectedClass,
        seed: crypto.getRandomValues(new Uint32Array(1))[0],
        appearance: { race: this.selectedRace, sex: this.selectedSex },
      });
    });
  }
  /** Top-left card: where you are, what to do, how far along, and the map. */
  private renderLeft() {
    if (this.state.phase === 'classSelect') return;
    const s = this.state;
    const dungeon = s.phase === 'floor' || s.phase === 'combat';
    const def = dungeon ? getFloor(s.floor.id) : undefined;
    const deepest = dungeon
      ? `Deepest this run: ${Math.max(...Object.keys(s.run.floors).map(Number))}`
      : s.progress.unlockedPortals.includes(5)
        ? 'Sanctuary reached'
        : 'Not yet descended';
    const where =
      s.phase === 'hub'
        ? (hallRoomAt(this.hubPosition)?.name ?? 'Passage')
        : s.phase === 'safeRoom'
          ? 'Stillwater Sanctuary'
          : def!.title;
    const objective = dungeon
      ? this.puzzleDescription()
      : s.phase === 'safeRoom'
        ? 'You made it. Your checkpoint and hub portal are unlocked.'
        : 'Recruit up to three companions, check your loadout in the Armory, then take the stairs in the Descent.';
    const left = this.root.querySelector<HTMLElement>('#left')!;
    left.classList.toggle('collapsed', this.hudCollapsed);
    left.innerHTML = `<div class="hud-card"><div class="hud-floor"><span class="floor-pill">${dungeon ? `Floor ${s.floor.id}` : s.phase === 'safeRoom' ? 'Floor 5 · Safe' : 'Floor 0 · Hall'}</span><span>${deepest}</span><button class="subtle hud-toggle" data-action="toggle-hud" aria-expanded="${!this.hudCollapsed}" aria-label="${this.hudCollapsed ? 'Show map and objective' : 'Hide map and objective'}">${this.hudCollapsed ? '▾' : '▴'}</button></div><h1 id="hud-title">${esc(where)}</h1><div class="hud-body"><p class="hud-objective">${objective}</p>${dungeon ? `<div class="hud-progress">${this.puzzleProgress()}</div>` : ''}<canvas class="minimap" aria-label="${dungeon ? 'Floor map, revealed as you explore' : 'Hall map'}"></canvas></div></div>`;
    this.updateMinimap();
  }
  private updateMinimap() {
    if (this.state.phase === 'classSelect') return;
    const s = this.state;
    if (s.phase === 'floor' || s.phase === 'combat')
      this.minimap.reveal(s.floor.id, s.floor.position);
    const canvas = this.root.querySelector<HTMLCanvasElement>('#left .minimap');
    if (canvas && !this.hudCollapsed) this.minimap.draw(canvas, s, this.hubPosition);
  }
  /** Short progress chips for the floor puzzle. */
  private puzzleProgress() {
    const s = this.state;
    if (s.phase !== 'floor' && s.phase !== 'combat') return '';
    const p = s.floor.puzzle;
    const chip = (label: string, done: boolean) =>
      `<span class="chip ${done ? 'done' : ''}">${done ? icon('check', 11) : ''}${label}</span>`;
    if (p.type === 'plates') {
      const seated = p.plates.filter((q) =>
        p.blocks.some((b) => b.x === q.x && b.z === q.z),
      ).length;
      return chip(`Stones seated ${seated} / ${p.plates.length}`, seated === p.plates.length);
    }
    if (p.type === 'levers')
      return (
        chip(`Levers ${p.progress} / ${p.sequence.length}`, p.progress === p.sequence.length) +
        chip('Clue read', s.floor.clueRead)
      );
    if (p.type === 'braziers') {
      const lit = p.lit.filter(Boolean).length;
      return (
        chip(`Lit ${lit} / ${p.lit.length}`, lit === p.lit.length) +
        chip('Clue read', s.floor.clueRead)
      );
    }
    return chip('Warden defeated', p.guardDefeated) + chip('Key taken', p.collected);
  }
  private puzzleDescription() {
    const s = this.state;
    if (s.phase !== 'floor' && s.phase !== 'combat') return '';
    if (isSolved(s.floor.puzzle)) return 'The seal is broken. Find the green stairs and descend.';
    const p = s.floor.puzzle;
    return p.type === 'plates'
      ? `Push all ${p.blocks.length} stones in the vault onto the gold pressure plates.`
      : p.type === 'levers'
        ? `Find the rune tablet, then pull the ${p.sequence.length} levers in its order.`
        : p.type === 'braziers'
          ? `Light all ${p.lit.length} braziers. Each flame toggles the flames bound to it.`
          : 'Defeat the Key Warden, then collect the key from its pedestal.';
  }
  /** Bottom-right: party portraits with an open + per empty slot, and the actions for this place. */
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
    const members = characters
      .map((c, i) => {
        const fighter = party?.find((f) => f.id === c.id);
        const hp = fighter ? fighter.hp / fighter.stats.hp : 1;
        return `<div class="party-member ${i === 0 ? 'you' : ''} ${fighter && fighter.hp <= 0 ? 'down' : ''}" title="${esc(c.name)} · ${CLASSES[c.classId].name}${fighter ? ` · ${fighter.hp}/${fighter.stats.hp} HP` : ` · Level ${levelFromXp(c.xp)}`}">${characterAvatar(c, i === 0)}${i > 0 && s.phase === 'hub' ? `<button class="dismiss" data-action="dismiss" data-id="${c.id}" aria-label="Dismiss ${esc(c.name)}">${icon('close', 10)}</button>` : ''}<strong>${esc(c.name)}</strong><div class="bar"><span style="width:${hp * 100}%"></span></div><small>${fighter ? `${fighter.hp} HP` : `${CLASSES[c.classId].name} ${levelFromXp(c.xp)}`}</small></div>`;
      })
      .join('');
    const slots = Array.from(
      { length: 4 - characters.length },
      () =>
        `<button class="empty-slot" data-action="roster" aria-label="An open party slot" title="An open party slot"><span>+</span></button>`,
    ).join('');
    const actions =
      s.phase === 'hub'
        ? `<div class="composition"><span class="${roles.includes('tank') ? 'ready' : 'missing'}">${icon('shield', 12)} ${roles.includes('tank') ? 'Tank' : 'No tank'}</span><span class="${roles.includes('healer') ? 'ready' : 'missing'}">${icon('heart', 12)} ${roles.includes('healer') ? 'Healer' : 'No healer'}</span></div><button data-action="loadout">${icon('sword', 14)} Manage loadout</button><button data-action="roster">${icon('companion', 14)} Browse companions</button>${p.unlockedPortals.includes(5) ? `<button data-action="portal">${icon('compass', 14)} Sanctuary portal</button>` : ''}<button class="primary" data-action="depart">${icon('stairs', 15)} Begin descent</button>`
        : s.phase === 'safeRoom'
          ? `<button class="primary" data-action="portal">${icon('compass', 15)} Return to the hub</button>`
          : `<span class="supplies">${s.phase === 'combat' ? s.combat.resources.potions : s.run.resources.potions} potions · ${s.run.unbankedGold} gold</span><button data-action="journal">${icon('book', 14)} Floor journal</button>`;
    this.root.querySelector('#right')!.innerHTML =
      `<div class="party-list">${members}${slots}</div><div class="hud-actions">${actions}</div>`;
  }
  /** Names the hall room you just walked into. */
  private roomBanner(name: string) {
    const stage = this.root.querySelector('#stage');
    if (!stage) return;
    stage.querySelector('.room-banner')?.remove();
    stage.insertAdjacentHTML(
      'beforeend',
      `<div class="room-banner" role="status">${esc(name)}</div>`,
    );
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => stage.querySelector('.room-banner')?.remove(), 2400);
    const title = this.root.querySelector('#hud-title');
    if (title) title.textContent = name;
  }
  private renderStageChrome() {
    const s = this.state;
    if (s.phase === 'classSelect') return;
    const stage = this.root.querySelector('#stage')!;
    stage.querySelectorAll('.touch-controls,.safe-banner').forEach((e) => e.remove());
    const dungeon = s.phase === 'floor' || s.phase === 'combat';
    stage.insertAdjacentHTML(
      'beforeend',
      `<div class="touch-controls"><div class="dpad"><button data-dir="0,-1" aria-label="Move north">↑</button><button data-dir="-1,0" aria-label="Move west">←</button><button data-dir="0,1" aria-label="Move south">↓</button><button data-dir="1,0" aria-label="Move east">→</button></div>${dungeon ? `<button class="sneak-toggle ${this.sneak ? 'on' : ''}" data-action="sneak">Sneak</button>` : ''}</div>${s.phase === 'safeRoom' ? `<div class="safe-banner">${icon('compass', 32)}<span class="eyebrow" style="display:block;margin-top:14px">Checkpoint reached</span><h2>A moment of stillness.</h2><p>Your gold is banked. Your company has returned home. The way here will always be open.</p></div>` : ''}`,
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
      `<div class="key-hints"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move <span>·</span><kbd>E</kbd> interact ${dungeon ? '<span>·</span><kbd>Shift</kbd> sneak' : ''}<span>·</span><kbd>M</kbd> map <span>·</span> ${dungeon ? 'Tap the floor to move. Touch a patrol to fight.' : 'Tap an adventurer to meet them.'}</div>`;
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
        if (s.floor.puzzle.type === 'levers') return `Pull the ${def.puzzleLabels[i]} lever`;
        if (s.floor.puzzle.type === 'braziers') return `Toggle the ${def.puzzleLabels[i]} brazier`;
        if (s.floor.puzzle.type === 'key')
          return s.floor.puzzle.guardDefeated
            ? 'Collect the brass key'
            : 'The Warden guards this key';
      }
    } else if (s.phase === 'hub') {
      if (distance(this.hubPosition, HALL.stairs) < 2) return 'Begin the descent';
      if (distance(this.hubPosition, HALL.portal) < 2.2)
        return s.progress.unlockedPortals.includes(5)
          ? 'Travel to sanctuary'
          : 'Sanctuary portal • not yet unlocked';
      if (distance(this.hubPosition, HALL.wardrobe) < 2.4) return 'Enter the changing room';
      if (distance(this.hubPosition, HALL.armory) < 2.4) return 'Manage your loadout';
      const nearest = this.nearestGhost();
      if (nearest) return `Meet ${nearest.character.name}`;
    } else if (s.phase === 'safeRoom') return 'Return to the Gathering Hall';
    return undefined;
  }
  private nearestGhost(): Ghost | undefined {
    if (!this.world) return;
    return GHOSTS.filter((g) => !g.community).find((g) => {
      const at = this.world!.ghostPosition(g.id);
      return at && distance(this.hubPosition, at) < 1.8;
    });
  }
  private interact() {
    if (this.modal || this.state.phase === 'combat' || this.state.phase === 'classSelect') return;
    const s = this.state;
    if (s.phase === 'hub') {
      if (distance(this.hubPosition, HALL.stairs) < 2) {
        this.depart();
        return;
      }
      if (distance(this.hubPosition, HALL.wardrobe) < 2.4) {
        this.enterChangingRoom();
        return;
      }
      if (distance(this.hubPosition, HALL.armory) < 2.4) {
        this.openLoadout();
        return;
      }
      if (distance(this.hubPosition, HALL.portal) < 2.2) {
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
  /** Saves, then walks through the wardrobe into the Paper Doll Studio. */
  private enterChangingRoom() {
    this.saveNow();
    try {
      sessionStorage.setItem(RETURN_KEY, 'changing');
    } catch {
      // Without session storage the hall simply starts at the entrance.
    }
    void this.saveQueue.then(() => location.assign('studio.html'));
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
      def && s.phase === 'floor' ? canOccupy(def, s.floor, p) : canStand(HALL_MAP, p);
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
        if (!pass(p)) return false;
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
    const next = moveOnGrid(HALL_MAP, this.hubPosition, dx, dz);
    if (distance(next, this.hubPosition) > 0) {
      const room = hallRoomAt(this.hubPosition)?.name;
      this.hubPosition = next;
      this.updateWorld();
      this.renderInteraction();
      const entered = hallRoomAt(next)?.name;
      if (entered !== room && this.state.phase === 'hub') {
        this.root.querySelector('#location-name')!.textContent =
          `The Gathering Hall · ${entered ?? 'Passage'}`;
        if (entered) this.roomBanner(entered);
      }
      if (performance.now() - this.lastMap > 150) {
        this.updateMinimap();
        this.lastMap = performance.now();
      }
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
      if (
        this.state.phase === 'combat' &&
        activeFighter(this.state.combat).player &&
        this.queuedAction
      ) {
        const action = this.queuedAction;
        this.queuedAction = undefined;
        const previous = this.state;
        this.dispatch({ type: 'combat', action });
        this.lastAI = ms;
        if (this.state === previous) {
          this.renderCombat();
          this.toast('Queued action is no longer available. Choose another action.');
        }
      }
    } else this.motionTime = 0;
    if (this.world) this.world.animate(this.time);
    else pumpDolls();
    this.combatStage?.draw(delta);
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
      `<div class="ghost-title">${characterAvatar(g.character, false)}<div><span class="eyebrow">${g.community ? 'Community companion' : `Offline snapshot of @${esc(g.character.name.toLowerCase())}`}</span><h2>${g.character.name}</h2><small>${CLASSES[g.character.classId].name} · ${g.style}</small></div></div><blockquote>“${g.dialogue}”</blockquote><div class="stat-grid">${[
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
      `<span class="eyebrow">Floor ${def.id} · Field notes</span><h2>${def.title}</h2><p>${this.puzzleDescription()}</p><div class="notice">${s.floor.clueRead ? def.hint : 'A rune tablet is marked by a pale blue stone on your map. Walk up to it and interact to read the clue.'}</div><p class="muted" style="margin-top:18px">${s.floor.puzzle.type === 'levers' ? `Lever order entered: ${s.floor.puzzle.progress} / ${s.floor.puzzle.sequence.length}. ` : s.floor.puzzle.type === 'braziers' ? `Lit: ${s.floor.puzzle.lit.filter(Boolean).length} / ${s.floor.puzzle.lit.length}. ` : ''}${def.notes}</p>${s.floor.puzzle.type === 'plates' ? '<button data-action="restart-puzzle">Reset stones (you return to the vault door)</button>' : ''}<div class="divider"></div><p class="muted">Hold Shift or toggle Sneak to reduce detection. Shadow Cloak reduces detection a further 40%. Tap the floor to walk; enemies may interrupt.</p><button class="primary wide" data-action="close">Back to the expedition ${icon('arrow', 15)}</button>`,
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
    this.combatStage ??= new CombatStage(c, s.progress, s.floor.id, (id) => this.selectTarget(id));
    const player = c.fighters.find((f) => f.player)!;
    const button = (
      type: 'attack' | 'skill' | 'potion' | 'defend' | 'flee',
      label: string,
      disabled = false,
    ) => {
      const queued = this.queuedAction?.type === (type === 'potion' ? 'item' : type);
      return `<button class="${type === 'attack' ? 'primary' : ''} ${queued ? 'queued' : ''}" data-action="${type}" aria-pressed="${queued}" ${player.hp <= 0 || disabled ? 'disabled' : ''}>${label}</button>`;
    };
    const queued = this.queuedAction;
    const queuedName =
      queued?.type === 'skill'
        ? CLASSES[player.classId].skill
        : queued?.type === 'item'
          ? 'Potion'
          : queued
            ? queued.type[0].toUpperCase() + queued.type.slice(1)
            : '';
    const queuedTarget =
      queued && 'target' in queued
        ? c.fighters.find((f) => f.id === queued.target)?.name
        : undefined;
    const queueHtml = `<div class="combat-queue" role="status">${queued ? `<span>Queued: <strong>${esc(queuedName)}${queuedTarget ? ` → ${esc(queuedTarget)}` : ''}</strong></span><button data-action="cancel-queue" aria-label="Cancel queued action">${icon('close', 12)} Cancel</button>` : `<span>${isPlayer ? 'Choose a target, then an action.' : 'Choose your next action now. It will fire on your turn.'}</span>`}</div>`;
    const enemies = c.fighters.filter((f) => f.team === 'enemy' && f.hp > 0);
    if (!c.fighters.some((f) => f.hp > 0 && f.id === this.selectedTarget))
      this.selectedTarget = enemies[0]?.id ?? '';
    // Turn order, starting with whoever acts now; the fallen go to the end.
    const order = [...c.order.slice(c.cursor), ...c.order.slice(0, c.cursor)]
      .map((id) => c.fighters.find((f) => f.id === id)!)
      .filter(Boolean);
    const lineup = [...order.filter((f) => f.hp > 0), ...order.filter((f) => f.hp <= 0)];
    const chip = (f: Fighter) => {
      const portrait =
        f.team === 'enemy'
          ? `<span class="avatar hostile-avatar"><img src="${(enemyTexture(Object.keys(ENEMIES).find((type) => ENEMIES[type].name === f.name) ?? 'cultist').image as HTMLCanvasElement).toDataURL()}" alt=""></span>`
          : characterAvatar(
              f.player ? s.progress.player : { ...f, appearance: undefined },
              f.player,
            );
      const status = [f.defending ? 'Guarding' : '', f.tauntTurns ? 'Taunting' : '']
        .filter(Boolean)
        .join(', ');
      return `<button class="fighter turn-chip ${f.team} ${actor.id === f.id ? 'active' : ''} ${f.hp <= 0 ? 'dead' : ''} ${this.selectedTarget === f.id ? 'targeted' : ''}" data-action="target" data-id="${f.id}" ${f.hp <= 0 ? 'disabled' : ''} aria-label="${esc(f.name)}${f.player ? ' (you)' : ''}, ${f.hp} of ${f.stats.hp} HP, ${f.mp} MP${status ? `, ${status}` : ''}" title="${esc(f.name)}${f.boss ? ' ♛' : ''} · ${f.hp}/${f.stats.hp} HP · ${f.mp} MP${status ? ` · ${status}` : ''}">${portrait}<span class="chip-name">${esc(f.player ? 'You' : f.name.split(' ')[0])}</span><span class="bar"><span style="width:${(f.hp / f.stats.hp) * 100}%"></span></span></button>`;
    };
    stage.insertAdjacentHTML(
      'beforeend',
      `<section class="combat-overlay compact" aria-label="Combat"><div class="combat-top"><div class="combat-title"><span class="eyebrow">Floor ${s.floor.id} · Round ${c.round}</span><h2>${c.fighters.some((f) => f.boss) ? 'The Key Warden' : 'Stand together.'}</h2></div><div class="turn-strip" aria-label="Turn order">${lineup.map(chip).join('')}</div></div><div class="battlefield"></div><div class="combat-bottom"><div class="combat-log" aria-live="polite">${c.messages
        .slice(-4)
        .map((m) => `<p>${esc(m)}</p>`)
        .join(
          '',
        )}</div><div class="combat-controls"><div class="turn-banner">${icon('sword', 14)} ${isPlayer ? 'Your turn. Pick a target on the field or in the turn order, then an action.' : `${esc(actor.name)} is acting…`}</div>${queueHtml}<div class="combat-menu">${button('attack', `${icon('sword', 14)} Attack`)}${button('skill', `${CLASSES[player.classId].skill} · ${CLASSES[player.classId].cost}`, player.mp < CLASSES[player.classId].cost)}${button('potion', `Potion (${c.resources.potions})`, c.resources.potions <= 0)}${button('defend', `${icon('shield', 14)} Defend`)}${button('flee', 'Flee')}</div></div></div></section>`,
    );
    this.combatStage.setFighters(c.fighters);
    stage.querySelector('.battlefield')!.append(this.combatStage.canvas);
    this.combatStage.selected = this.selectedTarget;
  }
  private selectTarget(id: string) {
    this.selectedTarget = id;
    if (this.state.phase === 'combat' && this.queuedAction && 'target' in this.queuedAction) {
      const friendly =
        this.queuedAction.type === 'item' ||
        (this.queuedAction.type === 'skill' && this.state.progress.player.classId === 'cleric');
      const target = this.state.combat.fighters.find(
        (f) => f.id === id && f.hp > 0 && f.team === (friendly ? 'party' : 'enemy'),
      );
      if (target) this.queuedAction = { ...this.queuedAction, target: id };
    }
    this.renderCombat();
  }
  private combatAction(type: Action['type']) {
    const s = this.state;
    if (s.phase !== 'combat') return;
    const actor = s.combat.fighters.find((f) => f.player)!;
    if (actor.hp <= 0) return;
    const isPlayer = activeFighter(s.combat).player;
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
      if (isPlayer && type === 'item' && target.hp === target.stats.hp) {
        this.toast('Choose an injured ally for the potion.');
        return;
      }
      action = { type, target: target.id };
    }
    if (isPlayer) {
      this.queuedAction = undefined;
      this.dispatch({ type: 'combat', action });
      this.lastAI = performance.now();
    } else {
      this.queuedAction = action;
      this.renderCombat();
    }
  }
  private handle(el: HTMLElement) {
    const id = el.dataset.id ?? '';
    switch (el.dataset.action) {
      case 'select-class':
        this.selectedClass = id as ClassId;
        this.renderClassSelect();
        break;
      case 'select-race':
        this.selectedRace = id as Race;
        this.renderClassSelect();
        break;
      case 'select-sex':
        this.selectedSex = id as Sex;
        this.renderClassSelect();
        break;
      case 'toggle-hud':
        this.hudCollapsed = !this.hudCollapsed;
        this.renderLeft();
        break;
      case 'changing-room':
        this.enterChangingRoom();
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
        this.selectTarget(id);
        break;
      case 'cancel-queue':
        this.queuedAction = undefined;
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
      this.queuedAction = undefined;
      this.hubPosition = { ...HALL.spawn };
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
