/**
 * Условные обозначения мебели и объектов участка (вид сверху).
 * Каждое обозначение рисуется в локальных координатах объекта:
 * центр в (0,0), ширина по X, глубина по Y, «спинка» — сторона −Y.
 */
import { THEME, tint, shade } from './theme.js';

const TAU = Math.PI * 2;

function rr(ctx, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.001, r), 0, TAU);
}

function line(ctx, x0, y0, x1, y1) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function fs(ctx) {
  ctx.fill();
  ctx.stroke();
}

/** Волнистая крона дерева / куста. */
function scallop(ctx, r, bumps, jitter = 0.08) {
  ctx.beginPath();
  for (let i = 0; i <= bumps; i++) {
    const a = (i / bumps) * TAU;
    const rr2 = r * (1 - jitter * ((i * 7) % 3) / 2);
    const x = Math.cos(a) * rr2;
    const y = Math.sin(a) * rr2;
    if (i === 0) ctx.moveTo(x, y);
    else {
      const am = ((i - 0.5) / bumps) * TAU;
      ctx.quadraticCurveTo(Math.cos(am) * r * 1.12, Math.sin(am) * r * 1.12, x, y);
    }
  }
  ctx.closePath();
}

const SYMBOLS = {
  sofa(ctx, w, d) {
    const back = Math.min(0.24, d * 0.28);
    const arm = Math.min(0.22, w * 0.12);
    rr(ctx, -w / 2, -d / 2, w, d, 0.06);
    fs(ctx);
    rr(ctx, -w / 2, -d / 2, w, back, 0.05);
    fs(ctx);
    rr(ctx, -w / 2, -d / 2, arm, d, 0.05);
    fs(ctx);
    rr(ctx, w / 2 - arm, -d / 2, arm, d, 0.05);
    fs(ctx);
    const seats = w > 1.6 ? 3 : 2;
    const sw = (w - arm * 2) / seats;
    for (let i = 1; i < seats; i++) line(ctx, -w / 2 + arm + sw * i, -d / 2 + back, -w / 2 + arm + sw * i, d / 2 - 0.05);
  },
  sofa_corner(ctx, w, d) {
    const depth = Math.min(0.95, d * 0.6, w * 0.45);
    ctx.beginPath();
    ctx.moveTo(-w / 2, -d / 2);
    ctx.lineTo(w / 2, -d / 2);
    ctx.lineTo(w / 2, -d / 2 + depth);
    ctx.lineTo(-w / 2 + depth, -d / 2 + depth);
    ctx.lineTo(-w / 2 + depth, d / 2);
    ctx.lineTo(-w / 2, d / 2);
    ctx.closePath();
    fs(ctx);
    const back = 0.22;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + back, d / 2);
    ctx.lineTo(-w / 2 + back, -d / 2 + back);
    ctx.lineTo(w / 2 - back, -d / 2 + back);
    ctx.lineTo(w / 2 - back, -d / 2 + depth);
    ctx.stroke();
    line(ctx, -w / 2 + depth, -d / 2 + back, -w / 2 + depth, -d / 2 + depth);
    line(ctx, (-w / 2 + depth + w / 2) / 2, -d / 2 + back, (-w / 2 + depth + w / 2) / 2, -d / 2 + depth);
  },
  armchair(ctx, w, d) {
    const back = Math.min(0.22, d * 0.26);
    const arm = Math.min(0.18, w * 0.2);
    rr(ctx, -w / 2, -d / 2, w, d, 0.08);
    fs(ctx);
    rr(ctx, -w / 2, -d / 2, w, back, 0.06);
    fs(ctx);
    rr(ctx, -w / 2, -d / 2, arm, d, 0.06);
    fs(ctx);
    rr(ctx, w / 2 - arm, -d / 2, arm, d, 0.06);
    fs(ctx);
  },
  coffee_table(ctx, w, d) {
    rr(ctx, -w / 2, -d / 2, w, d, 0.05);
    fs(ctx);
    rr(ctx, -w / 2 + 0.06, -d / 2 + 0.06, w - 0.12, d - 0.12, 0.03);
    ctx.stroke();
  },
  tv_stand(ctx, w, d) {
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    fs(ctx);
    const prev = ctx.fillStyle;
    ctx.fillStyle = '#2b2e33';
    rr(ctx, -w * 0.4, -d / 2 + 0.06, w * 0.8, 0.07, 0.02);
    ctx.fill();
    ctx.fillStyle = prev;
  },
  bookshelf(ctx, w, d) {
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    fs(ctx);
    const n = Math.max(2, Math.round(w / 0.4));
    for (let i = 1; i < n; i++) line(ctx, -w / 2 + (w / n) * i, -d / 2, -w / 2 + (w / n) * i, d / 2);
  },
  rug(ctx, w, d) {
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    fs(ctx);
    ctx.beginPath();
    ctx.rect(-w / 2 + 0.1, -d / 2 + 0.1, w - 0.2, d - 0.2);
    ctx.stroke();
    const n = Math.max(4, Math.round(d / 0.08));
    for (let i = 0; i <= n; i++) {
      const y = -d / 2 + (d / n) * i;
      line(ctx, -w / 2 - 0.05, y, -w / 2, y);
      line(ctx, w / 2, y, w / 2 + 0.05, y);
    }
  },
  fireplace(ctx, w, d) {
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    fs(ctx);
    ctx.beginPath();
    ctx.moveTo(-w * 0.3, d / 2);
    ctx.lineTo(-w * 0.2, -d / 2 + 0.12);
    ctx.lineTo(w * 0.2, -d / 2 + 0.12);
    ctx.lineTo(w * 0.3, d / 2);
    const prev = ctx.fillStyle;
    ctx.fillStyle = '#3a2f2a';
    ctx.fill();
    ctx.fillStyle = prev;
  },
  plant(ctx, w) {
    const r = w / 2;
    const prev = ctx.fillStyle;
    ctx.fillStyle = 'rgba(94, 143, 78, 0.55)';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.5, r * 0.22, a, 0, TAU);
      fs(ctx);
    }
    ctx.fillStyle = prev;
    circle(ctx, 0, 0, r * 0.28);
    fs(ctx);
  },
  bed_double(ctx, w, d) {
    bed(ctx, w, d, 2);
  },
  bed_single(ctx, w, d) {
    bed(ctx, w, d, 1);
  },
  crib(ctx, w, d) {
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    fs(ctx);
    const n = Math.max(4, Math.round(d / 0.1));
    for (let i = 1; i < n; i++) {
      const y = -d / 2 + (d / n) * i;
      line(ctx, -w / 2, y, -w / 2 + 0.05, y);
      line(ctx, w / 2 - 0.05, y, w / 2, y);
    }
  },
  nightstand(ctx, w, d) {
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    fs(ctx);
    circle(ctx, 0, 0, Math.min(w, d) * 0.22);
    ctx.stroke();
  },
  wardrobe(ctx, w, d) {
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    fs(ctx);
    ctx.save();
    ctx.setLineDash([0.08, 0.05]);
    line(ctx, -w / 2 + 0.05, 0, w / 2 - 0.05, 0);
    ctx.restore();
    const n = Math.max(1, Math.round(w / 0.55));
    for (let i = 1; i < n; i++) line(ctx, -w / 2 + (w / n) * i, d / 2 - 0.04, -w / 2 + (w / n) * i, d / 2);
    for (let i = 0; i < Math.round(w / 0.12); i++) {
      const x = -w / 2 + 0.1 + i * 0.12;
      if (x > w / 2 - 0.08) break;
      line(ctx, x - 0.03, -d * 0.18, x + 0.03, d * 0.18);
    }
  },
  dresser(ctx, w, d) {
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    fs(ctx);
    line(ctx, -w / 2, d / 2 - 0.06, w / 2, d / 2 - 0.06);
    line(ctx, 0, -d / 2, 0, d / 2);
  },
  desk(ctx, w, d) {
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    fs(ctx);
    ctx.beginPath();
    ctx.rect(-w * 0.18, -d / 2 + 0.06, w * 0.36, 0.05);
    ctx.stroke();
  },
  office_chair(ctx, w, d) {
    circle(ctx, 0, 0.03, Math.min(w, d) * 0.38);
    fs(ctx);
    ctx.beginPath();
    ctx.arc(0, 0.03, Math.min(w, d) * 0.46, Math.PI * 1.15, Math.PI * 1.85);
    ctx.lineWidth *= 2.2;
    ctx.stroke();
    ctx.lineWidth /= 2.2;
  },
  kitchen_counter(ctx, w, d) {
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    fs(ctx);
    line(ctx, -w / 2, d / 2 - 0.04, w / 2, d / 2 - 0.04);
    const n = Math.max(1, Math.round(w / 0.6));
    for (let i = 1; i < n; i++) line(ctx, -w / 2 + (w / n) * i, d / 2 - 0.04, -w / 2 + (w / n) * i, d / 2);
  },
  kitchen_sink(ctx, w, d) {
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    fs(ctx);
    rr(ctx, -w * 0.38, -d * 0.3, w * 0.76, d * 0.6, 0.06);
    ctx.stroke();
    circle(ctx, 0, 0, 0.025);
    ctx.stroke();
    circle(ctx, 0, -d * 0.38, 0.02);
    ctx.stroke();
  },
  stove(ctx, w, d) {
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    fs(ctx);
    const r = Math.min(w, d) * 0.14;
    for (const [x, y] of [
      [-w / 4, -d / 4],
      [w / 4, -d / 4],
      [-w / 4, d / 4],
      [w / 4, d / 4],
    ]) {
      circle(ctx, x, y, r);
      ctx.stroke();
    }
  },
  fridge(ctx, w, d) {
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    fs(ctx);
    line(ctx, -w / 2, d / 2 - 0.06, w / 2, d / 2 - 0.06);
    line(ctx, -w / 2, -d / 2, w / 2, d / 2 - 0.06);
    line(ctx, w / 2, -d / 2, -w / 2, d / 2 - 0.06);
  },
  kitchen_island(ctx, w, d) {
    rr(ctx, -w / 2, -d / 2, w, d, 0.04);
    fs(ctx);
    rr(ctx, -w / 2 + 0.05, -d / 2 + 0.05, w - 0.1, d - 0.1, 0.03);
    ctx.stroke();
  },
  dining_table(ctx, w, d) {
    rr(ctx, -w / 2, -d / 2, w, d, 0.05);
    fs(ctx);
  },
  round_table(ctx, w, d) {
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, d / 2, 0, 0, TAU);
    fs(ctx);
  },
  chair(ctx, w, d) {
    rr(ctx, -w / 2, -d / 2 + d * 0.15, w, d * 0.85, 0.04);
    fs(ctx);
    rr(ctx, -w / 2, -d / 2, w, d * 0.15, 0.03);
    fs(ctx);
  },
  toilet(ctx, w, d) {
    const tank = Math.min(0.2, d * 0.3);
    rr(ctx, -w / 2, -d / 2, w, tank, 0.03);
    fs(ctx);
    ctx.beginPath();
    ctx.ellipse(0, -d / 2 + tank + (d - tank) / 2, w * 0.42, (d - tank) / 2, 0, 0, TAU);
    fs(ctx);
    ctx.beginPath();
    ctx.ellipse(0, -d / 2 + tank + (d - tank) / 2 + 0.02, w * 0.28, (d - tank) / 2 - 0.07, 0, 0, TAU);
    ctx.stroke();
  },
  bathtub(ctx, w, d) {
    rr(ctx, -w / 2, -d / 2, w, d, 0.06);
    fs(ctx);
    rr(ctx, -w / 2 + 0.08, -d / 2 + 0.08, w - 0.16, d - 0.16, Math.min(0.25, d * 0.3));
    ctx.stroke();
    circle(ctx, -w / 2 + 0.25, 0, 0.03);
    ctx.stroke();
  },
  shower(ctx, w, d) {
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    fs(ctx);
    line(ctx, -w / 2, -d / 2, w / 2, d / 2);
    line(ctx, w / 2, -d / 2, -w / 2, d / 2);
    circle(ctx, 0, 0, 0.04);
    ctx.stroke();
  },
  washbasin(ctx, w, d) {
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, Math.min(0.08, d * 0.2));
    fs(ctx);
    ctx.beginPath();
    ctx.ellipse(0, -d / 2 + 0.08, w / 2, d - 0.08, 0, 0, Math.PI);
    fs(ctx);
    ctx.beginPath();
    ctx.ellipse(0, -d / 2 + 0.1, w * 0.34, (d - 0.08) * 0.7, 0, 0, Math.PI);
    ctx.stroke();
  },
  washing_machine(ctx, w, d) {
    rr(ctx, -w / 2, -d / 2, w, d, 0.03);
    fs(ctx);
    circle(ctx, 0, 0.03, Math.min(w, d) * 0.3);
    ctx.stroke();
  },
  boiler(ctx, w, d) {
    rr(ctx, -w / 2, -d / 2, w, d, 0.03);
    fs(ctx);
    circle(ctx, 0, 0, Math.min(w, d) * 0.22);
    ctx.stroke();
  },
  box(ctx, w, d) {
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    fs(ctx);
    ctx.save();
    ctx.globalAlpha *= 0.4;
    line(ctx, -w / 2, -d / 2, w / 2, d / 2);
    line(ctx, w / 2, -d / 2, -w / 2, d / 2);
    ctx.restore();
  },
  column(ctx, w, d) {
    const prev = ctx.fillStyle;
    ctx.fillStyle = THEME.wallInt;
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    fs(ctx);
    ctx.fillStyle = prev;
  },
  piano(ctx, w, d) {
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    fs(ctx);
    const prev = ctx.fillStyle;
    ctx.fillStyle = '#f4f2ee';
    ctx.beginPath();
    ctx.rect(-w / 2 + 0.05, d / 2 - 0.18, w - 0.1, 0.14);
    fs(ctx);
    ctx.fillStyle = prev;
  },
  treadmill(ctx, w, d) {
    rr(ctx, -w / 2, -d / 2, w, d, 0.06);
    fs(ctx);
    const prev = ctx.fillStyle;
    ctx.fillStyle = '#2b2e33';
    rr(ctx, -w * 0.32, -d / 2 + 0.35, w * 0.64, d - 0.5, 0.03);
    ctx.fill();
    ctx.fillStyle = prev;
  },

  // ── Участок ──
  tree(ctx, w, d, color) {
    const r = Math.min(w, d) / 2;
    ctx.fillStyle = withA(color, 0.55);
    ctx.strokeStyle = shade(color, 0.35);
    scallop(ctx, r, 14);
    fs(ctx);
    scallop(ctx, r * 0.55, 9);
    ctx.stroke();
    ctx.fillStyle = shade(color, 0.45);
    circle(ctx, 0, 0, Math.max(0.08, r * 0.07));
    ctx.fill();
  },
  fruit_tree(ctx, w, d, color) {
    SYMBOLS.tree(ctx, w, d, color);
    ctx.fillStyle = '#c8433a';
    const r = Math.min(w, d) / 2;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.4;
      circle(ctx, Math.cos(a) * r * 0.65, Math.sin(a) * r * 0.65, 0.09);
      ctx.fill();
    }
  },
  conifer(ctx, w, d, color) {
    const r = Math.min(w, d) / 2;
    ctx.fillStyle = withA(color, 0.6);
    ctx.strokeStyle = shade(color, 0.35);
    ctx.beginPath();
    const n = 18;
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * TAU;
      const rr2 = i % 2 ? r * 0.72 : r;
      if (i === 0) ctx.moveTo(Math.cos(a) * rr2, Math.sin(a) * rr2);
      else ctx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2);
    }
    ctx.closePath();
    fs(ctx);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      line(ctx, 0, 0, Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75);
    }
  },
  bush(ctx, w, d, color) {
    const r = Math.min(w, d) / 2;
    ctx.fillStyle = withA(color, 0.6);
    ctx.strokeStyle = shade(color, 0.35);
    scallop(ctx, r, 9, 0.15);
    fs(ctx);
  },
  flowerbed(ctx, w, d, color) {
    ctx.fillStyle = tint('#8a6a4f', 0.35);
    rr(ctx, -w / 2, -d / 2, w, d, Math.min(w, d) * 0.4);
    fs(ctx);
    const colors = [color, '#f0c94d', '#e8e4f0', '#c45b8a'];
    let k = 0;
    for (let x = -w / 2 + 0.2; x < w / 2 - 0.1; x += 0.25) {
      for (let y = -d / 2 + 0.2; y < d / 2 - 0.1; y += 0.25) {
        ctx.fillStyle = colors[k++ % colors.length];
        circle(ctx, x, y, 0.06);
        ctx.fill();
      }
    }
  },
  garden_bed(ctx, w, d, color) {
    ctx.fillStyle = tint(color, 0.25);
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    fs(ctx);
    ctx.fillStyle = '#6c9a4c';
    const rows = Math.max(1, Math.round(d / 0.4));
    for (let i = 0; i < rows; i++) {
      const y = -d / 2 + (d / rows) * (i + 0.5);
      for (let x = -w / 2 + 0.15; x < w / 2 - 0.1; x += 0.3) {
        circle(ctx, x, y, 0.07);
        ctx.fill();
      }
    }
  },
  greenhouse(ctx, w, d) {
    ctx.fillStyle = 'rgba(190, 225, 238, 0.55)';
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    fs(ctx);
    const n = Math.max(2, Math.round(d / 1));
    for (let i = 1; i < n; i++) line(ctx, -w / 2, -d / 2 + (d / n) * i, w / 2, -d / 2 + (d / n) * i);
    line(ctx, 0, -d / 2, 0, d / 2);
  },
  gazebo(ctx, w, d) {
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    fs(ctx);
    line(ctx, -w / 2, -d / 2, w / 2, d / 2);
    line(ctx, w / 2, -d / 2, -w / 2, d / 2);
    for (const [x, y] of [
      [-w / 2 + 0.12, -d / 2 + 0.12],
      [w / 2 - 0.12, -d / 2 + 0.12],
      [w / 2 - 0.12, d / 2 - 0.12],
      [-w / 2 + 0.12, d / 2 - 0.12],
    ]) {
      ctx.beginPath();
      ctx.rect(x - 0.07, y - 0.07, 0.14, 0.14);
      ctx.stroke();
    }
  },
  bench(ctx, w, d) {
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2 + d * 0.25, w, d * 0.75);
    fs(ctx);
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d * 0.18);
    fs(ctx);
  },
  bbq(ctx, w, d) {
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    fs(ctx);
    for (let x = -w / 2 + 0.1; x < w / 2; x += 0.1) line(ctx, x, -d / 2 + 0.05, x, d / 2 - 0.05);
  },
  pool(ctx, w, d, color) {
    ctx.fillStyle = tint('#d9d4c9', 0.2);
    rr(ctx, -w / 2, -d / 2, w, d, 0.15);
    fs(ctx);
    ctx.fillStyle = withA(color, 0.75);
    rr(ctx, -w / 2 + 0.25, -d / 2 + 0.25, w - 0.5, d - 0.5, 0.1);
    fs(ctx);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    for (let i = 1; i < 4; i++) {
      const y = -d / 2 + (d / 4) * i;
      ctx.beginPath();
      for (let x = -w / 2 + 0.4; x <= w / 2 - 0.4; x += 0.1) {
        const yy = y + Math.sin(x * 4) * 0.05;
        if (x === -w / 2 + 0.4) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  },
  car(ctx, w, d, color) {
    ctx.fillStyle = tint(color, 0.25);
    rr(ctx, -w / 2, -d / 2, w, d, Math.min(0.35, d * 0.25));
    fs(ctx);
    ctx.fillStyle = 'rgba(40, 50, 60, 0.55)';
    // лобовое и заднее стекло (капот — к +X)
    ctx.beginPath();
    ctx.moveTo(w * 0.18, -d * 0.36);
    ctx.lineTo(w * 0.3, -d * 0.42);
    ctx.lineTo(w * 0.3, d * 0.42);
    ctx.lineTo(w * 0.18, d * 0.36);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-w * 0.28, -d * 0.34);
    ctx.lineTo(-w * 0.36, -d * 0.38);
    ctx.lineTo(-w * 0.36, d * 0.38);
    ctx.lineTo(-w * 0.28, d * 0.34);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.rect(-w * 0.28, -d * 0.36, w * 0.46, d * 0.72);
    ctx.stroke();
  },
  playground(ctx, w, d) {
    ctx.fillStyle = 'rgba(232, 208, 150, 0.6)';
    rr(ctx, -w / 2, -d / 2, w, d, 0.2);
    fs(ctx);
    ctx.fillStyle = '#e2a446';
    ctx.beginPath();
    ctx.rect(-w * 0.35, -d * 0.3, w * 0.25, d * 0.25);
    fs(ctx);
    ctx.beginPath();
    ctx.rect(-w * 0.1, -d * 0.24, w * 0.4, d * 0.13);
    fs(ctx);
    circle(ctx, w * 0.25, d * 0.22, Math.min(w, d) * 0.14);
    ctx.stroke();
  },
  well(ctx, w) {
    circle(ctx, 0, 0, w / 2);
    fs(ctx);
    ctx.fillStyle = 'rgba(60, 100, 140, 0.6)';
    circle(ctx, 0, 0, w * 0.32);
    fs(ctx);
  },
};

function bed(ctx, w, d, pillows) {
  ctx.beginPath();
  ctx.rect(-w / 2, -d / 2, w, d);
  fs(ctx);
  const head = 0.08;
  const prev = ctx.fillStyle;
  ctx.fillStyle = shade('#c8b296', 0.05);
  ctx.beginPath();
  ctx.rect(-w / 2, -d / 2, w, head);
  fs(ctx);
  ctx.fillStyle = '#fbfaf8';
  const pw = (w - 0.12 - (pillows - 1) * 0.06) / pillows;
  for (let i = 0; i < pillows; i++) {
    rr(ctx, -w / 2 + 0.06 + i * (pw + 0.06), -d / 2 + head + 0.05, pw, Math.min(0.32, d * 0.16), 0.06);
    fs(ctx);
  }
  ctx.fillStyle = prev;
  const fold = -d / 2 + d * 0.36;
  line(ctx, -w / 2, fold, w / 2, fold);
  ctx.beginPath();
  ctx.moveTo(w / 2, fold);
  ctx.lineTo(w / 2 - Math.min(0.35, w * 0.3), fold + 0.18);
  ctx.lineTo(w / 2, fold + 0.22);
  ctx.stroke();
}

function withA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/**
 * Рисует объект в мировых координатах.
 * @param r — рендерер (для толщины линий в пикселях); может быть null (иконки каталога)
 */
export function drawItemSymbol(ctx, item, lineWidth, { alpha = 1 } = {}) {
  ctx.save();
  ctx.translate(item.x, item.y);
  ctx.rotate(((item.rotation || 0) * Math.PI) / 180);
  ctx.globalAlpha *= alpha;
  ctx.lineWidth = lineWidth;
  ctx.fillStyle = tint(item.color || '#c9c3b8', 0.55);
  ctx.strokeStyle = THEME.itemStroke;
  const fn = SYMBOLS[item.type] || SYMBOLS.box;
  fn(ctx, item.w, item.d, item.color || '#8dbb6e');
  ctx.restore();
}

export function hasSymbol(type) {
  return !!SYMBOLS[type];
}
