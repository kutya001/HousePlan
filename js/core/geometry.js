/**
 * Векторная геометрия на плоскости плана. Точки — объекты { x, y } в метрах.
 * Ось Y направлена вниз (как на экране), но все формулы от этого не зависят.
 */

export const EPS = 1e-9;
export const DEG = Math.PI / 180;

export const vec = (x = 0, y = 0) => ({ x, y });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a, s) => ({ x: a.x * s, y: a.y * s });
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const cross = (a, b) => a.x * b.y - a.y * b.x;
export const len = (a) => Math.hypot(a.x, a.y);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const mid = (a, b) => lerp(a, b, 0.5);
/** Поворот вектора на +90° (в сторону увеличения угла). */
export const perp = (a) => ({ x: -a.y, y: a.x });
export const clone = (a) => ({ x: a.x, y: a.y });
export const equals = (a, b, eps = 1e-6) => Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;

export function norm(a) {
  const l = len(a);
  return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

export function rotate(p, angleRad, origin = { x: 0, y: 0 }) {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c };
}

export const angleOf = (v) => Math.atan2(v.y, v.x);

export function normalizeDeg(deg) {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

export function snapValue(value, step) {
  return step > 0 ? Math.round(value / step) * step : value;
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Проекция точки на отрезок.
 * @returns {{ t:number, rawT:number, point:{x,y}, dist:number, along:number }}
 *   t — параметр 0..1 (обрезан), along — расстояние от a вдоль отрезка в метрах.
 */
export function projectOnSegment(p, a, b) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < EPS) return { t: 0, rawT: 0, point: clone(a), dist: dist(p, a), along: 0 };
  const rawT = dot(sub(p, a), ab) / l2;
  const t = clamp(rawT, 0, 1);
  const point = { x: a.x + ab.x * t, y: a.y + ab.y * t };
  return { t, rawT, point, dist: dist(p, point), along: t * Math.sqrt(l2) };
}

/** Пересечение прямых p + t·r и q + u·s. null — если параллельны. */
export function lineIntersect(p, r, q, s) {
  const denom = cross(r, s);
  if (Math.abs(denom) < 1e-9) return null;
  const t = cross(sub(q, p), s) / denom;
  return { x: p.x + r.x * t, y: p.y + r.y * t, t, u: cross(sub(q, p), r) / denom };
}

/** Пересечение отрезков ab и cd (включая концы с допуском). */
export function segmentIntersect(a, b, c, d, eps = 1e-7) {
  const r = sub(b, a);
  const s = sub(d, c);
  const hit = lineIntersect(a, r, c, s);
  if (!hit) return null;
  if (hit.t < -eps || hit.t > 1 + eps || hit.u < -eps || hit.u > 1 + eps) return null;
  return hit;
}

export function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Ориентированная площадь (формула шнурка). */
export function polygonSignedArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export const polygonArea = (poly) => Math.abs(polygonSignedArea(poly));

export function polygonCentroid(poly) {
  const A = polygonSignedArea(poly);
  if (Math.abs(A) < 1e-9) {
    const s = poly.reduce((acc, p) => add(acc, p), { x: 0, y: 0 });
    return mul(s, 1 / Math.max(1, poly.length));
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const f = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * f;
    cy += (a.y + b.y) * f;
  }
  return { x: cx / (6 * A), y: cy / (6 * A) };
}

/** Точка внутри многоугольника, удобная для подписи (центроид или ближайшая внутренняя). */
export function polygonLabelPoint(poly) {
  const c = polygonCentroid(poly);
  if (pointInPolygon(c, poly)) return c;
  // Ищем точку на горизонтальной линии через центроид
  const xs = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if ((a.y > c.y) !== (b.y > c.y)) xs.push(a.x + ((c.y - a.y) * (b.x - a.x)) / (b.y - a.y));
  }
  xs.sort((m, n) => m - n);
  if (xs.length >= 2) return { x: (xs[0] + xs[1]) / 2, y: c.y };
  return c;
}

/** Отсечение многоугольника полуплоскостью dot(p - origin, normal) >= 0 (Сазерленд — Ходжмен). */
export function clipPolygonHalfPlane(poly, origin, normal) {
  const out = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const cur = poly[i];
    const prev = poly[(i + n - 1) % n];
    const dc = dot(sub(cur, origin), normal);
    const dp = dot(sub(prev, origin), normal);
    if (dc >= 0) {
      if (dp < 0) out.push(lerp(prev, cur, dp / (dp - dc)));
      out.push(cur);
    } else if (dp >= 0) {
      out.push(lerp(prev, cur, dp / (dp - dc)));
    }
  }
  return out;
}

/** Углы повёрнутого прямоугольника: центр, ширина (локальная X), глубина (локальная Y), угол в градусах. */
export function rectCorners(cx, cy, w, d, rotDeg = 0) {
  const r = rotDeg * DEG;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const hw = w / 2;
  const hd = d / 2;
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([x, y]) => ({ x: cx + x * c - y * s, y: cy + x * s + y * c }));
}

/** Перевод мировой точки в локальные координаты объекта (центр + поворот). */
export function toLocal(p, cx, cy, rotDeg = 0) {
  const r = -rotDeg * DEG;
  const dx = p.x - cx;
  const dy = p.y - cy;
  return { x: dx * Math.cos(r) - dy * Math.sin(r), y: dx * Math.sin(r) + dy * Math.cos(r) };
}

export function toWorld(p, cx, cy, rotDeg = 0) {
  const r = rotDeg * DEG;
  return { x: cx + p.x * Math.cos(r) - p.y * Math.sin(r), y: cy + p.x * Math.sin(r) + p.y * Math.cos(r) };
}

export function pointInRotRect(p, cx, cy, w, d, rotDeg = 0, pad = 0) {
  const l = toLocal(p, cx, cy, rotDeg);
  return Math.abs(l.x) <= w / 2 + pad && Math.abs(l.y) <= d / 2 + pad;
}

export function bboxOf(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/** Расстояние от точки до ближайшего ребра многоугольника. */
export function distToPolygonEdges(p, poly, closed = true) {
  let best = Infinity;
  const n = poly.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const d = projectOnSegment(p, poly[i], poly[(i + 1) % n]).dist;
    if (d < best) best = d;
  }
  return best;
}

/** Удаляет повторяющиеся и лежащие на одной прямой вершины. */
export function simplifyPolygon(poly, eps = 1e-4) {
  let pts = poly.filter((p, i) => !equals(p, poly[(i + 1) % poly.length], eps));
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      const backtrack = equals(a, c, eps);
      if (backtrack || Math.abs(cross(sub(b, a), sub(c, b))) < eps * Math.max(1, dist(a, c))) {
        pts.splice(i, 1);
        if (backtrack && pts.length > 3) pts.splice(i % pts.length, 1);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

/** Окружность как многоугольник. */
export function circlePolygon(cx, cy, r, segments = 32) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

/**
 * Сдвиг каждого ребра многоугольника внутрь на своё расстояние.
 * Используется, чтобы посчитать «чистую» площадь комнаты по внутренним граням стен.
 */
export function insetPolygon(poly, distances) {
  const n = poly.length;
  if (n < 3) return poly;
  const ccw = polygonSignedArea(poly) > 0;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const d = norm(sub(b, a));
    let inward = perp(d);
    if (!ccw) inward = mul(inward, -1);
    const off = distances[i] || 0;
    lines.push({ p: add(a, mul(inward, off)), d });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const l1 = lines[(i + n - 1) % n];
    const l2 = lines[i];
    const hit = lineIntersect(l1.p, l1.d, l2.p, l2.d);
    out.push(hit ? { x: hit.x, y: hit.y } : l2.p);
  }
  return out;
}
