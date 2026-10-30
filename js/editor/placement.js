/**
 * Помощники размещения: «прилипание» мебели к стенам и поиск места для проёма.
 */
import { add, sub, mul, dot, projectOnSegment, snapValue, normalizeDeg } from '../core/geometry.js';
import { openingsOfWall } from '../model/project.js';
import { canPlaceOpening } from '../geometry/wallGeometry.js';
import { catalogItem } from '../model/catalog.js';
import { DEFAULTS } from '../model/defaults.js';

/**
 * Прижимает объект спинкой к ближайшей стене.
 * @returns {{ x, y, rotation, wallId } | null}
 */
export function snapToWall(editor, center, depth, width, { threshold } = {}) {
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
  let along = snapValue(best.along, DEFAULTS.grid);
  // не вылезать за концы стены, если объект короче стены
  if (g.len > width) along = Math.max(half, Math.min(g.len - half, along));
  const pos = add(add(g.a, mul(g.d, along)), mul(g.n, side * (g.half + depth / 2)));
  const b = mul(g.n, -side); // направление к стене
  const rotation = normalizeDeg((Math.atan2(b.x, -b.y) * 180) / Math.PI);
  return { x: pos.x, y: pos.y, rotation: Math.round(rotation * 100) / 100, wallId: g.wall.id };
}

export function itemSnapsToWall(item) {
  return !!catalogItem(item.type)?.wallSnap;
}

/**
 * Ближайшая стена для проёма под курсором.
 * @returns {{ g, t, ok } | null}
 */
export function findWallForOpening(editor, p, width, ignoreId = null) {
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
  let t = snapValue(best.along, DEFAULTS.grid);
  if (Math.abs(t - g.len / 2) < Math.max(0.08, editor.viewport.px(8))) t = g.len / 2;
  const minT = width / 2 + 0.05;
  const maxT = g.len - width / 2 - 0.05;
  if (maxT >= minT) t = Math.max(minT, Math.min(maxT, t));
  const ok = canPlaceOpening(g, openingsOfWall(editor.project, g.wall.id), t, width, ignoreId);
  return { g, t, ok };
}
