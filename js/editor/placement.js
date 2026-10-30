/**
 * Помощники размещения: «прилипание» мебели к стенам и поиск места для проёма.
 * Положение вдоль стены подбирают умные привязки (smartSnap.js).
 */
import { add, sub, mul, dot, projectOnSegment, normalizeDeg } from '../core/geometry.js';
import { snapOpening, snapAlongWall } from './smartSnap.js';
import { openingsOfWall } from '../model/project.js';
import { canPlaceOpening } from '../geometry/wallGeometry.js';
import { catalogItem } from '../model/catalog.js';

/**
 * Прижимает объект спинкой к ближайшей стене.
 * @returns {{ x, y, rotation, wallId } | null}
 */
export function snapToWall(editor, center, depth, width, { threshold, ignoreId = null, disabled = false } = {}) {
  const geoms = editor.geomsFor(editor.levelId);
  const th = threshold ?? Math.max(0.35, editor.viewport.px(22));
  let best = null;
  for (const g of geoms.values()) {
    const pr = projectOnSegment(center, g.a, g.b);
    if (pr.rawT < -0.05 || pr.rawT > 1.05) continue;
    const side = dot(sub(center, g.a), g.n) >= 0 ? 1 : -1;
    const distAxis = Math.abs(dot(sub(center, g.a), g.n));
    const target = g.half + depth / 2;
    const off = Math.abs(distAxis - target);
    if (off > th) continue;
    if (!best || off < best.off) best = { g, side, off, along: pr.along };
  }
  if (!best) return null;
  const { g, side } = best;
  const half = width / 2;
  const sn = disabled ? { along: best.along, label: null } : snapAlongWall(editor, g, best.along, width, side, { ignoreId });
  let along = sn.along;
  // не вылезать за концы стены, если объект короче стены
  if (g.len > width) along = Math.max(half, Math.min(g.len - half, along));
  const pos = add(add(g.a, mul(g.d, along)), mul(g.n, side * (g.half + depth / 2)));
  const b = mul(g.n, -side); // направление к стене
  const rotation = normalizeDeg((Math.atan2(b.x, -b.y) * 180) / Math.PI);
  return { x: pos.x, y: pos.y, rotation: Math.round(rotation * 100) / 100, wallId: g.wall.id, label: sn.label };
}

export function itemSnapsToWall(item) {
  return !!catalogItem(item.type)?.wallSnap;
}

/**
 * Ближайшая стена для проёма под курсором.
 * @returns {{ g, t, ok, snap } | null} snap — подпись и подсказки умной привязки
 */
export function findWallForOpening(editor, p, width, ignoreId = null, { kind = 'window', disabled = false } = {}) {
  const geoms = editor.geomsFor(editor.levelId);
  const tol = Math.max(editor.viewport.px(24), 0.3);
  let best = null;
  for (const g of geoms.values()) {
    const pr = projectOnSegment(p, g.a, g.b);
    const d = pr.dist - g.half;
    if (d > tol) continue;
    if (!best || d < best.d) best = { g, d, along: pr.along };
  }
  if (!best) return null;
  const { g } = best;
  // курсор на самой стене — сторона не важна: смотрим участки с обеих сторон
  const off = dot(sub(p, g.a), g.n);
  const side = Math.abs(off) < g.half ? 0 : off > 0 ? 1 : -1;
  const snap = snapOpening(editor, g, best.along, width, { ignoreId, side, kind, disabled });
  let t = snap.t;
  const minT = width / 2 + 0.05;
  const maxT = g.len - width / 2 - 0.05;
  if (maxT >= minT) t = Math.max(minT, Math.min(maxT, t));
  const ok = canPlaceOpening(g, openingsOfWall(editor.project, g.wall.id), t, width, ignoreId);
  return { g, t, ok, snap };
}
