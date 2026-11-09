/**
 * Условные обозначения инженерии на плане (электрика, сантехника, отопление).
 * Локальные координаты: центр (0,0), ширина по X, «спина» к стене — сторона −Y.
 * Мелкие значки рисуются не меньше нескольких пикселей (planRect).
 */
import { THEME } from './theme.js';
import { LAYER_COLORS, itemLayer, planRect } from '../../model/layers.js';

const TAU = Math.PI * 2;
let turn = 0; // поворот значка — буквы держим прямо

function line(ctx, x0, y0, x1, y1) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.001, r), 0, TAU);
}

/** Полукруг плоской стороной к стене. */
function halfDisc(ctx, y, r) {
  ctx.beginPath();
  ctx.moveTo(-r, y);
  ctx.arc(0, y, r, 0, Math.PI, false);
  ctx.closePath();
}

/** Буквы внутри значка: шрифт в пикселях, масштаб — под размер. */
function letter(ctx, text, size) {
  ctx.save();
  const k = size / 10;
  ctx.rotate(-turn);
  ctx.scale(k, k);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.font = '600 10px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0.6);
  ctx.restore();
}

function socketBase(ctx, w, d, ticks, bar = false) {
  const r = Math.min(w / 2, d * 0.95);
  const y = -d / 2;
  halfDisc(ctx, y, r);
  ctx.fill();
  ctx.stroke();
  const len = r * 0.55;
  for (let i = 0; i < ticks; i++) {
    const x = ticks === 1 ? 0 : (i - (ticks - 1) / 2) * r * 0.7;
    line(ctx, x, y + r, x, y + r + len);
  }
  if (bar) line(ctx, -r * 0.6, y + r + len, r * 0.6, y + r + len);
}

export const MEP_SYMBOLS = {
  socket(ctx, w, d) {
    socketBase(ctx, w, d, 1);
  },
  socket_double(ctx, w, d) {
    socketBase(ctx, w, d, 2);
  },
  socket_kitchen(ctx, w, d) {
    socketBase(ctx, w, d, 1, true);
  },
  switch(ctx, w, d) {
    const r = Math.min(w, d) * 0.26;
    const cy = -d / 2 + r * 1.2;
    circle(ctx, 0, cy, r);
    ctx.fill();
    ctx.stroke();
    const ex = r * 2.2;
    const ey = cy + r * 2;
    line(ctx, r * 0.7, cy + r * 0.7, ex, ey);
    line(ctx, ex, ey, ex - r * 0.9, ey + r * 0.5);
  },
  ceiling_light(ctx, w, d) {
    const r = Math.min(w, d) / 2;
    circle(ctx, 0, 0, r);
    ctx.fill();
    ctx.stroke();
    const k = r * 0.7071;
    line(ctx, -k, -k, k, k);
    line(ctx, -k, k, k, -k);
  },
  spot_light(ctx, w, d) {
    const r = Math.min(w, d) / 2;
    circle(ctx, 0, 0, r);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    circle(ctx, 0, 0, r * 0.38);
    ctx.fill();
  },
  wall_lamp(ctx, w, d) {
    const r = Math.min(w / 2, d * 0.95);
    halfDisc(ctx, -d / 2, r);
    ctx.fill();
    ctx.stroke();
    const k = r * 0.62;
    line(ctx, -k, -d / 2 + k * 0.1, k * 0.2, -d / 2 + k * 1.1);
    line(ctx, k, -d / 2 + k * 0.1, -k * 0.2, -d / 2 + k * 1.1);
  },
  el_panel(ctx, w, d) {
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(w / 2, -d / 2);
    ctx.lineTo(w / 2, d / 2);
    ctx.lineTo(-w / 2, d / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },
  water_point(ctx, w, d) {
    const r = Math.min(w / 2, d / 2);
    circle(ctx, 0, 0, r);
    ctx.fill();
    ctx.stroke();
    letter(ctx, 'В', r * 1.3);
  },
  sewer_point(ctx, w, d) {
    const r = Math.min(w / 2, d / 2);
    circle(ctx, 0, 0, r);
    ctx.fill();
    ctx.stroke();
    letter(ctx, 'К', r * 1.3);
  },
  floor_drain(ctx, w, d) {
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    ctx.fill();
    ctx.stroke();
    for (let i = 1; i < 4; i++) line(ctx, -w / 2 + (w / 4) * i, -d / 2 + d * 0.15, -w / 2 + (w / 4) * i, d / 2 - d * 0.15);
  },
  water_heater(ctx, w, d) {
    const r = Math.min(w, d) / 2;
    circle(ctx, 0, 0, r);
    ctx.fill();
    ctx.stroke();
    letter(ctx, 'ВН', r * 0.8);
  },
  radiator(ctx, w, d) {
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    ctx.fill();
    ctx.stroke();
    const n = Math.max(3, Math.round(w / 0.08));
    for (let i = 1; i < n; i++) line(ctx, -w / 2 + (w / n) * i, -d / 2, -w / 2 + (w / n) * i, d / 2);
  },
  towel_rail(ctx, w, d) {
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const x = -w / 2 + (w / n) * i;
      const y = i % 2 ? d / 2 - d * 0.2 : -d / 2 + d * 0.2;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
  },
};

/**
 * @param px метров в пикселе — для минимального размера значка (null — настоящий размер)
 */
export function drawMepSymbol(ctx, item, lineWidth, px, alpha = 1) {
  const r = planRect(item, px);
  const color = LAYER_COLORS[itemLayer(item)] || THEME.itemStroke;
  ctx.save();
  ctx.translate(r.x, r.y);
  turn = (r.rotation * Math.PI) / 180;
  ctx.rotate(turn);
  ctx.globalAlpha *= alpha;
  ctx.lineWidth = lineWidth * 1.15;
  ctx.strokeStyle = color;
  ctx.fillStyle = THEME.dark ? '#1d232a' : '#ffffff';
  MEP_SYMBOLS[item.type](ctx, r.w, r.d);
  ctx.restore();
}
