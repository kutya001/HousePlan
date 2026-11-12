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

// ── Виды крыш: скаты как нижняя огибающая плоскостей ─────────────────────

import { roofGeometry, roofPeak, roofPlanes, roofHeightAt, localPlanes } from '../../js/geometry/roofGeometry.js';
import { lowerEnvelope } from '../../js/core/geometry.js';

const T30 = Math.tan((30 * Math.PI) / 180);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const roofOf = (type, extra = {}) => ({ type, x: 0, y: 0, w: 10, d: 8, rotation: 0, pitch: 30, overhang: 0.5, ...extra });
const heights = (poly) => poly.map((p) => p.y);
const planArea = (poly) => {
  let s = 0;
  for (let i = 0; i < poly.length; i++) s += poly[i].x * poly[(i + 1) % poly.length].z - poly[(i + 1) % poly.length].x * poly[i].z;
  return Math.abs(s) / 2;
};

test('нижняя огибающая: участки покрывают контур без наложений', () => {
  const rect = [
    { x: -5, y: -4 },
    { x: 5, y: -4 },
    { x: 5, y: 4 },
    { x: -5, y: 4 },
  ];
  const planes = [
    { a: 0, b: 1, c: 4 },
    { a: 0, b: -1, c: 4 },
    { a: 1, b: 0, c: 5 },
    { a: -1, b: 0, c: 5 },
  ];
  const parts = lowerEnvelope(rect, planes);
  assert.equal(parts.length, 4);
  const sum = parts.reduce((s, p) => s + planArea(p.poly.map((q) => ({ x: q.x, z: q.y }))), 0);
  assert.ok(near(sum, 80));
  // одинаковые плоскости не дают двух участков
  assert.equal(lowerEnvelope(rect, [planes[0], { ...planes[0] }]).length, 1);
});

test('двускатная: два ската, конёк, два фронтона, два карниза — как раньше', () => {
  const g = roofGeometry(roofOf('gable'), 3);
  assert.equal(g.surfaces.length, 2);
  assert.equal(g.gables.length, 2);
  assert.equal(g.eaves.length, 2);
  assert.equal(g.plan.lines.length, 1);
  assert.ok(near(g.peak, 4 * T30));
  for (const s of g.surfaces) {
    assert.equal(s.poly.length, 4);
    assert.ok(near(Math.min(...heights(s.poly)), 3 - 0.5 * T30), 'карниз ниже верха стен на свес');
    assert.ok(near(Math.max(...heights(s.poly)), 3 + 4 * T30));
  }
  // конёк — вдоль ширины, во всю длину со свесами
  const [a, b] = g.plan.lines[0];
  assert.ok(near(a.y, 0) && near(b.y, 0) && near(Math.abs(a.x - b.x), 11));
  // фронтон — треугольник по линии стен, чуть ниже кровли
  const tri = g.gables[0];
  assert.equal(tri.length, 3);
  assert.ok(tri.every((p) => near(Math.abs(p.x), 5)));
  assert.ok(near(Math.max(...heights(tri)), 3 + 4 * T30 - 0.24));
  assert.ok(near(roofPeak(roofOf('gable')), 4 * T30));
});

test('вальмовая и шатровая', () => {
  const hip = roofGeometry(roofOf('hip'), 3);
  assert.equal(hip.surfaces.length, 4);
  assert.deepEqual(hip.surfaces.map((s) => s.poly.length).sort(), [3, 3, 4, 4]);
  assert.equal(hip.plan.lines.length, 5, 'конёк и четыре ребра');
  assert.equal(hip.gables.length, 0);
  assert.equal(hip.eaves.length, 4);
  assert.ok(near(hip.peak, 4 * T30));
  // узкая вальмовая: конёк идёт вдоль длинной стороны, какой бы она ни была
  const tall = roofGeometry(roofOf('hip', { w: 6, d: 12 }), 0);
  const ridge = tall.plan.lines.find(([a, b]) => near(a.x, 0) && near(b.x, 0));
  assert.ok(ridge && near(Math.abs(ridge[0].y - ridge[1].y), 6));
  assert.ok(near(tall.peak, 3 * T30));

  const pyr = roofGeometry(roofOf('pyramid'), 3);
  assert.equal(pyr.surfaces.length, 4);
  assert.ok(pyr.surfaces.every((s) => s.poly.length === 3), 'четыре треугольника сходятся в вершине');
  assert.equal(pyr.plan.lines.length, 4);
  assert.equal(pyr.gables.length, 0);
  assert.ok(near(pyr.peak, 4 * T30));
  for (const s of pyr.surfaces) assert.ok(s.poly.some((p) => near(p.x, 0) && near(p.z, 0) && near(p.y, 3 + 4 * T30)));
  // дом вытянут — скаты разной крутизны, но карниз на одной высоте, а рёбра выходят в углы
  assert.equal(pyr.eaves.length, 4);
  assert.equal(new Set(pyr.eaves.map((e) => Math.round(e.a.y * 1e4))).size, 1);
  assert.ok(near(Math.abs(pyr.plan.outline[0].x), 5 + 0.5 * (10 / 8)) && near(Math.abs(pyr.plan.outline[0].y), 4.5));
});

test('односкатная и плоская', () => {
  const shed = roofGeometry(roofOf('shed'), 3);
  assert.equal(shed.surfaces.length, 1);
  assert.equal(shed.gables.length, 3, 'две боковые стенки и высокая');
  assert.equal(shed.eaves.length, 1, 'водосток только на нижней кромке');
  assert.ok(near(shed.eaves[0].a.z, -4.5));
  assert.ok(near(shed.eaves[0].inset.z, 0.5) && near(shed.eaves[0].inset.x, 0), 'от кромки до стены — свес');
  assert.ok(near(shed.peak, 8 * T30), 'высота над высокой стеной');
  const flat = roofGeometry(roofOf('flat'), 3);
  assert.equal(flat.surfaces.length, 1);
  assert.ok(flat.surfaces[0].flat);
  assert.equal(flat.eaves.length, 0);
  assert.ok(near(roofPeak(roofOf('flat')), 0.25));
});

test('ломаная мансардная: крутой низ, пологий верх, перелом на заданной высоте', () => {
  const r = roofOf('mansard', { pitch: 60, pitch2: 30, breakH: 2 });
  const g = roofGeometry(r, 3);
  assert.equal(g.surfaces.length, 4);
  assert.equal(g.plan.lines.length, 3, 'конёк и два перелома');
  assert.equal(g.gables.length, 2);
  assert.equal(g.gables[0].length, 5, 'фронтон — пятиугольник');
  assert.equal(g.eaves.length, 2);
  const run = 2 / Math.tan(Math.PI / 3);
  assert.ok(near(g.peak, 2 + (4 - run) * T30));
  assert.ok(near(roofPeak(r), g.peak));
  // перелом — на высоте 2 м над верхом стен
  const breaks = g.surfaces.flatMap((s) => s.poly).filter((p) => near(p.y, 5));
  assert.ok(breaks.length >= 4);
  assert.ok(breaks.every((p) => near(Math.abs(p.z), 4 - run)));
  // верхний уклон не круче нижнего, перелом не выше конька
  const steep = roofGeometry(roofOf('mansard', { pitch: 45, pitch2: 70, breakH: 50 }), 0);
  assert.ok(steep.peak <= 4 + 1e-6);
  // четырёхскатная ломаная: восемь скатов, фронтонов нет
  const four = roofGeometry(roofOf('mansard4', { pitch: 60, pitch2: 30, breakH: 2 }), 0);
  assert.equal(four.surfaces.length, 8);
  assert.equal(four.gables.length, 0);
  assert.equal(four.eaves.length, 4);
});

test('полувальмовая: вальма срезает верх фронтона', () => {
  const r = roofOf('halfhip', { hipPart: 0.4 });
  const g = roofGeometry(r, 3);
  assert.equal(g.surfaces.length, 4);
  assert.equal(g.gables.length, 2);
  const peak = 4 * T30;
  assert.ok(near(g.peak, peak));
  // фронтон — трапеция высотой 60 % конька
  const gable = g.gables[0];
  assert.equal(gable.length, 4);
  assert.ok(near(Math.max(...heights(gable)), 3 + peak * 0.6 - 0.24));
  // короткие карнизы вальм выше длинных
  const levels = [...new Set(g.eaves.map((e) => Math.round(e.a.y * 1000)))].sort((a, b) => a - b);
  assert.equal(g.eaves.length, 4);
  assert.equal(levels.length, 2);
});

test('площадь скатов в плане равна прямоугольнику со свесами; плоскости согласованы с геометрией', () => {
  for (const type of ['gable', 'hip', 'shed', 'pyramid', 'halfhip', 'mansard', 'mansard4']) {
    const r = roofOf(type, { rotation: 25, x: 3, y: -2, pitch: type.startsWith('mansard') ? 60 : 30 });
    const g = roofGeometry(r, 3);
    const sum = g.surfaces.reduce((s, x) => s + planArea(x.poly), 0);
    assert.ok(near(sum, planArea(g.plan.outline.map((p) => ({ x: p.x, z: p.y }))), 1e-4), `${type}: скаты покрывают крышу`);
    const rp = roofPlanes(r, 3);
    assert.equal(rp.planes.length, localPlanes(r).length);
    // каждая вершина ската лежит на огибающей плоскостей
    for (const s of g.surfaces) for (const p of s.poly) assert.ok(near(roofHeightAt(rp, { x: p.x, y: p.z }), p.y, 1e-6), `${type}: вершина на кровле`);
    if (type !== 'shed') assert.ok(near(Math.max(...g.surfaces.flatMap((s) => heights(s.poly))) - 3, g.peak), `${type}: высота конька`);
    assert.ok(near(roofPeak(r), g.peak));
    assert.equal(roofHeightAt(rp, { x: 60, y: 60 }), Infinity);
  }
});

// ── Крыша в формате для ИИ и водостоки ───────────────────────────────────

import { toExchange, importProject } from '../../js/io/exchange.js';
import { createRoof, setRoofType } from '../../js/model/factories.js';
import { roofGutters } from '../../js/geometry/roofGutters.js';
import { roofCover, roofCoverOptions, setRoofCover } from '../../js/model/finishes.js';

test('вид крыши: ломаной подставляются крутой скат и короткий свес, обратно — обычный уклон', () => {
  const r = createRoof('L', 0, 0, 10, 8, { type: 'mansard' });
  assert.equal(r.pitch, 60);
  assert.equal(r.pitch2, 30);
  assert.equal(r.breakH, 2.2);
  assert.equal(r.overhang, 0.25);
  assert.equal(r.gutters, true);
  setRoofType(r, 'mansard4');
  assert.equal(r.pitch, 60, 'между ломаными уклон не сбрасывается');
  setRoofType(r, 'gable');
  assert.equal(r.pitch, 30);
  assert.equal(createRoof('L', 0, 0, 10, 8, { type: 'halfhip' }).hipPart, 0.4);
  // покрытие по виду крыши; цвет идёт за покрытием, пока его не выбрали сами
  const flat = createRoof('L', 0, 0, 10, 8, { type: 'flat', cover: 'tiles' });
  assert.equal(roofCover(flat), 'membrane', 'черепицу на плоскую не кладут');
  assert.deepEqual(Object.keys(roofCoverOptions(flat)), ['membrane', 'sedum', 'plain']);
  setRoofCover(flat, 'sedum');
  assert.equal(flat.color, '#7fa35c');
  flat.color = '#123456';
  setRoofCover(flat, 'membrane');
  assert.equal(flat.color, '#123456');
});

test('крыша в формате для ИИ: поля вида, парапет, водостоки — без потерь', () => {
  const p = buildHousePreset('box1', {});
  const L = p.levels[0].id;
  p.roofs = [
    Object.assign(createRoof(L, 0, 0, 8, 6, { type: 'mansard4' }), { pitch: 70, pitch2: 20, breakH: 1.6, overhang: 0.6 }),
    Object.assign(createRoof(L, 20, 0, 8, 6, { type: 'flat', cover: 'sedum' }), { parapet: 0.45 }),
    Object.assign(createRoof(L, 40, 0, 8, 6, { type: 'halfhip' }), { hipPart: 0.25, gutters: false }),
    createRoof(L, 60, 0, 8, 6, { type: 'pyramid', cover: 'slate' }),
  ];
  const x = toExchange(p);
  const [m, f, h, py] = x.levels[0].roofs;
  assert.deepEqual([m.type, m.pitch, m.pitch2, m.breakHeight, m.overhang], ['mansard4', 70, 20, 1.6, 0.6]);
  assert.equal(m.gutters, undefined, 'водостоки по умолчанию есть — в JSON их нет');
  assert.deepEqual([f.type, f.parapet, f.cover], ['flat', 0.45, 'sedum']);
  assert.deepEqual([h.hipPart, h.gutters], [0.25, false]);
  assert.equal(py.pitch2, undefined);
  const q = importProject(x).project;
  const pick = (r) => [r.type, r.pitch, r.pitch2, r.breakH, r.hipPart, r.parapet, r.overhang, r.cover, !!r.gutters];
  assert.deepEqual(q.roofs.map(pick), p.roofs.map(pick));
  // ИИ дал ломаную крышу без подробностей — подставляются разумные значения
  x.levels[0].roofs = [{ type: 'mansard', x: 0, y: 0, w: 8, d: 6 }];
  const auto = importProject(x).project.roofs[0];
  assert.deepEqual([auto.pitch, auto.pitch2, auto.breakH, auto.overhang, auto.gutters], [60, 30, 2.2, 0.25, true]);
});

test('водостоки: желоба по карнизам, трубы по углам; под другой крышей желоба нет', () => {
  const p = buildHousePreset('box1', {});
  const L = p.levels[0].id;
  const roof = createRoof(L, 0, 0, 10, 8, { type: 'gable' });
  p.roofs = [roof];
  const g = roofGutters(p, roof);
  assert.equal(g.gutters.length, 2);
  assert.ok(near(g.length, 22, 0.01), 'два карниза по 11 м');
  assert.equal(g.pipes.length, 4, 'карниз длиннее 8 м — трубы с обоих концов');
  for (const pipe of g.pipes) {
    assert.ok(near(Math.abs(pipe.top.z), 4.09, 0.02), 'труба идёт по стене, а не под свесом');
    assert.ok(Math.abs(pipe.top.x) < 5 && pipe.bottom.y < 0.3 && pipe.top.y > 1.5);
  }
  assert.ok(g.pipeLength > 8);
  // короткий карниз — одна труба; без водостоков и у плоской — ничего
  const small = createRoof(L, 0, 0, 5, 4, { type: 'gable' });
  p.roofs = [small];
  assert.equal(roofGutters(p, small).pipes.length, 2);
  small.gutters = false;
  assert.equal(roofGutters(p, small).gutters.length, 0);
  // крыло уходит под кровлю главного объёма: там желоб обрывается, трубы — только на свободном конце
  const main = createRoof(L, 0, 0, 12, 8, { type: 'gable' });
  const wing = createRoof(L, 0, 6, 8, 6, { type: 'gable', rotation: 90 }); // конёк вдоль Y, заходит в главный объём
  p.roofs = [main, wing];
  const w = roofGutters(p, wing);
  assert.equal(w.gutters.length, 2);
  assert.ok(w.length < 2 * 9 - 2, 'часть карнизов крыла накрыта главной крышей');
  for (const [a, b] of w.gutters) assert.ok(Math.min(a.z, b.z) > 3.5, 'желоб не заходит под главную крышу');
  assert.equal(w.pipes.length, 2);
  assert.ok(w.pipes.every((x) => x.top.z > 8));
});
