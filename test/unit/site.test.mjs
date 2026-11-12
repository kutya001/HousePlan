import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fenceOf, fenceSide, setFenceSide, isFenceGate } from '../../js/model/fence.js';
import { fenceRuns, snapToFence } from '../../js/geometry/fence.js';
import { railLook, RAIL_STYLES } from '../../js/model/railings.js';
import { stairRails } from '../../js/geometry/stairRails.js';
import { stairLayout } from '../../js/geometry/stairGeometry.js';
import { familyOptions, catalogItem, CATALOG } from '../../js/model/catalog.js';
import { createEmptyProject, SITE_LEVEL } from '../../js/model/project.js';
import { createItem, createStair } from '../../js/model/factories.js';
import { computeEstimate } from '../../js/model/estimate.js';
import { toExchange, importProject } from '../../js/io/exchange.js';
import { SCHEMAS } from '../../js/model/schemas.js';
import { hasSymbol } from '../../js/editor/render/symbols2d.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const rows = (p) => Object.fromEntries(computeEstimate(p).sections.flatMap((s) => s.rows).map((r) => [r.key, r]));

/** Участок 20×30: стороны 0 — сверху, 1 — справа, 2 — снизу, 3 — слева. */
function plot() {
  const p = createEmptyProject();
  p.site.boundary = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 30 },
    { x: 0, y: 30 },
  ];
  return p;
}

const gate = (p, type, x, y, rotation = 0) => {
  const it = createItem(p.levels[0].id, type, x, y, { rotation });
  p.items.push(it);
  return it;
};

test('забор: общий вид и свои настройки сторон', () => {
  const p = plot();
  assert.deepEqual([fenceOf(p.site).type, fenceOf(p.site).height, fenceOf(p.site).enabled], ['profsheet', 1.8, true]);
  p.site.fence.type = 'нет такого';
  assert.equal(fenceOf(p.site).type, 'profsheet');
  p.site.fence.type = 'wood';
  setFenceSide(p.site, 1, { type: 'forged', height: 1.2 });
  setFenceSide(p.site, 2, { off: true });
  assert.deepEqual([fenceSide(p.site, 0).type, fenceSide(p.site, 0).height], ['wood', 1.8]);
  const s1 = fenceSide(p.site, 1);
  assert.deepEqual([s1.type, s1.height, s1.off, s1.color], ['forged', 1.2, false, '#2f3134']);
  assert.ok(fenceSide(p.site, 2).off);
  // сброс настроек стороны убирает запись
  setFenceSide(p.site, 1, { type: null, height: null });
  setFenceSide(p.site, 2, { off: false });
  assert.equal(p.site.fence.sides, undefined);
  p.site.fence.enabled = false;
  assert.ok(fenceSide(p.site, 0).off);
});

test('пролёты забора: ворота и калитка размыкают свою сторону', () => {
  const p = plot();
  assert.equal(fenceRuns(p).length, 4);
  assert.ok(near(fenceRuns(p).reduce((s, r) => s + r.length, 0), 100));
  const g = gate(p, 'gate_swing', 6, 0, 0);
  const w = gate(p, 'wicket', 12, 0.2, 180); // чуть в стороне от линии и развёрнута — всё равно в заборе
  assert.equal(g.levelId, SITE_LEVEL);
  assert.ok(isFenceGate(g) && isFenceGate(w) && !isFenceGate({ type: 'tree' }));
  const runs = fenceRuns(p);
  const top = runs.filter((r) => r.side === 0);
  assert.equal(top.length, 3, 'сторона с воротами и калиткой — три пролёта');
  assert.ok(near(top.reduce((s, r) => s + r.length, 0), 20 - g.w - w.w));
  assert.ok(near(top[0].b.x, 6 - g.w / 2) && near(top[1].a.x, 6 + g.w / 2));
  // ворота поперёк забора или далеко от него пролёт не размыкают
  gate(p, 'gate_slide', 20, 15, 0);
  gate(p, 'wicket', 10, 15, 0);
  assert.equal(fenceRuns(p).filter((r) => r.side === 1).length, 1);
  // сторона без забора и выключенный забор
  setFenceSide(p.site, 3, { off: true });
  assert.equal(fenceRuns(p).filter((r) => r.side === 3).length, 0);
  p.site.fence.enabled = false;
  assert.equal(fenceRuns(p).length, 0);
});

test('ворота встают на линию забора', () => {
  const p = plot();
  const sn = snapToFence(p, { x: 19.4, y: 12 }, 3.6);
  assert.deepEqual([sn.x, sn.y, sn.rotation, sn.side], [20, 12, 90, 1]);
  // у угла — сдвигаются так, чтобы поместиться целиком
  const corner = snapToFence(p, { x: 0.5, y: 0.3 }, 3.6);
  assert.ok(near(corner.x, 1.8) && near(corner.y, 0) && corner.side === 0);
  assert.equal(snapToFence(p, { x: 10, y: 15 }, 3.6), null, 'далеко от забора — не притягиваем');
});

test('забор и ворота в смете и в формате для ИИ', () => {
  const p = plot();
  p.site.fence.type = 'picket';
  setFenceSide(p.site, 1, { type: 'brick', height: 2.2 });
  setFenceSide(p.site, 3, { off: true });
  gate(p, 'gate_slide', 10, 0, 0);
  gate(p, 'wicket', 16, 0, 0);
  const r = rows(p);
  assert.ok(near(r.fence_picket.qty, 20 - 4 - 1 + 20, 0.01), 'верх без ворот и калитки и низ');
  assert.ok(near(r.fence_brick.qty, 30, 0.01));
  assert.match(r.fence_brick.name, /2,2 м/);
  assert.equal(r.fence, undefined);
  assert.equal(r.site_gate_slide.qty, 1);
  assert.equal(r.site_wicket.qty, 1);
  const x = toExchange(p);
  assert.equal(x.site.fenceType, 'picket');
  assert.deepEqual(x.site.fenceSides, [
    { side: 1, type: 'brick', height: 2.2 },
    { side: 3, off: true },
  ]);
  assert.deepEqual(x.outdoor.map((o) => o.type).sort(), ['gate_slide', 'wicket']);
  x.levels[0].walls = [{ from: [5, 5], to: [9, 5] }];
  const q = importProject(x).project;
  assert.deepEqual(q.site.fence.sides, p.site.fence.sides);
  assert.equal(q.site.fence.type, 'picket');
  assert.equal(fenceRuns(q).filter((run) => run.side === 0).length, 3);
  // мусор от ИИ: несуществующая сторона и вид
  const bad = importProject({ ...x, site: { ...x.site, fenceType: 'лазерный', fenceSides: [{ side: 9, type: 'brick' }, { side: 0, type: '???' }] } }).project;
  assert.equal(bad.site.fence.type, undefined);
  assert.equal(bad.site.fence.sides, undefined);
});

test('перила: стиль, высота и цвет; стороны по отдельности', () => {
  assert.deepEqual([railLook({}).style, railLook({}).height], ['bars', 0.9]);
  const glass = railLook({ railStyle: 'glass', railHeight: 1.1, railColor: '#112233' });
  assert.deepEqual([glass.style, glass.height, glass.rail, glass.fill], ['glass', 1.1, '#112233', RAIL_STYLES.glass.fill]);
  assert.equal(railLook({ railStyle: 'wood', railColor: '#112233' }).fill, '#112233', 'деревянные — одним цветом');
  assert.equal(railLook({ railStyle: '???', railHeight: 9 }).height, 0.9);
  // прямая лестница посреди комнаты: с обеих сторон — два ограждения, слева или справа — одно
  const st = createStair('L', 0, 0, { shape: 'straight' });
  const lay = stairLayout(st, 3);
  const count = (railing) => stairRails({ ...st, railing }, lay, [], null).sides.length;
  assert.equal(count('both'), 2);
  assert.equal(count('auto'), 2);
  assert.equal(count('left'), 1);
  assert.equal(count('right'), 1);
  assert.equal(count('none'), 0);
  const side = (railing) => stairRails({ ...st, railing }, lay, [], null).sides[0][0];
  assert.notDeepEqual(side('left'), side('right'));
  // в формате для ИИ
  const p = createEmptyProject();
  p.walls.push({ id: 'w', levelId: p.levels[0].id, x1: 0, y1: 0, x2: 4, y2: 0, thickness: 0.3, kind: 'exterior' });
  p.stairs.push(Object.assign(createStair(p.levels[0].id, 2, 2, {}), { railing: 'right', railStyle: 'forged', railHeight: 1, railColor: '#222222' }));
  const out = toExchange(p).levels[0].stairs[0];
  assert.deepEqual([out.railing, out.railStyle, out.railHeight, out.railColor], ['right', 'forged', 1, '#222222']);
  const back = importProject(toExchange(p)).project.stairs[0];
  assert.deepEqual([back.railing, back.railStyle, back.railHeight, back.railColor], ['right', 'forged', 1, '#222222']);
});

test('виды одного предмета: навесы, козырьки, ограждения, ворота', () => {
  assert.deepEqual(Object.keys(familyOptions('carport')), ['carport', 'carport_gable', 'carport_arch', 'carport_flat', 'pergola']);
  assert.equal(Object.keys(familyOptions('canopy_glass')).length, 4);
  assert.equal(Object.keys(familyOptions('railing')).length, 5);
  assert.deepEqual(Object.keys(familyOptions('gate_swing')), ['gate_swing', 'gate_slide']);
  assert.equal(familyOptions('sofa'), null);
  // у каждого вида есть значок плана (свой или общий для семейства)
  for (const c of CATALOG.filter((x) => x.family || x.fenceGate)) assert.ok(hasSymbol(c.type), c.type);
  // смена вида в свойствах: место и размеры остаются, цвет — пока его не меняли
  const field = SCHEMAS.item.find((f) => f.label === 'Вид');
  const it = createItem('L', 'carport', 3, 4, {});
  it.w = 4.2;
  assert.ok(field.visible(it) && !field.visible(createItem('L', 'sofa', 0, 0, {})));
  field.set(it, 'pergola');
  assert.deepEqual([it.type, it.w, it.x, it.color, it.h], ['pergola', 4.2, 3, catalogItem('pergola').color, catalogItem('pergola').h]);
  it.color = '#010101';
  field.set(it, 'carport_flat');
  assert.equal(it.color, '#010101');
});
