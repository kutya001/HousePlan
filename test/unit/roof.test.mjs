import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoRoofRects } from '../../js/geometry/roofAuto.js';
import { createEmptyProject } from '../../js/model/project.js';
import { createWall } from '../../js/model/factories.js';
import { buildHousePreset } from '../../js/model/presets.js';
import { roofSurfaceAt, slopeRotation } from '../../js/geometry/roofSurface.js';

function house(pts) {
  const p = createEmptyProject();
  const L = p.levels[0].id;
  for (let i = 0; i < pts.length; i++) {
    const [a, b] = [pts[i], pts[(i + 1) % pts.length]];
    p.walls.push(createWall(L, { x: a[0], y: a[1] }, { x: b[0], y: b[1] }, { kind: 'exterior' }));
  }
  return p;
}

test('прямоугольный дом — одна крыша', () => {
  const p = house([
    [0, 0],
    [10, 0],
    [10, 8],
    [0, 8],
  ]);
  const r = autoRoofRects(p, p.levels[0].id);
  assert.equal(r.length, 1);
  assert.ok(r[0].w >= r[0].d, 'конёк вдоль длинной стороны');
});

test('Г-образный — главный объём и крыло до конька', () => {
  const p = buildHousePreset('lhouse', {});
  const r = autoRoofRects(p, p.levels[0].id);
  assert.equal(r.length, 2);
  // крыло заходит в главный объём только до его конька
  const [main, wing] = r;
  assert.ok(wing.w < main.w);
});

test('П-образный — три крыши', () => {
  const p = house([
    [-7, -4],
    [7, -4],
    [7, 6],
    [3, 6],
    [3, 1],
    [-3, 1],
    [-3, 6],
    [-7, 6],
  ]);
  assert.equal(autoRoofRects(p, p.levels[0].id).length, 3);
});

test('мансардное окно ложится по скату', () => {
  const p = buildHousePreset('mansard', {});
  const attic = p.levels.at(-1).id;
  const west = roofSurfaceAt(p, attic, { x: -2.5, y: 0 });
  const east = roofSurfaceAt(p, attic, { x: 2.5, y: 0 });
  assert.ok(west && east);
  assert.ok(Math.abs(slopeRotation(west) - 90) < 1e-6);
  assert.ok(Math.abs(Math.abs(slopeRotation(east)) - 90) < 1e-6);
  assert.ok(west.h > 5);
});
