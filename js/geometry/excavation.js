/**
 * Котлован под подвалом и приямки входов с улицы: где грунта нет
 * (вырез в земле в 3D, опора для манекена — дно подвала или ступени, а не земля).
 *
 * Котлован появляется с первой стены подвала, а не только когда контур замкнут:
 *  — замкнутые контуры стен (пятно застройки, раздвинутое на полутолщину стен);
 *  — комнаты вне этих контуров (стены ещё не дорисованы);
 *  — стены вне контуров и комнат: выпуклая оболочка их тел — будущая яма целиком.
 * Фигуры могут пересекаться — вырезание в земле это учитывает (subtractPolygons).
 */
import { levelFootprints } from './roomDetect.js';
import { pointInPolygon, polygonArea, polygonCentroid, convexHull, insetPolygon, isSimplePolygon } from '../core/geometry.js';
import { isBasement, levelElevation } from '../model/project.js';
import { cellarEntries } from './cellarEntry.js';

const ROOM_MARGIN = 0.2; // комната без стен: яма чуть шире чистого пола

/** Углы тела стены (прямоугольник по толщине). */
function wallBody(w, pad = 0.02) {
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const L = Math.hypot(dx, dy) || 1;
  const nx = (-dy / L) * (w.thickness / 2 + pad);
  const ny = (dx / L) * (w.thickness / 2 + pad);
  const ex = (dx / L) * pad;
  const ey = (dy / L) * pad;
  return [
    { x: w.x1 - ex + nx, y: w.y1 - ey + ny },
    { x: w.x2 + ex + nx, y: w.y2 + ey + ny },
    { x: w.x2 + ex - nx, y: w.y2 + ey - ny },
    { x: w.x1 - ex - nx, y: w.y1 - ey - ny },
  ];
}

function grow(poly, d) {
  const out = insetPolygon(poly, poly.map(() => -d));
  return out.length >= 3 && isSimplePolygon(out) && polygonArea(out) >= polygonArea(poly) ? out : poly;
}

/**
 * Пятна подвального этажа: всё, под чем земли быть не должно.
 * @returns {Array<Array<{x,y}>>}
 */
export function basementShapes(project, level) {
  const walls = project.walls.filter((w) => w.levelId === level.id);
  const shapes = levelFootprints(walls);
  const covered = (p) => shapes.some((s) => pointInPolygon(p, s));
  for (const r of project.rooms) {
    if (r.levelId !== level.id || r.points.length < 3 || polygonArea(r.points) < 0.05) continue;
    if (!covered(polygonCentroid(r.points))) shapes.push(grow(r.points, ROOM_MARGIN));
  }
  const stray = walls.filter((w) => !covered({ x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 }));
  if (stray.length) {
    const hull = convexHull(stray.flatMap((w) => wallBody(w)));
    if (hull.length >= 3 && polygonArea(hull) > 0.01) shapes.push(hull);
  }
  return shapes;
}

/**
 * Все ямы участка.
 * @returns {Array<{ poly, floor, kind: 'house' | 'entry', levelId? }>} floor — отметка дна
 */
export function excavationPits(project) {
  const all = [];
  for (const l of project.levels) {
    if (!isBasement(l)) continue;
    const floor = levelElevation(project, l.id);
    if (floor > -0.05) continue; // пол не ниже земли — копать нечего
    for (const poly of basementShapes(project, l)) all.push({ poly, floor, kind: 'house', levelId: l.id });
  }
  // фигура целиком внутри другой (подвалы друг под другом) — лишняя; дно берём самое глубокое
  all.sort((a, b) => polygonArea(b.poly) - polygonArea(a.poly));
  const out = [];
  for (const pit of all) {
    const host = out.find((q) => pit.poly.every((p) => pointInPolygon(p, q.poly)));
    if (host) host.floor = Math.min(host.floor, pit.floor);
    else out.push(pit);
  }
  // приямки входов в подвал с улицы
  for (const e of cellarEntries(project)) out.push({ poly: e.hole, floor: e.base, kind: 'entry' });
  return out;
}

/** Контуры ям (для совместимости: вырез земли, опора манекена). */
export function excavationOutlines(project) {
  return excavationPits(project).map((p) => p.poly);
}

/** Внутри ли точка котлована. */
export function inExcavation(outlines, p) {
  return outlines.some((poly) => pointInPolygon(p, poly));
}
