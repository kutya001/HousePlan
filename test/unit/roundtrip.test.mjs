/**
 * Формат для ИИ не должен ничего терять: каждый ответ помощника пересобирает
 * проект из этого JSON, поэтому поле, которого в формате нет, молча сбрасывается.
 * Тест сравнивает ВСЕ поля всех объектов до и после — новое поле модели,
 * забытое в exchange.js, уронит его.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHousePreset, HOUSE_PRESETS } from '../../js/model/presets.js';
import { toExchange, importProject } from '../../js/io/exchange.js';
import { carryOver } from '../../js/ai/assistant.js';
import { customize } from '../customize.mjs';

const r = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);
const norm = (f, v) => (f === 'rotation' && typeof v === 'number' ? ((v % 360) + 360) % 360 : v);
const js = (f, v) => JSON.stringify(norm(f, v), (k, x) => r(x));

function diffList(name, A, B, key, lost) {
  if (A.length !== B.length) lost.push(`${name}: было ${A.length}, стало ${B.length}`);
  const used = new Set();
  for (const a of A) {
    const i = B.findIndex((x, j) => !used.has(j) && key(x) === key(a));
    if (i < 0) {
      lost.push(`${name}: пропал ${key(a)}`);
      continue;
    }
    used.add(i);
    const b = B[i];
    for (const f of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (['id', 'levelId', 'wallId', '_k'].includes(f)) continue;
      if (js(f, a[f]) !== js(f, b[f])) lost.push(`${name}.${f}: ${js(f, a[f])} → ${js(f, b[f])}`);
    }
  }
}

for (const preset of HOUSE_PRESETS) {
  test(`ИИ-правка ничего не теряет: ${preset.name}`, () => {
    const p = customize(buildHousePreset(preset.id, {}));
    const q = carryOver(p, importProject(toExchange(p, { ids: true })).project);
    const lost = [];
    const lv = (P, id) => P.levels.findIndex((l) => l.id === id);
    const wk = (P) => (w) => `${lv(P, w.levelId)}:${r(w.x1)},${r(w.y1)}-${r(w.x2)},${r(w.y2)}`;
    const keyed = (P, list, k) => list.map((e) => ({ ...e, _k: k(P)(e) }));
    const ok = (P) => (o) => `${wk(P)(P.walls.find((x) => x.id === o.wallId))}@${r(o.t)}`;
    diffList('walls', keyed(p, p.walls, wk), keyed(q, q.walls, wk), (e) => e._k, lost);
    diffList('openings', keyed(p, p.openings, ok), keyed(q, q.openings, ok), (e) => e._k, lost);
    diffList('rooms', p.rooms, q.rooms, (x) => `${x.name}:${r(x.points[0].x)},${r(x.points[0].y)}`, lost);
    diffList('stairs', p.stairs, q.stairs, (x) => `${r(x.x)},${r(x.y)}`, lost);
    diffList('items', p.items, q.items, (x) => `${x.type}:${r(x.x)},${r(x.y)}`, lost);
    diffList('roofs', p.roofs, q.roofs, (x) => `${r(x.x)},${r(x.y)},${r(x.w)}`, lost);
    diffList('zones', p.zones, q.zones, (x) => `${x.material}:${r(x.points[0].x)}`, lost);
    diffList('levels', p.levels, q.levels, (x) => x.name, lost);
    const top = (P) => {
      const { walls, openings, rooms, stairs, items, roofs, zones, levels, site, ...rest } = P;
      return rest;
    };
    diffList('project', [top(p)], [top(q)], () => 1, lost);
    diffList('site', [p.site], [q.site], () => 1, lost);
    assert.deepEqual(lost, []);
  });
}
