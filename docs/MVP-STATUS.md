# MVP acceptance status

This report follows the Definition of Done in GDD.md. “Implemented” describes the local build; public deployment remains separate.

| GDD checklist     | Status                        | Evidence                                                                                                                                                                      |
| ----------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New game          | Implemented                   | Name and three classes; browser check creates a character and enters the hub.                                                                                                 |
| Hub               | Implemented                   | Three.js room, eight named billboard sprites walking waypoint loops, distinct gear/presets.                                                                                   |
| Hiring            | Implemented                   | NPC cards and roster; fixed snapshots, up to three hires, tank/healer indicators, owner/duplicate and budget checks.                                                          |
| Gold              | Implemented                   | 120 starting gold covers three average hires; six community ghosts cost 0–2, with a free balanced-party fallback.                                                             |
| Loadout           | Implemented                   | All 24 exact GDD items; four class-specific A/B slots. Browser check persists a gear change.                                                                                  |
| Floors 1–4        | Implemented                   | Hand-authored geometry, puzzles and locked stairs. Each shipped puzzle has a legal solution test.                                                                             |
| Enemies           | Implemented                   | Five ordinary enemy types and Key Warden; visible patrols/radius rings, wall-aware detection, sneak, flee and grace period.                                                   |
| Combat            | Implemented                   | Speed initiative, player actions, autonomous profile-weighted companions, MP, potions, defend and equipment effects.                                                          |
| Floor 5 safe room | Implemented                   | Run completion, banking, portal unlock and round-trip browser check.                                                                                                          |
| Failure           | Implemented                   | XP retained, unbanked gold lost, hires dismissed, return to checkpoint; rules test verifies first-run hub return.                                                             |
| Reset             | Implemented                   | Confirmation/cancellation and key deletion verified in Chromium.                                                                                                              |
| Deploy            | Blocked by GitHub permissions | Workflow is implemented. Both git push and Pages configuration were rejected with HTTP 403, “Resource not accessible by integration.” No public deployment has been verified. |

Additional checks: strict typechecking includes rules, client, tests and tool configs. A combat save resumes the exact same next turn. Unsupported saves remain untouched, including when the player chooses to play without saving. Balanced party simulations clear every encounter for each player class across three seeds.

## Scope decisions and remaining limits

- Upfront gold fees and fixed ghost snapshots were chosen from the GDD's open options.
- Four community spirits are free (tank, healer, two DPS) and two cost 2 gold, so running out of gold never requires a reset.
- A wipe loses unbanked gold; reaching floor 5 banks it and dismisses hires. A later wipe returns to the unlocked checkpoint, consistent with the core-loop checkpoint rule.
- Skill formulas/base stats and small encounter MP recovery are initial tuning values, documented in README.md.
- Desktop and the 2D-sprites-in-3D presentation take priority, following the user's clarification. Touch controls remain basic.
- The 20–30 minute duration target needs human playtesting. Automated clearability does not establish that timing.
- No scope was added for the backend or later social/procedural systems. Only deterministic decision logging and the unused learning code path prepare for them.

## Final local checks

- `pnpm test`: 35 tests passing.
- `pnpm typecheck`: passing, including test and tool configurations.
- `pnpm test:browser`: 4 Chromium browser checks passing.
- `pnpm build`: passing with the `/DungeonDelver/` asset base.
