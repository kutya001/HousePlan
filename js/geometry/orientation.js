/**
 * Куда смотрят окна комнаты: по наружной нормали окна и северу участка —
 * «Ю, З». Помогает понять, где солнечно, а где всегда тень.
 */
import { computeWallGeometry, pointOnWall } from './wallGeometry.js';
import { pointInPolygon } from '../core/geometry.js';
import { siteGeo, vectorAzimuth, compassPoint } from './sun.js';

/** Список сторон света (по порядку обхода С→СЗ) для окон комнаты. */
export function roomWindowDirections(project, room) {
  const geoms = computeWallGeometry(project.walls.filter((w) => w.levelId === room.levelId));
  const { north } = siteGeo(project.site);
  const found = new Set();
  for (const o of project.openings) {
    if (o.kind !== 'window') continue;
    const g = geoms.get(o.wallId);
    if (!g) continue;
    const c = pointOnWall(g, o.t);
    for (const side of [1, -1]) {
      const inside = { x: c.x + g.n.x * side * (g.half + 0.25), y: c.y + g.n.y * side * (g.half + 0.25) };
      if (!pointInPolygon(inside, room.points)) continue;
      // окно смотрит от комнаты наружу
      found.add(compassPoint(vectorAzimuth({ x: -g.n.x * side, y: -g.n.y * side }, north)));
    }
  }
  const order = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
  return order.filter((p) => found.has(p));
}
