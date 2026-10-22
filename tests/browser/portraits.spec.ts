import { test, expect } from '@playwright/test';
import { newProgress } from '../../packages/rules/src/index';
import type { GameState } from '../../packages/rules/src/index';
import type { Page } from '@playwright/test';

async function paintCell(page: Page, x: number, y: number) {
  const box = (await page.locator('#portraitBoard').boundingBox())!;
  await page.mouse.click(
    box.x + (box.width * (x + 0.5)) / 64,
    box.y + (box.height * (y + 0.5)) / 64,
  );
}

const pixel = (selector: string, x: number, y: number) =>
  `(() => {
    const c = document.querySelector(${JSON.stringify(selector)});
    return c ? [...c.getContext('2d').getImageData(${x}, ${y}, 1, 1).data] : null;
  })()`;

test('a portrait painted for a companion is used on their hire card, and defaults are painted busts', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // The painted default strip ships with the game: ten 64 px busts.
  await page.goto('./portraits.html?target=ghost-1');
  const strip = await page.evaluate(async () => {
    const image = new Image();
    image.src = new URL('portraits/defaults-v2.png', document.baseURI).href;
    await image.decode();
    return [image.width, image.height];
  });
  expect(strip).toEqual([320, 128]);

  // Paint one red pixel in the middle of Mira's face and publish it.
  await expect(page.locator('#publish')).toBeEnabled();
  await page.locator('#portraitPalette button[aria-label="Paint #b0383b"]').click();
  const board = page.locator('#portraitBoard');
  const box = (await board.boundingBox())!;
  await page.mouse.click(box.x + (box.width * 32.5) / 64, box.y + (box.height * 32.5) / 64);
  await page.locator('#publish').click();
  await expect(page.locator('#portraitMessage')).toContainText('used in the game');
  const keys = await page.evaluate(() =>
    Object.keys(JSON.parse(localStorage.getItem('dungeon-delver.portraits.v1')!).entries),
  );
  expect(keys.some((k) => k.startsWith('person:ghost-1|'))).toBe(true);

  // In the hall, Mira's hire card shows that exact pixel.
  const state: GameState = { phase: 'hub', progress: newProgress('Painter', 'tank', 4) };
  await page.evaluate(
    (state) => localStorage.setItem('dungeon-delver.save', JSON.stringify({ version: 1, state })),
    state,
  );
  await page.goto('./');
  await page.getByRole('button', { name: 'Browse companions' }).click();
  await page.locator('.modal [data-action="ghost"][data-id="ghost-1"]').click();
  const portrait = '.modal canvas[data-portrait-person="ghost-1"]';
  await expect.poll(() => page.evaluate(pixel(portrait, 32, 32))).toEqual([176, 56, 59, 255]);
  expect(errors).toEqual([]);
});

test('all ten editable defaults match the reference atlas and retain opaque pixel edges', async ({
  page,
}) => {
  await page.goto('./portraits.html');
  await expect(page.locator('#publish')).toBeEnabled();
  for (const race of ['human', 'orc', 'elf', 'dwarf', 'gnome']) {
    await page.locator('#race').selectOption(race);
    for (const sex of ['F', 'M']) {
      await page.locator('#sex').selectOption(sex);
      await expect(page.locator('#publish')).toBeEnabled();
      const result = await page.evaluate(
        async ({ race, sex }) => {
          const image = new Image();
          image.src = new URL('portraits/defaults-v2.png', document.baseURI).href;
          await image.decode();
          const c = document.createElement('canvas');
          c.width = 320;
          c.height = 128;
          const ctx = c.getContext('2d')!;
          ctx.drawImage(image, 0, 0);
          const expected = ctx.getImageData(
            ['human', 'orc', 'elf', 'dwarf', 'gnome'].indexOf(race) * 64,
            sex === 'F' ? 0 : 64,
            64,
            64,
          ).data;
          const actual = document
            .querySelector<HTMLCanvasElement>('#portraitFrames canvas')!
            .getContext('2d')!
            .getImageData(0, 0, 64, 64).data;
          return {
            same: actual.every((v, i) => v === expected[i]),
            binaryAlpha: actual.every((v, i) => i % 4 !== 3 || v === 0 || v === 255),
            colours: new Set(
              Array.from({ length: 4096 }, (_, i) => [...actual.slice(i * 4, i * 4 + 4)].join(',')),
            ).size,
          };
        },
        { race, sex },
      );
      expect(result.same, `${race}${sex} is the editable reference face`).toBe(true);
      expect(result.binaryAlpha).toBe(true);
      expect(result.colours).toBeLessThanOrEqual(50);
    }
  }
});

test('painting, undo, sixteen-frame limits and drafts survive reload without publishing', async ({
  page,
}) => {
  await page.goto('./portraits.html?body=elfF');
  await expect(page.locator('#publish')).toBeEnabled();
  await page.locator('#clearFrame').click();
  await page.locator('#portraitPalette button[aria-label="Paint #b0383b"]').click();
  await page.locator('#symmetry').check();
  await paintCell(page, 5, 5);
  const frame = '#portraitFrames button.on canvas';
  await expect.poll(() => page.evaluate(pixel(frame, 5, 5))).toEqual([176, 56, 59, 255]);
  await expect.poll(() => page.evaluate(pixel(frame, 58, 5))).toEqual([176, 56, 59, 255]);
  await page.locator('#undo').click();
  expect(await page.evaluate(pixel(frame, 5, 5))).toEqual([0, 0, 0, 0]);
  await page.locator('#redo').click();
  expect(await page.evaluate(pixel(frame, 5, 5))).toEqual([176, 56, 59, 255]);
  for (let i = 1; i < 16; i++) await page.locator('#duplicateFrame').click();
  await expect(page.locator('#portraitFrames canvas')).toHaveCount(16);
  await expect(page.locator('#addFrame')).toBeDisabled();
  await expect(page.locator('#duplicateFrame')).toBeDisabled();
  await page.locator('#deleteFrame').click();
  await expect(page.locator('#portraitFrames canvas')).toHaveCount(15);
  await page.locator('#undo').click();
  await expect(page.locator('#portraitFrames canvas')).toHaveCount(16);
  await expect(page.locator('#saveStatus')).toContainText('Draft autosaved');
  expect(await page.evaluate(() => localStorage.getItem('dungeon-delver.portraits.v1'))).toBeNull();
  await page.reload();
  await expect(page.locator('#portraitFrames canvas')).toHaveCount(16);
  expect(await page.evaluate(pixel(frame, 5, 5))).toEqual([176, 56, 59, 255]);
  await page.locator('#race').selectOption('orc');
  await expect(page.locator('#portraitFrames canvas')).toHaveCount(1);
  await page.locator('#race').selectOption('elf');
  await expect(page.locator('#portraitFrames canvas')).toHaveCount(16);
  expect(await page.evaluate(pixel(frame, 58, 5))).toEqual([176, 56, 59, 255]);
  await expect(page.locator('.wardrobe-pages a').first()).toHaveAttribute(
    'href',
    'studio.html?body=elfF',
  );
});

test('a speaking portrait loops, rests on frame one, and preserves the painted companion across visits', async ({
  page,
}) => {
  await page.goto('./portraits.html');
  const state: GameState = { phase: 'hub', progress: newProgress('Painter', 'tank', 42) };
  await page.evaluate((state) => {
    localStorage.setItem('dungeon-delver.save', JSON.stringify({ version: 1, state }));
    sessionStorage.setItem(
      'dungeon-delver.hall-looks',
      JSON.stringify({
        'ghost-0': {
          race: 'orc',
          sex: 'F',
          cls: 'tank',
          hair: 'ponytail',
          hairColor: '#2a2730',
          beard: false,
        },
      }),
    );
  }, state);
  await page.goto('./portraits.html?target=ghost-0');
  await expect(page.locator('#publish')).toBeEnabled();
  await expect(page.locator('#race')).toHaveValue('orc');
  await page.locator('#clearFrame').click();
  await page.locator('[data-tool="fill"]').click();
  await page.locator('#portraitPalette button[aria-label="Paint #b0383b"]').click();
  await paintCell(page, 32, 32);
  await page.locator('#addFrame').click();
  await page.locator('#colour').fill('#2050d0');
  await paintCell(page, 32, 32);
  for (const [id, value] of [
    ['fps', '4'],
    ['loops', '2'],
    ['rest', '3'],
  ]) {
    await page.locator(`#${id}`).fill(value);
    await page.locator(`#${id}`).press('Tab');
  }
  await page.locator('#publish').click();
  await expect(page.locator('#portraitMessage')).toContainText('used in the game');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('dungeon-delver.save')!).state),
  ).toEqual(state);
  await page.evaluate(() => sessionStorage.clear());
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.goto('./');
  await page.getByRole('button', { name: 'Browse companions' }).click();
  await page.locator('.modal [data-action="ghost"][data-id="ghost-0"]').click();
  const portrait = '.modal canvas[data-portrait-person="ghost-0"]';
  await expect(page.locator(portrait)).toHaveAttribute('data-portrait-body', 'orcF');
  // Decode both custom PNGs before starting the deterministic playback assertions.
  await page.evaluate(async () => {
    const entry = JSON.parse(localStorage.getItem('dungeon-delver.portraits.v1')!).entries[
      'person:ghost-0|orcF'
    ];
    await Promise.all(
      entry.frames.map(async (src: string) => {
        const i = new Image();
        i.src = src;
        await i.decode();
      }),
    );
  });
  await page.clock.runFor(32);
  await expect.poll(() => page.evaluate(pixel(portrait, 32, 32))).toEqual([176, 56, 59, 255]);
  await page.clock.runFor(250);
  await expect.poll(() => page.evaluate(pixel(portrait, 32, 32))).toEqual([32, 80, 208, 255]);
  await page.clock.runFor(750);
  await expect.poll(() => page.evaluate(pixel(portrait, 32, 32))).toEqual([176, 56, 59, 255]);
  await page.clock.runFor(2200);
  expect(await page.evaluate(pixel(portrait, 32, 32))).toEqual([176, 56, 59, 255]);
  await page.clock.runFor(1050);
  await expect.poll(() => page.evaluate(pixel(portrait, 32, 32))).toEqual([32, 80, 208, 255]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.runFor(32);
  await expect.poll(() => page.evaluate(pixel(portrait, 32, 32))).toEqual([176, 56, 59, 255]);
});
