import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPatch, PatchError } from '../../js/ai/jsonPatch.js';
import { SSEParser, MessageBuilder, streamMessage, describeError, ApiError } from '../../js/ai/claudeClient.js';
import { snapshotProject, buildMessages, projectFromTool, runTurn, carryOver, buildSystem, TOOLS } from '../../js/ai/assistant.js';
import { buildHousePreset } from '../../js/model/presets.js';
import { createEmptyProject } from '../../js/model/project.js';
import { EXAMPLE } from '../../js/io/aiPrompt.js';
import { sseStream, fakeFetch } from '../sse.mjs';

// ── JSON Patch ──────────────────────────────────────────────────────────

test('JSON Patch: add/remove/replace/move/copy и адрес по id', () => {
  const doc = { a: [{ id: 'f1', x: 1 }, { id: 'f2', x: 2 }], b: { c: 1 } };
  const out = applyPatch(doc, [
    { op: 'replace', path: '/a/f2/x', value: 5 },
    { op: 'add', path: '/a/-', value: { id: 'f3', x: 3 } },
    { op: 'remove', path: '/a/f1' },
    { op: 'copy', from: '/b', path: '/d' },
    { op: 'move', from: '/b/c', path: '/b/e' },
    { op: 'add', path: '/a/0', value: { id: 'f0' } },
  ]);
  assert.deepEqual(out, { a: [{ id: 'f0' }, { id: 'f2', x: 5 }, { id: 'f3', x: 3 }], b: { e: 1 }, d: { c: 1 } });
  assert.equal(doc.a.length, 2, 'исходный документ не тронут');
  assert.equal(doc.a[1].x, 2);
});

test('JSON Patch: понятная ошибка с номером правки', () => {
  const doc = { a: [{ id: 'f1' }] };
  assert.throws(
    () => applyPatch(doc, [{ op: 'replace', path: '/a/0/id', value: 'x' }, { op: 'remove', path: '/a/f9' }]),
    (e) => e instanceof PatchError && e.index === 1 && /Правка 2/.test(e.message) && /f9/.test(e.message),
  );
  assert.throws(() => applyPatch(doc, [{ op: 'remove', path: '/a/3' }]), /номера 3 нет/);
  assert.throws(() => applyPatch(doc, [{ op: 'jump', path: '/a' }]), /неизвестная операция/);
  assert.throws(() => applyPatch(doc, [{ op: 'add', path: 'a' }]), /нет value|начинаться/);
  // ~1 и ~0 в пути
  assert.deepEqual(applyPatch({ 'x/y': 1, 'p~q': 2 }, [{ op: 'replace', path: '/x~1y', value: 3 }, { op: 'remove', path: '/p~0q' }]), { 'x/y': 3 });
});

// ── Поток SSE ───────────────────────────────────────────────────────────

test('SSE: события собираются из рваных кусков', () => {
  const got = [];
  const p = new SSEParser((e, d) => got.push([e, d]));
  p.push('event: a\r\nda');
  p.push('ta: {"x":1}\r\n\r\n: комментарий\n\nevent: b\ndata: 2\n');
  p.push('\n');
  p.end();
  assert.deepEqual(got, [['a', '{"x":1}'], ['b', '2']]);
});

test('поток: текст, JSON инструмента, расход токенов, заголовки', async () => {
  const input = { summary: 'Поставил диван', patch: [{ op: 'add', path: '/x', value: 1 }] };
  const f = fakeFetch([{ sse: sseStream({ text: 'Ставлю диван.', tool: 'edit_project', input }) }]);
  const progress = [];
  const msg = await streamMessage({ key: 'sk-ant-test', body: { model: 'm', max_tokens: 10, messages: [] }, fetchImpl: f, onProgress: (p) => progress.push(p.type) });
  assert.equal(msg.content[0].text, 'Ставлю диван.');
  assert.deepEqual(msg.content[1].input, input);
  assert.equal(msg.stop_reason, 'tool_use');
  assert.equal(msg.usage.output_tokens, 345);
  assert.equal(msg.usage.cache_read_input_tokens, 9000);
  assert.ok(progress.includes('text') && progress.includes('tool'));
  const h = f.calls[0].init.headers;
  assert.equal(h['x-api-key'], 'sk-ant-test');
  assert.equal(h['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(h['anthropic-version'], '2023-06-01');
  assert.equal(f.calls[0].body.stream, true);
});

test('ошибки API — понятным текстом', async () => {
  const f = fakeFetch([{ status: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } }]);
  await assert.rejects(
    () => streamMessage({ key: 'k', body: {}, fetchImpl: f }),
    (e) => e instanceof ApiError && e.status === 401 && /Ключ API не подошёл/.test(describeError(e)),
  );
  assert.match(describeError(new ApiError(400, 'invalid_request_error', 'Your credit balance is too low')), /недостаточно средств/);
  assert.match(describeError(new ApiError(529, 'overloaded_error', '')), /перегружены/);
  assert.match(describeError(new TypeError('Failed to fetch')), /Нет связи/);
  assert.equal(describeError(Object.assign(new Error('x'), { name: 'AbortError' })), 'Остановлено');
  const mb = new MessageBuilder();
  assert.throws(() => mb.apply('error', { error: { type: 'overloaded_error', message: 'Overloaded' } }), ApiError);
});

// ── Помощник ────────────────────────────────────────────────────────────

test('снимок проекта: id для правок, активный этаж, выделение', () => {
  const p = buildHousePreset('house2', {});
  const sofa = p.items.find((i) => i.levelId === p.levels[0].id);
  const snap = snapshotProject(p, { activeLevelId: p.levels[1].id, selection: [{ kind: 'item', id: sofa.id }] });
  assert.ok(snap.exchange.levels[0].furniture.every((f) => /^f\d+$/.test(f.id)));
  assert.ok(snap.exchange.levels[0].openings.every((o) => /^o\d+$/.test(o.id)));
  assert.match(snap.context, /АКТИВНЫЙ ЭТАЖ: levels\/1/);
  assert.match(snap.context, /ВЫДЕЛЕНО НА ПЛАНЕ: f\d+ \(levels\/0, предмет\)/);
  const empty = snapshotProject(createEmptyProject());
  assert.ok(empty.empty);
  assert.match(empty.context, /пуст/);
});

test('сообщения: история текстом, роли чередуются, фото — в последнем', () => {
  const msgs = buildMessages({
    history: [
      { role: 'assistant', text: 'привет' }, // ответ без вопроса в начале — выпадает
      { role: 'user', text: 'дом 10×10' },
      { role: 'assistant', text: 'Строю.', applied: 'Дом 10×10' },
      { role: 'user', text: 'ещё раз' }, // запрос, на который не было ответа (ошибка сети)
    ],
    text: 'добавь окно',
    images: [{ mediaType: 'image/jpeg', data: 'AAAA' }],
    context: 'ТЕКУЩИЙ ПРОЕКТ: {}',
  });
  assert.deepEqual(
    msgs.map((m) => m.role),
    ['user', 'assistant', 'user'],
  );
  assert.match(msgs[1].content[0].text, /Применено к проекту: Дом 10×10/);
  const last = msgs[2].content;
  assert.equal(last[0].text, 'ещё раз');
  assert.equal(last[1].type, 'image');
  assert.match(last[2].text, /ЗАПРОС ПОЛЬЗОВАТЕЛЯ:\nдобавь окно$/);
});

test('системный промпт кэшируется, инструменты описаны', () => {
  const sys = buildSystem();
  assert.equal(sys[sys.length - 1].cache_control.type, 'ephemeral');
  assert.match(sys[0].text, /edit_project/);
  assert.match(sys[0].text, /ЕДИНИЦЫ И КООРДИНАТЫ/);
  assert.deepEqual(TOOLS.map((t) => t.name), ['edit_project', 'build_project']);
});

test('правки и постройка → проект', () => {
  const p = buildHousePreset('house9', {});
  const snap = snapshotProject(p);
  const room = snap.exchange.levels[0].rooms[0];
  const res = projectFromTool({ name: 'edit_project', input: { summary: 'Плитка', patch: [{ op: 'replace', path: `/levels/0/rooms/${room.id}/floor`, value: 'tile' }, { op: 'remove', path: '/levels/0/furniture/f1' }] } }, snap.exchange);
  assert.equal(res.project.rooms[0].floor, 'tile');
  assert.equal(res.project.items.length, p.items.length - 1);
  assert.equal(res.project.walls.length, p.walls.length);
  assert.equal(res.changes, 2);
  // пустые правки — ничего не меняем
  assert.equal(projectFromTool({ name: 'edit_project', input: { summary: '', patch: [] } }, snap.exchange).project, null);
  // проект строкой — тоже понимаем
  const built = projectFromTool({ name: 'build_project', input: { summary: 'Пример', project: JSON.stringify(EXAMPLE) } }, snap.exchange);
  assert.equal(built.project.walls.length, 6);
  assert.throws(() => projectFromTool({ name: 'build_project', input: { project: { levels: [{ walls: [] }] } } }, snap.exchange), /нет ни одной стены/);
});

test('ход разговора: ошибка правок уходит Claude, вторая попытка применяется', async () => {
  const p = buildHousePreset('box2', {});
  const snap = snapshotProject(p, { activeLevelId: p.levels[0].id });
  const bad = { summary: 'Пол', patch: [{ op: 'replace', path: '/levels/0/rooms/r99/floor', value: 'tile' }] };
  const good = { summary: 'Пол — плитка', patch: [{ op: 'replace', path: '/levels/0/rooms/r1/floor', value: 'tile' }] };
  const f = fakeFetch([{ sse: sseStream({ text: 'Меняю пол.', tool: 'edit_project', input: bad }) }, { sse: sseStream({ text: 'Исправил адрес.', tool: 'edit_project', input: good }) }]);
  const progress = [];
  const res = await runTurn({ key: 'k', model: 'claude-sonnet-5-5', text: 'плитку в комнату', snapshot: snap, fetchImpl: f, onProgress: (x) => progress.push(x.type) });
  assert.equal(f.calls.length, 2);
  assert.equal(res.attempts, 2);
  assert.equal(res.project.rooms[0].floor, 'tile');
  assert.equal(res.summary, 'Пол — плитка');
  assert.match(res.text, /Меняю пол\.\n\nИсправил адрес\./);
  assert.ok(progress.includes('retry'));
  const second = f.calls[1].body.messages;
  const tr = second[second.length - 1].content[0];
  assert.equal(tr.type, 'tool_result');
  assert.equal(tr.is_error, true);
  assert.match(tr.content, /r99/);
  assert.equal(second[second.length - 2].content[1].type, 'tool_use');
  assert.equal(f.calls[0].body.model, 'claude-sonnet-5-5');
  assert.equal(f.calls[0].body.tools.length, 2);
});

test('ход разговора: ответ текстом без инструмента', async () => {
  const p = buildHousePreset('box1', {});
  const f = fakeFetch([{ sse: sseStream({ text: 'Площадь комнаты — 24 м².' }) }]);
  const res = await runTurn({ key: 'k', model: 'm', text: 'какая площадь?', snapshot: snapshotProject(p), fetchImpl: f });
  assert.equal(res.text, 'Площадь комнаты — 24 м².');
  assert.equal(res.project, undefined);
  assert.equal(res.usage.output, 345);
});

test('перенос места участка и точки манекена', () => {
  const a = buildHousePreset('house9', {});
  a.site.lat = 55.7;
  a.site.north = 30;
  a.site.spawn = { x: 1, y: 2, levelId: a.levels[0].id };
  const b = buildHousePreset('house9', {});
  carryOver(a, b);
  assert.equal(b.site.lat, 55.7);
  assert.equal(b.site.north, 30);
  assert.equal(b.site.spawn.levelId, b.levels[0].id);
});

test('ход разговора: модель с меньшим пределом ответа — повтор с ним', async () => {
  const p = buildHousePreset('box1', {});
  const f = fakeFetch([
    { status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'max_tokens: 32000 > 16384, which is the maximum allowed number of output tokens for this model' } } },
    { sse: sseStream({ text: 'Готово.' }) },
  ]);
  const res = await runTurn({ key: 'k', model: 'm', text: 'привет', snapshot: snapshotProject(p), fetchImpl: f });
  assert.equal(res.text, 'Готово.');
  assert.equal(f.calls[1].body.max_tokens, 16384);
});
