/**
 * Геометрия «умных» привязок: где к стене примыкают другие стены,
 * чистые (между гранями) участки стен, соседние параллельные стены,
 * лучи до ближайшей стены. Чистые функции — без редактора и DOM.
 */
import { add, sub, mul, dot, cross, dist, projectOnSegment, segmentIntersect, clamp } from '../core/geometry.js';

const EPS = 0.02;

/**
 * Примыкания к стене g: позиции вдоль оси, где к ней подходят или её пересекают другие стены.
 * @returns {Array<{ s, half, side, wall }>}
 *   s — расстояние от начала стены, half — полутолщина примыкающей стены вдоль оси g,
 *   side — с какой стороны стены (по нормали g.n) находится примыкающая стена: +1, −1 или 0 (с обеих).
 */
export function wallJunctions(geoms, g) {
  const out = [];
  for (const h of geoms.values()) {
    if (h === g) continue;
    const sin = Math.abs(cross(g.d, h.d));
    if (sin < 0.05) continue; // параллельные — продолжение, а не примыкание
    const half = h.half / sin;
    let found = false;
    // конец стены h лежит на оси g (Т-примыкание или угол)
    for (const [p, other] of [
      [h.a, h.b],
      [h.b, h.a],
    ]) {
      const pr = projectOnSegment(p, g.a, g.b);
      if (pr.dist > EPS || pr.rawT * g.len < -EPS || pr.rawT * g.len > g.len + EPS) continue;
      const s = clamp(pr.along, 0, g.len);
      const atEnd = s < EPS || s > g.len - EPS;
      const side = atEnd ? 0 : Math.sign(dot(sub(other, p), g.n)) || 0;
      out.push({ s, half, side, wall: h.wall });
      found = true;
    }
    if (found) continue;
    // конец стены g упирается в середину h
    for (const [p, s] of [
      [g.a, 0],
      [g.b, g.len],
    ]) {
      const pr = projectOnSegment(p, h.a, h.b);
      if (pr.dist < EPS && pr.along > EPS && pr.along < h.len - EPS) {
        out.push({ s, half, side: 0, wall: h.wall });
        found = true;
      }
    }
    if (found) continue;
    // пересечение «крестом»
    const hit = segmentIntersect(g.a, g.b, h.a, h.b);
    if (hit && hit.t > 0.001 && hit.t < 0.999 && hit.u > 0.001 && hit.u < 0.999) out.push({ s: hit.t * g.len, half, side: 0, wall: h.wall });
  }
  return out.sort((p, q) => p.s - q.s);
}

/**
 * Чистые участки стены с одной стороны: от грани до грани примыкающих стен.
 * @param side +1 / −1 — сторона по нормали g.n (откуда смотрим)
 * @returns {Array<{ s0, s1, c }>}
 */
export function clearSegments(geoms, g, side) {
  const js = wallJunctions(geoms, g).filter((j) => j.side === 0 || j.side === side);
  const marks = [{ s: 0, half: 0 }, ...js, { s: g.len, half: 0 }];
  // концы стены без примыканий — свободные
  const segs = [];
  for (let i = 0; i < marks.length - 1; i++) {
    const a = marks[i];
    const b = marks[i + 1];
    if (b.s - a.s < 0.05) continue;
    const s0 = a.s + a.half;
    const s1 = b.s - b.half;
    if (s1 - s0 > 0.1) segs.push({ s0, s1, c: (s0 + s1) / 2 });
  }
  return segs;
}

/** Чистый участок стены, на котором лежит точка along (или ближайший). */
export function clearSegmentAt(geoms, g, along, side) {
  const segs = clearSegments(geoms, g, side);
  if (!segs.length) return { s0: 0, s1: g.len, c: g.len / 2 };
  let best = segs[0];
  let bestD = Infinity;
  for (const sg of segs) {
    const d = along < sg.s0 ? sg.s0 - along : along > sg.s1 ? along - sg.s1 : 0;
    if (d < bestD) {
      bestD = d;
      best = sg;
    }
  }
  return best;
}

/**
 * Параллельные стены, перекрывающиеся с g по длине: смещение их оси относительно оси g по нормали.
 * @returns {Array<{ off, half, g }>} отсортировано по off
 */
export function parallelWalls(geoms, g, minOverlap = 0.2) {
  const out = [];
  for (const h of geoms.values()) {
    if (h === g || Math.abs(cross(g.d, h.d)) > 0.02) continue;
    const s0 = dot(sub(h.a, g.a), g.d);
    const s1 = dot(sub(h.b, g.a), g.d);
    const lo = Math.max(0, Math.min(s0, s1));
    const hi = Math.min(g.len, Math.max(s0, s1));
    if (hi - lo < minOverlap) continue;
    out.push({ off: dot(sub(h.a, g.a), g.n), half: h.half, g: h });
  }
  return out.sort((p, q) => p.off - q.off);
}

/**
 * Луч от точки до ближайшей грани стены.
 * @returns {{ t, point, g } | null} t — расстояние до грани
 */
export function rayToWalls(geoms, origin, dir, maxT = 60) {
  let best = null;
  const far = add(origin, mul(dir, maxT));
  for (const g of geoms.values()) {
    const poly = g.poly;
    for (let i = 0; i < poly.length; i++) {
      const hit = segmentIntersect(origin, far, poly[i], poly[(i + 1) % poly.length]);
      if (!hit) continue;
      const t = hit.t * maxT;
      if (t > 1e-4 && (!best || t < best.t)) best = { t, point: { x: hit.x, y: hit.y }, g };
    }
  }
  return best;
}

/** Луч до оси ближайшей стены (для построения новой стены, примыкающей к оси). */
export function rayToWallAxes(geoms, origin, dir, maxT = 60) {
  let best = null;
  const far = add(origin, mul(dir, maxT));
  for (const g of geoms.values()) {
    const hit = segmentIntersect(origin, far, g.a, g.b);
    if (!hit) continue;
    const t = hit.t * maxT;
    if (t > 1e-3 && (!best || t < best.t)) best = { t, point: { x: hit.x, y: hit.y }, g };
  }
  return best;
}

/** Центр прямоугольной рамки комнаты (для симметрии и деления пополам). */
export function roomCenter(room) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of room.points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

export { dist };
