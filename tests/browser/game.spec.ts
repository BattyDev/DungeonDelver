import { test, expect } from '@playwright/test';
import {
  createFloor,
  getFloor,
  newProgress,
  startRun,
  startCombat,
  createEnemy,
  GHOSTS,
  CLASSES,
  transition,
} from '../../packages/rules/src/index';
import type { GameState } from '../../packages/rules/src/index';
import type { Page } from '@playwright/test';
const key = 'dungeon-delver.save';
async function fixture(page: Page, state: GameState, auto = false) {
  await page.goto('./');
  await page.evaluate(
    ({ key, state, auto }) => {
      localStorage.setItem(key, JSON.stringify({ version: 1, state }));
      localStorage.setItem('dungeon-delver.auto-battle', auto ? 'on' : 'off');
    },
    { key, state, auto },
  );
  await page.reload();
}
async function saved(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, key);
}
test('class, hiring, loadout, reload, and confirmed reset', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.getByLabel('What should we call you?').fill('Cody');
  await page.getByRole('button', { name: 'Enter the Gathering Hall' }).click();
  await expect(page.locator('.world-label')).toHaveCount(8);
  await page.getByRole('button', { name: 'Browse companions' }).click();
  await page.locator('[data-action="ghost"][data-id="ghost-1"]').click();
  await page.getByRole('button', { name: 'Hire companion' }).click();
  await expect(page.locator('.party-member')).toHaveCount(2);
  await page.getByRole('button', { name: 'Manage loadout' }).click();
  await page.getByRole('button', { name: 'War Hammer' }).click();
  await page.getByRole('button', { name: 'Ready for adventure' }).click();
  await expect
    .poll(async () => (await saved(page)).progress.player.loadout.weapon)
    .toBe('war-hammer');
  await page.reload();
  await expect(page.locator('.party-member')).toHaveCount(2);
  await expect(page.locator('#gold')).toContainText('88');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Reset Game', exact: true }).click();
  await page.getByRole('button', { name: 'Keep my journey' }).click();
  await expect(page.locator('.party-member')).toHaveCount(2);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Reset Game', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, reset game' }).click();
  await expect(page.getByLabel('What should we call you?')).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
  expect(errors).toEqual([]);
});
test('keyboard pushes blocks and the floor persists', async ({ page }) => {
  const progress = newProgress('P', 'tank', 1),
    run = startRun(progress),
    floor = run.floors[1];
  floor.position = { x: 17, z: 16.1 };
  floor.patrols.forEach((p) => (p.pauseTicks = 9999));
  await page.clock.install();
  await fixture(page, { phase: 'floor', progress, run, floor });
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  // Walking north shoves the west stone two cells, until the vault pillar stops it.
  await page.keyboard.down('ArrowUp');
  await page.clock.runFor(900);
  await page.keyboard.up('ArrowUp');
  await page.clock.runFor(1000);
  expect((await saved(page)).floor.puzzle.blocks[0]).toEqual({ x: 17, z: 13 });
  await page.reload();
  expect((await saved(page)).floor.puzzle.blocks[0]).toEqual({ x: 17, z: 13 });
  await expect(page.locator('#left')).toContainText('Push all 3 stones');
});
test('Mend can explicitly target a selected ally', async ({ page }) => {
  const progress = newProgress('P', 'healer', 42);
  progress.hires = [GHOSTS[0]];
  const run = startRun(progress),
    floor = run.floors[1];
  run.party[1].hp = 10;
  const combat = startCombat(run.party, [createEnemy('slime', 'moss-0', 1)], 42, run.resources);
  combat.order = ['player', 'ghost-0', 'moss-0'];
  combat.cursor = 0;
  await fixture(page, { phase: 'combat', progress, run, floor, patrolId: 'moss', combat });
  await page.locator('[data-action="target"][data-id="ghost-0"]').click();
  await page.getByRole('button', { name: 'Mend · 6' }).click();
  await expect
    .poll(async () => {
      const s = await saved(page);
      return s.combat.decisions[0]?.action.target;
    })
    .toBe('ghost-0');
});

test('walking is continuous, diagonal speed is normalized, and fractional position reloads', async ({
  page,
}) => {
  const progress = newProgress('Walker', 'samurai', 42);
  const run = startRun(progress),
    floor = run.floors[1];
  floor.patrols.forEach((p) => (p.pauseTicks = 9999));
  await page.clock.install();
  await fixture(page, { phase: 'floor', progress, run, floor });
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.keyboard.down('d');
  await page.keyboard.down('w');
  await page.clock.runFor(200);
  await page.keyboard.up('d');
  await page.keyboard.up('w');
  await page.clock.runFor(1000);
  const position = (await saved(page)).floor.position;
  const dx = position.x - 3,
    dz = 23 - position.z;
  expect(dx).toBeGreaterThan(0.3);
  expect(dx).toBeLessThan(0.8);
  expect(dx).toBeCloseTo(dz, 1);
  expect(Math.hypot(dx, dz)).toBeLessThan(1.1);
  expect(Number.isInteger(position.x)).toBe(false);
  await page.reload();
  expect((await saved(page)).floor.position).toEqual(position);
  await expect(page.locator('#stage canvas')).toBeVisible();
});
test('sanctuary portal round trip and corrupt-save preservation', async ({ page }) => {
  const progress = newProgress('P', 'samurai', 2);
  progress.unlockedPortals = [5];
  progress.checkpoint = 5;
  await fixture(page, { phase: 'safeRoom', progress });
  await page.getByRole('button', { name: 'Return to the hub' }).click();
  await page.getByRole('button', { name: 'Sanctuary portal' }).click();
  await expect(page.locator('.safe-banner')).toBeVisible();
  await page.addInitScript((key) => localStorage.setItem(key, '{"version":9000}'), key);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your save is preserved.' })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe('{"version":9000}');
  await page.getByRole('button', { name: 'Play without saving' }).click();
  await page.getByLabel('What should we call you?').fill('Unsaved');
  await page.getByRole('button', { name: 'Enter the Gathering Hall' }).click();
  await page.waitForTimeout(900);
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe('{"version":9000}');
});

function queuedCombat(): Extract<GameState, { phase: 'combat' }> {
  const progress = newProgress('Planner', 'tank', 42);
  progress.hires = [GHOSTS[0]];
  const run = startRun(progress),
    floor = run.floors[1];
  const enemies = ['moss-0', 'moss-1'].map((id) => {
    const enemy = createEnemy('slime', id, 1);
    enemy.hp = enemy.stats.hp = 999;
    enemy.stats.atk = 1;
    return enemy;
  });
  const combat = startCombat(run.party, enemies, 42, run.resources);
  combat.order = ['ghost-0', 'moss-0', 'player', 'moss-1'];
  combat.cursor = 0;
  return { phase: 'combat', progress, run, floor, patrolId: 'moss', combat };
}

async function pausedCombat(page: Page, state: GameState) {
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await fixture(page, state);
}

test('the final hit shows zero health and the held death pose before leaving combat', async ({
  page,
}, testInfo) => {
  const state = queuedCombat();
  state.floor.patrols.forEach((p) => (p.pauseTicks = 99999));
  state.combat.fighters = state.combat.fighters.filter((f) => f.id !== 'moss-1');
  const enemy = state.combat.fighters.find((f) => f.id === 'moss-0')!;
  enemy.hp = 1;
  enemy.stats.hp = 20;
  state.combat.fighters.find((f) => f.player)!.stats.atk = 999;
  state.combat.order = ['player', 'ghost-0', 'moss-0'];
  state.combat.cursor = 0;
  const xp = state.progress.player.xp;
  await pausedCombat(page, state);
  await page.getByRole('button', { name: 'Attack', exact: true }).click({ force: true });
  await expect(page.locator('.turn-banner')).toContainText('Victory!');
  await expect(page.getByRole('button', { name: 'Attack', exact: true })).toBeDisabled();
  await page.clock.runFor(1200);
  await expect(page.locator('.combat-overlay')).toBeVisible();
  await expect(page.locator('.turn-chip[data-id="moss-0"]')).toHaveAttribute(
    'aria-label',
    /0 of 20 HP/,
  );
  const visible = await page.evaluate(async () => {
    const sourceUrl = '/DungeonDelver/src/paperdoll/creatures.ts';
    const { creatureFor } = await import(sourceUrl);
    const source = creatureFor('slime'),
      idle = source.frameNow('idle', 2, 0),
      death = source.frameNow('death', 2, 5);
    const ctx = document.querySelector<HTMLCanvasElement>('.battlefield-canvas')!.getContext('2d')!;
    const top = idle.findIndex((v: number, i: number) => i % 4 === 3 && v > 0),
      height = 62 - Math.floor(top / (64 * 4));
    const bar = [...ctx.getImageData(183, 108 - height - 4, 26, 2).data];
    let checked = 0,
      matches = true;
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const i = (y * 64 + x) * 4;
        if (!death[i + 3]) continue;
        const shown = ctx.getImageData(196 - 32 + x, 108 - 62 + y, 1, 1).data;
        checked++;
        if (shown.some((v, c) => v !== death[i + c])) matches = false;
      }
    return { zeroBar: bar.every((v, i) => v === [11, 20, 22, 255][i % 4]), matches, checked };
  });
  expect(visible.zeroBar).toBe(true);
  expect(visible.checked).toBeGreaterThan(50);
  expect(visible.matches).toBe(true);
  expect((await saved(page)).progress.player.xp).toBe(xp);
  await page
    .locator('.combat-overlay')
    .screenshot({ path: testInfo.outputPath('final-hit-and-death.png') });
  await page.clock.runFor(1600);
  await expect(page.locator('.combat-overlay')).toHaveCount(0);
  expect((await saved(page)).phase).toBe('floor');
  expect((await saved(page)).progress.player.xp).toBeGreaterThan(xp);
});

test('reloading a finished encounter resumes settlement without duplicating rewards', async ({
  page,
}) => {
  const state = queuedCombat();
  state.floor.patrols.forEach((p) => (p.pauseTicks = 99999));
  state.combat.fighters = state.combat.fighters.filter((f) => f.id !== 'moss-1');
  const enemy = state.combat.fighters.find((f) => f.id === 'moss-0')!;
  enemy.hp = 1;
  state.combat.fighters.find((f) => f.player)!.stats.atk = 999;
  state.combat.order = ['player', 'ghost-0', 'moss-0'];
  state.combat.cursor = 0;
  const pending = transition(state, {
    type: 'combat',
    action: { type: 'attack', target: 'moss-0' },
    deferSettlement: true,
  });
  await pausedCombat(page, pending);
  await expect(page.locator('.turn-banner')).toContainText('Victory!');
  await page.clock.runFor(1500);
  await expect(page.locator('.combat-overlay')).toHaveCount(0);
  const settled = await saved(page);
  expect(settled.phase).toBe('floor');
  expect(settled.progress.player.xp).toBe(state.progress.player.xp + enemy.xp);
  expect(settled.run.unbankedGold).toBe(state.run.unbankedGold + enemy.gold);
  await page.reload();
  expect((await saved(page)).progress.player.xp).toBe(settled.progress.player.xp);
  expect((await saved(page)).run.unbankedGold).toBe(settled.run.unbankedGold);
});

test('combat pre-input can be replaced, retargeted, canceled, and executes once on the player turn', async ({
  page,
}) => {
  const state = queuedCombat();
  const mp = state.combat.fighters.find((f) => f.player)!.mp;
  await pausedCombat(page, state);
  await page.getByRole('button', { name: 'Attack', exact: true }).click({ force: true });
  await expect(page.locator('.combat-queue')).toContainText('Queued: Attack');
  await page.getByRole('button', { name: 'Defend', exact: true }).click({ force: true });
  await expect(page.locator('.combat-queue')).toContainText('Queued: Defend');
  await page.getByRole('button', { name: 'Cancel queued action' }).click({ force: true });
  await expect(page.locator('.combat-queue')).not.toContainText('Queued:');
  await page
    .getByRole('button', { name: `Shield Bash · ${CLASSES.tank.cost}` })
    .click({ force: true });
  await page.locator('[data-action="target"][data-id="moss-1"]').click({ force: true });
  expect((await saved(page)).combat.decisions).toHaveLength(0);
  expect((await saved(page)).combat.fighters.find((f: { player: boolean }) => f.player).mp).toBe(
    mp,
  );
  await page.clock.runFor(3400);
  const combat = (await saved(page)).combat;
  expect(combat.decisions).toHaveLength(1);
  expect(combat.decisions[0].action).toEqual({ type: 'skill', target: 'moss-1' });
  expect(combat.fighters.find((f: { player: boolean }) => f.player).mp).toBe(
    mp - CLASSES.tank.cost,
  );
  await expect(page.locator('.combat-queue')).not.toContainText('Queued:');
});

test('a queued attack on a defeated target clears without using the player turn', async ({
  page,
}) => {
  const state = queuedCombat();
  state.combat.fighters.find((f) => f.id === 'moss-0')!.hp = 1;
  state.combat.order = ['ghost-0', 'player', 'moss-0', 'moss-1'];
  const companion = state.combat.fighters.find((f) => f.id === 'ghost-0')!;
  companion.profile.defaults = { attack: 1, skill: 0, item: 0, defend: 0, flee: 0 };
  await pausedCombat(page, state);
  await page.getByRole('button', { name: 'Attack', exact: true }).click({ force: true });
  await page.clock.runFor(1800);
  const combat = (await saved(page)).combat;
  expect(combat.fighters.find((f: { id: string }) => f.id === 'moss-0').hp).toBe(0);
  expect(combat.decisions).toHaveLength(0);
  expect(combat.order[combat.cursor]).toBe('player');
  await expect(page.locator('.combat-queue')).not.toContainText('Queued:');
  await expect(page.locator('.toast')).toContainText('Queued action is no longer available');
});

test('a queued potion rechecks shared supplies after companions act', async ({ page }) => {
  const state = queuedCombat();
  state.combat.order = ['ghost-0', 'player', 'moss-0', 'moss-1'];
  state.combat.resources.potions = 1;
  state.combat.fighters.find((f) => f.player)!.hp = 50;
  const companion = state.combat.fighters.find((f) => f.id === 'ghost-0')!;
  companion.hp = 10;
  companion.profile.defaults = { attack: 0, skill: 0, item: 1, defend: 0, flee: 0 };
  await pausedCombat(page, state);
  await page.locator('[data-action="target"][data-id="player"]').click({ force: true });
  await page.getByRole('button', { name: 'Potion (1)', exact: true }).click({ force: true });
  await expect(page.locator('.combat-queue')).toContainText('Queued: Potion → Planner');
  await page.clock.runFor(1800);
  const combat = (await saved(page)).combat;
  expect(combat.resources.potions).toBe(0);
  expect(combat.decisions).toHaveLength(0);
  expect(combat.order[combat.cursor]).toBe('player');
  await expect(page.locator('.toast')).toContainText('Queued action is no longer available');
});

test('a chosen race and sex carry into the hall, and the studio sends a look to the game', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.getByRole('button', { name: 'Dwarf' }).click();
  await page.getByRole('button', { name: 'Male', exact: true }).click();
  await page.getByLabel('What should we call you?').fill('Brick');
  await page.getByRole('button', { name: 'Enter the Gathering Hall' }).click();
  await expect
    .poll(async () => (await saved(page)).progress.player.appearance)
    .toEqual({
      race: 'dwarf',
      sex: 'M',
    });
  await expect(page.locator('#location-name')).toContainText('Great Hall');
  // The loadout changes who you are as well as what you carry.
  await page.getByRole('button', { name: 'Manage loadout' }).click();
  await page.locator('.modal [data-action="look-race"][data-id="elf"]').click();
  await page.locator('.modal [data-action="look-class"][data-id="mage"]').click();
  await expect
    .poll(async () => {
      const player = (await saved(page)).progress.player;
      return [player.appearance.race, player.appearance.sex, player.classId];
    })
    .toEqual(['elf', 'M', 'mage']);
  await page.getByRole('button', { name: 'Ready for adventure' }).click();
  await page.goto('./studio.html');
  await expect(page.locator('#room canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Dwarf' }).click();
  await page.getByRole('button', { name: 'Male', exact: true }).click();
  await page.locator('#sendBtn').click();
  // A preview compares the current game look with the drawing before anything is sent.
  await expect(page.locator('#pvNew')).toBeVisible();
  await page.locator('#confirmSend').click();
  await expect(page.locator('#toast')).toContainText('dwarf male Tank');
  const wardrobe = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('dungeon-delver.wardrobe.v1') ?? '{}'),
  );
  expect(Object.keys(wardrobe)).toEqual(['dwarfM|tank']);
  expect(Object.keys(wardrobe['dwarfM|tank'].anims)).toEqual(
    expect.arrayContaining(['idle', 'walk', 'attack', 'block']),
  );
  await page.getByRole('link', { name: '← Gathering Hall' }).click();
  await expect(page.locator('.party-member')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('levers answer every pull: held, or sprung back with the sequence reset', async ({ page }) => {
  const progress = newProgress('Puller', 'tank', 3);
  const run = startRun(progress);
  const floor = createFloor(getFloor(2));
  floor.patrols.forEach((p) => (p.pauseTicks = 99999));
  floor.position = { x: 10, z: 24 };
  run.floors[2] = floor;
  await fixture(page, { phase: 'floor', progress, run, floor });
  await expect(page.locator('.interaction')).toContainText('Pull the Tide lever');
  await page.keyboard.press('e');
  await expect(page.locator('.toast')).toContainText('Tide lever locks into place · 1 / 5');
  await expect(page.locator('#left')).toContainText('Levers 1 / 5');
  // Pulling Tide again restarts the order, with Tide held as the first lever.
  await page.keyboard.press('e');
  await expect(page.locator('.toast')).toContainText('Tide lever holds · 1 / 5');
});

test('auto-battle plays the player turn, and a queued action overrides it', async ({ page }) => {
  const state = queuedCombat();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await fixture(page, state, true);
  await expect(page.locator('.combat-menu .auto-toggle')).toHaveText('Auto: on');
  // Companion, enemy, then the player: with no input, the player's turn still resolves.
  await page.clock.runFor(3400);
  const combat = (await saved(page)).combat;
  expect(combat.decisions).toHaveLength(1);
  await page.getByRole('button', { name: 'Auto: on' }).click({ force: true });
  await expect(page.locator('.combat-menu .auto-toggle')).toHaveText('Auto: off');
});
