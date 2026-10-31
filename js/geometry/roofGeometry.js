/**
 * Геометрия крыш по прямоугольнику дома (центр, ширина, глубина, поворот).
 * Конёк идёт вдоль локальной оси X (ширины). Для смены направления — повернуть на 90°.
 *
 * Возвращает:
 *  surfaces — скаты (3D-многоугольники {x,y,z}, где y — высота, z — координата плана Y);
 *  gables   — фронтоны / стенки под скатами (3D-многоугольники);
 *  plan     — линии для 2D: контур с учётом свеса, конёк и рёбра вальм;
 *  peak     — высота конька над базой.
 */
import { DEG, toWorld } from '../core/geometry.js';

export function roofGeometry(roof, baseHeight) {
  const w = Math.max(0.5, roof.w);
  const d = Math.max(0.5, roof.d);
  const o = Math.max(0, roof.overhang ?? 0.5);
  const t = Math.tan(Math.max(0, Math.min(70, roof.pitch ?? 30)) * DEG);
  const H = baseHeight;
  const X = w / 2 + o;
  const Y = d / 2 + o;

  // локальная точка (x, y плана, h высота) → мировая 3D
  const P = (x, y, h) => {
    const p = toWorld({ x, y }, roof.x, roof.y, roof.rotation || 0);
    return { x: p.x, y: h, z: p.y };
  };
  const L2 = (x, y) => toWorld({ x, y }, roof.x, roof.y, roof.rotation || 0);

  const surfaces = [];
  const gables = [];
  // фронтоны чуть ниже кровли, чтобы не совпадать со скатом (иначе мерцание)
  const G = 0.24;
  const lines = [];
  const outline = [L2(-X, -Y), L2(X, -Y), L2(X, Y), L2(-X, Y)];
  let peak = 0;

  if (roof.type === 'flat') {
    const th = 0.25;
    surfaces.push({ flat: true, poly: [P(-X, -Y, H + th), P(X, -Y, H + th), P(X, Y, H + th), P(-X, Y, H + th)], thickness: th });
    peak = th;
  } else if (roof.type === 'shed') {
    const zLow = H - o * t;
    const zHigh = H + (d + o) * t;
    surfaces.push({ poly: [P(-X, -Y, zLow), P(X, -Y, zLow), P(X, Y, zHigh), P(-X, Y, zHigh)] });
    const top = H + d * t - G;
    if (top > H + 0.05) {
      for (const x of [-w / 2, w / 2]) gables.push([P(x, -d / 2 + G / Math.max(t, 0.01), H), P(x, d / 2, H), P(x, d / 2, top)]);
      gables.push([P(-w / 2, d / 2, H), P(w / 2, d / 2, H), P(w / 2, d / 2, top), P(-w / 2, d / 2, top)]);
    }
    peak = d * t;
  } else if (roof.type === 'hip') {
    // вальмовая: если ширина меньше глубины — конёк вдоль Y
    const alongX = w >= d;
    const half = (alongX ? d : w) / 2;
    const ridge = Math.abs(w - d) / 2;
    const zE = H - o * t;
    const zR = H + half * t;
    if (alongX) {
      surfaces.push({ poly: [P(-X, -Y, zE), P(X, -Y, zE), P(ridge, 0, zR), P(-ridge, 0, zR)] });
      surfaces.push({ poly: [P(X, Y, zE), P(-X, Y, zE), P(-ridge, 0, zR), P(ridge, 0, zR)] });
      surfaces.push({ poly: [P(-X, Y, zE), P(-X, -Y, zE), P(-ridge, 0, zR)] });
      surfaces.push({ poly: [P(X, -Y, zE), P(X, Y, zE), P(ridge, 0, zR)] });
      lines.push([L2(-ridge, 0), L2(ridge, 0)]);
      for (const [cx, cy, rx] of [
        [-X, -Y, -ridge],
        [X, -Y, ridge],
        [X, Y, ridge],
        [-X, Y, -ridge],
      ])
        lines.push([L2(cx, cy), L2(rx, 0)]);
    } else {
      surfaces.push({ poly: [P(-X, -Y, zE), P(-X, Y, zE), P(0, ridge, zR), P(0, -ridge, zR)] });
      surfaces.push({ poly: [P(X, Y, zE), P(X, -Y, zE), P(0, -ridge, zR), P(0, ridge, zR)] });
      surfaces.push({ poly: [P(-X, -Y, zE), P(X, -Y, zE), P(0, -ridge, zR)] });
      surfaces.push({ poly: [P(X, Y, zE), P(-X, Y, zE), P(0, ridge, zR)] });
      lines.push([L2(0, -ridge), L2(0, ridge)]);
      for (const [cx, cy, ry] of [
        [-X, -Y, -ridge],
        [X, -Y, -ridge],
        [X, Y, ridge],
        [-X, Y, ridge],
      ])
        lines.push([L2(cx, cy), L2(0, ry)]);
    }
    peak = half * t;
  } else {
    // двускатная
    const zE = H - o * t;
    const zR = H + (d / 2) * t;
    surfaces.push({ poly: [P(-X, -Y, zE), P(X, -Y, zE), P(X, 0, zR), P(-X, 0, zR)] });
    surfaces.push({ poly: [P(X, Y, zE), P(-X, Y, zE), P(-X, 0, zR), P(X, 0, zR)] });
    if (zR - G > H + 0.05) for (const x of [-w / 2, w / 2]) gables.push([P(x, -d / 2, H), P(x, d / 2, H), P(x, 0, zR - G)]);
    lines.push([L2(-X, 0), L2(X, 0)]);
    peak = (d / 2) * t;
  }

  return { surfaces, gables, plan: { outline, lines }, peak };
}

/** Высота конька над базой крыши (без построения геометрии). */
export function roofPeak(roof) {
  const t = Math.tan(Math.max(0, Math.min(70, roof.pitch ?? 30)) * DEG);
  const w = Math.max(0.5, roof.w);
  const d = Math.max(0.5, roof.d);
  if (roof.type === 'flat') return 0.25;
  if (roof.type === 'shed') return d * t;
  if (roof.type === 'hip') return (Math.min(w, d) / 2) * t;
  return (d / 2) * t;
}

/**
 * Скаты крыши как плоскости h = a·x + b·y + c (x, y — план), высота — верх кровли.
 * Нужны, чтобы срезать стены мансарды по скатам и считать высоту под крышей.
 * @returns {{ planes: Array<{a,b,c}>, contains(p): boolean }}
 */
export function roofPlanes(roof, baseHeight) {
  const t = Math.tan(Math.max(0, Math.min(70, roof.pitch ?? 30)) * DEG);
  const w = Math.max(0.5, roof.w);
  const d = Math.max(0.5, roof.d);
  const o = Math.max(0, roof.overhang ?? 0.5);
  const r = (roof.rotation || 0) * DEG;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const H = baseHeight;
  // локальные оси: lx = c·dx + s·dy, ly = −s·dx + c·dy
  const plane = (kx, ky, k0) => ({
    a: kx * c - ky * s,
    b: kx * s + ky * c,
    c: k0 - (kx * c - ky * s) * roof.x - (kx * s + ky * c) * roof.y,
  });
  const planes = [];
  if (roof.type === 'flat') planes.push(plane(0, 0, H));
  else if (roof.type === 'shed') planes.push(plane(0, t, H + (d / 2) * t));
  else {
    planes.push(plane(0, -t, H + (d / 2) * t), plane(0, t, H + (d / 2) * t));
    if (roof.type === 'hip') planes.push(plane(-t, 0, H + (w / 2) * t), plane(t, 0, H + (w / 2) * t));
  }
  const contains = (p) => {
    const dx = p.x - roof.x;
    const dy = p.y - roof.y;
    return Math.abs(c * dx + s * dy) <= w / 2 + o + 1e-6 && Math.abs(-s * dx + c * dy) <= d / 2 + o + 1e-6;
  };
  return { planes, contains };
}

/** Высота верха кровли над точкой плана (Infinity — точка не под крышей). */
export function roofHeightAt(rp, p) {
  if (!rp.contains(p)) return Infinity;
  let h = Infinity;
  for (const pl of rp.planes) h = Math.min(h, pl.a * p.x + pl.b * p.y + pl.c);
  return h;
}

/** Направление ската для стрелок на плане (для односкатной). */
export function shedArrow(roof) {
  const a = toWorld({ x: 0, y: roof.d / 2 }, roof.x, roof.y, roof.rotation || 0);
  const b = toWorld({ x: 0, y: -roof.d / 2 }, roof.x, roof.y, roof.rotation || 0);
  return [a, b];
}
