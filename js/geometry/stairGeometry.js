/**
 * Геометрия лестниц: ступени, контур (для проёма в перекрытии) и линия хода.
 * Локальная система: X — поперёк, Y — вдоль; подъём идёт от +Y к −Y.
 * Формы: straight (прямая), L (Г-образная), U (П-образная), spiral (винтовая).
 */
import { toWorld, circlePolygon } from '../core/geometry.js';

const RISER = 0.175; // комфортная высота ступени, м

export function stepCount(rise) {
  return Math.max(3, Math.round(rise / RISER));
}

const rect = (x0, y0, x1, y1) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

/**
 * @param stair — объект лестницы
 * @param rise  — полная высота подъёма (до пола следующего этажа)
 * @returns {{ steps: Array<{poly, top, landing?}>, outline, path, risers, riser }}
 */
export function stairLayout(stair, rise) {
  const n = stepCount(rise);
  const r = rise / n;
  const W = Math.max(0.5, stair.width);
  const L = Math.max(0.5, stair.length);
  const f = Math.min(stair.flight || 1, W, L);
  const sx = stair.flip ? -1 : 1;
  let steps = [];
  let outline;
  let path;

  if (stair.shape === 'L') {
    const run1 = Math.max(0.1, L - f);
    const run2 = Math.max(0.1, W - f);
    const n1 = Math.max(1, Math.round(((n - 1) * run1) / (run1 + run2)));
    const n2 = Math.max(1, n - 1 - n1);
    const x0 = -W / 2;
    const d1 = run1 / n1;
    for (let k = 0; k < n1; k++) {
      steps.push({ poly: rect(x0, L / 2 - k * d1, x0 + f, L / 2 - (k + 1) * d1), top: (k + 1) * r });
    }
    steps.push({ poly: rect(x0, -L / 2, x0 + f, -L / 2 + f), top: (n1 + 1) * r, landing: true });
    const d2 = run2 / n2;
    for (let k = 0; k < n2; k++) {
      steps.push({ poly: rect(x0 + f + k * d2, -L / 2, x0 + f + (k + 1) * d2, -L / 2 + f), top: (n1 + 2 + k) * r });
    }
    outline = [
      { x: -W / 2, y: L / 2 },
      { x: -W / 2, y: -L / 2 },
      { x: W / 2, y: -L / 2 },
      { x: W / 2, y: -L / 2 + f },
      { x: -W / 2 + f, y: -L / 2 + f },
      { x: -W / 2 + f, y: L / 2 },
    ];
    path = [
      { x: x0 + f / 2, y: L / 2 - 0.15 },
      { x: x0 + f / 2, y: -L / 2 + f / 2 },
      { x: W / 2 - 0.15, y: -L / 2 + f / 2 },
    ];
  } else if (stair.shape === 'U') {
    const run = Math.max(0.1, L - f);
    const n1 = Math.max(1, Math.floor((n - 1) / 2));
    const n2 = Math.max(1, n - 1 - n1);
    const d1 = run / n1;
    const d2 = run / n2;
    for (let k = 0; k < n1; k++) {
      steps.push({ poly: rect(-W / 2, L / 2 - k * d1, -W / 2 + f, L / 2 - (k + 1) * d1), top: (k + 1) * r });
    }
    steps.push({ poly: rect(-W / 2, -L / 2, W / 2, -L / 2 + f), top: (n1 + 1) * r, landing: true });
    for (let k = 0; k < n2; k++) {
      const y0 = -L / 2 + f + k * d2;
      steps.push({ poly: rect(W / 2 - f, y0, W / 2, y0 + d2), top: (n1 + 2 + k) * r });
    }
    outline = rect(-W / 2, -L / 2, W / 2, L / 2);
    path = [
      { x: -W / 2 + f / 2, y: L / 2 - 0.15 },
      { x: -W / 2 + f / 2, y: -L / 2 + f / 2 },
      { x: W / 2 - f / 2, y: -L / 2 + f / 2 },
      { x: W / 2 - f / 2, y: L / 2 - 0.15 },
    ];
  } else if (stair.shape === 'spiral') {
    const R = W / 2;
    const r0 = 0.1;
    const stepAngle = Math.min((2 * Math.PI) / n, (24 * Math.PI) / 180);
    const start = Math.PI / 2; // начало внизу (+Y)
    path = [];
    for (let k = 0; k < n; k++) {
      const a0 = start - k * stepAngle;
      const a1 = start - (k + 1) * stepAngle;
      const poly = [];
      const seg = 4;
      for (let s = 0; s <= seg; s++) {
        const a = a0 + ((a1 - a0) * s) / seg;
        poly.push({ x: Math.cos(a) * R, y: Math.sin(a) * R });
      }
      poly.push({ x: Math.cos(a1) * r0, y: Math.sin(a1) * r0 });
      poly.push({ x: Math.cos(a0) * r0, y: Math.sin(a0) * r0 });
      steps.push({ poly, top: (k + 1) * r, thin: true });
      const am = (a0 + a1) / 2;
      path.push({ x: Math.cos(am) * R * 0.62, y: Math.sin(am) * R * 0.62 });
    }
    outline = circlePolygon(0, 0, R, 32);
  } else {
    const d = L / n;
    for (let k = 0; k < n; k++) {
      steps.push({ poly: rect(-W / 2, L / 2 - k * d, W / 2, L / 2 - (k + 1) * d), top: (k + 1) * r });
    }
    outline = rect(-W / 2, -L / 2, W / 2, L / 2);
    path = [
      { x: 0, y: L / 2 - 0.15 },
      { x: 0, y: -L / 2 + 0.2 },
    ];
  }

  const T = (p) => toWorld({ x: p.x * sx, y: p.y }, stair.x, stair.y, stair.rotation || 0);
  const fix = (poly) => (sx < 0 ? poly.map(T).reverse() : poly.map(T));
  steps = steps.map((s) => ({ ...s, poly: fix(s.poly) }));
  return {
    steps,
    outline: fix(outline),
    path: path.map(T),
    risers: n,
    riser: r,
  };
}
