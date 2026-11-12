/** Условные обозначения дверей, окон и проёмов в разрезе стены. */
import { THEME } from './theme.js';
import { add, mul, sub, cross, dist } from '../../core/geometry.js';
import { pointOnWall } from '../../geometry/wallGeometry.js';
import { openingsByWall } from './drawWalls.js';
import { openingLook } from '../../model/openings.js';

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
  const look = openingLook(o);
  ctx.strokeStyle = THEME.ink;
  const at = (s, k = 0) => add(pointOnWall(g, s), mul(g.n, k));
  const seg = (s0, s1, k = 0) => {
    const a = at(s0, k);
    const b = at(s1, k);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };
  // боковое остекление — как узкое окно рядом с дверью
  const d0 = f.s0 + look.side.left;
  const d1 = f.s1 - look.side.right;
  for (const [a, b] of [
    [f.s0, d0],
    [d1, f.s1],
  ]) {
    if (b - a < 0.05) continue;
    r.path(ctx, [at(a, g.half), at(b, g.half), at(b, -g.half), at(a, -g.half)]);
    ctx.fillStyle = THEME.windowFill;
    ctx.fill();
    ctx.lineWidth = r.px(1);
    ctx.stroke();
    seg(a, b);
  }
  const width = d1 - d0;
  const glass = look.glass === 'full';
  // стеклянное полотно — цветом стекла, остальные — чернилами
  const leafStroke = () => {
    ctx.strokeStyle = glass ? THEME.accent : THEME.ink;
    ctx.lineWidth = r.px(glass ? 1.6 : 2.2);
  };

  if (o.style === 'sliding') {
    leafStroke();
    ctx.lineWidth = r.px(2.5);
    const off = Math.min(g.half * 0.4, 0.04);
    const mid = (d0 + d1) / 2;
    seg(d0, mid + 0.05, off);
    seg(mid - 0.05, d1, -off);
    return;
  }
  if (o.style === 'fold') {
    // гармошка: сложенные панели зигзагом у косяка и пунктир хода
    const n = width > 1.5 ? 4 : 2;
    const pw = width / n;
    const hs = o.flipHinge ? d1 : d0;
    const dir = o.flipHinge ? -1 : 1;
    leafStroke();
    ctx.beginPath();
    let p = add(pointOnWall(g, hs), mul(nn, g.half));
    ctx.moveTo(p.x, p.y);
    for (let i = 0; i < n; i++) {
      // панели стоят почти поперёк стены, чуть «ёлочкой»
      const along = dir * pw * 0.22;
      const out = pw * 0.97 * (i % 2 ? -1 : 1);
      p = add(add(p, mul(g.d, along)), mul(nn, out));
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.strokeStyle = THEME.ink;
    ctx.lineWidth = r.px(1);
    ctx.setLineDash([r.px(3), r.px(3)]);
    seg(d0, d1, sgn * g.half);
    ctx.setLineDash([]);
    return;
  }
  if (o.style === 'garage' || o.style === 'garage_roll') {
    ctx.lineWidth = r.px(2.5);
    seg(f.s0, f.s1);
    ctx.setLineDash([r.px(6), r.px(4)]);
    ctx.lineWidth = r.px(1);
    // секционные уходят под потолок гаража; рулонные сматываются в короб над проёмом
    const depth = o.style === 'garage_roll' ? 0.3 : Math.min(2.4, o.height);
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
  const mid = (d0 + d1) / 2;
  const leaves =
    o.style === 'double' || o.style === 'garage_swing'
      ? [
          [d0, mid, width / 2],
          [d1, mid, width / 2],
        ]
      : [o.flipHinge ? [d1, d0, width] : [d0, d1, width]];
  for (const [hs, os, w] of leaves) {
    const H = add(pointOnWall(g, hs), mul(nn, g.half));
    const J = add(pointOnWall(g, os), mul(nn, g.half));
    const E = add(H, mul(nn, w));
    // полотно
    leafStroke();
    ctx.beginPath();
    ctx.moveTo(H.x, H.y);
    ctx.lineTo(E.x, E.y);
    ctx.stroke();
    // траектория открывания
    const a1 = Math.atan2(J.y - H.y, J.x - H.x);
    const a2 = Math.atan2(E.y - H.y, E.x - H.x);
    const ccw = cross(sub(J, H), sub(E, H)) < 0;
    ctx.strokeStyle = THEME.ink;
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
