import { test, expect } from '@playwright/test';
import {
  newProgress,
  startRun,
  startCombat,
  createEnemy,
  GHOSTS,
} from '../../packages/rules/src/index';
import type { GameState } from '../../packages/rules/src/index';
import type { Page } from '@playwright/test';
const key = 'dungeon-delver.save';
async function fixture(page: Page, state: GameState) {
  await page.goto('./');
  await page.evaluate(
    ({ key, state }) => localStorage.setItem(key, JSON.stringify({ version: 1, state })),
    { key, state },
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
  const progress = newProgress('P', 'knight', 1),
    run = startRun(progress),
    floor = run.floors[1];
  floor.position = { x: 4, z: 5 };
  floor.patrols.forEach((p) => (p.pauseTicks = 9999));
  await page.clock.install();
  await fixture(page, { phase: 'floor', progress, run, floor });
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  for (const [key, duration] of [
    ['ArrowUp', 450],
    ['ArrowRight', 225],
    ['ArrowDown', 450],
    ['ArrowRight', 225],
    ['ArrowUp', 450],
  ] as const) {
    await page.keyboard.down(key);
    await page.clock.runFor(duration);
    await page.keyboard.up(key);
  }
  await page.clock.runFor(1000);
  expect((await saved(page)).floor.puzzle.blocks.map((b: { z: number }) => b.z)).toEqual([2, 2]);
  await page.reload();
  await expect(page.locator('#left')).toContainText('The seal is broken');
});
test('Mend can explicitly target a selected ally', async ({ page }) => {
  const progress = newProgress('P', 'cleric', 42);
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
  const progress = newProgress('Walker', 'rogue', 42);
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
  const dx = position.x - 2,
    dz = 10 - position.z;
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
  const progress = newProgress('P', 'rogue', 2);
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
