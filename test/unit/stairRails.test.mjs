/**
 * Перила лестниц, стоящих друг над другом: блокировка по высоте, а не по плану.
 * ВАЖНО: rotation в проекте — в ГРАДУСАХ (toWorld/rectCorners принимают rotDeg).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { stairLayout } from '../../js/geometry/stairGeometry.js';
import { pointInPolygon } from '../../js/core/geometry.js';
import {
  stairRails, stairFootprintsAbove, stairFootprintsOverOpening, RAIL_HEIGHT,
} from '../../js/geometry/stairRails.js';

const RISE = 3.05; // этаж 2.8 + перекрытие 0.25

const level = (id) => ({ id, name: id, kind: 'floor', height: 2.8, slab: 0.25 });
const stair = (id, levelId, over = {}) => ({
  id, levelId, shape: 'straight', style: 'stringer', railing: 'auto',
  x: 0, y: 0, rotation: 0, width: 1, length: 3, flight: 1, ...over,
});
const project = (stairs) => ({
  foundation: 0.45,
  levels: [level('l1'), level('l2'), level('l3')],
  stairs,
});

// защита от путаницы градусов/радиан: при rotation: 180 первая ступень
// повёрнутой лестницы обязана оказаться у y < 0 (при Math.PI ≈ 3° она у y > 0)
const assertRotated180 = (s) => {
  const first = stairLayout(s, RISE).steps[0].poly;
  assert.ok(first.every((p) => p.y < 0), 'rotation задаётся в градусах: 180, а не Math.PI');
};

test('лестницы друг над другом, одинаковая ориентация: перила нижней сохраняются', () => {
  const s1 = stair('s1', 'l1');
  const s2 = stair('s2', 'l2');
  const p = project([s1, s2]);
  const lay = stairLayout(s1, RISE);
  const rails = stairRails(s1, lay, [], null, { blocked: stairFootprintsAbove(p, s1) });
  // зазор по высоте ~2 м — пересечения нет, обе стороны марша ограждены
  assert.ok(rails.sides.length >= 2);
  const xs = rails.sides.map((l) => l[0].x);
  assert.ok(Math.min(...xs) < -0.4 && Math.max(...xs) > 0.4);
  assert.ok(rails.sides.some((l) => l.some((pt) => pt.h > RISE - 0.2)));
});

test('верхняя лестница повёрнута на 180°: перила нижней срезаются только у верха', () => {
  const s1 = stair('s1', 'l1');
  const s2 = stair('s2', 'l2', { rotation: 180 }); // градусы!
  assertRotated180(s2);
  const p = project([s1, s2]);
  const lay = stairLayout(s1, RISE);
  const blocked = stairFootprintsAbove(p, s1);
  const rails = stairRails(s1, lay, [], null, { blocked });
  assert.ok(rails.sides.length >= 2, 'низ марша должен остаться ограждённым');
  const hs = rails.sides.flatMap((l) => l.map((pt) => pt.h));
  assert.ok(Math.min(...hs) < 1, 'перила у нижней ступени сохранились');
  assert.ok(Math.max(...hs) < 2.7, 'у верха марша перила срезаны (не доходят до верхней лестницы)');
  // середины отрезков перил не торчат сквозь ступени верхней лестницы
  for (const l of rails.sides) {
    const m = { x: (l[0].x + l[1].x) / 2, y: (l[0].y + l[1].y) / 2 };
    const hm = (l[0].h + l[1].h) / 2;
    for (const b of blocked) {
      if (!pointInPolygon(m, b.poly)) continue;
      assert.ok(hm + RAIL_HEIGHT <= b.y0 + 0.05 || hm >= b.y1 - 0.05, 'перила не пересекают ступень сверху');
    }
  }
});

test('ограждение проёма обходит верхнюю лестницу и не перекрывает вход на неё', () => {
  const s1 = stair('s1', 'l1');
  const s2 = stair('s2', 'l2', { rotation: 180 }); // градусы! начинается прямо над проёмом
  assertRotated180(s2);
  const p = project([s1, s2]);
  const lay = stairLayout(s1, RISE);
  const blocked = stairFootprintsOverOpening(p, 'l2', lay.outline);
  const { guards } = stairRails(s1, lay, [], [], { blocked });
  assert.ok(guards.length >= 3, 'свободные края проёма ограждены');
  // у начала верхней лестницы (y ≈ −1.5) забора нет — вход открыт
  assert.ok(guards.every((l) => l.every((pt) => pt.y > -0.6)));
  // дальний край проёма по-прежнему ограждён
  assert.ok(guards.some((l) => l.every((pt) => pt.y > 1.4)));
  // без учёта верхней лестницы забор заходил к её первым ступеням — регрессия
  const before = stairRails(s1, lay, [], [], {}).guards;
  assert.ok(before.some((l) => l.some((pt) => pt.y < -1.0)));
});

test('одна лестница: ничего не изменилось', () => {
  const s1 = stair('s1', 'l1');
  const p = project([s1]);
  const lay = stairLayout(s1, RISE);
  const rails = stairRails(s1, lay, [], null, { blocked: stairFootprintsAbove(p, s1) });
  assert.equal(rails.sides.length, 2);
  const { guards } = stairRails(s1, lay, [], [], { blocked: stairFootprintsOverOpening(p, 'l2', lay.outline) });
  assert.equal(guards.length, 3); // два боковых края + дальний; выход свободен
});

test('railing: none — перил нет', () => {
  const s1 = stair('s1', 'l1', { railing: 'none' });
  const lay = stairLayout(s1, RISE);
  const rails = stairRails(s1, lay, [], [], { blocked: [] });
  assert.equal(rails.sides.length, 0);
  assert.equal(rails.guards.length, 0);
});

test('старый формат blocked (просто полигоны) совместим: блокирует на любой высоте', () => {
  const s1 = stair('s1', 'l1');
  const lay = stairLayout(s1, RISE);
  const rails = stairRails(s1, lay, [], null, { blocked: [lay.outline] });
  assert.equal(rails.sides.length, 0);
});
