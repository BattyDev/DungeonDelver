import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('docs/previews', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/DungeonDelver/portraits.html?body=orcF');
  await page.locator('#portraitFrames canvas').waitFor();
  await page.screenshot({ path: 'docs/previews/portrait-studio.png', fullPage: true });
  const png = await page.evaluate(async () => {
    const url = '/DungeonDelver/src/paperdoll/portraits.ts';
    const { PORTRAIT_BODIES, portraitPixels } = await import(url);
    const { defaultPortrait, loadDefaultPortraits } = await import(
      '/DungeonDelver/src/paperdoll/default-portraits.ts'
    );
    await loadDefaultPortraits();
    const c = document.createElement('canvas');
    c.width = 5 * 64 * 3;
    c.height = 4 * (64 * 3 + 24);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#17272b';
    ctx.fillRect(0, 0, c.width, c.height);
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = 64;
    for (const [i, body] of PORTRAIT_BODIES.entries())
      for (const finished of [true, false]) {
        const x = Math.floor(i / 2) * 192,
          y = ((i % 2) * 2 + (finished ? 0 : 1)) * 216;
        ctx.fillStyle = '#e5ba72';
        ctx.font = '13px system-ui';
        ctx.fillText(`${body} · ${finished ? 'default' : 'head shape'}`, x + 8, y + 17);
        tmp.getContext('2d').putImageData(new ImageData(defaultPortrait(body), 64, 64), 0, 0);
        if (!finished)
          tmp
            .getContext('2d')
            .putImageData(new ImageData(portraitPixels(body, false), 64, 64), 0, 0);
        ctx.drawImage(tmp, x, y + 24, 192, 192);
      }
    return c.toDataURL().split(',')[1];
  });
  await writeFile('docs/previews/portrait-heads.png', Buffer.from(png, 'base64'));
  if (errors.length) throw Error(errors.join('\n'));
  console.log('Portrait studio and all ten head shapes captured.');
} finally {
  await browser.close();
}
