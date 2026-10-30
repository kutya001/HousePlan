/** Лестницы: ступени, линия хода со стрелкой, проём на этаже выше. */
import { THEME, floorFill, tint } from './theme.js';
import { stairLayout } from '../../geometry/stairGeometry.js';
import { getLevel, levelWallHeight } from '../../model/project.js';
import { sub, norm, add, mul, perp } from '../../core/geometry.js';

export function stairRise(project, stair) {
  const lvl = getLevel(project, stair.levelId);
  return lvl ? levelWallHeight(lvl) : 3;
}

export function drawStairs(ctx, r) {
  const stairs = r.project.stairs.filter((s) => s.levelId === r.levelId);
  for (const s of stairs) {
    const lay = stairLayout(s, stairRise(r.project, s));
    ctx.save();
    ctx.lineWidth = r.px(1);
    ctx.strokeStyle = THEME.itemStroke;
    for (const st of lay.steps) {
      r.path(ctx, st.poly);
      ctx.fillStyle = THEME.dark ? floorFill(s.color) : tint(s.color, st.landing ? 0.45 : 0.6);
      ctx.fill();
      ctx.stroke();
    }
    r.path(ctx, lay.outline);
    ctx.lineWidth = r.px(1.6);
    ctx.stroke();
    drawArrow(ctx, r, lay.path);
    ctx.restore();
  }
}

function drawArrow(ctx, r, path) {
  if (path.length < 2) return;
  ctx.beginPath();
  path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = r.px(1.3);
  ctx.stroke();
  const a = path[path.length - 2];
  const b = path[path.length - 1];
  const d = norm(sub(b, a));
  const n = perp(d);
  const s = r.px(9);
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  const l = add(add(b, mul(d, -s)), mul(n, s * 0.45));
  const rr = add(add(b, mul(d, -s)), mul(n, -s * 0.45));
  ctx.lineTo(l.x, l.y);
  ctx.lineTo(rr.x, rr.y);
  ctx.closePath();
  ctx.fillStyle = THEME.ink;
  ctx.fill();
  // точка старта
  ctx.beginPath();
  ctx.arc(path[0].x, path[0].y, r.px(2.5), 0, Math.PI * 2);
  ctx.fill();
}

/** На верхнем этаже — контур лестничного проёма от лестницы снизу. */
export function drawStairwellsFromBelow(ctx, r, belowId) {
  const stairs = r.project.stairs.filter((s) => s.levelId === belowId);
  for (const s of stairs) {
    const lay = stairLayout(s, stairRise(r.project, s));
    ctx.save();
    r.path(ctx, lay.outline);
    ctx.fillStyle = THEME.voidFill;
    ctx.fill();
    ctx.setLineDash([r.px(6), r.px(4)]);
    ctx.lineWidth = r.px(1.2);
    ctx.strokeStyle = THEME.ink;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = r.px(0.8);
    for (const st of lay.steps) {
      r.path(ctx, st.poly);
      ctx.stroke();
    }
    ctx.restore();
    const c = lay.path[lay.path.length - 1];
    r.label(ctx, c, 'проём', { size: 10, color: THEME.muted });
  }
}
