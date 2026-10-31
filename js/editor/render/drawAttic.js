/**
 * Мансарда на плане: штриховка там, где до скатов крыши ниже 1,5 м
 * (по нормам такая площадь не считается полезной — там не выпрямиться).
 */
import { THEME } from './theme.js';
import { clipPolygonHalfPlane, polygonCentroid, pointInPolygon, polygonArea, bboxOf } from '../../core/geometry.js';
import { roofGeometry, roofPlanes } from '../../geometry/roofGeometry.js';
import { getLevel, isAttic, levelElevation, levelTop } from '../../model/project.js';

const LOW = 1.5; // м
const ROOF_THICKNESS = 0.2;

/** Участки плана мансарды, где высота до низа скатов меньше 1,5 м. */
export function atticLowZones(project, levelId) {
  const level = getLevel(project, levelId);
  if (!isAttic(level)) return [];
  const floor = levelElevation(project, levelId);
  const H = levelTop(project, levelId);
  const T = floor + LOW + ROOF_THICKNESS;
  const zones = [];
  for (const roof of project.roofs) {
    if (roof.levelId !== levelId) continue;
    const rect = roofGeometry(roof, H).plan.outline;
    for (const pl of roofPlanes(roof, H).planes) {
      // область, где pl < T:  −(a·x + b·y + c − T) ≥ 0
      const L2 = pl.a * pl.a + pl.b * pl.b;
      if (L2 < 1e-12) {
        if (pl.c < T) zones.push(rect);
        continue;
      }
      const k = -(pl.c - T) / L2;
      const poly = clipPolygonHalfPlane(rect, { x: pl.a * k, y: pl.b * k }, { x: -pl.a, y: -pl.b });
      if (poly.length >= 3 && polygonArea(poly) > 1e-3) zones.push(poly);
    }
  }
  return zones;
}

export function drawAtticLow(ctx, r) {
  const zones = atticLowZones(r.project, r.levelId);
  if (!zones.length) return;
  const rooms = r.project.rooms.filter((x) => x.levelId === r.levelId);
  ctx.save();
  // только внутри комнат
  ctx.beginPath();
  for (const room of rooms) room.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)), ctx.closePath());
  if (rooms.length) ctx.clip();
  ctx.beginPath();
  for (const z of zones) {
    z.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
  }
  ctx.fillStyle = THEME.dark ? 'rgba(226, 160, 143, 0.12)' : 'rgba(138, 74, 58, 0.09)';
  ctx.fill('nonzero');
  ctx.clip('nonzero');
  // диагональная штриховка с шагом в экранных пикселях
  const all = zones.flat();
  const bb = bboxOf(all);
  const step = r.px(9);
  ctx.beginPath();
  for (let s = bb.minX - (bb.maxY - bb.minY); s <= bb.maxX; s += step) {
    ctx.moveTo(s, bb.minY);
    ctx.lineTo(s + (bb.maxY - bb.minY), bb.maxY);
  }
  ctx.strokeStyle = THEME.dark ? 'rgba(226, 160, 143, 0.35)' : 'rgba(138, 74, 58, 0.3)';
  ctx.lineWidth = r.px(1);
  ctx.stroke();
  ctx.restore();
  // подпись в самой большой полосе, если она внутри комнаты
  const big = zones.reduce((a, b) => (polygonArea(a) >= polygonArea(b) ? a : b));
  const c = polygonCentroid(big);
  if (r.vp.scale > 18 && rooms.some((room) => pointInPolygon(c, room.points))) {
    r.label(ctx, c, 'ниже 1,5 м', { size: 10.5, weight: 600, color: THEME.dark ? '#e2a08f' : '#8a4a3a' });
  }
}
