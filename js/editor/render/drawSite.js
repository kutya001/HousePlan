/** Участок: граница, забор, зоны ландшафта и объекты на земле. */
import { THEME, withAlpha } from './theme.js';
import { ZONE_MATERIALS } from '../../model/defaults.js';
import { bboxOf, polygonArea, dist, lerp } from '../../core/geometry.js';
import { fmtSotki } from '../../core/format.js';
import { drawItemSymbol } from './symbols2d.js';
import { SITE_LEVEL } from '../../model/project.js';

export function drawSite(ctx, r) {
  const site = r.project.site;
  const b = site.boundary;
  if (!b || b.length < 3) return;
  ctx.save();
  if (!r.ground) ctx.globalAlpha = 0.35;

  r.path(ctx, b);
  ctx.fillStyle = THEME.siteFill;
  ctx.fill();

  if (r.ground) for (const z of r.project.zones) drawZone(ctx, r, z);

  // граница участка
  r.path(ctx, b);
  ctx.setLineDash([r.px(10), r.px(6)]);
  ctx.lineWidth = r.px(1.5);
  ctx.strokeStyle = THEME.siteStroke;
  ctx.stroke();
  ctx.setLineDash([]);

  // забор — столбики
  if (site.fence?.enabled && r.vp.scale > 6) {
    ctx.fillStyle = THEME.siteStroke;
    const s = r.px(3);
    for (let i = 0; i < b.length; i++) {
      const a = b[i];
      const c = b[(i + 1) % b.length];
      const L = dist(a, c);
      const n = Math.max(1, Math.round(L / 2.5));
      for (let k = 0; k < n; k++) {
        const p = lerp(a, c, k / n);
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
  }

  if (r.ground && !r.exportMode) {
    const bb = bboxOf(b);
    r.label(ctx, { x: bb.minX, y: bb.minY }, `Участок · ${fmtSotki(polygonArea(b))}`, {
      align: 'left',
      baseline: 'bottom',
      size: 12,
      color: THEME.siteStroke,
    });
  }
  ctx.restore();
}

function drawZone(ctx, r, z) {
  const mat = ZONE_MATERIALS[z.material] || ZONE_MATERIALS.lawn;
  r.path(ctx, z.points);
  ctx.fillStyle = withAlpha(mat.color, 0.6);
  ctx.fill();
  ctx.save();
  r.path(ctx, z.points);
  ctx.clip();
  const bb = bboxOf(z.points);
  ctx.strokeStyle = 'rgba(40, 50, 40, 0.18)';
  ctx.lineWidth = r.px(1);
  const big = r.vp.scale > 25;
  if (z.material === 'paving' && big) gridLines(ctx, bb, 0.5, 0.5);
  else if (z.material === 'deck' && big) gridLines(ctx, bb, 0, 0.15);
  else if (z.material === 'soil' && big) gridLines(ctx, bb, 0, 0.6);
  else if (z.material === 'gravel' && big) dots(ctx, bb, 0.25, r.px(1.2), 'rgba(90, 80, 60, 0.35)');
  else if (z.material === 'flowers' && big) dots(ctx, bb, 0.3, r.px(2.5), 'rgba(200, 60, 120, 0.55)');
  else if (z.material === 'water') {
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    for (let y = bb.minY + 0.3; y < bb.maxY; y += 0.6) {
      ctx.beginPath();
      for (let x = bb.minX; x <= bb.maxX; x += 0.15) {
        const yy = y + Math.sin(x * 3) * 0.06;
        if (x === bb.minX) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
  r.path(ctx, z.points);
  ctx.strokeStyle = withAlpha(mat.color, 1);
  ctx.lineWidth = r.px(1);
  ctx.stroke();
}

function gridLines(ctx, bb, sx, sy) {
  ctx.beginPath();
  if (sx > 0) for (let x = Math.floor(bb.minX / sx) * sx; x <= bb.maxX; x += sx) {
    ctx.moveTo(x, bb.minY);
    ctx.lineTo(x, bb.maxY);
  }
  if (sy > 0) for (let y = Math.floor(bb.minY / sy) * sy; y <= bb.maxY; y += sy) {
    ctx.moveTo(bb.minX, y);
    ctx.lineTo(bb.maxX, y);
  }
  ctx.stroke();
}

function dots(ctx, bb, step, radius, color) {
  ctx.fillStyle = color;
  let k = 0;
  for (let y = Math.floor(bb.minY / step) * step; y <= bb.maxY; y += step) {
    const off = k++ % 2 ? step / 2 : 0;
    for (let x = Math.floor(bb.minX / step) * step + off; x <= bb.maxX; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawSiteItems(ctx, r) {
  const items = r.project.items.filter((i) => i.levelId === SITE_LEVEL);
  // низкие объекты (бассейн, грядки) — первыми
  items.sort((a, b) => a.h - b.h);
  for (const it of items) drawItemSymbol(ctx, it, r.px(1.1));
}
