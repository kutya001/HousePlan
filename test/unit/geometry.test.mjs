import { test } from 'node:test';
import assert from 'node:assert/strict';
import { polygonArea, subtractConvex, isConvex, clipPolygonHalfPlane, toWorld, toLocal } from '../../js/core/geometry.js';

const sq = (x, y, w, h) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

test('площадь многоугольника', () => {
  assert.equal(polygonArea(sq(0, 0, 4, 3)), 12);
});

test('вычитание выпуклого окна, пересекающего край', () => {
  const parts = subtractConvex(sq(0, 0, 4, 4), sq(3, 1, 3, 1));
  const total = parts.reduce((s, p) => s + polygonArea(p), 0);
  assert.ok(Math.abs(total - 15) < 1e-9);
});

test('окно вне многоугольника не режет его', () => {
  assert.equal(subtractConvex(sq(0, 0, 4, 4), sq(10, 10, 1, 1)).length, 1);
});

test('выпуклость', () => {
  assert.equal(isConvex(sq(0, 0, 2, 2)), true);
  const L = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 2 },
    { x: 2, y: 2 },
    { x: 2, y: 4 },
    { x: 0, y: 4 },
  ];
  assert.equal(isConvex(L), false);
});

test('отсечение полуплоскостью', () => {
  const half = clipPolygonHalfPlane(sq(0, 0, 4, 4), { x: 2, y: 0 }, { x: 1, y: 0 });
  assert.equal(polygonArea(half), 8);
});

test('локальные и мировые координаты взаимно обратны', () => {
  const p = toWorld({ x: 1.5, y: -0.7 }, 3, 4, 37);
  const q = toLocal(p, 3, 4, 37);
  assert.ok(Math.abs(q.x - 1.5) < 1e-9 && Math.abs(q.y + 0.7) < 1e-9);
});
