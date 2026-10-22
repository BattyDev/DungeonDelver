# Dungeon Delver — local handoff

Updated October 22, 2026. This document is for the owner and the next local coding session.

## Start here

**October 22 portraits release:** a Portrait Studio (`portraits.html`) paints 64 × 64, optionally animated conversation faces per race/sex or per character, used across the HUD, roster, hire card and turn order. Ten revised defaults are reduced from a generated reference into editable pixels (`apps/client/public/portraits/defaults-v2.png`); the neck remains exposed and the fallback hair order is corrected. The palette includes the painting's own colours. Existing drafts stay intact; **Default face** refreshes only the selected frame, with Undo. Reference, exact prompt, checks and review captures are in the Portraits section of `docs/VISUALS-HANDOFF.md`.

**October 22 combat ending release:** final blows now remain on the battlefield through the impact, health drain to **0 HP**, complete death animation and a short held pose. Combat inputs stop during the ending; rewards/escape/wipe apply afterward through `finishCombat`. Reloading a terminal combat save safely settles it once. See `docs/VISUALS-HANDOFF.md` and `docs/previews/combat-ending.png`; combined validation is 76 unit tests, strict typecheck, production build and 14 Chromium checks.

**October 22 sprite consistency release:** the shared rig/rasterizer now joins heads with necks and round joints, resolves limb/head/ear overlap per pixel, fixes the north ponytail and diagonal helmet openings, fits armour to clearer female shoulder/waist/hip proportions, rotates headwear/staves on fallen bodies, and fixes combat held-item ordering. See `docs/VISUALS-HANDOFF.md` for the audit sheets and saved-Studio-art behavior. Current checks: 72 unit tests, strict typecheck, production build and 12 Chromium checks. The earlier mirrored-view drawing shortcut is also still local.

**Latest visual release (October 21):** V1–V5, V9 and V11 are live at https://battydev.com/DungeonDelve/ through domain PR https://github.com/BattyDev/BattyDev.github.io/pull/27. Source PR https://github.com/BattyDev/DungeonDelver/pull/2 is merged. All 61 unit tests, strict typecheck, build and 11 Chromium checks passed in GitHub Actions; the domain Pages deployment succeeded. All nine public game files matched the tested `/DungeonDelve/` build. A fresh live browser verified an Orc Archer, three hires, floor 1 patrols, persisted reload and the studio with no page/asset errors. Browser checks now use one worker and a 60-second budget on local and hosted software WebGL runners. See `handoff/visuals-release/verification.json` for this local session's release SHAs and evidence.

The MVP has been built. Continue from this implementation; do not start by rebuilding the game from scratch.

**Recovery completed:** source and commit history are now published at https://github.com/BattyDev/DungeonDelver. The game is live at https://battydev.com/DungeonDelve/ through domain PR https://github.com/BattyDev/BattyDev.github.io/pull/21. The domain Pages run succeeded; the public game URL returned HTTP 200 and its JS/CSS/favicon assets were checked against the tested production build.

The former HTTP 403 restriction was resolved by installing/authorizing the OpenAI ChatGPT Codex Connector GitHub app. Historical references to an empty repo, unpushed commits or blocked publishing below describe the recovery period and are superseded by this status. The archived domain patch is no longer needed for the first deployment: do not apply it to the already-deployed domain main. For future updates rebuild and use a fresh branch/PR. Standalone project Pages deployment is opt-in with `ENABLE_PROJECT_PAGES=true`; the current live URL is served by the existing domain repository.

Read these files before changing code:

1. **`docs/GDD.md` in full** — the source of truth. Build the MVP checklist only; the rest is future context.
2. This handoff — especially the owner's later clarifications and deployment path.
3. `README.md` — commands, mechanics, balance choices, save behavior and deployment notes.
4. `docs/MVP-STATUS.md` — checklist status and last observed validation.
5. `docs/VISUALS-HANDOFF.md` — for any art or presentation work: how sprites, tiles and combat are drawn, how to inspect them, and the prioritized list of visuals still to fix.

The owner already approved the architecture and implementation plan. A fresh local session should verify the checkout, run it, publish it, and obtain live feedback.

## Run the downloaded source

Install Node.js 24 and pnpm 11.25.0. The pnpm version is pinned in `package.json`; one installation option is `npm install -g pnpm@11.25.0`.

Extract `DungeonDelver-handoff.zip`. Open a terminal inside the extracted **DungeonDelver** folder, where `package.json` and this file live.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://localhost:5173/DungeonDelver/**. The default development base has the final **r** in Delver.

Verification commands:

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
```

On Linux, browser system dependencies may require `pnpm exec playwright install --with-deps chromium`. The optional `CHROMIUM_PATH` environment variable selects an existing Chromium executable; normally leave it unset and use Playwright's downloaded browser. Browser checks start Vite automatically, or reuse a running local Vite server. Restart Vite after replacing/updating dependencies if it serves stale internal modules.

The source ZIP contains no `node_modules`, package store, `.git` working directory, credentials, or browser saves. Install dependencies locally. The `handoff/` folder in the ZIP holds optional transfer artifacts and is gitignored.

## Put the source on GitHub

Repository: **https://github.com/BattyDev/DungeonDelver**.

Use your laptop's own authenticated Git/GitHub connection. In a local coding session, check the actual remote state and write access before assuming the old cloud restriction applies. With GitHub CLI installed, `gh auth login` and `gh auth setup-git` can configure your local login.

### Preserve the original history

The ZIP includes `handoff/source-history.bundle`, containing the committed source and this handoff. From the directory containing the extracted `DungeonDelver` folder:

```sh
# Creates a separate working folder; does not overwrite the extracted source.
git clone DungeonDelver/handoff/source-history.bundle DungeonDelver-local
cd DungeonDelver-local
git remote set-url origin https://github.com/BattyDev/DungeonDelver.git
git push -u origin main
```

If the remote has gained commits since this handoff, fetch and inspect them first. Do not force-push over other work.

### Start with a fresh local Git history instead

Inside the extracted source folder, if it has no `.git` directory:

```sh
git init -b main
git add .
git commit -m "Import Dungeon Delver MVP"
git remote add origin https://github.com/BattyDev/DungeonDelver.git
git push -u origin main
```

Choose one history approach. The handoff commit is included in the bundle; the six earlier source commits end with `7db9522`, which added a configurable deployment base. The preceding implementation commits cover rules, the client, saves/reset, CI/docs, and adventurer/enemy visual distinction.

## Owner's clarified design direction

### Local playtest feedback, October 21

The local feedback pass implements continuous walking, normalized diagonal speed, wall sliding, smoother click routes, a much lower camera with stable follow, and a replaceable/cancelable combat action queue. Existing version 1 saves remain compatible; fractional walking positions persist. Verification: 40 unit tests, 8 Chromium checks, strict typechecking and production build. Local browser checks use one worker for software WebGL stability. These changes are local; the published game remains the previously verified deployment until a new domain PR is released.

- Replace tile-step walking with continuous movement and smooth diagonal input. The camera should stay much lower, near the characters, so rooms feel larger, and should not jerk at room edges.
- Allow combat actions to be queued before the player's turn, with a way to change or cancel them.
- Puzzles feel good enough. Keep their mechanics intact. *(Superseded on October 21: the owner asked for rooms 2–5× bigger, more enemies, and harder, spread-out puzzles. The mechanics are unchanged; the layouts, piece counts and patrols are new.)*
- Combat feels too trivial and classes feel redundant. The owner will refine class identity and longer combat later; do not rebalance encounters as part of the movement/input pass.
- Future combat direction: tanks begin with more aggro; large heals and damage can pull enemies away if the tank does not maintain threat. Exposed characters should risk dying within one or two turns at the intended level. Shield Bash should become a separate threat-generating move so tanks choose between damage, aggro and defense. This is recorded design direction, not implemented combat behavior.

- **Desktop is the priority.** Do not spend time on additional phone polish before live feedback.
- Aim for a **PokéBonk-style presentation: billboarded 2D character sprites in a real 3D map**, with perspective, walls, lighting and depth. The current camera follows the party in dungeon floors.
- **A ghost is an offline snapshot of another player's character, not a literal ghost.** The first prototype interpreted this too literally; the current source has already replaced floating spirits with ordinary adventurers, faces, clothing, boots and class equipment.
- The owner requested clearer distinction between wandering enemies and players. This is implemented: friendly recruits have teal diamond markers and Recruit/In party labels; the controlled player has a gold circle; enemies have distinct creature silhouettes, red triangle markers and HOSTILE/BOSS labels. Combat portraits use the matching enemy art.
- The owner wants a simpler HUD but explicitly accepted the current HUD temporarily. The supplied low-fidelity reference is included at **`docs/references/safe-room-hud.jpg`**: current level and deepest level at top left, compact party portraits at bottom right, and a **+** for an open party slot. Leave most of the viewport to the world. The example's numbers are illustrative, not new MVP content.
- The owner asked whether sprite sheets can be used. **Yes.** Characters are now 64 × 64 paper dolls from the owner's Paper Doll Studio, which runs as `studio.html` and can send looks straight into the game (see README). Enemies are still generated canvas art. On receiving sheets, inspect frame dimensions, animation rows and facing directions, then replace the visual layer without changing deterministic game rules.
- The immediate goal is to get a live build online so the owner can play and give feedback.

Visual references of the current implementation:

- `docs/previews/characters.png` — three adventurer classes and all six enemy designs.
- `docs/previews/hub.png` — current hub.
- `docs/previews/dungeon.png` — current dungeon presentation.

## Architecture and scope

A pnpm monorepo, strict TypeScript, Vite, Three.js and Vitest. No React or backend is used.

| Location                                       | Responsibility                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `packages/rules/src/types.ts`                  | Serializable game, party, combat, floor, puzzle and save types.                                                     |
| `rng.ts`, `classes.ts`, `items.ts`, `stats.ts` | Seeded RNG, class/equipment tables and floor-level stat sync.                                                       |
| `combat.ts`, `ai.ts`                           | Initiative, one-actor turn resolution, equipment effects, context buckets, weighted behavior and `learn()`.         |
| `content/`                                     | Four floor layouts/patrols, eight fake adventurers, six community companions, five ordinary enemies and Key Warden. |
| `floors/`                                      | Exploration, detection and the four pure puzzle state machines.                                                     |
| `progression.ts`, `game.ts`                    | XP/gold, run lifecycle and top-level command/state transitions.                                                     |
| `save.ts`                                      | Versioned serialization and validation.                                                                             |
| `apps/client/src/controller.ts`                | Commands, keyboard/touch/click interactions, HTML UI, autosave and reset.                                           |
| `apps/client/src/scene/`                       | Three.js world, camera, billboard sprites and generated creature/adventurer textures.                               |
| `apps/client/src/storage/`                     | Small asynchronous Storage interface and localStorage adapter.                                                      |
| `tests/browser/`                               | Playwright browser checks.                                                                                          |
| `.github/workflows/pages.yml`                  | Unit/browser tests, strict typecheck, build and standalone Pages deployment.                                        |

Rules have **no runtime dependencies, DOM or Three.js imports**. All game state is JSON data. Seeded RNG is passed through state; never use `Math.random` for game logic. Exploration advances with fixed 100 ms ticks. `resolveTurn` resolves one actor, while the client schedules automatic companion/enemy turns.

State flow: class select → hub → floors 1–4 ↔ combat → floor 5 safe room; hub/safe-room portals unlock at run completion. Reset returns to class select after confirmation. Gear and class changes are hub-only.

Implemented MVP content: Knight, Cleric, Rogue *(since October 21: Tank, Healer, Archer, Mage and Samurai, at the owner's request, with 40 gear choices; see README)*; all 24 exact gear choices from the GDD; hiring/cards/party indicators; four hand-authored floors with pressure plates, lever order, lights-out braziers and boss/key hunt; locked stairs; visible patrols, wall-aware detection, sneaking and fleeing; autonomous companions; XP/gold; sanctuary portals; wipes; confirmed reset; saves and decision logs.

Do not implement Supabase, auth, real-player lending/social features, procedural floors or floors beyond 5 as part of this MVP. `learn()` and player decision logging exist, but the player profile is not updated automatically in this slice.

## Balance and save decisions already made

- Start with 120 gold; fake adventurers cost 24–32. Four community companions are free (tank, healer, two DPS), and two cost 2 gold. A balanced party remains available after running out of gold.
- Fees are paid up front; snapshots stay fixed for a run. Dismissing a hire does not refund its fee.
- XP persists through wipes. Wipes lose unbanked encounter gold and dismiss hires; return to the unlocked checkpoint. The initial checkpoint is the hub; after reaching sanctuary it is floor 5.
- Reaching floor 5 banks gold, dismisses hires, unlocks the portal and ends the run.
- Party stats sync to each floor. Damage and spent MP carry forward. Victories restore 4 MP; descending grants a potion plus Holy Symbol bonuses, resets Smoke Bomb use and updates resource maxima. Phoenix Feather use remains spent for the run.
- Ordinary flee is 50%; an available living companion's Smoke Bomb guarantees one escape per floor. Fled patrols pause for 4.5 seconds.
- Skill formulas, base stats and enemy balance are initial implementation values, not extra GDD requirements. The **20–30 minute duration target has not been established by a human playtest**.
- Save version: **1**. localStorage key: **`dungeon-delver.save`**. Save includes RNG, combat, floor/puzzle progress, gear, hires, logs and resources. Corrupt/unsupported saves are preserved; the UI offers unsaved play or explicit reset. Reset deletes only this game's key.
- Browser saves are origin-specific. A localhost save will not automatically transfer to battydev.com. No player's save is included in this handoff.

## Validation at handoff

Last observed checks:

- **35 unit tests passed** (rules and storage).
- **4 Chromium browser checks passed** (class/hiring/gear/reload/reset; keyboard plate puzzle; explicit healing target; sanctuary portals and corrupt-save preservation).
- Strict typechecking and production builds passed.
- Balanced-party simulations cleared every shipped encounter for each player class across three seeds.
- All four shipped puzzles have solvability tests; patrol geometry is checked.
- The production build for **`/DungeonDelve/`** was served in isolation and checked in Chromium: asset loading, new character, eight friendly NPCs, three hires, floor 1, two hostile patrol labels and a persisted reload. No browser or HTTP errors were observed.

This handoff adds documentation/reference files only; these are the last observed implementation checks, not a claim of a new full test run for documentation.

## Publishing: two paths with different spellings

**Repository/game name:** DungeonDelver, ending in **r**.

**Original/default project path:** `/DungeonDelver/`, ending in **r**. This remains the Vite default and local dev URL.

**Owner's latest requested live URL:** **https://battydev.com/DungeonDelve/**, without the final **r**. The latest deployment preparation follows that request. Preserve this distinction rather than silently mixing asset bases. If the owner corrects the spelling, update the chosen deployment accordingly.

`apps/client/vite.config.ts` supports `DELVER_BASE_PATH`, with `/DungeonDelver/` as its default.

### Preferred prepared route: existing domain repository

The domain is already hosted by **`BattyDev/BattyDev.github.io`**, with `CNAME` set to `battydev.com`. Its existing Pages workflow assembles the root site plus other games. Publishing the game as a static `DungeonDelve/` directory there requires no additional Pages site or CNAME change.

That repository's `AGENTS.md` requires **a branch and PR; never push directly to its main branch**. Read the current instructions when cloning it. Keep its no-build convention: copy compiled game output; do not add game build tooling to the domain repo. Its other projects, homepage and private sections are outside this change.

The ZIP includes:

- `handoff/DungeonDelve-deploy.patch` — a prepared commit adding only the static game directory and deployment notes to the domain repo.
- `handoff/DungeonDelve-site.zip` — the same compiled game directory, suitable for inspecting/copying.

The original prepared patch was based on domain main `5d8a0db`; it was **never pushed**. Check the current domain branch and any existing `DungeonDelve/` directory before applying it. Do not overwrite newer work. From the parent directory containing extracted `DungeonDelver`:

```sh
git clone https://github.com/BattyDev/BattyDev.github.io.git battydev-site
cd battydev-site
git switch -c deploy/dungeon-delve-mvp
git am ../DungeonDelver/handoff/DungeonDelve-deploy.patch
git push -u origin deploy/dungeon-delve-mvp
```

Then open a PR into main, inspect the diff and merge through that repository's workflow. Watch the existing **Deploy site** Actions run and verify the actual public URL, JS/CSS requests and playable UI. A successful local build or local commit is not a deployment.

If source code changes, rebuild rather than publishing the older compiled snapshot:

```sh
# macOS/Linux shell, in the game source directory
DELVER_BASE_PATH=/DungeonDelve/ pnpm build
```

```powershell
# PowerShell, in the game source directory
$env:DELVER_BASE_PATH = '/DungeonDelve/'
pnpm build
Remove-Item Env:DELVER_BASE_PATH
```

Copy the resulting `apps/client/dist/` contents into the domain repo's `DungeonDelve/` directory, replacing only that game's old hashed assets. Commit that update on the domain branch and use a PR. Verify only the isolated game build during local hosting.

### Standalone project Pages route

The source repo also includes a standalone Pages workflow. It runs on pushes to main, pull requests and manual dispatch; only main deploys. Configure that repo's **Settings → Pages → Source: GitHub Actions** before expecting deployment to succeed. Its default `/DungeonDelver/` path differs from the latest requested `/DungeonDelve/` domain path. Do not run competing domain deployment approaches without deciding which one owns the game URL.

Do not claim the game is live until the public URL and its assets actually work.

## First actions for the next local session

1. Read the GDD, this handoff and the current repository instructions.
2. Establish a genuine local checkout and authenticated GitHub write access; do not assume this chat's old cloud credentials will be reused locally.
3. Run the game and relevant checks; preserve the implemented rules and updated character/monster visuals.
4. Push the source to `BattyDev/DungeonDelver` using the local login.
5. Publish the requested live build through the domain repo's branch/PR process; verify the deployed game, then give the owner the working URL for feedback.
6. After live feedback, prioritize HUD simplification and sprite-sheet integration when assets arrive. Avoid backend or phone-polish scope expansion.

Suggested prompt for a fresh local coding agent:

> Continue the Dungeon Delver MVP in this checkout. Read HANDOFF.md and docs/GDD.md fully first. The architecture was approved and the implementation already exists. Desktop and billboarded 2D adventurers/monsters in a perspective 3D world are the priority; "ghost" means an offline player snapshot. The owner's immediate goal is to get the existing MVP onto GitHub and live at battydev.com/DungeonDelve/ for feedback. Verify local GitHub authentication, push the source, follow the domain repo's AGENTS.md branch/PR deployment rules, and verify the public URL. Do not rewrite the game, add a backend, or assume local commits are already on GitHub. The simpler HUD reference is docs/references/safe-room-hud.jpg; sprite sheets have not been supplied yet.
