import { THEME } from './theme.js';

const STEPS = [
  [0.1, 1],
  [0.5, 5],
  [1, 5],
  [5, 25],
  [10, 50],
  [50, 250],
];

/** Адаптивная сетка: мелкий шаг всегда не меньше ~9 px. */
export function drawGrid(ctx, r) {
  const vp = r.vp;
  const tl = vp.toWorld({ x: 0, y: 0 });
  const br = vp.toWorld({ x: vp.width, y: vp.height });
  const [minor, major] = STEPS.find(([s]) => s * vp.scale >= 9) || STEPS[STEPS.length - 1];

  const lines = (step, color, width) => {
    ctx.beginPath();
    const x0 = Math.floor(tl.x / step) * step;
    const y0 = Math.floor(tl.y / step) * step;
    for (let x = x0; x <= br.x; x += step) {
      ctx.moveTo(x, tl.y);
      ctx.lineTo(x, br.y);
    }
    for (let y = y0; y <= br.y; y += step) {
      ctx.moveTo(tl.x, y);
      ctx.lineTo(br.x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = r.px(width);
    ctx.stroke();
  };
  lines(minor, THEME.gridMinor, 1);
  lines(major, THEME.gridMajor, 1);
}
