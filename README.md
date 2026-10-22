# Dungeon Delver

Starting a fresh local session? Read [HANDOFF.md](HANDOFF.md) first.

An offline, single-player dungeon crawler: choose a calling, hire three ghost companions, solve four dungeon floors, and reach the floor 5 sanctuary. Billboarded canvas sprites inhabit a Three.js world; the UI is HTML/CSS. The authoritative scope is [docs/GDD.md](docs/GDD.md).

## Run locally

Node.js 24 and pnpm 11.25.0 are used in CI.

```sh
pnpm install
pnpm dev
```

Open `http://localhost:5173/DungeonDelver/`. The Paper Doll Studio is at `http://localhost:5173/DungeonDelver/studio.html`, or walk into the wardrobe in the hall's Changing Room.

```sh
pnpm test          # deterministic rules and storage adapter tests
pnpm typecheck     # strict TypeScript, including tests
pnpm build         # static output in apps/client/dist
pnpm exec playwright install chromium
pnpm test:browser  # real browser checks; starts Vite automatically
```

For a system Chromium, use `CHROMIUM_PATH=/usr/bin/chromium pnpm test:browser`. On Linux, Playwright may need `pnpm exec playwright install --with-deps chromium`.

## Playing

- WASD/arrows: continuous movement, including diagonals at the same speed. Release to stop; walk into walls to slide along them. Clicking the floor follows a route through open space.
- E/Enter: nearby interaction. Tap an NPC or use Companions to inspect and hire.
- Shift (or the Sprint button): sprint, about 65% faster. Sprinting is loud: patrols detect you from 1.6× farther, and any that can see you within 6.5 tiles leave their route to come at you, then walk back once you stop. Detection rings show the normal range; cloaks reduce detection by 40%.
- Combat is an auto-battler by default: everyone, including your character, picks actions on their own in speed order. Choose an action (and a target) to override your next turn, or switch **Auto** off in the combat menu to play every turn yourself. The setting is saved in the browser.
- Enemies hit 15% harder than at launch; after each won encounter the living party recovers 10% HP and 4 MP.
- You can choose an action during another character's turn to queue it. Change the action or target to replace it, or use Cancel. It executes once on your next turn; invalid targets or unavailable resources cancel it without spending your turn. Queues clear when combat ends or the page reloads.
- Read the pale-blue rune tablets for puzzle clues. The Journal holds discovered clues and a stone reset option.
- Gear/class changes and hires are hub-only. A tank, healer and two damage dealers are recommended.
- The start screen picks a race (human, orc, elf, dwarf, gnome), a sex and a class. Race and sex only change how you are drawn.
- The Gathering Hall has seven rooms: the Great Hall, the Tavern (recruits), the Changing Room (the wardrobe opens the Paper Doll Studio), the Armory (loadout), the Portal Sanctum, the Descent (stairs) and the Moss Garden. Twenty background adventurers wander it with random looks covering every race, sex and studio class; they are rerolled once per browser session.
- The HUD floats over the world: the floor, your objective, puzzle progress and a map top left (the map reveals what you have seen and resets each run; <kbd>M</kbd> hides the card), party portraits with a **+** per open slot and the place's actions bottom right. Landmarks and nearby levers, braziers and the key pedestal get name tags; patrols are only labeled within about seven tiles. Resetting the vault stones returns you to the vault door.
- Combat fits one screen: turn order across the top (tap a portrait to target), health and mana bars over each fighter, and the log and actions underneath.
- Companions walk in a line behind you, in the hall and below. The camera pulls back as the line stretches, and walls between the camera and the party drop to a low stub so rooms stay visible.
- The settings menu pauses the expedition and contains Reset Game with confirmation.

Desktop presentation is the priority. Basic touch movement and responsive controls are included, without a separate phone-specific design pass.

The camera follows from a lower, closer angle, smoothing its position and aim together without changing angle at room edges. Stone blocks still push one cell at a time to keep the pressure-plate puzzle readable; walking around them is continuous. Existing version 1 saves load, and new saves retain fractional positions. Local browser checks run one at a time to avoid software WebGL contention; CI retains parallel checks.

## Paper Doll Studio and character art

Characters are 64 × 64 pixel paper dolls: a base body, hair and class gear layers, drawn over a pose guide, with idle and walk in eight directions (NE, E and SE mirror NW, W and SW) and one combat camera facing east. The drawing code in `apps/client/src/paperdoll/` is shared by the studio and the game, so every race, sex and class has a default look before anyone draws.

Bodies have connected necks/joints and depth-aware limb/headwear overlap. Female defaults use distinct shoulder, waist and hip proportions with fitted armour and face-framing hair. Saved Studio projects keep their existing pixels; **Project → Reset** regenerates selected starter layers with the current renderer and supports Undo. Use `node tools/sprite-consistency.mjs after --full` with Vite running for the complete walk/combat audit sheets.

- The studio (`studio.html`) edits layers per race and sex, previews them in a walk-around changing room (auto walk, WASD, and a button for each combat move), and exports sheets, a zip with a manifest, or a project file.
- Walking views E, NE and SE mirror W, NW and SW. Choose the source direction in the compass, or use the canvas banner's **Draw on W/NW/SW** shortcut, then select a layer, Pencil and a color to draw. Both directions update together. **Symmetry** mirrors brush strokes within one frame; direction mirroring is configured in **Project**.
- **Send to game** stores the current body and class's sheets in this browser (`dungeon-delver.wardrobe.v1`). The game uses them for your own character when its race, sex and class match; everyone else keeps the default look. Project › In the game lists sent looks and reverts them.
- The studio and the game share the same five classes, so any look drawn for a class can be sent and played.
- **Portraits** (`portraits.html`, the Portraits tab in the studio): 64 × 64 conversation faces, optionally animated, painted for a race and sex or for one character. Defaults are ten painted busts (`apps/client/public/portraits/defaults.png`, rebuilt by `tools/portraits/slice_defaults.py`). **Use portrait in game** stores a portrait in this browser (`dungeon-delver.portraits.v1`).
- The studio has zoom (+, −, 0, or Ctrl + wheel) with Space-drag panning, a play button (P), onion skins for the previous (red) and next (green) frames, the race's skin and hair plus recent colors beside the palette, a side-by-side preview before Send to game, and a shortcut list on <kbd>?</kbd>. The ghost overlay defaults to an outline.
- Combat plays the drawn animations: attackers lunge and play attack, slash or heal; targets play hurt or death, with damage numbers.

World tiles, walls and props are also generated pixel art (`scene/pixels.ts`), themed per floor. Enemies use native 64 × 64 frames (`paperdoll/creatures.ts`) with the characters' rasterizer, skeletons and one-pixel outlines. Exploration, combat and turn-order portraits share this art; enemies turn, idle, react to hits and fall in combat. Grounded characters and enemies have floor shadows; bats and wisps do not. Fallen companions stay visible in a prone pose. Remaining visual work, in priority order, is in [docs/VISUALS-HANDOFF.md](docs/VISUALS-HANDOFF.md); the dev-only sprite contact sheet is at `/DungeonDelver/debug-sheet.html` (`?creatures=&combat=death` shows enemy death strips).

## Reading characters at a glance

“Ghost” means an offline snapshot of another player's character. Adventurers are ordinary humanoid sprites with faces, clothing, boots and class equipment. Friendly recruits have teal diamond markers and Recruit/In party labels; the controlled player has a gold circle. Hostiles have separate slime, bat, skeleton, flame, masked acolyte and armored warden silhouettes, red triangle markers and explicit HOSTILE/BOSS labels. Combat uses matching creature portraits. See the [character comparison](docs/previews/characters.png).

## Rules and balance decisions

`packages/rules` has no runtime dependencies or browser/rendering imports. All state is serializable JSON. A seeded Mulberry32 RNG is passed through state; no game code uses `Math.random`, wall clocks, or global RNG state. Exploration advances in fixed 100 ms ticks. The client sends commands through `transition`; `resolveTurn` advances one actor at a time. Illegal commands do not consume RNG.

- Floors are 41 × 27 tiles of five to seven rooms with four to six patrols each. Floor 1's vault needs 19 pushes to seat three stones around pillars; floor 2 has five levers across the archive in a riddle order; floor 3 chains seven braziers (one five-touch solution); floor 4 sends you from the Warden's hall to a key in the far tower. `layout.test.ts` checks connectivity, patrol routes and every solution.
- Five classes, matching the Paper Doll Studio: **Tank** (Shield Bash), **Healer** (Mend), and three damage dealers, **Archer** (Piercing Shot, mostly ignores DEF), **Mage** (Arcane Bolt; all its damage scales with MAG) and **Samurai** (Iai Slash). Each has 8 gear choices, two per slot (40 in all). The original Knight, Cleric and Rogue gear lives on as the Tank, Healer and Samurai sets; saves that name knights, clerics or rogues load as tanks, healers and samurai. Base stats, skill costs/power, enemy stats and starting gold are initial balance values because the GDD leaves them open.
- The loadout (Armory) also changes your race, sex and class in the hub; changing class resets equipment to that class's starting gear.
- Start with 120 gold. Adventurer hires cost 24–32 gold; community hires cost 0–2. A free tank, healer and two DPS remain available so repeated wipes cannot lock a player out of a balanced party. Fees are paid up front, dismissed hires are not refunded, and snapshots remain fixed for a run.
- Wipes retain earned XP and banked gold, lose unbanked encounter gold, restore resources on the next run, and dismiss hires. The checkpoint starts at the hub; after unlocking sanctuary, it becomes floor 5.
- Reaching sanctuary banks gold and ends the run. Hires are dismissed. Both directions of the hub/sanctuary portal remain available.
- Party members sync to each floor's level. Damage and MP spent carry forward. Each cleared encounter restores 4 MP; descending grants one potion plus Holy Symbol bonuses, resets Smoke Bomb use, and increases synced resource maxima. Phoenix Feather use remains spent throughout the run.
- Ordinary flee succeeds 50% of the time. An available living party member's Smoke Bomb guarantees one escape per floor. Escaped patrols pause 4.5 seconds; they grant no rewards.
- Ghost context buckets include own HP, MP, lowest living ally HP, enemy count, boss presence and round. Player decisions are saved with pre-action context. `learn()` is tested but is deliberately not wired to update player ghosts in this MVP.
- Automated expedition simulations cover all encounters with balanced parties led by each of the five classes. They establish clearability, **not a measured 20–30 minute human playtime**. Duration remains a playtest target; avoidance and familiarity can shorten a run considerably.

## Save format

The version 1 save is stored under `dungeon-delver.save`. An asynchronous `Storage` interface isolates localStorage from the game. Saves include exploration, puzzles, hires, combat, RNG, decision logs, resource usage, and portals. Structural validation rejects corrupt or unsupported versions without overwriting them. The player can continue without saving or explicitly reset. Quota/permission errors leave play available in memory and display a notice. Reset clears only this game's key.

No backend, auth, cloud synchronization, lender economy, real player ghosts, social features, procedural generation, or floors beyond 5 are implemented.

## GitHub Pages

The workflow tests, typechecks, runs Chromium browser checks, and builds pushes to `main` and pull requests. Standalone project Pages deployment is opt-in via the repository variable `ENABLE_PROJECT_PAGES=true`; the active `/DungeonDelve/` release is published through the domain repository. Vite's base is `/DungeonDelver/`.

Enable **Settings → Pages → Build and deployment → Source: GitHub Actions** in `BattyDev/DungeonDelver`, set the repository Actions variable `ENABLE_PROJECT_PAGES` to `true`, then push `main` (or run the workflow manually). The connected GitHub identity needs write access to Contents and Workflows; configuring Pages also requires Pages permissions.

For `https://battydev.com/DungeonDelver/`, `battydev.com` should already be the custom domain of the account's root Pages site (`BattyDev/battydev.github.io`). Project sites inherit that domain. Do not set the project site's CNAME to the account root domain: this is a subpath deployment. If the root domain is hosted elsewhere, its server must route `/DungeonDelver/` to this build; a Pages project alone cannot configure another host.

See [docs/MVP-STATUS.md](docs/MVP-STATUS.md) for implementation and verification status.

### Existing domain deployment

The domain repository, `BattyDev/BattyDev.github.io`, assembles battydev.com. To publish the requested `/DungeonDelve/` path there as a static directory, build with `DELVER_BASE_PATH=/DungeonDelve/ pnpm build` and copy `apps/client/dist` into `DungeonDelve/` in that repo. The default base stays `/DungeonDelver/` for the standalone project workflow. Follow the domain repository’s branch/PR deployment rules.
