import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHousePreset } from '../../js/model/presets.js';
import { toExchange, importProject } from '../../js/io/exchange.js';
import { planRect, itemLayer } from '../../js/model/layers.js';
import { createItem } from '../../js/model/factories.js';
import { pickScale, fmtMark, sectionPlan, houseBBox, sectionCuts } from '../../js/app/drawings.js';

test('обмен с ИИ: туда и обратно без потерь', () => {
  const p = buildHousePreset('mansard', {});
  p.facade = 'brick';
  p.roofs[0].cover = 'tiles';
  p.rooms[0].heatedFloor = true;
  const back = importProject(JSON.stringify(toExchange(p))).project;
  assert.equal(back.walls.length, p.walls.length);
  assert.equal(back.openings.length, p.openings.length);
  assert.equal(back.levels.length, p.levels.length);
  assert.equal(back.facade, 'brick');
  assert.equal(back.roofs[0].cover, 'tiles');
  assert.ok(back.rooms.some((r) => r.heatedFloor));
  assert.equal(back.items.filter((i) => i.type === 'roof_window').length, 3);
});

test('слои: значок розетки не меньше нескольких пикселей', () => {
  const s = createItem('l', 'socket', 0, 0);
  assert.equal(itemLayer(s), 'electric');
  const r = planRect(s, 0.05); // 5 см в пикселе — сильно отдалили
  assert.ok(r.w >= 0.79 && r.d >= 0.44);
  assert.equal(planRect(s, 0.0001).w, s.w);
  assert.equal(itemLayer(createItem('l', 'balcony', 0, 0)), 'structure');
});

test('чертежи: масштаб, отметки, разрез', () => {
  assert.equal(pickScale(18, 12, 277, 156), 100);
  assert.equal(pickScale(18, 18, 277, 156), 125);
  assert.equal(fmtMark(0), '±0,000');
  assert.equal(fmtMark(-0.45), '−0,450');
  assert.equal(fmtMark(3.05), '+3,050');
  const p = buildHousePreset('house2', {});
  const sec = sectionPlan(p, houseBBox(p));
  assert.ok(Math.hypot(sec.n.x, sec.n.y) > 0.99);
  assert.ok(sectionCuts(p, sec).length > 5);
});
