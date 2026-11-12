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
