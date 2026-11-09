/**
 * Сквозная проверка в настоящем браузере (Chromium через Playwright):
 * приложение открывается, пресет строится, проверка чистая, смета, чертежи,
 * варианты, слои и 3D работают без ошибок в консоли.
 *   npm run test:e2e   (в CI перед этим: npx playwright install --with-deps chromium)
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer } from '../serve.mjs';

// require понимает и локальный node_modules, и глобально установленный playwright
const { chromium } = createRequire(import.meta.url)('playwright');

let server;
let base;
let browser;
let page;
const errors = [];

before(async () => {
  ({ server, url: base } = await startServer(0));
  browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  page.setDefaultTimeout(180000);
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_FAILED|fonts\.g/.test(m.text())) errors.push(m.text());
  });
  await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
  await page.route('**/fonts.gstatic.com/**', (r) => r.abort());
  await page.goto(`${base}/index.html`);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('houseplan.view.v1', 'split');
  });
  await page.reload();
  await page.waitForFunction(() => window.houseplan?.project);
});

after(async () => {
  await browser?.close();
  server?.close();
});

const loadPreset = (id) =>
  page.evaluate(async (pid) => {
    const m = await import('./js/model/presets.js');
    const r = m.buildHousePreset(pid, {});
    window.houseplan.commands.loadProject(r.project || r);
  }, id);

test('пресет строится, проверка без замечаний', async () => {
  await loadPreset('house2');
  await page.waitForTimeout(800);
  const s = await page.evaluate(() => ({ walls: houseplan.project.walls.length, levels: houseplan.project.levels.length, issues: houseplan.checks.issues.map((i) => i.title) }));
  assert.ok(s.walls > 10);
  assert.equal(s.levels, 2);
  assert.deepEqual(s.issues, []);
});

test('3D-сцена собирается', async () => {
  await page.evaluate(() => houseplan.setViewMode('3d'));
  await page.waitForFunction(() => houseplan.view3d?.root?.children.length > 3, null, { timeout: 120000 });
  const meshes = await page.evaluate(() => {
    let n = 0;
    houseplan.view3d.root.traverse((o) => o.isMesh && n++);
    return n;
  });
  assert.ok(meshes > 50, `мешей ${meshes}`);
});

test('вечером светильники зажигаются', async () => {
  await page.evaluate(async () => {
    const f = await import('./js/model/factories.js');
    const r = houseplan.project.rooms[0];
    houseplan.store.commit((p) => p.items.push(f.createItem(r.levelId, 'ceiling_light', r.points[0].x + 1, r.points[0].y + 1)));
    houseplan.state.setSetting('sunReal', true);
    houseplan.state.setSetting('sunHour', 22.5);
  });
  await page.waitForTimeout(1500);
  const lit = await page.evaluate(() => houseplan.view3d.lamps.lights.some((l) => l.intensity > 1));
  assert.ok(lit);
  await page.evaluate(() => houseplan.state.setSetting('sunReal', false));
});

test('слои скрывают инженерию', async () => {
  await page.evaluate(() => houseplan.state.setSetting('layer_electric', false));
  await page.waitForTimeout(600);
  const hidden = await page.evaluate(() => {
    const id = houseplan.project.items.find((i) => i.type === 'ceiling_light').id;
    let found = false;
    houseplan.view3d.rebuild();
    houseplan.view3d.root.traverse((o) => o.userData.ref?.id === id && (found = true));
    return !found;
  });
  assert.ok(hidden);
  await page.evaluate(() => houseplan.state.setSetting('layer_electric', true));
});

test('смета открывается, итог больше нуля', async () => {
  await page.evaluate(() => houseplan.ui.estimate.open());
  await page.waitForSelector('.est-total-sum');
  const total = await page.locator('.est-total-sum').innerText();
  assert.ok(/[1-9]/.test(total) && /сом/.test(total), total);
  await page.keyboard.press('Escape');
});

test('чертежи: листы планов, фасадов и разреза', async () => {
  await page.evaluate(() => houseplan.ui.drawings.open());
  await page.waitForFunction(() => document.querySelectorAll('.sheet').length > 0, null, { timeout: 180000 });
  const titles = await page.locator('.sheet .st-title').allInnerTexts();
  assert.ok(titles.length >= 10, titles.join(' | '));
  assert.ok(titles.some((t) => /Разрез/.test(t)));
  assert.ok(titles.some((t) => /фасад/.test(t)));
  await page.click('.print-bar button:has-text("Закрыть")');
});

test('варианты: сохранить и сравнить', async () => {
  await page.evaluate(() => houseplan.ui.variants.saveCurrent('Тест'));
  await page.evaluate(() => houseplan.ui.variants.open());
  await page.waitForSelector('.var-compare');
  assert.equal(await page.locator('.var-card').count(), 1);
  await page.keyboard.press('Escape');
});

test('в консоли нет ошибок', () => {
  assert.deepEqual(errors, []);
});
