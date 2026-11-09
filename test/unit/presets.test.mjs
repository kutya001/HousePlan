import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOUSE_PRESETS, buildHousePreset } from '../../js/model/presets.js';
import { checkProject } from '../../js/model/validate.js';
import { createItem } from '../../js/model/factories.js';

const build = (id) => {
  const r = buildHousePreset(id, {});
  return r.project || r;
};

test('пресеты проходят проверку без ошибок и предупреждений', () => {
  for (const p of HOUSE_PRESETS) {
    const issues = checkProject(build(p.id));
    assert.deepEqual(
      issues.map((i) => i.title),
      [],
      `пресет ${p.id}`,
    );
  }
});

test('проверка находит предметы друг в друге', () => {
  const p = build('house9');
  const lvl = p.levels[0].id;
  const room = p.rooms.find((r) => r.levelId === lvl);
  const c = room.points.reduce((s, q) => ({ x: s.x + q.x / room.points.length, y: s.y + q.y / room.points.length }), { x: 0, y: 0 });
  p.items.push(createItem(lvl, 'sofa', c.x, c.y), createItem(lvl, 'armchair', c.x + 0.3, c.y));
  const issues = checkProject(p);
  assert.ok(issues.some((i) => i.level === 'error' && /друг в друге/.test(i.title)));
});

test('инженерия не считается столкновением', () => {
  const p = build('house9');
  const lvl = p.levels[0].id;
  const room = p.rooms.find((r) => r.levelId === lvl);
  const c = room.points.reduce((s, q) => ({ x: s.x + q.x / room.points.length, y: s.y + q.y / room.points.length }), { x: 0, y: 0 });
  p.items.push(createItem(lvl, 'ceiling_light', c.x, c.y), createItem(lvl, 'bed_double', c.x, c.y));
  assert.ok(!checkProject(p).some((i) => /Светильник/.test(i.title)));
});
