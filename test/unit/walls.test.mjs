/** Типы стен, отделка по сторонам, учёт в смете. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WALL_TYPES, WALL_TYPE_GROUPS, wallTypeId, wallSideFinish, isBearing, finishOptions } from '../../js/model/wallTypes.js';
import { wallSides, sideLabel } from '../../js/geometry/wallSides.js';
import { computeWallGeometry } from '../../js/geometry/wallGeometry.js';
import { buildHousePreset } from '../../js/model/presets.js';
import { computeEstimate } from '../../js/model/estimate.js';
import { createWall } from '../../js/model/factories.js';

test('типы стен: каталог цел, старые стены читаются по роли и толщине', () => {
  for (const g of WALL_TYPE_GROUPS) for (const id of g.ids) assert.ok(WALL_TYPES[id], id);
  assert.equal(Object.keys(WALL_TYPES).length, WALL_TYPE_GROUPS.reduce((n, g) => n + g.ids.length, 0), 'каждый тип — в одной из групп');
  assert.equal(wallTypeId({ kind: 'exterior', thickness: 0.4 }), 'aerated');
  assert.equal(wallTypeId({ kind: 'interior', thickness: 0.12 }), 'part_block');
  assert.equal(wallTypeId({ kind: 'interior', thickness: 0.25 }), 'bearing_block');
  assert.equal(wallTypeId({ kind: 'interior', type: 'glass' }), 'glass');
  assert.ok(isBearing({ kind: 'exterior' }) && !isBearing({ kind: 'interior', thickness: 0.1 }));
  const w = createWall('l', { x: 0, y: 0 }, { x: 3, y: 0 }, { type: 'drywall' });
  assert.deepEqual([w.kind, w.thickness, w.type], ['interior', 0.1, 'drywall']);
});

test('отделка стороны: тип стены, фасад проекта, своя отделка и цвет', () => {
  const ctx = { facade: 'siding', facadeColor: '#eee', interiorColor: '#fff', plinthColor: '#888' };
  const aer = { kind: 'exterior', thickness: 0.4 };
  assert.equal(wallSideFinish(aer, 'A', { ...ctx, outside: true }).finish, 'siding', 'снаружи — фасад проекта');
  assert.equal(wallSideFinish(aer, 'B', { ...ctx, outside: false }).finish, 'plaster', 'внутри — штукатурка');
  assert.equal(wallSideFinish({ ...aer, type: 'brick' }, 'A', { ...ctx, outside: true }).finish, 'brick', 'кирпичная стена — кирпич снаружи');
  assert.equal(wallSideFinish({ ...aer, type: 'log' }, 'B', { ...ctx, outside: false }).finish, 'log', 'бревно видно и внутри');
  const own = { ...aer, finishB: 'tile', colorB: '#123456', color: '#abcdef' };
  assert.deepEqual([wallSideFinish(own, 'B', ctx).finish, wallSideFinish(own, 'B', ctx).color], ['tile', '#123456']);
  assert.equal(wallSideFinish(own, 'A', { ...ctx, outside: true }).color, '#abcdef', 'старый общий цвет стены действует на сторону без своего');
  assert.equal(wallSideFinish(aer, 'A', { ...ctx, outside: true, underground: true }).finish, 'concrete', 'стена подвала в грунте');
  assert.ok(wallSideFinish({ kind: 'interior', type: 'glass' }, 'A', ctx).glass > 0);
  assert.ok(finishOptions(true).siding && !finishOptions(true).wallpaper && finishOptions(false).wallpaper);
});

test('стороны стен: у наружной наружу смотрит ровно одна, у перегородки — комнаты с обеих', () => {
  for (const id of ['house9', 'lhouse', 'house2']) {
    const p = buildHousePreset(id, {});
    const l = p.levels[0];
    const geoms = computeWallGeometry(p.walls.filter((w) => w.levelId === l.id));
    const sides = wallSides(p, l.id, geoms);
    for (const g of geoms.values()) {
      const s = sides.get(g.wall.id);
      if (g.wall.kind === 'exterior') assert.ok(s.A.outside !== s.B.outside, `${id}: наружная стена`);
      else assert.ok(!s.A.outside && !s.B.outside, `${id}: перегородка`);
    }
    const any = [...sides.values()].find((s) => s.A.room || s.B.room);
    assert.match(sideLabel(any.A.room ? any.A : any.B), /^к «/);
  }
});

test('смета: стены считаются по типам, отделка — по видам; старые строки на месте', () => {
  const p = buildHousePreset('house9', {});
  const keys = (est) => est.sections.flatMap((s) => s.rows.map((r) => r.key));
  const before = keys(computeEstimate(p));
  assert.ok(before.includes('wall_ext') && before.includes('partition') && before.includes('facade') && before.includes('int_finish'));
  const ext = p.walls.filter((w) => w.kind === 'exterior');
  for (const w of ext) Object.assign(w, { type: 'timber', thickness: 0.2 });
  const inner = p.walls.find((w) => w.kind === 'interior');
  Object.assign(inner, { type: 'drywall', finishA: 'tile' });
  const after = computeEstimate(p);
  const k = keys(after);
  assert.ok(k.includes('wall_timber') && k.includes('wall_drywall') && k.includes('int_tile'));
  assert.ok(!k.includes('wall_ext') && !k.includes('facade'), 'брус отделки фасада не требует');
  const row = after.sections.flatMap((s) => s.rows).find((r) => r.key === 'wall_drywall');
  assert.equal(row.unit, 'м²');
});
