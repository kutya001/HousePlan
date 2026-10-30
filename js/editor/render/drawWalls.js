/**
 * Стены на плане. Приём «сначала обводка, потом заливка» даёт чистый общий
 * контур: внутренние линии стыков закрываются заливкой соседней стены.
 */
import { THEME } from './theme.js';
import { wallPiecesPlan } from '../../geometry/wallGeometry.js';

export function openingsByWall(project) {
  const map = new Map();
  for (const o of project.openings) {
    if (!map.has(o.wallId)) map.set(o.wallId, []);
    map.get(o.wallId).push(o);
  }
  return map;
}

export function drawWalls(ctx, r) {
  const byWall = openingsByWall(r.project);
  const pieces = [];
  for (const g of r.geoms.values()) {
    for (const poly of wallPiecesPlan(g, byWall.get(g.wall.id) || [])) {
      pieces.push({ poly, kind: g.wall.kind, id: g.wall.id });
    }
  }
  ctx.save();
  ctx.lineJoin = 'miter';
  ctx.lineWidth = r.px(2.4);
  ctx.strokeStyle = THEME.wallStroke;
  for (const p of pieces) {
    r.path(ctx, p.poly);
    ctx.stroke();
  }
  for (const p of pieces) {
    r.path(ctx, p.poly);
    ctx.fillStyle = p.kind === 'exterior' ? THEME.wallExt : THEME.wallInt;
    ctx.fill();
  }
  const hover = r.state.hover;
  if (hover?.kind === 'wall' && !r.state.isSelected('wall', hover.id)) {
    ctx.fillStyle = THEME.hover;
    for (const p of pieces) if (p.id === hover.id) {
      r.path(ctx, p.poly);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Стены этажа ниже — тонким пунктиром, чтобы рисовать «поверх». */
export function drawLowerLevel(ctx, r, levelId) {
  const geoms = r.editor.geomsFor(levelId);
  ctx.save();
  ctx.setLineDash([r.px(4), r.px(4)]);
  ctx.lineWidth = r.px(1);
  ctx.strokeStyle = THEME.ghost;
  ctx.fillStyle = 'rgba(55, 75, 92, 0.05)';
  for (const g of geoms.values()) {
    r.path(ctx, g.poly);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
