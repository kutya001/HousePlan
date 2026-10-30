/** Условные обозначения дверей, окон и проёмов в разрезе стены. */
import { THEME } from './theme.js';
import { add, mul, sub, cross, dist } from '../../core/geometry.js';
import { pointOnWall } from '../../geometry/wallGeometry.js';
import { openingsByWall } from './drawWalls.js';

export function drawOpenings(ctx, r) {
  const byWall = openingsByWall(r.project);
  for (const g of r.geoms.values()) {
    for (const o of byWall.get(g.wall.id) || []) drawOpening(ctx, r, g, o);
  }
}

/** Геометрия проёма на плане — общая для отрисовки, выделения и попадания курсора. */
export function openingFrame(g, o) {
  const s0 = o.t - o.width / 2;
  const s1 = o.t + o.width / 2;
  const nP = mul(g.n, g.half);
  const A0 = pointOnWall(g, s0);
  const A1 = pointOnWall(g, s1);
  return {
    s0,
    s1,
    A0,
    A1,
    poly: [add(A0, nP), add(A1, nP), sub(A1, nP), sub(A0, nP)],
    center: pointOnWall(g, o.t),
  };
}

export function drawOpening(ctx, r, g, o, { ghost = false } = {}) {
  const f = openingFrame(g, o);
  const nP = mul(g.n, g.half);
  ctx.save();
  if (ghost) ctx.globalAlpha = 0.75;
  ctx.lineCap = 'butt';

  // откосы
  ctx.strokeStyle = THEME.wallStroke;
  ctx.lineWidth = r.px(2);
  ctx.beginPath();
  ctx.moveTo(add(f.A0, nP).x, add(f.A0, nP).y);
  ctx.lineTo(sub(f.A0, nP).x, sub(f.A0, nP).y);
  ctx.moveTo(add(f.A1, nP).x, add(f.A1, nP).y);
  ctx.lineTo(sub(f.A1, nP).x, sub(f.A1, nP).y);
  ctx.stroke();

  if (o.kind === 'window') drawWindow(ctx, r, g, o, f);
  else if (o.kind === 'door') drawDoor(ctx, r, g, o, f);
  else drawArch(ctx, r, g, f);
  ctx.restore();
}

function drawWindow(ctx, r, g, o, f) {
  r.path(ctx, f.poly);
  ctx.fillStyle = THEME.windowFill;
  ctx.fill();
  ctx.lineWidth = r.px(1.2);
  ctx.strokeStyle = THEME.ink;
  ctx.stroke();
  // стекло — двойная линия по оси
  const off = Math.min(g.half * 0.35, 0.05);
  ctx.beginPath();
  for (const s of [off, -off]) {
    const a = add(f.A0, mul(g.n, s));
    const b = add(f.A1, mul(g.n, s));
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.strokeStyle = o.style === 'panoramic' ? THEME.accent : THEME.ink;
  ctx.lineWidth = r.px(1);
  ctx.stroke();
  // импосты
  const parts = { single: 1, double: 2, triple: 3, panoramic: Math.max(2, Math.round(o.width / 1)) }[o.style] || 2;
  ctx.beginPath();
  for (let i = 1; i < parts; i++) {
    const s = f.s0 + (o.width / parts) * i;
    const a = add(pointOnWall(g, s), mul(g.n, g.half));
    const b = add(pointOnWall(g, s), mul(g.n, -g.half));
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
}

function drawDoor(ctx, r, g, o, f) {
  const sgn = o.flipSide ? -1 : 1;
  const nn = mul(g.n, sgn);
  ctx.strokeStyle = THEME.ink;
  if (o.style === 'sliding') {
    ctx.lineWidth = r.px(2.5);
    const off = Math.min(g.half * 0.4, 0.04);
    const mid = o.t;
    const seg = (s0, s1, k) => {
      const a = add(pointOnWall(g, s0), mul(g.n, k));
      const b = add(pointOnWall(g, s1), mul(g.n, k));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };
    seg(f.s0, mid + 0.05, off);
    seg(mid - 0.05, f.s1, -off);
    return;
  }
  if (o.style === 'garage') {
    ctx.lineWidth = r.px(2.5);
    ctx.beginPath();
    ctx.moveTo(f.A0.x, f.A0.y);
    ctx.lineTo(f.A1.x, f.A1.y);
    ctx.stroke();
    ctx.setLineDash([r.px(6), r.px(4)]);
    ctx.lineWidth = r.px(1);
    const depth = Math.min(2.4, o.height);
    const a = add(f.A0, mul(nn, -(g.half + depth)));
    const b = add(f.A1, mul(nn, -(g.half + depth)));
    ctx.beginPath();
    ctx.moveTo(add(f.A0, mul(nn, -g.half)).x, add(f.A0, mul(nn, -g.half)).y);
    ctx.lineTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(add(f.A1, mul(nn, -g.half)).x, add(f.A1, mul(nn, -g.half)).y);
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }
  const leaves =
    o.style === 'double'
      ? [
          [f.s0, o.t, o.width / 2],
          [f.s1, o.t, o.width / 2],
        ]
      : [o.flipHinge ? [f.s1, f.s0, o.width] : [f.s0, f.s1, o.width]];
  for (const [hs, os, w] of leaves) {
    const H = add(pointOnWall(g, hs), mul(nn, g.half));
    const J = add(pointOnWall(g, os), mul(nn, g.half));
    const E = add(H, mul(nn, w));
    // полотно
    ctx.lineWidth = r.px(2.2);
    ctx.beginPath();
    ctx.moveTo(H.x, H.y);
    ctx.lineTo(E.x, E.y);
    ctx.stroke();
    // траектория открывания
    const a1 = Math.atan2(J.y - H.y, J.x - H.x);
    const a2 = Math.atan2(E.y - H.y, E.x - H.x);
    const ccw = cross(sub(J, H), sub(E, H)) < 0;
    ctx.lineWidth = r.px(1);
    ctx.setLineDash([r.px(3), r.px(3)]);
    ctx.beginPath();
    ctx.arc(H.x, H.y, dist(H, J), a1, a2, ccw);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawArch(ctx, r, g, f) {
  ctx.setLineDash([r.px(5), r.px(4)]);
  ctx.lineWidth = r.px(1);
  ctx.strokeStyle = THEME.ink;
  ctx.beginPath();
  for (const k of [g.half, -g.half]) {
    const a = add(f.A0, mul(g.n, k));
    const b = add(f.A1, mul(g.n, k));
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}
