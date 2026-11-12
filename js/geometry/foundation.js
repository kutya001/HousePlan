/**
 * Геометрия фундамента: что стоит под стенами нижнего этажа и отмостка вокруг дома.
 * Одни и те же данные — для 3D (view3d/builders/buildFoundation.js) и сметы.
 */
import { computeWallGeometry } from './wallGeometry.js';
import { levelFootprints } from './roomDetect.js';
import { insetPolygon, isSimplePolygon, polygonArea } from '../core/geometry.js';
import { isBearing } from '../model/wallTypes.js';
import { groundLevel, isBasement, levelElevation } from '../model/project.js';
import { foundationOf, PILE_STEP } from '../model/foundation.js';

/** Сваи: по углам и стыкам несущих стен и вдоль них с шагом не больше step. */
export function pilePoints(geoms, step) {
  const pts = [];
  const add = (p) => {
    if (!pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.3)) pts.push({ x: p.x, y: p.y });
  };
  const list = [...geoms.values()].filter((g) => isBearing(g.wall));
  // сначала углы и стыки — промежуточные сваи подстраиваются под них
  for (const g of list) {
    add(g.a);
    add(g.b);
  }
  for (const g of list) {
    const n = Math.max(1, Math.ceil(g.len / step - 1e-6));
    for (let i = 1; i < n; i++) add({ x: g.a.x + ((g.b.x - g.a.x) * i) / n, y: g.a.y + ((g.b.y - g.a.y) * i) / n });
  }
  return pts;
}

/**
 * Фундамент под домом.
 * @returns {{
 *   type, base — отметка пола нижнего этажа, basement — нижний этаж подземный,
 *   exterior: [poly] — наружные стены (цоколь), bearing: [poly] — все несущие (ростверк),
 *   footprints: [poly] — пятно дома по наружным граням стен,
 *   slab: [poly] — плита с выпуском, piles: [{x,y}], beam — высота ростверка,
 *   perimeter — длина наружных стен, bearingLength — длина несущих
 * }}
 */
export function foundationParts(project) {
  const f = foundationOf(project);
  const level = project.levels[0];
  const basement = isBasement(level);
  const base = levelElevation(project, level.id);
  const walls = project.walls.filter((w) => w.levelId === level.id);
  const geoms = computeWallGeometry(walls);
  const list = [...geoms.values()];
  const ext = list.filter((g) => g.wall.kind === 'exterior');
  const bearing = list.filter((g) => isBearing(g.wall));
  const footprints = levelFootprints(walls);
  const out = {
    type: f.type,
    base,
    basement,
    exterior: ext.map((g) => g.poly),
    bearing: bearing.map((g) => g.poly),
    footprints,
    slab: [],
    piles: [],
    beam: 0,
    perimeter: ext.reduce((s, g) => s + g.len, 0),
    bearingLength: bearing.reduce((s, g) => s + g.len, 0),
  };
  if (basement || base <= 0.01) return out;
  if (f.type === 'slab') out.slab = footprints.map((fp) => grow(fp, 0.15));
  if (f.info.open) {
    out.beam = Math.min(f.info.beam, base);
    out.piles = pilePoints(geoms, PILE_STEP[f.type]);
  }
  return out;
}

/** Контур, раздвинутый наружу на d; если сдвиг ломает контур — он остаётся как был. */
function grow(poly, d) {
  const out = insetPolygon(poly, poly.map(() => -d));
  return isSimplePolygon(out) && polygonArea(out) > polygonArea(poly) ? out : poly;
}

/**
 * Отмостка: полоса вокруг пятна дома (по первому надземному этажу; если на нём
 * нет стен — по нижнему).
 * @returns {{ rings: Array<{ outer, hole }>, area, width }}
 */
export function blindArea(project) {
  const { blind } = foundationOf(project);
  const out = { rings: [], area: 0, width: blind };
  if (blind < 0.05) return out;
  const pick = (lvl) => (lvl ? levelFootprints(project.walls.filter((w) => w.levelId === lvl.id)) : []);
  let fps = pick(groundLevel(project));
  if (!fps.length) fps = pick(project.levels[0]);
  for (const fp of fps) {
    const outer = grow(fp, blind);
    if (outer === fp) continue;
    out.rings.push({ outer, hole: fp });
    out.area += polygonArea(outer) - polygonArea(fp);
  }
  return out;
}
