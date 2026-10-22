export type ClassId = 'tank' | 'healer' | 'archer' | 'mage' | 'samurai';
export type Role = 'tank' | 'healer' | 'dps';
export type Race = 'human' | 'orc' | 'elf' | 'dwarf' | 'gnome';
export type Sex = 'F' | 'M';
/** Body chosen at character creation; it only affects how the character is drawn. */
export interface Appearance {
  race: Race;
  sex: Sex;
}
export type Slot = 'weapon' | 'offhand' | 'armor' | 'trinket';
export interface Stats {
  hp: number;
  mp: number;
  atk: number;
  mag: number;
  def: number;
  spd: number;
}
export type Effect =
  | 'taunt'
  | 'regen'
  | 'mendBoost'
  | 'cleaveHeal'
  | 'extraPotion'
  | 'revive'
  | 'doubleHit'
  | 'cleave'
  | 'counter'
  | 'stealth'
  | 'crit'
  | 'smoke';
export interface Item {
  id: string;
  name: string;
  classId: ClassId;
  slot: Slot;
  description: string;
  modifiers: Partial<Stats>;
  effect?: Effect;
}
export type Loadout = Record<Slot, string>;
export interface Character {
  id: string;
  ownerId: string;
  name: string;
  classId: ClassId;
  xp: number;
  loadout: Loadout;
  color: string;
  appearance?: Appearance;
}
export type Action =
  | { type: 'attack'; target: string }
  | { type: 'skill'; target: string }
  | { type: 'item'; target: string }
  | { type: 'defend' }
  | { type: 'flee' };
export type ActionType = Action['type'];
export interface ContextSnapshot {
  ownHpPct: number;
  mpPct: number;
  lowestAllyHpPct: number;
  enemyCount: number;
  bossPresent: boolean;
  turnNumber: number;
}
export interface DecisionLog {
  actorId: string;
  context: ContextSnapshot;
  action: Action;
}
export type Weights = Record<ActionType, number>;
export interface BehaviorProfile {
  version: 1;
  role: Role;
  samples: number;
  buckets: Record<string, Weights>;
  defaults: Weights;
  healingThreshold: number;
}
export interface Ghost {
  id: string;
  ownerId: string;
  character: Character;
  profile: BehaviorProfile;
  style: string;
  price: number;
  community: boolean;
  dialogue: string;
  runs: number;
  revives: number;
  deepestFloor: number;
}
export interface Fighter {
  id: string;
  name: string;
  team: 'party' | 'enemy';
  classId: ClassId;
  stats: Stats;
  hp: number;
  mp: number;
  effects: Effect[];
  profile: BehaviorProfile;
  player: boolean;
  boss: boolean;
  defending: boolean;
  tauntTurns: number;
  xp: number;
  gold: number;
}
export interface RunResources {
  potions: number;
  smokeUsed: boolean;
  feathersUsed: string[];
}
export interface CombatState {
  fighters: Fighter[];
  order: string[];
  cursor: number;
  round: number;
  rng: number;
  resources: RunResources;
  outcome: 'active' | 'victory' | 'wipe' | 'fled';
  messages: string[];
  decisions: DecisionLog[];
}
export interface Point {
  x: number;
  z: number;
}
export type PuzzleState =
  | { type: 'plates'; blocks: Point[]; plates: Point[] }
  | { type: 'levers'; sequence: number[]; progress: number }
  | { type: 'braziers'; lit: boolean[]; neighbors: number[][] }
  | { type: 'key'; guardDefeated: boolean; collected: boolean };
export type PuzzleAction =
  | { type: 'push'; block: number; dx: number; dz: number }
  | { type: 'lever'; index: number }
  | { type: 'brazier'; index: number }
  | { type: 'guardDefeated' }
  | { type: 'collectKey' }
  | { type: 'restart' };
export interface PatrolDef {
  id: string;
  enemyTypes: string[];
  path: Point[];
  radius: number;
  boss: boolean;
}
export interface FloorDef {
  id: number;
  title: string;
  subtitle: string;
  level: number;
  map: string[];
  spawn: Point;
  stairs: Point;
  puzzle: PuzzleState;
  puzzlePoints: Point[];
  /** Names for levers or braziers, in puzzlePoints order. */
  puzzleLabels: string[];
  clue: Point;
  hint: string;
  /** Where resetting the puzzle puts the player; the spawn when absent. */
  restart?: Point;
  /** Journal guidance shown before and after the clue is read. */
  notes: string;
  patrols: PatrolDef[];
}
export interface PatrolState {
  id: string;
  position: Point;
  waypoint: number;
  pauseTicks: number;
  defeated: boolean;
}
export interface FloorState {
  id: number;
  position: Point;
  puzzle: PuzzleState;
  patrols: PatrolState[];
  clueRead: boolean;
}
export interface RunState {
  party: Fighter[];
  resources: RunResources;
  unbankedGold: number;
  floors: Record<number, FloorState>;
}
export interface Progress {
  player: Character;
  gold: number;
  hires: Ghost[];
  unlockedPortals: number[];
  checkpoint: 0 | 5;
  rng: number;
  decisions: DecisionLog[];
  completedRuns: number;
}
export type GameState =
  | { phase: 'classSelect' }
  | { phase: 'hub'; progress: Progress }
  | { phase: 'safeRoom'; progress: Progress }
  | { phase: 'floor'; progress: Progress; run: RunState; floor: FloorState }
  | {
      phase: 'combat';
      progress: Progress;
      run: RunState;
      floor: FloorState;
      patrolId: string;
      combat: CombatState;
    };
export interface SaveData {
  version: 1;
  state: GameState;
}
export type GameCommand =
  | { type: 'newGame'; name: string; classId: ClassId; seed: number; appearance?: Appearance }
  | { type: 'hire'; ghostId: string }
  | { type: 'dismiss'; ghostId: string }
  | { type: 'equip'; itemId: string }
  | { type: 'changeClass'; classId: ClassId }
  | { type: 'changeAppearance'; appearance: Appearance }
  | { type: 'startRun' }
  | { type: 'portal' }
  | { type: 'reset' }
  | { type: 'move'; dx: number; dz: number; sneak?: boolean }
  | { type: 'tick'; sneak: boolean }
  | { type: 'interact' }
  | { type: 'puzzle'; action: PuzzleAction }
  | { type: 'combat'; action: Action }
  | { type: 'aiTurn' };
