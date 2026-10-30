/**
 * Размерные линии как на чертеже: снаружи — по наружным граням наружных стен,
 * внутри — подпись длины по оси перегородки (при достаточном масштабе).
 */
import { THEME } from './theme.js';
import { add, sub, mul, dist, norm, mid, perp } from '../../core/geometry.js';
import { fmtLenShort } from '../../core/format.js';
import { outwardSign, wallsCenter } from '../../geometry/wallGeometry.js';

export function drawDimensions(ctx, r) {
  const geoms = r.geoms;
  if (!geoms.size || r.vp.scale < 8) return;
  const center = wallsCenter(geoms);
  for (const g of geoms.values()) {
    const selected = r.state.isSelected('wall', g.wall.id);
    if (g.wall.kind === 'exterior') {
      const sgn = outwardSign(g, center);
      const [p0, p1] = sgn > 0 ? [g.aPos, g.bPos] : [g.aNeg, g.bNeg];
      dimLine(ctx, r, p0, p1, mul(g.n, sgn), 22, selected);
    } else if (r.vp.scale > 45 || selected) {
      const m = mid(g.a, g.b);
      r.label(ctx, add(m, mul(g.n, r.px(9) + g.half)), fmtLenShort(g.len), {
        size: 10,
        angle: uprightAngle(g.d),
        color: selected ? THEME.accent : THEME.muted,
      });
    }
  }
}

export function uprightAngle(d) {
  let a = Math.atan2(d.y, d.x);
  if (a > Math.PI / 2 + 1e-6) a -= Math.PI;
  if (a < -Math.PI / 2 - 1e-6) a += Math.PI;
  return a;
}

/**
 * Размерная линия между точками p0, p1, вынесенная по нормали на offPx пикселей.
 */
export function dimLine(ctx, r, p0, p1, normal, offPx = 22, highlight = false, text = null) {
  const L = dist(p0, p1);
  if (L * r.vp.scale < 24) return;
  const n = norm(normal);
  const d = norm(sub(p1, p0));
  const off = r.px(offPx);
  const a = add(p0, mul(n, off));
  const b = add(p1, mul(n, off));
  const color = highlight ? THEME.accent : THEME.dim;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = r.px(1);
  ctx.beginPath();
  // выносные линии
  const g = r.px(4);
  for (const [p, q] of [
    [p0, a],
    [p1, b],
  ]) {
    const s = add(p, mul(n, g));
    const e = add(q, mul(n, g));
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(e.x, e.y);
  }
  // размерная линия
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  // засечки
  ctx.lineWidth = r.px(1.6);
  const t = mul(add(d, n), r.px(4) / Math.SQRT2);
  ctx.beginPath();
  for (const p of [a, b]) {
    ctx.moveTo(p.x - t.x, p.y - t.y);
    ctx.lineTo(p.x + t.x, p.y + t.y);
  }
  ctx.stroke();
  ctx.restore();
  const label = text ?? fmtLenShort(L);
  const ang = uprightAngle(d);
  // подпись над линией (со стороны от стены)
  const up = perp({ x: Math.cos(ang), y: Math.sin(ang) });
  const sideSign = up.x * n.x + up.y * n.y >= 0 ? 1 : -1;
  r.label(ctx, add(mid(a, b), mul(up, -sideSign * r.px(-8))), label, {
    size: 11,
    angle: ang,
    color,
    weight: highlight ? 600 : 500,
  });
}
