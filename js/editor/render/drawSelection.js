/** Выделение, подсветка под курсором и ручки редактирования. */
import { THEME } from './theme.js';
import { getEntity } from '../../model/project.js';
import { rectCorners, mul, add } from '../../core/geometry.js';
import { computeHandles, entityOutline } from '../handles.js';
import { openingFrame } from './drawOpenings.js';
import { roofGeometry } from '../../geometry/roofGeometry.js';
import { dimLine } from './drawDimensions.js';

export function drawSelection(ctx, r) {
  const { state } = r;
  const hover = state.hover;
  if (hover && !state.isSelected(hover.kind, hover.id) && hover.kind !== 'wall') {
    outlineRef(ctx, r, hover, { color: THEME.hover, width: 1.5, fill: null });
  }
  for (const ref of state.selection) outlineRef(ctx, r, ref, { color: THEME.accent, width: 2, fill: THEME.accentSoft, selected: true });
  drawHandles(ctx, r, computeHandles(r.editor));
}

function outlineRef(ctx, r, ref, { color, width, fill, selected }) {
  const e = getEntity(r.project, ref.kind, ref.id);
  if (!e) return;
  let poly = null;
  if (ref.kind === 'wall') poly = r.geoms.get(e.id)?.poly;
  else if (ref.kind === 'opening') {
    const g = r.geoms.get(e.wallId);
    if (!g) return;
    const f = openingFrame(g, e);
    poly = f.poly;
    if (selected) {
      // расстояния до концов стены
      const nn = mul(g.n, g.half);
      dimLine(ctx, r, add(g.a, nn), add(f.A0, nn), g.n, 18, true);
      dimLine(ctx, r, add(f.A1, nn), add(g.b, nn), g.n, 18, true);
      dimLine(ctx, r, add(f.A0, mul(nn, -1)), add(f.A1, mul(nn, -1)), mul(g.n, -1), 18, true);
    }
  } else if (ref.kind === 'item') poly = rectCorners(e.x, e.y, e.w, e.d, e.rotation);
  else if (ref.kind === 'stair') poly = entityOutline(r.editor, ref);
  else if (ref.kind === 'roof') poly = roofGeometry(e, 0).plan.outline;
  else if (ref.kind === 'room' || ref.kind === 'zone') poly = e.points;
  else if (ref.kind === 'site') poly = r.project.site.boundary;
  if (!poly) return;
  ctx.save();
  r.path(ctx, poly);
  if (fill && ref.kind !== 'site' && ref.kind !== 'roof') {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.lineWidth = r.px(width);
  ctx.strokeStyle = color;
  ctx.stroke();
  if (ref.kind === 'roof') {
    r.path(ctx, rectCorners(e.x, e.y, e.w, e.d, e.rotation));
    ctx.setLineDash([r.px(4), r.px(3)]);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHandles(ctx, r, handles) {
  for (const h of handles) {
    if (h.type === 'rotate') {
      ctx.beginPath();
      ctx.moveTo(h.anchor.x, h.anchor.y);
      ctx.lineTo(h.pos.x, h.pos.y);
      ctx.strokeStyle = THEME.accent;
      ctx.lineWidth = r.px(1.2);
      ctx.stroke();
      r.dot(ctx, h.pos, 6, '#fff', THEME.accent, 2);
      // значок поворота
      ctx.beginPath();
      ctx.arc(h.pos.x, h.pos.y, r.px(2.8), -Math.PI * 0.9, Math.PI * 0.4);
      ctx.lineWidth = r.px(1.2);
      ctx.stroke();
    } else if (h.type === 'resize') {
      const s = r.px(9);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = THEME.accent;
      ctx.lineWidth = r.px(2);
      ctx.fillRect(h.pos.x - s / 2, h.pos.y - s / 2, s, s);
      ctx.strokeRect(h.pos.x - s / 2, h.pos.y - s / 2, s, s);
    } else if (h.type === 'edge-mid') {
      r.dot(ctx, h.pos, 3.5, THEME.accent, '#fff', 1.2);
    } else {
      r.dot(ctx, h.pos, 6, '#fff', THEME.accent, 2);
    }
  }
}
