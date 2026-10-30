/**
 * Геометрия стен: стыковка (углы «на ус», Т-примыкания, перекрёстки)
 * и разрезка стены проёмами. Используется и 2D-планом, и 3D-видом.
 *
 * Для каждой стены считается контур (многоугольник) с учётом соседей:
 *  - концы, сходящиеся в одной точке, соединяются по биссектрисе;
 *  - конец, упирающийся в середину другой стены, обрезается по её грани;
 *  - в узлах из 3+ стен контуры сходятся в центр узла.
 */
import {
  add,
  sub,
  mul,
  dist,
  norm,
  perp,
  cross,
  lineIntersect,
  projectOnSegment,
  clipPolygonHalfPlane,
} from '../core/geometry.js';

/** Допуск совпадения концов стен, м. */
export const JOIN_EPS = 0.01;

/**
 * @param {Array} walls — стены одного этажа
 * @returns {Map<string, WallGeom>}
 * WallGeom: { wall, a, b, d, n, len, half, aPos, aNeg, bPos, bNeg, poly }
 *   d — единичное направление a→b, n = perp(d); aPos/bPos — углы со стороны +n.
 */
export function computeWallGeometry(walls) {
  const geoms = new Map();
  for (const w of walls) {
    const a = { x: w.x1, y: w.y1 };
    const b = { x: w.x2, y: w.y2 };
    const L = dist(a, b);
    if (L < 1e-4) continue;
    const d = mul(sub(b, a), 1 / L);
    const n = perp(d);
    const half = Math.max(0.005, w.thickness / 2);
    geoms.set(w.id, {
      wall: w,
      a,
      b,
      d,
      n,
      len: L,
      half,
      aPos: add(a, mul(n, half)),
      aNeg: add(a, mul(n, -half)),
      bPos: add(b, mul(n, half)),
      bNeg: add(b, mul(n, -half)),
      aCenter: null,
      bCenter: null,
      aJoined: false,
      bJoined: false,
      poly: null,
    });
  }

  // Узлы: кластеры концов стен
  const nodes = [];
  const nodeAt = (p) => {
    for (const nd of nodes) if (dist(nd.p, p) < JOIN_EPS) return nd;
    const nd = { p: { x: p.x, y: p.y }, ends: [], hosts: [] };
    nodes.push(nd);
    return nd;
  };
  for (const g of geoms.values()) {
    nodeAt(g.a).ends.push({ g, end: 'a', u: g.d });
    nodeAt(g.b).ends.push({ g, end: 'b', u: mul(g.d, -1) });
  }

  // Т-примыкания: узел лежит на середине другой стены
  const all = [...geoms.values()];
  for (const nd of nodes) {
    for (const g of all) {
      if (nd.ends.some((e) => e.g === g)) continue;
      const pr = projectOnSegment(nd.p, g.a, g.b);
      if (pr.dist < JOIN_EPS * 2 && pr.along > JOIN_EPS && pr.along < g.len - JOIN_EPS) nd.hosts.push(g);
    }
  }

  for (const nd of nodes) {
    const dirs = nd.ends.map((e) => ({ u: e.u, half: e.g.half, end: e }));
    for (const h of nd.hosts) {
      dirs.push({ u: h.d, half: h.half, end: null });
      dirs.push({ u: mul(h.d, -1), half: h.half, end: null });
    }
    if (dirs.length < 2) continue;
    for (const dd of dirs) dd.ang = Math.atan2(dd.u.y, dd.u.x);
    dirs.sort((p, q) => p.ang - q.ang);
    const m = dirs.length;
    const withCenter = nd.ends.length >= 3 && nd.hosts.length === 0;

    for (let i = 0; i < m; i++) {
      const cur = dirs[i];
      if (!cur.end) continue;
      const next = dirs[(i + 1) % m];
      const prev = dirs[(i + m - 1) % m];
      const left = cornerBetween(nd.p, cur, next, +1);
      const right = cornerBetween(nd.p, cur, prev, -1);
      const g = cur.end.g;
      if (cur.end.end === 'a') {
        g.aPos = left;
        g.aNeg = right;
        g.aJoined = true;
        if (withCenter) g.aCenter = { ...nd.p };
      } else {
        g.bNeg = left;
        g.bPos = right;
        g.bJoined = true;
        if (withCenter) g.bCenter = { ...nd.p };
      }
    }
  }

  for (const g of geoms.values()) {
    const poly = [g.aNeg, g.bNeg];
    if (g.bCenter) poly.push(g.bCenter);
    poly.push(g.bPos, g.aPos);
    if (g.aCenter) poly.push(g.aCenter);
    g.poly = poly;
  }
  return geoms;
}

/**
 * Угол стыка двух соседних (по углу) направлений в узле.
 * side = +1: левая грань cur с правой гранью соседа; side = -1 — наоборот.
 */
function cornerBetween(center, cur, other, side) {
  const pc = perp(cur.u);
  const po = perp(other.u);
  const p1 = add(center, mul(pc, side * cur.half));
  const p2 = add(center, mul(po, -side * other.half));
  const fallback = p1;
  if (other === cur) return fallback;
  if (Math.abs(cross(cur.u, other.u)) < 1e-3) return fallback; // продолжение по прямой
  const hit = lineIntersect(p1, cur.u, p2, other.u);
  if (!hit) return fallback;
  const p = { x: hit.x, y: hit.y };
  const limit = Math.max(cur.half, other.half) * 8;
  if (dist(p, center) > limit) return fallback; // слишком острый угол — без «уса»
  return p;
}

/** Обрезка контура стены диапазоном вдоль оси [s0, s1] (м от начала стены). */
export function clipWallRange(g, s0, s1) {
  let poly = g.poly;
  if (Number.isFinite(s0)) poly = clipPolygonHalfPlane(poly, add(g.a, mul(g.d, s0)), g.d);
  if (poly.length && Number.isFinite(s1)) poly = clipPolygonHalfPlane(poly, add(g.a, mul(g.d, s1)), mul(g.d, -1));
  return poly;
}

/** Диапазоны проёмов вдоль стены, отсортированные. */
export function openingSpans(g, openings) {
  return openings
    .map((o) => ({ s0: o.t - o.width / 2, s1: o.t + o.width / 2, o }))
    .filter((sp) => sp.s1 > 0 && sp.s0 < g.len)
    .sort((p, q) => p.s0 - q.s0);
}

/**
 * Куски стены для 3D: сплошные участки на всю высоту, а над и под проёмами — перемычки.
 * @returns {Array<{poly, y0, y1}>} y — от низа стены
 */
export function wallPieces3D(g, openings, height) {
  const pieces = [];
  let cursor = -Infinity;
  for (const sp of openingSpans(g, openings)) {
    if (sp.s0 > cursor) pieces.push({ poly: clipWallRange(g, cursor, sp.s0), y0: 0, y1: height });
    const top = sp.o.sill + sp.o.height;
    const a = Math.max(sp.s0, cursor);
    if (sp.s1 > a) {
      if (sp.o.sill > 0.005) pieces.push({ poly: clipWallRange(g, a, sp.s1), y0: 0, y1: Math.min(sp.o.sill, height) });
      if (top < height - 0.005) pieces.push({ poly: clipWallRange(g, a, sp.s1), y0: top, y1: height });
    }
    cursor = Math.max(cursor, sp.s1);
  }
  pieces.push({ poly: clipWallRange(g, cursor, Infinity), y0: 0, y1: height });
  return pieces.filter((p) => p.poly.length >= 3 && p.y1 > p.y0);
}

/** Куски стены для плана — без проёмов (проём на плане всегда «разрез»). */
export function wallPiecesPlan(g, openings) {
  const pieces = [];
  let cursor = -Infinity;
  for (const sp of openingSpans(g, openings)) {
    if (sp.s0 > cursor) pieces.push(clipWallRange(g, cursor, sp.s0));
    cursor = Math.max(cursor, sp.s1);
  }
  pieces.push(clipWallRange(g, cursor, Infinity));
  return pieces.filter((p) => p.length >= 3);
}

/** Точка на оси стены по расстоянию от начала. */
export function pointOnWall(g, s) {
  return add(g.a, mul(g.d, s));
}

/** Проверка, помещается ли проём в стену и не пересекается ли с другими. */
export function canPlaceOpening(g, openings, t, width, ignoreId = null, gap = 0.05) {
  if (t - width / 2 < 0.02 || t + width / 2 > g.len - 0.02) return false;
  for (const o of openings) {
    if (o.id === ignoreId) continue;
    if (Math.abs(o.t - t) < (o.width + width) / 2 + gap) return false;
  }
  return true;
}

/** Направление «наружу» для стены: от центра масс всех стен этажа. */
export function outwardSign(g, center) {
  const m = { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 };
  const v = sub(m, center);
  const s = v.x * g.n.x + v.y * g.n.y;
  return s >= 0 ? 1 : -1;
}

export function wallsCenter(geoms) {
  let x = 0;
  let y = 0;
  let k = 0;
  for (const g of geoms.values()) {
    x += g.a.x + g.b.x;
    y += g.a.y + g.b.y;
    k += 2;
  }
  return k ? { x: x / k, y: y / k } : { x: 0, y: 0 };
}

export { norm };
