/** Котлован под подвалом: контур должен быть простым и накрывать комнаты,
 *  даже когда наружная стена с узким изломом (газон не должен лезть внутрь). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelFootprints } from '../../js/geometry/roomDetect.js';
import { isSimplePolygon, pointInPolygon } from '../../js/core/geometry.js';

const wall = (x1, y1, x2, y2, thickness = 0.4) => ({
  id: `w${x1}_${y1}_${x2}_${y2}`, levelId: 'b', x1, y1, x2, y2, thickness, kind: 'exterior',
});
const loop = (pts, t) => pts.map((p, i) => wall(p[0], p[1], pts[(i + 1) % pts.length][0], pts[(i + 1) % pts.length][1], t));

test('прямоугольный подвал: контур простой и накрывает interior', () => {
  const fp = levelFootprints(loop([[0, 0], [6, 0], [6, 4], [0, 4]]));
  assert.equal(fp.length, 1);
  assert.ok(isSimplePolygon(fp[0]));
  assert.ok(pointInPolygon({ x: 3, y: 2 }, fp[0]));
});

test('подвал с узким выступом в стене: контур не самопересекается и накрывает комнаты', () => {
  // выступ высотой 0.1 м уже, чем сдвиг 0.2 м — наивный наружный сдвиг самопересекается
  const pts = [[0, 0], [6, 0], [6, 4], [3, 4], [3, 4.1], [2, 4.1], [2, 4], [0, 4]];
  const fp = levelFootprints(loop(pts));
  assert.equal(fp.length, 1);
  assert.ok(isSimplePolygon(fp[0]), 'контур котлована обязан быть простым');
  assert.ok(pointInPolygon({ x: 1, y: 2 }, fp[0]), 'комната внутри котлована');
  assert.ok(pointInPolygon({ x: 5, y: 2 }, fp[0]), 'вторая комната внутри котлована');
});

// ── Котлован появляется с первой стены и режется при любой форме ──
import { basementShapes, excavationPits } from '../../js/geometry/excavation.js';
import { subtractPolygons, polygonArea, triangulate, convexHull } from '../../js/core/geometry.js';
import { createEmptyProject } from '../../js/model/project.js';
import { addBasementLevel } from '../../js/model/operations.js';
import { createWall, createRoom } from '../../js/model/factories.js';

function basementProject(walls, rooms = []) {
  const p = createEmptyProject();
  const lvl = addBasementLevel(p);
  for (const [x1, y1, x2, y2] of walls) p.walls.push(createWall(lvl.id, { x: x1, y: y1 }, { x: x2, y: y2 }));
  for (const pts of rooms) p.rooms.push(createRoom(lvl.id, pts.map(([x, y]) => ({ x, y }))));
  return { p, lvl };
}

test('подвал строится: три стены из четырёх — яма уже есть и накрывает будущую комнату', () => {
  const { p, lvl } = basementProject([[0, 0, 6, 0], [6, 0, 6, 4], [6, 4, 0, 4]]);
  const shapes = basementShapes(p, lvl);
  assert.equal(shapes.length, 1);
  assert.ok(pointInPolygon({ x: 3, y: 2 }, shapes[0]));
  assert.ok(pointInPolygon({ x: 0.3, y: 2 }, shapes[0]), 'и у незакрытой стороны');
  const pits = excavationPits(p);
  assert.equal(pits.length, 1);
  assert.ok(pits[0].floor < -2, 'дно — на отметке пола подвала');
});

test('одна стена подвала — яма по телу стены; комната без стен — яма по комнате', () => {
  const one = basementProject([[0, 0, 6, 0]]);
  const s1 = basementShapes(one.p, one.lvl);
  assert.equal(s1.length, 1);
  assert.ok(pointInPolygon({ x: 3, y: 0 }, s1[0]));
  assert.ok(!pointInPolygon({ x: 3, y: 1 }, s1[0]));
  const room = basementProject([], [[[0, 0], [5, 0], [5, 4], [0, 4]]]);
  const s2 = basementShapes(room.p, room.lvl);
  assert.equal(s2.length, 1);
  assert.ok(pointInPolygon({ x: 2.5, y: 2 }, s2[0]));
});

test('замкнутый подвал с лишней стеной снаружи: контур и отдельная фигура', () => {
  const { p, lvl } = basementProject([[0, 0, 6, 0], [6, 0, 6, 4], [6, 4, 0, 4], [0, 4, 0, 0], [6, 0, 9, 0], [9, 0, 9, 4]]);
  const shapes = basementShapes(p, lvl);
  assert.equal(shapes.length, 2);
  assert.ok(shapes.some((s) => pointInPolygon({ x: 8, y: 2 }, s)), 'пристройка, которую дорисовывают, тоже выкопана');
});

test('вычитание любых фигур: пересекающиеся, невыпуклые, выходящие за край', () => {
  const sq = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const area = (pieces) => pieces.reduce((s, q) => s + polygonArea(q), 0);
  const subject = sq(0, 0, 20, 20);
  // две пересекающиеся ямы: 24 + 36 − 4 = 56
  assert.ok(Math.abs(area(subtractPolygons(subject, [sq(1, 1, 7, 5), sq(5, 3, 11, 9)])) - (400 - 56)) < 1e-6);
  // Г-образная яма площадью 16
  const L = [{ x: 2, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 6 }, { x: 2, y: 6 }];
  assert.ok(Math.abs(area(subtractPolygons(subject, [L])) - 384) < 1e-6);
  // яма наполовину за краем участка: вычитается только то, что внутри (3×4)
  assert.ok(Math.abs(area(subtractPolygons(subject, [sq(17, 5, 23, 9)])) - (400 - 12)) < 1e-6);
  // яма целиком снаружи — участок цел
  assert.ok(Math.abs(area(subtractPolygons(subject, [sq(30, 30, 35, 35)])) - 400) < 1e-6);
  // вспомогательное: треугольники покрывают многоугольник, оболочка выпуклая
  assert.ok(Math.abs(triangulate(L).reduce((s, t) => s + polygonArea(t), 0) - 16) < 1e-9);
  assert.equal(convexHull([...L, { x: 3, y: 3 }]).length, 5);
});

test('пятно дома не искажается «висячей» стеной', () => {
  const walls = [...loop([[0, 0], [6, 0], [6, 4], [0, 4]]), wall(6, 0, 9, 0)];
  const fp = levelFootprints(walls);
  assert.equal(fp.length, 1);
  assert.ok(Math.abs(polygonArea(fp[0]) - 6.4 * 4.4) < 1e-6, 'прямоугольник 6×4, раздвинутый на полутолщину стен');
});
