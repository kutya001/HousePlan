/**
 * Стены на плане. Приём «сначала обводка, потом заливка» даёт чистый общий
 * контур: внутренние линии стыков закрываются заливкой соседней стены.
 */
import { THEME } from './theme.js';
import { wallPiecesPlan } from '../../geometry/wallGeometry.js';
import { wallType } from '../../model/wallTypes.js';
import { bboxOf } from '../../core/geometry.js';

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
      pieces.push({ poly, kind: g.wall.kind, id: g.wall.id, hatch: wallType(g.wall).hatch, d: g.d });
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
    ctx.fillStyle = p.hatch === 'glass' ? 'rgba(120, 185, 215, 0.55)' : p.kind === 'exterior' ? THEME.wallExt : THEME.wallInt;
    ctx.fill();
  }
  // материал стены — штриховкой: кирпич — наклонная, дерево — вдоль стены, каркас — крест-накрест
  if (r.vp.scale > 14) {
    ctx.strokeStyle = THEME.paper;
    ctx.lineWidth = r.px(1);
    for (const p of pieces) if (p.hatch === 'brick' || p.hatch === 'wood' || p.hatch === 'frame') hatch(ctx, r, p);
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

function hatch(ctx, r, p) {
  const bb = bboxOf(p.poly);
  const step = r.px(p.hatch === 'wood' ? 4 : 6);
  ctx.save();
  r.path(ctx, p.poly);
  ctx.clip();
  ctx.globalAlpha = p.hatch === 'wood' ? 0.4 : 0.32;
  ctx.beginPath();
  const size = bb.w + bb.h;
  const lines = (dx, dy) => {
    // семейство параллельных прямых с направлением (dx, dy), покрывающее прямоугольник
    const nx = -dy;
    const ny = dx;
    const cx = bb.minX + bb.w / 2;
    const cy = bb.minY + bb.h / 2;
    for (let k = -Math.ceil(size / step); k <= Math.ceil(size / step); k++) {
      const ox = cx + nx * k * step;
      const oy = cy + ny * k * step;
      ctx.moveTo(ox - dx * size, oy - dy * size);
      ctx.lineTo(ox + dx * size, oy + dy * size);
    }
  };
  const s = Math.SQRT1_2;
  if (p.hatch === 'wood') lines(p.d.x, p.d.y);
  else {
    lines(s, -s);
    if (p.hatch === 'frame') lines(s, s);
  }
  ctx.stroke();
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
