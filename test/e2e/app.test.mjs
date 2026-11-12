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
import { sseStream } from '../sse.mjs';

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
  // 3D пересобирается с задержкой; на занятой машине — дольше
  const lit = await page
    .waitForFunction(() => houseplan.view3d.lamps.lights.some((l) => l.intensity > 1), null, { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
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

test('ИИ-помощник (API подменён): ключ, постройка по шагам, правка, запрос по области, отмена', async () => {
  const requests = [];
  const replies = [];
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
  await page.route('https://api.anthropic.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET,POST' } });
    requests.push({ url: req.url(), headers: req.headers(), body: req.postDataJSON?.() ?? null });
    if (req.url().includes('/v1/models')) {
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ data: [{ id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' }] }) });
    }
    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream' }, body: replies.shift() ?? sseStream({ text: 'Нечего добавить.' }) });
  });
  const messages = () => requests.filter((r) => r.url.includes('/v1/messages'));
  const example = await page.evaluate(() => import('./js/io/aiPrompt.js').then((m) => m.EXAMPLE));
  await page.evaluate(() => houseplan.ui.side.ai.focus());
  await page.click('#tab-ai .ai-card .btn-primary');
  await page.fill('.ai-key-input', `sk-ant-api03-${'t'.repeat(40)}`);
  await page.click('.ai-settings .btn-primary');
  await page.waitForSelector('.ai-settings', { state: 'detached' });

  // дом строится тремя шагами одного ответа: каркас → окно → мебель
  const undoBefore = await page.evaluate(() => houseplan.store._undo.length);
  replies.push(
    sseStream({ text: 'План: каркас, окно, мебель.', tool: 'build_project', input: { summary: 'Каркас дома 8×6', project: example }, id: 't1' }),
    sseStream({ text: 'Окно в санузел.', tool: 'edit_project', input: { summary: 'Окно в спальне', patch: [{ op: 'add', path: '/levels/0/openings/-', value: { wall: 'w2', type: 'window', offset: 1.5, width: 0.9, height: 1.4, sill: 0.9 } }] }, id: 't2' }),
    sseStream({ text: 'Мебель.', tool: 'edit_project', input: { summary: 'Кресло в гостиной', patch: [{ op: 'add', path: '/levels/0/furniture/-', value: { type: 'armchair', x: -2, y: 0, rotation: 0 } }] }, id: 't3' }),
    sseStream({ text: 'Дом готов.' }),
  );
  await page.fill('.ai-input', 'Дом 8×6: гостиная, спальня, санузел, с мебелью');
  await page.press('.ai-input', 'Enter');
  await page.waitForSelector('.ai-result');
  assert.equal(await page.evaluate(() => houseplan.project.walls.length), 6);
  assert.equal(await page.evaluate(() => houseplan.project.openings.length), example.levels[0].openings.length + 1);
  assert.equal(await page.locator('.ai-result .ai-steps li').count(), 3);
  assert.match(await page.textContent('.ai-result-title'), /Проект построен · 3 шага/);
  // три шага — один шаг истории
  assert.equal(await page.evaluate(() => houseplan.store._undo.length), undoBefore + 1);
  assert.equal(messages().length, 4);

  replies.push(sseStream({ text: 'Кладу плитку.', tool: 'edit_project', input: { summary: 'Плитка в гостиной', patch: [{ op: 'replace', path: '/levels/0/rooms/r1/floor', value: 'tile' }] } }), sseStream({ text: 'Готово.' }));
  await page.fill('.ai-input', 'Плитку в гостиную');
  await page.press('.ai-input', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('.ai-result').length === 2);
  assert.equal(await page.evaluate(() => houseplan.project.rooms.find((r) => r.name === 'Гостиная').floor), 'tile');

  const msg = messages();
  assert.equal(msg.length, 6);
  assert.equal(msg[0].headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.match(msg[0].headers['x-api-key'], /^sk-ant-api03-t+$/);
  assert.equal(msg[4].body.model, 'claude-sonnet-5-5');
  assert.match(msg[4].body.messages.at(-1).content.at(-1).text, /"id":"r1"/);
  // ключ — только в localStorage, не в проекте и не в настройках
  assert.ok(!(await page.evaluate(() => JSON.stringify(houseplan.project).includes('sk-ant'))));

  await page.click('.ai-msg.bot:last-child .ai-undo');
  assert.equal(await page.evaluate(() => houseplan.project.rooms.find((r) => r.name === 'Гостиная').floor), 'laminate');

  // запрос по области: правый клик по комнате → «Запрос ИИ…» → меняется только она
  await page.evaluate(async () => {
    await houseplan.setViewMode('plan');
    houseplan.editor.setTool('select');
    houseplan.editor.fitToContent();
  });
  await page.waitForTimeout(400);
  const at = await page.evaluate(() => {
    // свободное место в спальне: под курсором должна быть сама комната, а не мебель
    const room = houseplan.project.rooms.find((r) => r.name === 'Спальня');
    const xs = room.points.map((q) => q.x);
    const ys = room.points.map((q) => q.y);
    for (let i = 1; i < 10; i++) {
      for (let j = 1; j < 10; j++) {
        const q = { x: Math.min(...xs) + ((Math.max(...xs) - Math.min(...xs)) * i) / 10, y: Math.min(...ys) + ((Math.max(...ys) - Math.min(...ys)) * j) / 10 };
        const hit = houseplan.editor.hitTest(q, { tolPx: 6 });
        if (hit?.kind !== 'room' || hit.id !== room.id) continue;
        const p = houseplan.editor.viewport.toScreen(q);
        const r = houseplan.editor.canvas.getBoundingClientRect();
        return { x: r.left + p.x, y: r.top + p.y };
      }
    }
    return null;
  });
  assert.ok(at, 'в спальне есть свободное место для клика');
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await page.click('.ctx-item:has-text("Запрос ИИ по этой комнате")');
  await page.waitForSelector('.ai-scope:not([hidden])');
  assert.match(await page.textContent('.ai-scope'), /Только: комната «Спальня»/);
  replies.push(
    sseStream({ text: 'Плитку везде.', tool: 'edit_project', input: { summary: 'Плитка', patch: [{ op: 'replace', path: '/levels/0/rooms/r1/floor', value: 'stone' }] }, id: 's1' }),
    sseStream({ text: 'Только спальня.', tool: 'edit_project', input: { summary: 'Паркет в спальне заменён ковролином', patch: [{ op: 'replace', path: '/levels/0/rooms/r2/floor', value: 'carpet' }] }, id: 's2' }),
    sseStream({ text: 'В спальне ковролин.' }),
  );
  await page.fill('.ai-input', 'Постели ковролин');
  await page.press('.ai-input', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('.ai-result').length === 3);
  const floors = await page.evaluate(() => Object.fromEntries(houseplan.project.rooms.map((r) => [r.name, r.floor])));
  assert.equal(floors['Спальня'], 'carpet');
  assert.equal(floors['Гостиная'], 'laminate', 'правка вне области отклонена');
  const scoped = messages().slice(6);
  assert.equal(scoped.length, 3);
  assert.match(scoped[0].body.messages.at(-1).content.at(-1).text, /ОБЛАСТЬ ЗАДАНИЯ: комната «Спальня»/);
  assert.match(scoped[1].body.messages.at(-1).content[0].content, /выходит за область/);
  // область и выделение остаются — можно сразу дать следующий запрос по той же комнате
  assert.match(await page.textContent('.ai-scope'), /комната «Спальня»/);
  assert.deepEqual(await page.evaluate(() => houseplan.state.selection.map((s) => houseplan.project.rooms.find((r) => r.id === s.id)?.name)), ['Спальня']);
  assert.match(await page.textContent('.ai-msg.user:nth-last-child(2) .ai-meta'), /Область: комната «Спальня»/);
  await page.click('.ai-scope-x');
  assert.ok(await page.isHidden('.ai-scope'));
  await page.unroute('https://api.anthropic.com/**');
});

test('в консоли нет ошибок', () => {
  assert.deepEqual(errors, []);
});
