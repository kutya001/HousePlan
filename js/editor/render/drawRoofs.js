/** Крыши на плане — пунктирный контур со свесом, конёк и рёбра. */
import { THEME } from './theme.js';
import { roofGeometry, shedArrow } from '../../geometry/roofGeometry.js';
import { ROOF_TYPES } from '../../model/defaults.js';
import { add, sub, mul, norm, perp } from '../../core/geometry.js';

export function drawRoofs(ctx, r) {
  const roofs = r.project.roofs.filter((x) => x.levelId === r.levelId);
  for (const roof of roofs) {
    const geo = roofGeometry(roof, 0);
    ctx.save();
    ctx.strokeStyle = roof.color || '#8a4a3a';
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = r.px(1.4);
    ctx.setLineDash([r.px(9), r.px(5)]);
    r.path(ctx, geo.plan.outline);
    ctx.stroke();
    ctx.setLineDash([r.px(3), r.px(4)]);
    ctx.lineWidth = r.px(1.1);
    for (const [a, b] of geo.plan.lines) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (roof.type === 'shed') {
      const [a, b] = shedArrow(roof);
      const d = norm(sub(b, a));
      const n = perp(d);
      const s = r.px(8);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      const p1 = add(add(b, mul(d, -s)), mul(n, s * 0.5));
      const p2 = add(add(b, mul(d, -s)), mul(n, -s * 0.5));
      ctx.lineTo(p1.x, p1.y);
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.restore();
    const o = geo.plan.outline;
    r.label(ctx, o[0], `${ROOF_TYPES[roof.type] || 'Крыша'} · ${roof.type === 'flat' ? 'плоская' : `${roof.pitch}°`}`, {
      size: 10,
      color: roof.color || '#8a4a3a',
      align: 'left',
      baseline: 'bottom',
    });
  }
}
