# Visuals handoff

Updated October 22, 2026. This is the work list for the next session that improves how Dungeon Delver looks. It covers what is drawn where, how to see it, and what's still wrong, in priority order. Gameplay, rules and balance are out of scope. Read `HANDOFF.md` and `README.md` for those.

The owner plays the live build at https://battydev.com/DungeonDelve/ and reports by eye. Each item below names the symptom they'd see, so a fix can be checked the same way.

## Portraits (October 22 release)

Conversation and party portraits are separate from sprite sheets: 64 × 64 busts, optionally animated (1–16 frames, played for a few loops and then resting on frame 1).

- **Default faces** are ten busts (five races × female/male), rebuilt from a generated reference in `apps/client/public/portraits/defaults-v2.png` (a 320 × 128 strip; columns follow `RACES`, female on top). `tools/portraits/slice_defaults.py docs/references/portraits-reference-v2.webp apps/client/public/portraits/defaults-v2.png` rebuilds it: it cuts each bust out of the backdrop, reduces it to 64 px with a 48-colour palette, and adds the one-pixel sprite outline. Alpha is binary and transparent pixels are normalized. The exact built-in generation prompt and asset provenance are in `docs/references/portraits-reference-v2.md`. These are reduced reference images loaded into editable buffers, rather than manually redrawn portraits. `paperdoll/default-portraits.ts` validates and loads the strip once; until it arrives, and as the Portrait Studio's **Blank head shape**, the drawn faces from `portraitPixels()` stand in. Their back hair now draws before the shoulders and neck, fixing the dark hair patch across the female neck.
- **Portrait Studio** (`portraits.html`, linked from the Sprite Studio's header) paints a portrait for a race-and-sex default or for one person: your character or any companion. **Use portrait in game** stores it in `dungeon-delver.portraits.v1`; drafts autosave separately. A person's portrait wins over the race/sex default. A companion with a painted portrait keeps that portrait's body on later visits (`scene/cast.ts`).
- **In the game**, `ui/portraits.ts` draws portraits in the party HUD, roster, hire card (animated), and turn order, from the game's single animation loop.
- The palette starts with the current painting's 24 most-used colours, followed by the existing race and sprite colours. Existing drafts and published paintings are preserved; **Default face** replaces just the current frame and can be undone.
- Tests: `paperdoll/portraits.test.ts` covers storage, validation, playback timing, paint tools and the exposed fallback neck. Four portrait browser checks verify an edited pixel on a companion's hire card, all ten editable defaults against the atlas, binary alpha and palette limits, symmetry/undo, the 16-frame ceiling, separate drafts/reload/body switching, per-person appearance across visits, actual dialogue animation/hold/restart and reduced motion. The full suite passes: **82 unit tests and 18 Chromium browser checks**, plus strict typechecks and the production build.
- Review images: `docs/previews/portrait-heads.png`, `portrait-studio.png` and `portrait-reference-pixels.png` (the ten revised defaults enlarged without smoothing). Refresh the first two with `node tools/portrait-review.mjs`.

**Follow-ups:** companions who share a race and sex also share a default face until someone paints them one, so a hall that rolls several dwarf women shows the same portrait several times. A few face variants per body, or per-person hair hue shifts, would fix that. Separately, the painted defaults and the default sprites disagree in places. Gnomes have copper and brown curls in the portraits but silver hair on their sprites, and the portraits' clothing doesn't follow class. Consider per-sex default hair colours on the sprites (V13), or class-tinted portrait clothing.

## Combat ending follow-up (October 22 release)

The last blow previously settled the encounter immediately, so `Controller` discarded the battlefield before `CombatStage` ever received the lethal hit. Zero-health bars were also hidden.

- The client now requests deferred settlement for player and AI turns. A terminal combat state remains visible for the impact delay, the complete death animation and a half-second held pose (about 1.53 seconds total). Actions and target selection stop during this sequence, and the UI shows the outcome instead of prompting for another turn.
- On impact, displayed health drains to the new value over 0.22 seconds. Empty bars remain visible with **0 HP**, and a held death frame cannot fall back to idle while art is queued. Escape uses a shorter pause. Settings/hidden-window pauses do not advance the ending animation.
- `finishCombat` applies the existing reward/wipe/escape settlement once presentation finishes. Rules callers that omit `deferSettlement` retain immediate settlement. Terminal combat states already fit the version-1 save schema; reloading one shows its final pose briefly and settles normally, without awarding XP/gold twice.
- `combat-settlement.test.ts` covers player and companion final blows, save restoration, terminal input rejection, early finish rejection, and one-time victory/wipe/flee settlement. Browser checks compare the zero-health canvas bar and every opaque pixel of the final slime death pose, then verify the return to exploration. A second browser check restores a terminal save and checks rewards across another reload.

Review image: `docs/previews/combat-ending.png`. Validation for the combined local changes: 76 unit tests, strict typecheck, production build, and 14 Chromium browser checks.

## Sprite consistency follow-up (October 22 release)

The owner reported a black patch on the female orc tank's north walk, ears showing through SW/SE helmets, detached heads, and female bodies that were difficult to distinguish. This pass changes the shared procedural renderer, rather than painting individual frames:

- The rig now includes a neck. Full limb capsules have rounded joint ends; partial cuffs and hems stay flat. Body connectivity is checked across **4,800 frames**: all ten bodies, thirteen animations, every frame, and eight directions.
- Raster overlap uses interpolated endpoint depth per pixel, with rounded depth surfaces for heads and headwear. Diagonal helmet openings turn with the face and cover the ear roots; pointed ear tips can remain outside the shell. Helm/kabuto eyes remain open.
- Ponytails use their projected depth in each direction, taper toward the end, and hang over clothing under headwear. This removes the clipped fragments on the north-facing back. Short temple locks frame the face. New Studio presets use the same hair/clothing/headwear order as game defaults.
- Female rigs have narrower shoulders, a clearer waist and wider hip spacing, with slimmer arms. Leather, plate and robes follow the same waist profile. Each race keeps its height, head size, skin and build identity.
- Hats, helmet openings and hair caps rotate with a fallen body. Staves rotate too, retain their length and slide through the grip to keep raised gems inside the frame. The healer raises the staff slightly forward so the flare stays visible. Combat uses body-depth clipping for held items instead of also burying the whole weapon behind the body with a walking-only layer override. Gloves/held gear use hand depth.
- The rasterizer rejects pixels outside each shape's bounds before doing geometry work. The broader pose checks remain fast enough for the normal unit suite.

Review captures are in `docs/previews/consistency-before/` and `consistency-after/`. `node tools/sprite-consistency.mjs after` captures all fifty default looks at eight angles, the six enemies, and per-layer orc walk strips. Add `--full` for twenty-five race/class sheets containing both sexes, all six walk frames in the five drawn directions (the other three mirror these), plus combat/block/hurt/death strips. The script uses an isolated browser profile.

Existing Studio projects and sent wardrobe sheets retain their saved pixels. To apply the new generated shapes to an existing project, use **Project → Reset**, choose the scope and layers deliberately, and confirm; Undo restores the prior pixels. If an old project still puts Hair beneath clothing, move Hair above the clothing and below the helmet with the layer-order arrows. Imported/painted work is never silently regenerated. Fresh projects use the updated starter order. The Studio's **Behind** toggle now keeps combat order separate from walking-direction overrides; the browser check verifies each can be edited independently.

Validation: 72 unit tests, strict typecheck, production build and 12 Chromium browser checks. Focused regressions cover joint/depth behavior, all-pose connectivity, diagonal ear roots, six-frame north ponytail fill, rotated hats, and the healer flare on every body through healing/channel poses. Browser checks include drawing through the mirrored-direction shortcut and sending a Studio look to the game.

## Studio editing follow-up (October 22 release)

The mirrored-view warning now offers **Draw on W/NW/SW** and **Mirror settings** buttons. The first opens the editable source while preserving the selected frame and layer; the second opens Project and focuses direction mirroring. The brush Mirror tool is labeled **Symmetry** to distinguish it from linked directions. `tests/browser/studio.spec.ts` verifies all three shortcuts and an actual stroke reflected into the E preview. The browser check, typecheck and build pass.

## October 21 follow-up status (deployed)

Completed **V1–V5, V9 and V11** on top of the earlier visual pass. Published at https://battydev.com/DungeonDelve/ through domain PR #27; source PR #2 is merged. All 61 unit tests, typecheck, build and 11 browser checks passed in GitHub Actions. The live game files matched the tested build, and the live character/hiring/floor/save/studio smoke check passed. The remaining priorities are **V6 (combat effects), V7 (backdrop perspective), V8 (wall cutaway), V10 (torch lighting)**, followed by V12–V17.

- Enemies now use `paperdoll/creatures.ts`: native 64 × 64 RGBA frames from the same rasterizer as the dolls. Humanoids use their skeletons and gear; slimes, bats and wisps have dedicated shapes. All six turn and animate, play hurt/death in combat, and share their idle art with turn-order portraits. The Warden gets its size from its body and armour; no sprite upscaling.
- `scene/contact-shadow.ts` supplies horizontal floor shadows for the player, companions, wanderers, grounded enemies and studio preview. They follow positions and visibility and are disposed with their sprites. Flying enemies have no contact shadow.
- Default helms/kabutos are enabled. Eye openings and crown/crest bounds are checked across every race, sex and all eight directions. Tall bodies reserve headroom; the wizard crown bends back and compresses vertically to fit. The old orc-mage test exception is removed.
- The Archer keeps its bow upright while aiming, pulls a single continuous string path to the nock, and draws a horizontal arrow. The string has its own depth behind the arms; putting it earlier inside the weapon layer alone did not hide it at overlaps. A regression test checks this during full draw for every race and sex. Robe layers skip redundant inner depth outlines. Fallen companions hold their last death frame immediately and can return to idle when revived.
- Validation: **61 unit tests**, strict typecheck and production build pass after the bowstring correction; **11 Chromium browser checks** passed during the preceding visual pass. The updated shoot strip was checked in Chromium. `tools/visual-review.mjs` captures the sheets, hall, studio, combat and fallen enemies; it also checks held death/revival and shadow sizing, movement, flight exclusion and disposal. It uses an isolated browser profile and does not touch the owner's save. Use `node tools/visual-review.mjs archer` for just the shoot strip.
- Browser timing note: checks now use one worker and a 60-second budget on both local and hosted runners. Parallel software WebGL instances caused timeouts; the serialized GitHub Actions rerun passed all 11 checks. Avoid concurrent WebGL captures during the suite.
- Review images: `docs/previews/visuals-priority-before.png` / `visuals-priority-after.png`, `archer-before.png` / `archer-after.png`, `creatures-*-after.png`, `combat-creatures*.png`, `combat-humanoids*.png`, `visuals-hall.png`, `visuals-dungeon.png` (includes a fallen companion), and `visuals-studio.png`. With Vite running, use `node tools/visual-review.mjs after` to refresh them. On Windows, point `PLAYWRIGHT_BROWSERS_PATH` to the installed browser cache if needed.

The numbered descriptions below preserve the original symptoms and acceptance criteria; completed items are marked.

## How the visuals are built

Everything is generated at runtime. There are no image assets.

| What | Where | Notes |
| --- | --- | --- |
| Character shapes (body, hair, gear) | `apps/client/src/paperdoll/pose.ts` | `skeleton()` poses a 3D stick figure per animation frame and direction. `blockGear()` turns one layer (slot + style + colour) into 64 × 64 pixels. `raster()` fills capsules and circles, tracks depth per pixel, and outlines the silhouette and any near part that crosses a far one. Gear is cut wherever the bare body is nearer (`OCCLUDE`), so arms show over chest pieces and far-hand items go behind the body. |
| Pose data | `POSES` in `pose.ts` | Joint angles per frame. Arms: `aR`/`aL` = [shoulder swing, elbow bend]. Legs: `lR`/`lL`. Also `lean`, `tilt`, `rot` (falling) and `breath`. |
| Tables | `apps/client/src/paperdoll/model.ts` | Animations, five classes and their animation lists, slot styles, class gear presets (`PRESETS`), races and sexes, palette. |
| A character's layers and frames | `apps/client/src/paperdoll/looks.ts` | `lookLayers()` (base, hair, gear, beard), `Doll` (builds frames lazily and mirrors NE/E/SE from NW/W/SW), `pumpDolls()` (time-sliced building). Looks sent from the studio replace the defaults (`wardrobe.ts`). |
| In-world character | `apps/client/src/scene/doll-sprite.ts` | Picks walk/idle and direction from movement and plays one-shot animations. Drawn as an upright `billboard()` (`scene/billboard.ts`), not a `THREE.Sprite`, so it never leans into walls. |
| Who looks like what | `apps/client/src/scene/cast.ts` | Hall wanderers and companions get random looks, rerolled once per browser session. |
| Tiles, walls, props, lever icons | `apps/client/src/scene/pixels.ts` | Procedural pixel art per theme (`THEMES`: hall, overgrown, archive, ember, keep). `prop()` makes billboard props; `leverTexture()` draws lever plaques with symbols. |
| World, camera, wall cutaway | `apps/client/src/scene/world.ts` | Instanced floors and walls, wall lowering near the camera (`layoutWalls`), the party trail, hall wanderers, enemies, signs and puzzle feedback. |
| Enemies | `paperdoll/creatures.ts`, `scene/sprites.ts` | Native 64 × 64 frames, shared rasterizer/outline and humanoid skeletons; `FrameSource` drives world/combat animation, `enemyTexture()` supplies matching portraits. |
| Combat view | `apps/client/src/ui/combat-stage.ts` | 2D canvas battlefield: dolls from the combat camera (east), enemy images, lunges, hurt/death, floating numbers, HP/MP bars. |
| Studio and changing room | `apps/client/src/studio/` | Uses the same `pose.ts`, so improving block-ins also improves the studio's starter art. |

### Seeing it

- `pnpm dev` (or `node apps/client/node_modules/vite/bin/vite.js apps/client --port 5173`; pnpm isn't on PATH on the owner's machine), then open **`/DungeonDelver/debug-sheet.html`**. This dev-only contact sheet takes these URL parameters:
  - `bodies=humanM,orcF,dwarfM,gnomeF`
  - `classes=tank,mage`
  - `anim=walk&frame=1`
  - `dirs=0,2,4,6` (0 S, 1 SW, 2 W, 3 NW, 4 N, 5 NE, 6 E, 7 SE)
  - `combat=`, or `combat=death`, for a combat animation strip
  - `creatures=`, or `creatures=slime,warden`, to inspect enemies instead of classes
  - `scale=3`

  When the sheet has finished drawing, the page title becomes `ready`.
- `docs/previews/sprite-polish.png` shows the October 21 pass before and after. Repeat that comparison for any change: screenshot the sheet, swap in the old code, screenshot it again, and put the two side by side.
- `apps/client/src/paperdoll/looks.test.ts` checks every race × sex × class for content and ground alignment, plus headwear bounds and open eyes in all directions. `creatures.test.ts` checks all six enemies' animation content, binary alpha, visible reactions, facing and mirroring. Keep both passing.

## What the October 21 pass fixed

- **Arms and gear:** arms no longer vanish behind chest pieces. Near limbs are outlined against the torso, and robe sleeves are a shade darker than the robe.
- **Held items:** off-hand items and weapons in the far hand now go behind the body while walking and turning. Before, they stayed on top.
- **Headwear:** hoods and helms leave the face open (with no outline ring inside the opening), and the wizard-hat brim sits above the eyes.
- **Torso pieces:** they stop at the neck. Beards draw over chest pieces, and dwarves no longer lose their chin.
- **Samurai:** the shoulder plates are slimmer.
- **Combat animations:** the Archer shows a drawn string and nocked arrow, the Mage's cast throws a small bolt, and the healer's staff flares at the heal peak and while channelling.

## Work list, highest priority first

### P1: the biggest visible gaps

**V1. [Completed locally] Enemies don't match the characters.** Slimes, bats, skeletons, wisps, cultists and the Warden are smooth vector drawings, squashed to 44 px and pixelated. They don't animate apart from a bob, and they never turn. Next to the paper dolls they look like a different game, and the Warden (scaled 1.5×) has visibly bigger pixels.
*Fix:* draw enemies with the same pixel pipeline. Humanoids (skeleton, cultist, Warden) can be paper dolls with new presets: bone colours, robes and a mask, heavy armour. Slime, bat and wisp need small dedicated `Pix` drawings with 2–4 frames of idle and a hurt frame, at the 64 px frame scale. Then use the same art in the combat stage, its turn-order portraits, and the world.
*Files:* `scene/sprites.ts`, `scene/pixels.ts` (or a new `paperdoll/creatures.ts`), `ui/combat-stage.ts` (`enemyImage`), `controller.ts` (turn-order portraits use `enemyTexture`).
*Done when:* enemies sit at the same pixel size and outline weight as characters, and idle, hurt and die in combat.

**V2. [Completed locally] No contact shadows.** Characters, wanderers and enemies stand on the floor with no shadow, so they float, especially on the carpet and stone.
*Fix:* add a small dark ellipse under each billboard: a flat `PlaneGeometry` with a radial alpha texture, kept at y = 0.01. Scale it with body size (gnome to orc), and leave it out for flying bats and wisps.
*Files:* `scene/doll-sprite.ts`, `scene/world.ts` (enemies).

**V3. [Completed locally] Helmets never show on defaults.** The Tank's `helm` and the Samurai's `kabuto` are marked hidden in `PRESETS` (the fifth entry), from back when they covered the face. They now leave the face open.
*Fix:* unhide them and check every race in all eight directions. They must not cover the eyes, and the kabuto crest must not leave the top of the frame on orcs.
*Files:* `paperdoll/model.ts` `PRESETS`, `pose.ts` (helmet branch).

**V4. [Completed locally] The Archer's drawn string reads as an X over the face** in shoot frames 2–3, because two string lines and the arrow cross. Draw one string line, from the bow tip to the hand to the other tip, plus an arrow that is clearly horizontal and pointing forward. Consider leaving the string straight in frames 0 and 4–5.
*Files:* `pose.ts` (weapon → bow).

**V5. [Completed locally] Wizard hats on tall bodies are squashed.** Orcs fill the 64 px frame, so the tip is clamped (`Math.max(5.5, …)`) and the hat turns into a bowler.
*Fix:* for tall bodies, draw a shorter, wider-brimmed hat that bends back, rather than clamping. Or render tall races about 4 px lower with a smaller scale. Then drop the orc-mage exception in `looks.test.ts`.

### P2: polish people will notice

**V6. Combat has no hit effects or projectiles.** Only lunges, flashes and numbers show what happened. Add a short slash arc for melee, a travelling arrow for the Archer, a bolt travelling to the target for the Mage, a green sparkle on heal targets and a shield flash on Defend. All of these are 2D effects in `CombatStage.update`/`draw`.
*Files:* `ui/combat-stage.ts`.

**V7. Combat backdrop is flat.** It's a wall strip over tiled floor with everything the same size. Add a perspective floor (rows shrinking toward the wall), a few props from the floor theme (torches, banners), and slightly smaller far rows. Keep the HP bars legible.

**V8. Wall cutaway is abrupt.** Lowered walls show as dark stubs, props on them pop out, and long rooms show a band of black caps along the bottom edge.
*Fix:* fade (alpha) instead of, or as well as, shrinking. Give the cut cap a lighter top texture. Fade the props that hang on those walls instead of hiding them.
*Files:* `world.ts` `layoutWalls`, `pixels.ts` `capTexture`.

**V9. [Completed locally] Robe sleeves crossing the body draw as a hanging "U" loop** in side views, because the inner outline traces the whole sleeve. Restrict inner outlines to the sleeve's front edge, or skip them between parts of the same layer whose colours already differ.
*Files:* `pose.ts` `raster()` (`INNER_EDGE`, `nearer`).

**V10. Lighting is flat.** One ambient light, one sun and a point light on the player. Torches are emissive sprites that light nothing.
*Fix:* add a few warm point lights at the nearest torches (cap about 6, nearest the camera), or bake light into the floor tiles around torches. Make floor 4 darker.
*Files:* `world.ts`.

**V11. [Completed locally] Fallen companions vanish** while exploring (`sprite.visible = alive`). Show them lying down instead, using the last death frame, or as a faint ghost that follows. Players currently think companions left.
*Files:* `world.ts` `syncParty`, `doll-sprite.ts` (hold `death`).

### P3: nice to have

- **V12.** The hall carpet is very saturated, and floor tiles visibly repeat. Add variants and detail tiles (cracks, drains, grates), and tone the carpet down.
- **V13.** Default hair: men always get "short" or "long", and colour is always the race default. Add a few hair colours per race and more styles (braid, mohawk, bald).
- **V14.** Gnomes read very small from the default camera. Consider a minimum on-screen scale for small races, or a slightly closer camera when the party is all small.
- **V15.** The class-select cards show a static idle frame. They could slowly turn or walk.
- **V16.** The changing room always uses hall textures and props. A plain backdrop option, or one that matches the current floor theme, would help when judging colours.
- **V17.** Followers still overlap each other in tight corridors. Offset the trail sideways a little, alternating left and right, so the party reads as a line.

## Constraints to keep

- **Frames:** 64 × 64, with feet on row 62.5. Eight walking directions in the order S, SW, W, NW, N, NE, E, SE, where NE/E/SE mirror NW/W/SW. Combat uses one camera, facing east. The studio's sheets and the game's wardrobe (`dungeon-delver.wardrobe.v1`) depend on all of this, so don't change it without a migration.
- **Shared drawing code:** `pose.ts` is shared with the studio. Any change to block-ins changes the studio's starter art too. That's intended, but check the studio (`/DungeonDelver/studio.html`) and its changing room as well.
- **Pixel scale:** keep props and tiles at the character pixel scale (`PIXEL = 1.85 / 64` world units per pixel). Mixed pixel sizes are the main thing that makes the art look inconsistent.
- **Rules stay untouched:** the rules package has no rendering. Visual work shouldn't touch `packages/rules` except for content descriptions.
- **Checks before publishing:** run `pnpm test`, `pnpm typecheck` and `pnpm test:browser`, then publish through the site repo's branch-and-PR route (see `HANDOFF.md`) and verify the live URL.
