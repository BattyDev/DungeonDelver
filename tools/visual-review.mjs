// Local visual QA; run with Vite on port 5173. Never reads or writes a real browser profile.
import { chromium } from '@playwright/test';

const suffix = process.argv[2] ?? 'after';
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const base = 'http://127.0.0.1:5173/DungeonDelver/';
  if (suffix === 'sprites')
    await page.goto(`${base}debug-sheet.html?bodies=humanM&classes=tank&scale=1`);
  for (const [name, query] of [
    ['visuals-priority', 'bodies=humanM,orcF&classes=tank,mage,samurai&dirs=0,2,4,6&scale=2'],
    ['archer', 'bodies=humanM,orcF&classes=archer&combat=&scale=3'],
    ...(suffix === 'before'
      ? []
      : [
          ['creatures-idle', 'creatures=&combat=idle&scale=2'],
          ['creatures-hurt', 'creatures=&combat=hurt&scale=2'],
          ['creatures-death', 'creatures=&combat=death&scale=2'],
        ]),
  ]) {
    if (suffix === 'sprites') continue;
    if (suffix === 'archer' && name !== 'archer') continue;
    await page.goto(`${base}debug-sheet.html?${query}`);
    await page.waitForFunction(() => document.title === 'ready');
    await page
      .locator('canvas')
      .screenshot({ path: `docs/previews/${name}-${suffix === 'archer' ? 'after' : suffix}.png` });
  }
  if (suffix !== 'before' && suffix !== 'sprites' && suffix !== 'archer') {
    await page.goto(base);
    await page.getByLabel('What should we call you?').fill('Visual review');
    await page.getByRole('button', { name: 'Enter the Gathering Hall' }).click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: 'docs/previews/visuals-hall.png' });
    await page.goto(`${base}studio.html`);
    await page.locator('#room canvas').waitFor();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'docs/previews/visuals-studio.png' });
    const rulesUrl = `/DungeonDelver/@fs/${process.cwd().replaceAll('\\', '/')}/packages/rules/src/index.ts`;
    await page.goto(`${base}debug-sheet.html?bodies=humanM&classes=tank&scale=1`);
    await page.waitForFunction(() => document.title === 'ready');
    await page.evaluate(async (rulesUrl) => {
      const r = await import(rulesUrl);
      const progress = r.newProgress('Art review', 'tank', 42);
      progress.hires = [r.GHOSTS[1], r.GHOSTS[2], r.GHOSTS[3]];
      const run = r.startRun(progress),
        floor = run.floors[1];
      floor.position = { x: 18, z: 23 };
      floor.patrols.forEach((p) => {
        p.pauseTicks = 9999;
      });
      run.party[1].hp = 0;
      localStorage.setItem(
        'dungeon-delver.save',
        JSON.stringify({ version: 1, state: { phase: 'floor', progress, run, floor } }),
      );
    }, rulesUrl);
    await page.goto(base);
    await page.locator('#left').filter({ hasText: 'Push all 3 stones' }).waitFor();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: 'docs/previews/visuals-dungeon.png' });
    for (const [name, types] of [
      ['creatures', ['slime', 'bat', 'skeleton', 'wisp']],
      ['humanoids', ['cultist', 'warden']],
    ]) {
      await page.goto(`${base}debug-sheet.html?bodies=humanM&classes=tank&scale=1`);
      await page.waitForFunction(() => document.title === 'ready');
      await page.evaluate(
        async ({ rulesUrl, types }) => {
          const r = await import(rulesUrl);
          const { CombatStage } = await import('/DungeonDelver/src/ui/combat-stage.ts');
          const progress = r.newProgress('Art review', 'tank', 42);
          progress.hires = [r.GHOSTS[1], r.GHOSTS[2], r.GHOSTS[3]];
          const run = r.startRun(progress);
          const combat = r.startCombat(
            run.party,
            types.map((t, i) => r.createEnemy(t, `enemy-${i}`, 1)),
            42,
            run.resources,
          );
          combat.order = ['player', ...combat.order.filter((id) => id !== 'player')];
          combat.cursor = 0;
          const stage = new CombatStage(combat, progress, 1, () => {});
          stage.canvas.id = 'review-battle';
          stage.canvas.style.cssText = 'width:900px;height:420px;image-rendering:pixelated';
          document.body.replaceChildren(stage.canvas);
          stage.setFighters(combat.fighters);
          stage.draw(0);
          window.reviewBattle = { stage, combat };
        },
        { rulesUrl, types },
      );
      await page.locator('#review-battle').screenshot({ path: `docs/previews/combat-${name}.png` });
      await page.evaluate(() => {
        const { stage, combat } = window.reviewBattle;
        const next = structuredClone(combat);
        next.fighters
          .filter((f) => f.team === 'enemy')
          .forEach((f) => {
            f.hp = 0;
          });
        stage.update(combat, next);
        stage.setFighters(next.fighters);
        for (let i = 0; i < 80; i++) stage.draw(1 / 60);
      });
      await page
        .locator('#review-battle')
        .screenshot({ path: `docs/previews/combat-${name}-fallen.png` });
    }
  }
  if (suffix !== 'before' && suffix !== 'archer') {
    // Exercise the same wrapper used by enemies and companions, including shadow cleanup.
    const sprites = await page.evaluate(async () => {
      const { DollSprite } = await import('/DungeonDelver/src/scene/doll-sprite.ts');
      const { defaultLook, pumpDolls } = await import('/DungeonDelver/src/paperdoll/looks.ts');
      const { makeEnemySprite } = await import('/DungeonDelver/src/scene/sprites.ts');
      const { Scene } = await import('/DungeonDelver/node_modules/.vite/deps/three.js');
      const group = new Scene();
      const small = new DollSprite(defaultLook('gnome', 'F', 'tank'));
      const large = new DollSprite(defaultLook('orc', 'M', 'tank'));
      const flying = makeEnemySprite('bat');
      for (const doll of [small, large, flying]) {
        group.add(doll.sprite);
        doll.update(0);
      }
      small.sprite.position.set(3, 0, 4);
      small.setAlive(false);
      pumpDolls(1000);
      small.update(1);
      const deadImage = small.sprite.material.map.image.toDataURL();
      small.setAlive(false);
      small.update(1);
      const held = deadImage === small.sprite.material.map.image.toDataURL();
      small.setAlive(true);
      small.update(0);
      const revived = deadImage !== small.sprite.material.map.image.toDataURL();
      const checks = {
        held,
        revived,
        visible: small.sprite.visible,
        ground: small.shadow.position.y === 0.01,
        follows: small.shadow.position.x === 3 && small.shadow.position.z === 4,
        sized: small.shadow.scale.x < large.shadow.scale.x,
        flight: !flying.shadow.visible,
      };
      const shadow = small.shadow;
      for (const doll of [small, large, flying]) doll.dispose();
      return { ...checks, disposed: shadow.parent === null };
    });
    if (Object.values(sprites).some((ok) => !ok))
      throw new Error(`Sprite visual regression: ${JSON.stringify(sprites)}`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Visual sheets captured (${suffix}).`);
} finally {
  await browser.close();
}
