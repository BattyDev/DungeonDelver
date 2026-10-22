import { test, expect } from '@playwright/test';

test('mirrored previews lead to an editable source and show the resulting stroke', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./studio.html');
  await page.locator('#room canvas').waitFor();
  await page.locator('#modeSeg [data-mode="body"]').click();
  await page.locator('#layers .label').filter({ hasText: 'Base body' }).click();
  await page.locator('#animSeg [data-anim="walk"]').click();
  await page.locator('#frames button').nth(2).click();

  for (const [preview, source, label] of [
    [5, 3, 'NW'],
    [6, 2, 'W'],
    [7, 1, 'SW'],
  ] as const) {
    await page.locator(`#dirSeg [data-dir="${preview}"]`).click();
    await expect(page.locator('#mirrorNote')).toBeVisible();
    await page.getByRole('button', { name: `Draw on ${label}`, exact: true }).click();
    await expect(page.locator(`#dirSeg [data-dir="${source}"]`)).toHaveClass(/on/);
    await expect(page.locator('#mirrorNote')).toBeHidden();
    await expect(page.locator('#poseHint')).toContainText('frame 3/6');
    await expect(page.locator('#layers .layer.on .label')).toHaveText('Base body');
    await expect(page.locator('#autoMirrorChk')).toBeChecked();
  }

  await page.locator('#dirSeg [data-dir="6"]').click();
  await page.screenshot({ path: testInfo.outputPath('mirrored-help.png') });
  await page.getByRole('button', { name: 'Mirror settings', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Project', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('#autoMirrorChk')).toBeFocused();
  await page.getByRole('button', { name: 'Draw on W', exact: true }).click();

  for (const id of ['guideChk', 'onionChk', 'gridChk', 'overlayChk'])
    await page.locator(`#${id}`).uncheck();
  await page.locator('#palette [data-c="#b0383b"]').click();
  const board = page.locator('#board'),
    bounds = await board.boundingBox();
  if (!bounds) throw new Error('Drawing board is missing.');
  await page.mouse.click(
    bounds.x + (bounds.width * 10.5) / 64,
    bounds.y + (bounds.height * 10.5) / 64,
  );
  const pixel = (x: number) =>
    page
      .locator('#frames canvas')
      .nth(2)
      .evaluate((canvas, x) => {
        const c = canvas as HTMLCanvasElement;
        return [...c.getContext('2d')!.getImageData(x, 10, 1, 1).data];
      }, x);
  expect(await pixel(10)).toEqual([176, 56, 59, 255]);
  await page.locator('#dirSeg [data-dir="6"]').click();
  expect(await pixel(53)).toEqual([176, 56, 59, 255]);

  // A walking-only override must not bury a raised weapon in combat. Artists
  // can still override combat order without changing the walking directions.
  await page.locator('#modeSeg [data-mode="gear"]').click();
  await page.getByRole('tab', { name: 'Layers', exact: true }).click();
  const weaponBehind = page
    .locator('#layers .layer')
    .filter({ has: page.locator('.cat').filter({ hasText: /^weapon$/ }) })
    .locator('.behind');
  await page.locator('#dirSeg [data-dir="2"]').click();
  await expect(weaponBehind).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#animSeg [data-anim="attack"]').click();
  await expect(weaponBehind).toHaveAttribute('aria-pressed', 'false');
  await weaponBehind.click();
  await expect(weaponBehind).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#animSeg [data-anim="walk"]').click();
  await page.locator('#dirSeg [data-dir="0"]').click();
  await expect(weaponBehind).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#animSeg [data-anim="attack"]').click();
  await expect(weaponBehind).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});
