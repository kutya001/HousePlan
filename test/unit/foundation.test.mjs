import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foundationOf, BLIND_AREA } from '../../js/model/foundation.js';
import { foundationParts, blindArea, pilePoints } from '../../js/geometry/foundation.js';
import { computeWallGeometry } from '../../js/geometry/wallGeometry.js';
import { computeEstimate } from '../../js/model/estimate.js';
import { createEmptyProject, normalizeProject } from '../../js/model/project.js';
import { createWall } from '../../js/model/factories.js';
import { addBasementLevel } from '../../js/model/operations.js';
import { buildHousePreset } from '../../js/model/presets.js';
import { toExchange, importProject } from '../../js/io/exchange.js';
import { wallSideFinish } from '../../js/model/wallTypes.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

/** Коробка 10×8 по осям стен (стены 0,4 м) с несущей стеной посередине и перегородкой. */
function house() {
  const p = createEmptyProject();
  const L = p.levels[0].id;
  const pts = [
    [0, 0],
    [10, 0],
    [10, 8],
    [0, 8],
  ];
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % 4];
    p.walls.push(createWall(L, { x: a[0], y: a[1] }, { x: b[0], y: b[1] }, { type: 'aerated' }));
  });
  p.walls.push(createWall(L, { x: 5, y: 0 }, { x: 5, y: 8 }, { type: 'bearing_block' }));
  p.walls.push(createWall(L, { x: 0, y: 4 }, { x: 5, y: 4 }, { type: 'part_block' }));
  return p;
}

const rows = (p) => Object.fromEntries(computeEstimate(p).sections.flatMap((s) => s.rows).map((r) => [r.key, r]));

test('фундамент: умолчания и проверка значений', () => {
  const p = house();
  assert.deepEqual([foundationOf(p).type, foundationOf(p).finish, foundationOf(p).blind, foundationOf(p).height], ['strip', 'stone', 0.8, 0.45]);
  Object.assign(p, { foundationType: 'нет такого', plinthFinish: '???', plinthColor: 'red', blindArea: -3 });
  const f = foundationOf(p);
  assert.deepEqual([f.type, f.finish, f.blind], ['strip', 'stone', 0]);
  assert.match(f.color, /^#[0-9a-f]{6}$/i);
  p.plinthColor = '#123456';
  assert.equal(foundationOf(p).color, '#123456');
  // старый проект без новых полей получает их при открытии
  const old = normalizeProject({ name: 'Старый', levels: p.levels, walls: p.walls, foundation: 0.6 });
  assert.deepEqual([old.foundationType, old.plinthFinish, old.blindArea, old.foundation], ['strip', 'stone', BLIND_AREA, 0.6]);
});

test('сваи стоят по углам, на стыках несущих стен и вдоль них с шагом', () => {
  const p = house();
  const geoms = computeWallGeometry(p.walls);
  const piles = pilePoints(geoms, 2.5);
  const has = (x, y) => piles.some((q) => near(q.x, x, 0.01) && near(q.y, y, 0.01));
  for (const [x, y] of [[0, 0], [10, 0], [10, 8], [0, 8], [5, 0], [5, 8]]) assert.ok(has(x, y), `свая в (${x}, ${y})`);
  assert.ok(!has(2.5, 4), 'под перегородкой свай нет');
  // соседние сваи вдоль стены не дальше шага
  const onWall = piles.filter((q) => near(q.y, 0)).sort((a, b) => a.x - b.x);
  for (let i = 1; i < onWall.length; i++) assert.ok(onWall[i].x - onWall[i - 1].x <= 2.5 + 1e-6);
  assert.ok(onWall.length >= 5);
  // сваи не дублируются
  for (let i = 0; i < piles.length; i++) for (let j = i + 1; j < piles.length; j++) assert.ok(Math.hypot(piles[i].x - piles[j].x, piles[i].y - piles[j].y) > 0.29);
});

test('части фундамента по видам; под подвалом своего фундамента нет', () => {
  const p = house();
  const strip = foundationParts(p);
  assert.equal(strip.exterior.length, 4);
  assert.equal(strip.bearing.length, 5);
  assert.equal(strip.piles.length, 0);
  assert.ok(near(strip.perimeter, 36));
  assert.ok(near(strip.bearingLength, 44));
  p.foundationType = 'slab';
  const slab = foundationParts(p);
  assert.equal(slab.slab.length, 1);
  // плита шире пятна дома (10,4 × 8,4) на 15 см с каждой стороны
  const xs = slab.slab[0].map((q) => q.x);
  assert.ok(near(Math.max(...xs) - Math.min(...xs), 10.7, 1e-6));
  p.foundationType = 'piles';
  const piles = foundationParts(p);
  assert.ok(piles.piles.length >= 14);
  assert.ok(near(piles.beam, 0.4));
  p.foundationType = 'screw';
  p.foundation = 0.1;
  assert.ok(near(foundationParts(p).beam, 0.1), 'обвязка не выше цоколя');
  p.foundation = 0;
  assert.equal(foundationParts(p).piles.length, 0, 'дом на земле — свай не видно');
  // подвал: фундамент — его стены
  p.foundation = 0.45;
  addBasementLevel(p, false);
  const b = foundationParts(p);
  assert.ok(b.basement);
  assert.equal(b.piles.length, 0);
});

test('отмостка — полоса вокруг пятна дома', () => {
  const p = house();
  const b = blindArea(p);
  assert.equal(b.rings.length, 1);
  assert.ok(near(b.area, (10.4 + 1.6) * (8.4 + 1.6) - 10.4 * 8.4, 1e-6));
  p.blindArea = 1.2;
  assert.ok(near(blindArea(p).area, (10.4 + 2.4) * (8.4 + 2.4) - 10.4 * 8.4, 1e-6));
  p.blindArea = 0;
  assert.equal(blindArea(p).rings.length, 0);
  // недостроенный дом (контур не замкнут) — отмостки нет, ошибок тоже
  const q = house();
  q.walls = q.walls.slice(1, 4);
  assert.equal(blindArea(q).rings.length, 0);
});

test('смета фундамента по видам, отделка цоколя и отмостка', () => {
  const p = house();
  const strip = rows(p);
  assert.match(strip.found_concrete.name, /ленточного/);
  assert.ok(strip.excavation && strip.found_rebar);
  assert.ok(near(strip.blind_area.qty, 32.64, 0.01));
  assert.ok(near(strip.plinth_stone.qty, 36 * 0.45, 0.01));
  assert.equal(strip.found_pile, undefined);

  p.foundationType = 'slab';
  const slab = rows(p);
  assert.match(slab.found_concrete.name, /плиты/);
  assert.ok(slab.found_sand.qty > 20);
  assert.ok(slab.found_concrete.qty > strip.found_concrete.qty, 'плита — больше бетона, чем лента');

  p.foundationType = 'piles';
  const piles = rows(p);
  assert.equal(piles.found_pile.qty, foundationParts(p).piles.length);
  assert.match(piles.found_concrete.name, /ростверка/);
  assert.equal(piles.excavation, undefined);

  p.foundationType = 'screw';
  p.plinthFinish = 'concrete';
  p.blindArea = 0;
  const screw = rows(p);
  assert.equal(screw.found_screw.qty, foundationParts(p).piles.length);
  assert.ok(near(screw.found_beam.qty, 44, 0.01));
  assert.equal(screw.found_concrete, undefined);
  assert.equal(screw.found_rebar, undefined);
  assert.equal(screw.blind_area, undefined);
  assert.ok(!Object.keys(screw).some((k) => k.startsWith('plinth_')), 'бетон без отделки в смету не идёт');
});

test('смета кровли: покрытие по видам, водостоки, парапет', () => {
  const p = buildHousePreset('house9', {});
  const base = rows(p);
  assert.ok(base.roof_cover.qty > 50);
  assert.ok(base.gutter.qty > 10 && base.downpipe.qty > 4);
  p.roofs[0].cover = 'seam';
  const seam = rows(p);
  assert.equal(seam.roof_cover, undefined);
  assert.ok(near(seam.roof_seam.qty, base.roof_cover.qty, 0.01));
  p.roofs[0].gutters = false;
  assert.equal(rows(p).gutter, undefined);
  Object.assign(p.roofs[0], { type: 'flat', parapet: 0.4 });
  const flat = rows(p);
  assert.ok(flat.roof_membrane.qty > 50, 'у плоской крыши — мембрана');
  assert.ok(flat.parapet.qty > 10);
});

test('фундамент в формате для ИИ; стены подвала снаружи — в отделке цоколя', () => {
  const p = house();
  assert.equal(toExchange(p).foundationType, undefined, 'умолчания в JSON не попадают');
  assert.equal(toExchange(p).blindArea, undefined);
  Object.assign(p, { foundationType: 'screw', plinthFinish: 'brick', plinthColor: '#774433', blindArea: 0 });
  const x = toExchange(p);
  assert.deepEqual([x.foundationType, x.plinth, x.blindArea], ['screw', { finish: 'brick', color: '#774433' }, 0]);
  const q = importProject(x).project;
  assert.deepEqual([q.foundationType, q.plinthFinish, q.plinthColor, q.blindArea], ['screw', 'brick', '#774433', 0]);
  // неизвестные значения от ИИ не ломают проект
  const bad = importProject({ ...x, foundationType: 'magic', plinth: { finish: 'gold', color: 'x' }, blindArea: 'широкая' }).project;
  assert.deepEqual([bad.foundationType, bad.plinthFinish, bad.plinthColor], ['strip', 'stone', undefined]);
  // стена подвала: снаружи — отделка и цвет цоколя, внутри — своя
  const w = { kind: 'exterior', type: 'concrete', thickness: 0.3 };
  const out = wallSideFinish(w, 'A', { outside: true, underground: true, plinthFinish: 'tile', plinthColor: '#774433' });
  assert.deepEqual([out.finish, out.color], ['tile', '#774433']);
  assert.equal(wallSideFinish(w, 'B', { outside: false, underground: true, plinthFinish: 'tile', plinthColor: '#774433' }).finish, 'plaster');
});
