# Dungeon Delver — Game Design Doc

Oct 21, 2026 · @Cody Adcock

## Pitch

A browser-based, endless dungeon crawler with turn-based party combat, where your party is made of your friends' "ghosts": AI copies that fight the way those players actually play. You control one character; the other three act on their own. Lending your ghost earns you a share of the XP it helps earn, so building a character other people want to recruit is part of the game.

Title: Dungeon Delver. Live multiplayer is out of scope for now.

## Core loop

Players descend an endless stack of floors; dying sends them back to the last safe floor they reached.

1. **Hub (floor 0):** the starting safe floor. Holds portals to every safe floor the player has unlocked, plus vendors and the ghost-recruiting area.
2. **Recruit:** pick up to three ghosts to fill the party.
3. **Descend:** explore each floor in 3D as a 2D sprite (billboarded, PokéBonk-style). Touching an enemy starts a turn-based fight.
4. **Reach a safe floor:** every N floors (10 in the full game; floor 5 in the MVP) is a safe floor. It unlocks a hub portal and becomes your new checkpoint. Safe floors are also social spaces where ghosts gather.
5. **Fail:** party wipe returns you to your last safe floor. Keep XP earned; lose some or all unbanked loot (to tune).

Floors are procedurally generated from a seed, so floor 47 can look the same for everyone if wanted (useful for comparing runs later).

## Combat and party

Combat is turn-based in the Final Fantasy / D&D mold: a party of four against an enemy group, with the player controlling only their own character.

- **Standard composition:** 1 tank, 1 healer, 2 DPS. The player's own character fills one slot; ghosts fill the rest.
- **Turn order:** speed-based initiative, so ghosts and enemies interleave with the player.
- **Actions:** attack, skill (costs MP), item, defend, flee. Keep the action set small at first so ghost behavior is easy to learn.
- **Level sync:** every party member scales to the floor's level (FFXIV-style). Gear, skills chosen, and behavior are what make one ghost better than another, not raw level.

## Classes and equipment

The player picks one of three classes; each has four gear slots with two class-specific items per slot, chosen before a run in the hub.

| Class (role) | Weapon | Off-hand | Armor | Trinket |
| --- | --- | --- | --- | --- |
| Knight (tank) | Longsword: +4 ATK · War Hammer: +8 ATK, -2 SPD | Tower Shield: +8 DEF, -1 SPD · Buckler: +3 DEF, +2 SPD | Plate Mail: +30 HP, -2 SPD · Chain Mail: +15 HP | Taunt Totem: Shield Bash makes enemies target you next turn · Iron Heart: regain 5% HP each turn |
| Cleric (healer) | Oak Staff: +5 MAG · Mace: +3 ATK, +2 MAG | Prayer Book: Mend heals 20% more · Censer: Mend also heals the next most hurt ally for half | Robes: +15 MP · Padded Vest: +4 DEF, +10 HP | Holy Symbol: +1 potion per floor · Phoenix Feather: once per run, the first ally to fall revives at 25% HP |
| Rogue (DPS) | Twin Daggers: +3 SPD, attacks hit twice at 60% · Greataxe: +9 ATK, -3 SPD | Throwing Knives: Power Strike also hits a second enemy · Parrying Dagger: +3 DEF, 25% chance to counter | Leather: +3 SPD · Shadow Cloak: enemy detection radius on floors -40% | Lucky Coin: 15% crit chance · Smoke Bomb: one guaranteed Flee per floor |

- Every item is an "A or B" choice per slot, so each class has 16 possible loadouts.
- Items change the player's character and are copied onto their ghost snapshot later.
- Hired fake players come with their own fixed loadouts, shown on their ghost card.
- Changing class or gear is done in the hub only; a game reset returns to class select.

## Floors, puzzles and encounters

In the MVP, floors 1 to 4 are dungeon floors with one puzzle each, and floor 5 is a safe room.

**Dungeon floors (1 to 4)**

- Hand-built or seeded layouts of rooms and corridors, explored as a 2D sprite in a 3D space.
- The stairs down are behind a door that opens only when the floor's puzzle is solved.
- One puzzle per floor, a different type each floor:
  1. **Pressure plates:** push blocks onto all plates.
  2. **Lever order:** pull levers in the order shown by runes elsewhere on the floor.
  3. **Braziers:** light every brazier; lighting one toggles its neighbors (lights-out style).
  4. **Key hunt:** find a key guarded by a mini-boss encounter.

**Enemies: engage or avoid**

- Enemies are visible on the floor and patrol set paths with a detection radius.
- Touching an enemy, or being caught inside its radius, starts turn-based combat.
- Players can sneak around patrols to avoid fights entirely.
- In combat, a **Flee** action has a 50% chance to escape back to the floor (Smoke Bomb guarantees it once per floor). The enemy then pauses for a few seconds.
- Defeating enemies grants XP and gold; avoiding them grants nothing.

**Safe room (floor 5)**

- No enemies. Contains a portal back to the hub.
- Reaching it unlocks a matching portal in the hub, so the player can return straight to floor 5 later.
- A party wipe on floors 1 to 4 returns the player to the hub (the last safe floor reached). Hires are dismissed when a run ends.

## Ghost system

A ghost is a snapshot of a player's character (looks, gear, skills) plus a behavior profile learned from how that player fights.

**How a ghost learns (no machine learning needed)**

1. Every time a player acts in combat, log the action with a small context snapshot: own HP%, MP%, lowest ally HP%, number of enemies, whether a boss is present, turn number.
2. Group contexts into buckets (for example, lowest ally HP: under 25%, 25 to 50%, over 50%).
3. For each bucket, count how often the player chose each action type. That table is the behavior profile.
4. In combat, the ghost finds the matching bucket and picks an action weighted by those counts, with a little randomness so it feels human.
5. Until a player has enough logged turns, fall back to a sensible role default.

**Recruiting**

- Ghosts appear in hubs and on safe floors near their own progress level, in their custom gear and looks.
- Tap a ghost to see its card (role, gear, runs completed, revives, owner) and a short line of flavor dialogue, then recruit.
- Each ghost shows a hire price (see Economy).

**Community ghosts**

- Game-made ghosts for every role, always available and cheap.
- Deliberately weaker (worse gear, simpler behavior) so real players' ghosts feel like an upgrade.
- Guarantees nobody is stuck without a healer or tank.

**Rules**

- You can't recruit your own ghosts or ghosts from the same account.
- A ghost dying or a failed run never costs its owner anything.

## Economy and rewards

Lending pays, hiring costs, and friendship gets a discount. Every number below is a starting point to tune.

| Mechanic | Rule | Why |
| --- | --- | --- |
| Lender XP | Owner earns a share of XP when their ghost helps clear floors, sized as a % of the *owner's* next-level requirement | A level 500 can still give a level 5 a big boost, but it can't be farmed endlessly |
| Daily lender cap | Max lender XP per day (e.g. 3 levels' worth at low level, less at high) | Stops alt-account farming |
| Hire price | Set by the game from level and role, not by players | Prevents price gouging on popular ghosts |
| Friend discount | Friends hire at a steep discount (e.g. 75% off) or free | Makes friendships worth having |
| Gold sink | The game keeps a small cut (e.g. 10%) of every hire fee | Limits inflation |
| Underdog bonus | Extra reward for recruiting rarely borrowed ghosts | Spreads payouts beyond the meta ghosts |
| Community ghosts | Cheapest option in every role | Nobody is locked out |

Hire fees could also include a share of loot from the run instead of gold up front. Pick one model for the MVP.

## Social features

Without live play, friendships form through what ghosts do for each other.

- **Lending reports:** "Your healer helped Kai clear floors 110 to 120. +2,400 XP." Shown on login and optionally as a push notification.
- **Thanks:** after a run, send a one-tap thanks to each ghost's owner. Thanks counts show on ghost cards.
- **Friend requests:** sent from a ghost card or a thanks notification. Friends get the hire discount.
- **Ghost stats:** runs completed, floors cleared, revives, deepest floor. Players judge ghosts by results, not only gear.
- **Hubs as showcases:** your ghost stands in the hub of your deepest safe floor, so others see it there.

## Tech stack and backend

The backend is one free Supabase project (Postgres, Auth, Edge Functions); the client is a static site on GitHub Pages at battydev.com/DungeonDelver.

**Client**

- Three.js + TypeScript + Vite in the `BattyDev/DungeonDelver` repo, with Vite `base: '/DungeonDelver/'`.
- All game rules live in a shared `rules` package: pure functions like `(state, action) → newState`, used by the client and by Edge Functions.
- Deployed to GitHub Pages by a GitHub Actions workflow.

**Supabase**

- **Auth:** anonymous sign-ins for guest play; link email or Discord later without losing progress.
- **Database:** Postgres tables for players, characters, ghosts (snapshot + behavior profile JSON), runs, combat\_logs, hires, friendships, notifications. Row Level Security on every table.
- **Server authority:** an Edge Function (`submit-run`) re-checks run results with the shared rules before granting XP, loot and lender payouts, so edited clients can't award themselves rewards.
- **Profile building:** a scheduled job folds raw combat logs into behavior profiles, then deletes processed logs to stay under the 500 MB free database.

**Free plan limits to watch** ([Supabase pricing](https://supabase.com/pricing))

| Limit | Value | Impact |
| --- | --- | --- |
| Active projects | 2 (paused ones don't count) | Paused an old project to make room |
| Database size | 500 MB | Prune raw combat logs after processing |
| Monthly active users | 50,000 | Not a concern for a long time |
| Inactivity | Pauses after 7 days idle | Unpause in the dashboard after breaks |

**Fallbacks** if the free plan ever stops fitting: hosted Postgres on [Neon](https://neon.com/blog/neon-free-plan-1-gb-per-project) (1 GB per project), or self-host Postgres on the home server behind a Cloudflare Tunnel.

## MVP scope

The MVP is a single-player, offline slice: hub, hire a party, crawl floors 1 to 4, reach the floor 5 safe room, and portal between it and the hub. Progress saves to localStorage; no backend yet.

**Definition of done**

- [ ] **New game:** pick a class (Knight, Cleric, Rogue) and name; land in the hub.
- [ ] **Hub:** a 3D room where 8 fake players (sprite NPCs with names, classes, gear and preset behavior) wander between waypoints.
- [ ] **Hiring:** walk up to or tap a fake player to open their ghost card (class, gear, stats, play style, price) and hire them. Party is the player plus up to 3 hires; the UI shows whether the party has a tank and healer.
- [ ] **Gold:** start with enough gold for a full party of average hires; 2 cheap community ghosts per role are always available.
- [ ] **Loadout:** change gear in the hub, two class-specific items per slot (see Classes and equipment).
- [ ] **Floors 1 to 4:** explorable layouts, one puzzle each (four different types), stairs locked until solved.
- [ ] **Enemies:** visible patrols with detection radius; engage by contact or avoid by sneaking; Flee works in combat.
- [ ] **Combat:** turn-based, player controls one character, hires act on their own via behavior profiles.
- [ ] **Floor 5 safe room:** portal back to the hub; reaching it unlocks a hub portal down to floor 5.
- [ ] **Failure:** party wipe returns to the hub; XP is kept, hires are dismissed.
- [ ] **Reset:** a Reset Game option (with confirmation) wipes the save and returns to class select.
- [ ] **Deploy:** playable at battydev.com/DungeonDelver via GitHub Pages.

**After the MVP**

1. Log the player's combat decisions and build their behavior profile (the code path exists in the MVP, unused).
2. Supabase: anonymous accounts, cloud saves, real player ghosts in the hub replacing fake players.
3. Economy and social: lender XP with caps, hire prices, friends and discount, lending reports, thanks.
4. Endless floors beyond 5 with procedural generation and a safe floor every 10.

Out of scope for now: live multiplayer, trading, guilds, mobile app wrappers.

## Open questions

- [ ] What is lost on a party wipe: unbanked loot, gold, durability, or nothing?
- [ ] Hire payment: gold up front, a share of run loot, or both?
- [ ] Does a recruited ghost keep its snapshot, or update when the owner improves?
- [ ] How far apart are safe floors, and does that spacing grow deeper down?
- [ ] Can players see which floor a ghost is from, and limit recruiting to ghosts within some range?
- [ ] Art direction for sprites and floors, and the setting/theme (original IP).
- [ ] Floor count: the MVP treats floors 1 to 4 as dungeon floors and floor 5 as the safe room. Confirm, or make 5 dungeon floors with the safe room as floor 6.

## Starter prompt

Paste this into a Claude Code session on the `BattyDev/DungeonDelver` repo. Export this doc as Markdown and add it to the repo as `docs/GDD.md` first, so the session can read it.

```text
You're building the MVP of Dungeon Delver, a browser-based dungeon crawler with turn-based party combat. Read docs/GDD.md fully before writing code; it is the source of truth. The MVP is the "MVP scope" checklist in that doc. Everything else in the doc is context for later, so design for it but don't build it.

STACK
- pnpm monorepo, TypeScript (strict) everywhere, Vite for the client, Vitest for tests.
- packages/rules: all game logic as pure, deterministic functions. No DOM or Three.js imports. Seeded RNG passed in (never Math.random). This package will later run inside Supabase Edge Functions, so keep it dependency-free.
- apps/client: Three.js. Characters are billboarded 2D sprites in a 3D space (PokeBonk-style). UI (menus, ghost cards, combat menu, HUD) is HTML/CSS over the canvas. Must work with mouse + keyboard and touch on a phone.
- Vite base must be '/DungeonDelver/' (served at battydev.com/DungeonDelver). Add a GitHub Actions workflow that runs tests, typechecks, builds, and deploys to GitHub Pages.
- Save/load through a small Storage interface backed by localStorage, so it can be swapped for Supabase later. Version the save format.
- Placeholder art is fine: generated canvas sprites (colored silhouettes with a class glyph), simple materials. Make it readable and pleasant, not final.

ARCHITECTURE
- A top-level game state machine: ClassSelect -> Hub -> Floor(n) <-> Combat -> SafeRoom, plus Reset.
- rules package modules: rng, classes + items (data tables from the GDD), stats (base + gear), combat (initiative, resolveTurn(state, action) -> newState, flee), ai (behavior profiles: context buckets -> weighted actions, role defaults, learn()), floors (floor definitions, enemy patrol data, puzzle state machines and their solve checks), progression (XP, gold, unlocked portals, run start/end/wipe).
- Each puzzle type (pressure plates, lever order, braziers lights-out, key hunt) is a pure state machine with its own unit tests, including a test that each shipped floor's puzzle is solvable.
- Log the player's combat decisions with context snapshots in the format described in the GDD's Ghost system section, even though the MVP doesn't use them yet.

CONTENT FOR THE MVP
- 3 classes (Knight, Cleric, Rogue) with the exact items in the GDD's Classes and equipment table.
- 8 fake players for the hub with distinct names, classes, loadouts, preset behavior profiles (e.g. "cautious healer", "reckless rogue") and hire prices, plus 2 cheap community ghosts per role.
- Floors 1-4 hand-authored as data (rooms, walls, enemy patrols, one puzzle each, locked stairs). Floor 5 is the safe room with a portal to the hub.
- 4-5 enemy types plus the floor 4 key-guard mini-boss. Tune so a balanced party clears floors 1-4 in about 20-30 minutes.

WORKING STYLE
1. First, propose the folder structure, the core types (GameState, Character, Item, Ghost, BehaviorProfile, CombatState, Action, FloorDef, PuzzleState, SaveData) and the state machine. Wait for my OK.
2. Build the rules package with tests before any rendering: classes/items/stats, combat + AI, puzzles, progression.
3. Then the client in this order: class select -> hub (movement, wandering fake players, ghost cards, hiring, loadout) -> floor 1 exploration + combat -> remaining floors and puzzles -> safe room and portals -> reset -> save/load -> deploy workflow.
4. Keep `pnpm dev` runnable and `pnpm test` green at every step. Commit after each working step with a clear message.
5. When done, walk through the MVP checklist from the GDD and report which items pass, with anything you cut or changed and why.
```
