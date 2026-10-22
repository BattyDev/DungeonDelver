// Isolated visual audit. Run with Vite on 5173; does not use the player's browser/save.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const suffix = process.argv[2] || 'after';
const full = process.argv.includes('--full');
const folder = `docs/previews/consistency-${suffix}`;
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  page.on('pageerror', (e) => {
    throw e;
  });
  await page.goto(
    'http://127.0.0.1:5173/DungeonDelver/debug-sheet.html?bodies=humanM&classes=tank&scale=1',
  );
  await page.waitForFunction(() => document.title === 'ready');
  const jobs = full
    ? ['human', 'orc', 'elf', 'dwarf', 'gnome'].flatMap((race) =>
        ['tank', 'healer', 'archer', 'mage', 'samurai'].map((cls) => `${race}:${cls}`),
      )
    : ['human', 'orc', 'elf', 'dwarf', 'gnome', 'creatures', 'details'];
  for (const race of jobs) {
    const result = await page.evaluate(async (race) => {
      const { Doll, defaultLook, lookLayers } = await import(
        '/DungeonDelver/src/paperdoll/looks.ts'
      );
      const { F, ANIMS, DIRS, PX } = await import('/DungeonDelver/src/paperdoll/model.ts');
      const { blockGear } = await import('/DungeonDelver/src/paperdoll/pose.ts');
      const { CREATURE_IDS, creatureFor } = await import(
        '/DungeonDelver/src/paperdoll/creatures.ts'
      );
      const rows = [];
      const add = (label, frames) => rows.push({ label, frames });
      if (race.includes(':')) {
        const [r, cls] = race.split(':');
        for (const sex of ['F', 'M']) {
          const doll = new Doll(defaultLook(r, sex, cls));
          for (const dir of [0, 1, 2, 3, 4])
            add(
              `${sex} walk ${DIRS[dir].k}`,
              Array.from({ length: 6 }, (_, f) => doll.frameNow('walk', dir, f)),
            );
          for (const anim of ['attack', 'heal', 'shoot', 'cast', 'slash']
            .filter(
              (a) =>
                ({
                  tank: 'attack',
                  healer: 'heal',
                  archer: 'shoot',
                  mage: 'cast',
                  samurai: 'slash',
                })[cls] === a,
            )
            .concat(['block', 'hurt', 'death']))
            add(
              `${sex} ${anim} E`,
              Array.from({ length: 6 }, (_, f) =>
                f < ANIMS[anim].frames ? doll.frameNow(anim, 6, f) : new Uint8ClampedArray(PX),
              ),
            );
        }
      } else if (race === 'details') {
        const look = defaultLook('orc', 'F', 'tank'),
          doll = new Doll(look);
        for (const dir of [4, 1, 7, 2, 0]) {
          add(
            `orcF tank ${DIRS[dir].k}`,
            Array.from({ length: 6 }, (_, f) => doll.frameNow('walk', dir, f)),
          );
          for (const layer of lookLayers(look))
            add(
              `${DIRS[dir].k} ${layer.slot}`,
              Array.from({ length: 6 }, (_, f) => {
                const out = new Uint8ClampedArray(PX);
                blockGear(out, 'walk', f, dir, 'orcF', layer.slot, layer.color, layer.style);
                return out;
              }),
            );
        }
      } else if (race === 'creatures') {
        for (const id of CREATURE_IDS) {
          const doll = creatureFor(id);
          for (const anim of ['idle', 'walk', 'attack', 'hurt', 'death'])
            add(
              `${id} ${anim}`,
              Array.from({ length: 8 }, (_, dir) =>
                doll.frameNow(anim, dir, Math.min(2, ANIMS[anim].frames - 1)),
              ),
            );
        }
      } else {
        for (const sex of ['F', 'M'])
          for (const cls of ['tank', 'healer', 'archer', 'mage', 'samurai']) {
            const doll = new Doll(defaultLook(race, sex, cls));
            for (const anim of ['idle', 'walk'])
              add(
                `${sex} ${cls} ${anim}`,
                Array.from({ length: 8 }, (_, dir) =>
                  doll.frameNow(anim, dir, anim === 'idle' ? 2 : 0),
                ),
              );
          }
      }
      const cols = Math.max(...rows.map((r) => r.frames.length)),
        scale = 2,
        labelWidth = 100;
      const c = document.querySelector('canvas');
      c.width = labelWidth + cols * F * scale;
      c.height = 24 + rows.length * F * scale;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#223237';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.font = '13px system-ui';
      ctx.fillStyle = '#ddd';
      ctx.fillText(race, 4, 17);
      for (let i = 0; i < cols; i++)
        ctx.fillText(
          cols === 8 ? DIRS[i].k : `frame ${i + 1}`,
          labelWidth + i * F * scale + 10,
          17,
        );
      const tmp = document.createElement('canvas');
      tmp.width = tmp.height = F;
      for (const [r, row] of rows.entries()) {
        const y = 24 + r * F * scale;
        ctx.fillStyle = r % 2 ? '#35474b' : '#2b3b3f';
        ctx.fillRect(0, y, c.width, F * scale);
        ctx.fillStyle = '#ddd';
        row.label.split(' ').forEach((w, i) => ctx.fillText(w, 4, y + 20 + i * 16));
        row.frames.forEach((frame, i) => {
          tmp.getContext('2d').putImageData(new ImageData(frame.slice(), F, F), 0, 0);
          ctx.drawImage(tmp, labelWidth + i * F * scale, y, F * scale, F * scale);
        });
      }
      const parts =
        race === 'details'
          ? [4, 1, 7, 2, 0].map((d, i) => {
              const part = document.createElement('canvas');
              part.width = c.width;
              part.height = 1280;
              part
                .getContext('2d')
                .drawImage(c, 0, 24 + i * 1280, c.width, 1280, 0, 0, c.width, 1280);
              return { name: DIRS[d].k, png: part.toDataURL().split(',')[1] };
            })
          : [];
      return { png: c.toDataURL().split(',')[1], rows: rows.length, parts };
    }, race);
    await writeFile(`${folder}/${race.replace(':', '-')}.png`, Buffer.from(result.png, 'base64'));
    for (const part of result.parts)
      await writeFile(`${folder}/details-${part.name}.png`, Buffer.from(part.png, 'base64'));
    console.log(`${race}: ${result.rows} rows`);
  }
} finally {
  await browser.close();
}
