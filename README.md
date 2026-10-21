# Dungeon Delver

Starting a fresh local session? Read [HANDOFF.md](HANDOFF.md) first.

An offline, single-player dungeon crawler: choose a calling, hire three ghost companions, solve four dungeon floors, and reach the floor 5 sanctuary. Billboarded canvas sprites inhabit a Three.js world; the UI is HTML/CSS. The authoritative scope is [docs/GDD.md](docs/GDD.md).

## Run locally

Node.js 24 and pnpm 11.25.0 are used in CI.

```sh
pnpm install
pnpm dev
```

Open `http://localhost:5173/DungeonDelver/`.

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
- Shift: sneak; detection rings show the unsneaking detection range. Shadow Cloak reduces it by 40%; sneaking reduces it further.
- In combat, select an enemy for attacks or an ally for Mend/potions. Only the player is controlled directly. Ghosts and enemies act automatically in speed order.
- Read the pale-blue rune tablets for puzzle clues. The Journal holds discovered clues and a stone reset option.
- Gear/class changes and hires are hub-only. A tank, healer and two damage dealers are recommended.
- The settings menu pauses the expedition and contains Reset Game with confirmation.

Desktop presentation is the priority. Basic touch movement and responsive controls are included, without a separate phone-specific design pass.

The camera follows from a lower, closer angle, smoothing its position and aim together without changing angle at room edges. Stone blocks still push one cell at a time to keep the pressure-plate puzzle readable; walking around them is continuous. Existing version 1 saves load, and new saves retain fractional positions. Local browser checks run one at a time to avoid software WebGL contention; CI retains parallel checks.

## Reading characters at a glance

“Ghost” means an offline snapshot of another player's character. Adventurers are ordinary humanoid sprites with faces, clothing, boots and class equipment. Friendly recruits have teal diamond markers and Recruit/In party labels; the controlled player has a gold circle. Hostiles have separate slime, bat, skeleton, flame, masked acolyte and armored warden silhouettes, red triangle markers and explicit HOSTILE/BOSS labels. Combat uses matching creature portraits. See the [character comparison](docs/previews/characters.png).

## Rules and balance decisions

`packages/rules` has no runtime dependencies or browser/rendering imports. All state is serializable JSON. A seeded Mulberry32 RNG is passed through state; no game code uses `Math.random`, wall clocks, or global RNG state. Exploration advances in fixed 100 ms ticks. The client sends commands through `transition`; `resolveTurn` advances one actor at a time. Illegal commands do not consume RNG.

- All 24 gear choices match the GDD. Base stats, skill costs/power, enemy stats and starting gold are initial balance values because the GDD leaves them open.
- Start with 120 gold. Adventurer hires cost 24–32 gold; community hires cost 0–2. A free tank, healer and two DPS remain available so repeated wipes cannot lock a player out of a balanced party. Fees are paid up front, dismissed hires are not refunded, and snapshots remain fixed for a run.
- Wipes retain earned XP and banked gold, lose unbanked encounter gold, restore resources on the next run, and dismiss hires. The checkpoint starts at the hub; after unlocking sanctuary, it becomes floor 5.
- Reaching sanctuary banks gold and ends the run. Hires are dismissed. Both directions of the hub/sanctuary portal remain available.
- Party members sync to each floor's level. Damage and MP spent carry forward. Each cleared encounter restores 4 MP; descending grants one potion plus Holy Symbol bonuses, resets Smoke Bomb use, and increases synced resource maxima. Phoenix Feather use remains spent throughout the run.
- Ordinary flee succeeds 50% of the time. An available living party member's Smoke Bomb guarantees one escape per floor. Escaped patrols pause 4.5 seconds; they grant no rewards.
- Ghost context buckets include own HP, MP, lowest living ally HP, enemy count, boss presence and round. Player decisions are saved with pre-action context. `learn()` is tested but is deliberately not wired to update player ghosts in this MVP.
- Automated expedition simulations cover all encounters with balanced parties led by each of the three classes. They establish clearability, **not a measured 20–30 minute human playtime**. Duration remains a playtest target; avoidance and familiarity can shorten a run considerably.

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
