/**
 * Геометрия крыш по прямоугольнику дома (центр, ширина, глубина, поворот).
 * Конёк идёт вдоль локальной оси X (ширины). Для смены направления — повернуть на 90°.
 *
 * Любая скатная крыша здесь — нижняя огибающая нескольких плоскостей: каждый скат —
 * плоскость, а видна та, что ниже остальных. Двускатная — две плоскости, вальмовая —
 * четыре, ломаная мансардная — по две на сторону (крутая снизу, пологая сверху),
 * полувальмовая — две плюс срезающие верх торцов, шатровая — четыре, сходящиеся
 * в точку. Новый вид крыши — это новый набор плоскостей в localPlanes().
 *
 * roofGeometry возвращает:
 *  surfaces — скаты (3D-многоугольники {x,y,z}, где y — высота, z — координата плана Y);
 *  gables   — фронтоны / стенки под скатами (3D-многоугольники);
 *  eaves    — карнизы: горизонтальные нижние кромки скатов (для водостоков):
 *             { a, b — концы (3D), inset — сдвиг в плане от кромки до линии стен {x, z} };
 *  plan     — линии для 2D: контур с учётом свеса, конёк, рёбра и переломы;
 *  peak     — высота конька над верхом стен (roofPeak).
 */
import { DEG, toWorld, lowerEnvelope } from '../core/geometry.js';

/** Ломаная крыша по умолчанию: уклоны нижнего и верхнего скатов, высота перелома, короткий свес. */
export const MANSARD = { pitch: 60, pitch2: 30, breakH: 2.2, overhang: 0.25 };
/** Полувальмовая: какую долю высоты фронтона срезает вальма. */
export const HALF_HIP = 0.4;

const tanOf = (deg, def) => Math.tan(Math.max(0, Math.min(85, deg ?? def)) * DEG);
/**
 * Размеры крыши: ширина, глубина и свесы по осям. Свес одинаков со всех сторон, кроме
 * шатровой над вытянутым домом: там скаты разной крутизны, и чтобы карниз шёл на одной
 * высоте, а рёбра выходили точно в углы, свес пологих скатов длиннее.
 */
function size(roof) {
  const w = Math.max(0.5, roof.w);
  const d = Math.max(0.5, roof.d);
  const o = Math.max(0, roof.overhang ?? 0.5);
  const pyr = roof.type === 'pyramid';
  return { w, d, ox: pyr && w > d ? (o * w) / d : o, oy: pyr && d > w ? (o * d) / w : o };
}

/** Прямоугольник крыши со свесами в плане (углы по порядку). */
export function roofOutline(roof) {
  const { w, d, ox, oy } = size(roof);
  const X = w / 2 + ox;
  const Y = d / 2 + oy;
  return [
    { x: -X, y: -Y },
    { x: X, y: -Y },
    { x: X, y: Y },
    { x: -X, y: Y },
  ].map((p) => toWorld(p, roof.x, roof.y, roof.rotation || 0));
}

/** Ломаная ли крыша (два уклона на скат). */
export const isMansardRoof = (roof) => roof.type === 'mansard' || roof.type === 'mansard4';

/**
 * Плоскости скатов в осях крыши: h = kx·x + ky·y + k0, где h — высота над верхом стен,
 * x — вдоль конька, y — поперёк. На линии стен (|y| = d/2 или |x| = w/2) скат на нуле.
 */
export function localPlanes(roof) {
  const { w, d } = size(roof);
  const t = tanOf(roof.pitch, 30);
  // пара скатов, симметричных относительно оси: вдоль y (обычные) или вдоль x (торцевые)
  const pairY = (k, k0) => [
    { kx: 0, ky: k, k0 },
    { kx: 0, ky: -k, k0 },
  ];
  const pairX = (k, k0) => [
    { kx: k, ky: 0, k0 },
    { kx: -k, ky: 0, k0 },
  ];
  switch (roof.type) {
    case 'flat':
      return [{ kx: 0, ky: 0, k0: 0 }];
    case 'shed':
      return [{ kx: 0, ky: t, k0: (d / 2) * t }];
    case 'hip':
      return [...pairY(t, (d / 2) * t), ...pairX(t, (w / 2) * t)];
    case 'pyramid': {
      // все четыре ската сходятся в одной точке: уклон задаёт короткая сторона
      const peak = (Math.min(w, d) / 2) * t;
      return [...pairY(peak / (d / 2), peak), ...pairX(peak / (w / 2), peak)];
    }
    case 'halfhip': {
      // вальма срезает верх фронтона: её плоскость касается торцевой стены на высоте hs
      const part = Math.max(0.1, Math.min(0.9, roof.hipPart ?? HALF_HIP));
      const hs = (d / 2) * t * (1 - part);
      return [...pairY(t, (d / 2) * t), ...pairX(t, hs + (w / 2) * t)];
    }
    case 'mansard':
    case 'mansard4': {
      const t1 = Math.max(tanOf(roof.pitch, MANSARD.pitch), 0.05);
      const t2 = Math.min(tanOf(roof.pitch2, MANSARD.pitch2), t1);
      const half = roof.type === 'mansard4' ? Math.min(w, d) / 2 : d / 2;
      // перелом — не дальше 90 % пролёта, иначе верхнего ската не остаётся
      const run = Math.min(Math.max(0.2, roof.breakH ?? MANSARD.breakH) / t1, half * 0.9);
      const hb = run * t1;
      const out = [...pairY(t1, (d / 2) * t1), ...pairY(t2, hb + (d / 2 - run) * t2)];
      if (roof.type === 'mansard4') out.push(...pairX(t1, (w / 2) * t1), ...pairX(t2, hb + (w / 2 - run) * t2));
      return out;
    }
    default:
      return pairY(t, (d / 2) * t); // двускатная
  }
}

/** Участки скатов в осях крыши: [{ poly: [{x,y}], plane: {a,b,c} }]. */
function localSurfaces(roof) {
  const { w, d, ox, oy } = size(roof);
  const X = w / 2 + ox;
  const Y = d / 2 + oy;
  const rect = [
    { x: -X, y: -Y },
    { x: X, y: -Y },
    { x: X, y: Y },
    { x: -X, y: Y },
  ];
  const planes = localPlanes(roof).map((p) => ({ a: p.kx, b: p.ky, c: p.k0 }));
  return lowerEnvelope(rect, planes)
    .map(({ poly, plane }) => ({ poly: dedupe(poly), plane }))
    .filter((s) => s.poly.length >= 3 && area(s.poly) > 1e-4);
}

const hAt = (pl, p) => pl.a * p.x + pl.b * p.y + pl.c;

function dedupe(poly) {
  const out = [];
  for (const p of poly) {
    const q = out[out.length - 1];
    if (!q || Math.abs(q.x - p.x) > 1e-6 || Math.abs(q.y - p.y) > 1e-6) out.push(p);
  }
  if (out.length > 1 && Math.abs(out[0].x - out[out.length - 1].x) < 1e-6 && Math.abs(out[0].y - out[out.length - 1].y) < 1e-6) out.pop();
  return out;
}

function area(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Высота огибающей в точке (оси крыши). */
function envelopeAt(planes, p) {
  let h = Infinity;
  for (const pl of planes) h = Math.min(h, pl.kx * p.x + pl.ky * p.y + pl.k0);
  return h;
}

/**
 * Профиль огибающей вдоль отрезка a → b: точки, где меняется ведущая плоскость.
 * @returns {Array<{ p, h }>} от a к b, с концами
 */
function profile(planes, a, b) {
  const ts = [0, 1];
  const f = (pl, t) => pl.kx * (a.x + (b.x - a.x) * t) + pl.ky * (a.y + (b.y - a.y) * t) + pl.k0;
  for (let i = 0; i < planes.length; i++) {
    for (let j = i + 1; j < planes.length; j++) {
      const d0 = f(planes[i], 0) - f(planes[j], 0);
      const d1 = f(planes[i], 1) - f(planes[j], 1);
      if (Math.abs(d0 - d1) < 1e-9) continue;
      const t = d0 / (d0 - d1);
      if (t > 1e-6 && t < 1 - 1e-6) ts.push(t);
    }
  }
  ts.sort((x, y) => x - y);
  const out = [];
  for (const t of ts) {
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const h = envelopeAt(planes, p);
    const last = out[out.length - 1];
    if (last && Math.hypot(last.p.x - p.x, last.p.y - p.y) < 1e-6) continue;
    out.push({ p, h });
  }
  // убрать точки на прямой: пересечения плоскостей, которые здесь не ведущие
  for (let i = 1; i < out.length - 1; ) {
    const [u, v, q] = [out[i - 1], out[i], out[i + 1]];
    const L = Math.hypot(q.p.x - u.p.x, q.p.y - u.p.y) || 1;
    const k = Math.hypot(v.p.x - u.p.x, v.p.y - u.p.y) / L;
    if (Math.abs(u.h + (q.h - u.h) * k - v.h) < 1e-6) out.splice(i, 1);
    else i++;
  }
  return out;
}

export function roofGeometry(roof, baseHeight) {
  const { w, d, ox, oy } = size(roof);
  const H = baseHeight;
  const X = w / 2 + ox;
  const Y = d / 2 + oy;

  // локальная точка (x, y плана, h высота) → мировая 3D
  const P = (x, y, h) => {
    const p = toWorld({ x, y }, roof.x, roof.y, roof.rotation || 0);
    return { x: p.x, y: h, z: p.y };
  };
  const L2 = (x, y) => toWorld({ x, y }, roof.x, roof.y, roof.rotation || 0);

  const surfaces = [];
  const gables = [];
  const eaves = [];
  const lines = [];
  const outline = [L2(-X, -Y), L2(X, -Y), L2(X, Y), L2(-X, Y)];
  const peak = roofPeak(roof);

  if (roof.type === 'flat') {
    const th = 0.25;
    surfaces.push({ flat: true, poly: [P(-X, -Y, H + th), P(X, -Y, H + th), P(X, Y, H + th), P(-X, Y, H + th)], thickness: th });
    return { surfaces, gables, eaves, plan: { outline, lines }, peak };
  }

  const planes = localPlanes(roof);
  const parts = localSurfaces(roof);
  const onEdge = (p) => Math.abs(Math.abs(p.x) - X) < 1e-6 || Math.abs(Math.abs(p.y) - Y) < 1e-6;
  const sameEdge = (a, b) => (Math.abs(a.x - b.x) < 1e-6 && Math.abs(Math.abs(a.x) - X) < 1e-6) || (Math.abs(a.y - b.y) < 1e-6 && Math.abs(Math.abs(a.y) - Y) < 1e-6);
  const seen = new Set();
  const key = (a, b) => {
    const k = (p) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
    return [k(a), k(b)].sort().join('|');
  };
  for (const { poly, plane } of parts) {
    surfaces.push({ poly: poly.map((p) => P(p.x, p.y, H + hAt(plane, p))) });
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const ha = hAt(plane, a);
      const hb = hAt(plane, b);
      if (onEdge(a) && onEdge(b) && sameEdge(a, b)) {
        // кромка крыши. Карниз (под водосток) — горизонтальная кромка, к которой скат
        // спускается; верх односкатной и торцы скатов — не карнизы
        const nx = Math.abs(a.x - b.x) < 1e-6 && Math.abs(Math.abs(a.x) - X) < 1e-6 ? Math.sign(a.x) : 0;
        const ny = nx ? 0 : Math.sign(a.y);
        const down = plane.a * nx + plane.b * ny < -1e-6;
        if (down && Math.abs(ha - hb) < 1e-6 && Math.hypot(b.x - a.x, b.y - a.y) > 0.3) {
          const v = toWorld({ x: -nx * ox, y: -ny * oy }, 0, 0, roof.rotation || 0);
          eaves.push({ a: P(a.x, a.y, H + ha), b: P(b.x, b.y, H + hb), inset: { x: v.x, z: v.y } });
        }
        continue;
      }
      // общая кромка двух скатов: конёк, ребро вальмы или перелом
      const k = key(a, b);
      if (seen.has(k)) continue;
      seen.add(k);
      lines.push([L2(a.x, a.y), L2(b.x, b.y)]);
    }
  }

  // Фронтоны: стенки под скатами по линии стен, где кровля поднимается над верхом стен.
  // Чуть ниже кровли, чтобы не совпадать со скатом (иначе мерцание).
  const G = 0.24;
  const corners = [
    [{ x: -w / 2, y: -d / 2 }, { x: w / 2, y: -d / 2 }],
    [{ x: w / 2, y: -d / 2 }, { x: w / 2, y: d / 2 }],
    [{ x: w / 2, y: d / 2 }, { x: -w / 2, y: d / 2 }],
    [{ x: -w / 2, y: d / 2 }, { x: -w / 2, y: -d / 2 }],
  ];
  for (const [a, b] of corners) {
    const prof = profile(planes, a, b).map(({ p, h }) => ({ p, h: h - G }));
    if (!prof.some((q) => q.h > 0.05)) continue;
    // участки профиля выше верха стен; концы — там, где он пересекает ноль
    const top = [];
    for (let i = 0; i < prof.length; i++) {
      const cur = prof[i];
      const prev = prof[i - 1];
      if (prev && prev.h > 0 !== cur.h > 0 && Math.abs(prev.h - cur.h) > 1e-9) {
        const t = prev.h / (prev.h - cur.h);
        top.push({ p: { x: prev.p.x + (cur.p.x - prev.p.x) * t, y: prev.p.y + (cur.p.y - prev.p.y) * t }, h: 0 });
      }
      if (cur.h > 0) top.push(cur);
    }
    if (top.length < 2) continue;
    const first = top[0];
    const last = top[top.length - 1];
    const poly = [P(first.p.x, first.p.y, H), P(last.p.x, last.p.y, H)];
    for (let i = top.length - 1; i >= 0; i--) if (top[i].h > 1e-6) poly.push(P(top[i].p.x, top[i].p.y, H + top[i].h));
    if (poly.length >= 3) gables.push(poly);
  }

  return { surfaces, gables, eaves, plan: { outline, lines }, peak };
}

/** Высота конька над верхом стен (без построения скатов). У односкатной — над высокой стеной. */
export function roofPeak(roof) {
  if (roof.type === 'flat') return 0.25;
  const { w, d } = size(roof);
  const planes = localPlanes(roof);
  // вершина огибающей — над центром или над линией стен (односкатная)
  return Math.max(envelopeAt(planes, { x: 0, y: 0 }), envelopeAt(planes, { x: 0, y: d / 2 }), envelopeAt(planes, { x: w / 2, y: 0 }), 0);
}

/**
 * Скаты крыши как плоскости h = a·x + b·y + c (x, y — план), высота — верх кровли.
 * Нужны, чтобы срезать стены мансарды по скатам и считать высоту под крышей.
 * @returns {{ planes: Array<{a,b,c}>, contains(p): boolean }}
 */
export function roofPlanes(roof, baseHeight) {
  const { w, d, ox, oy } = size(roof);
  const r = (roof.rotation || 0) * DEG;
  const c = Math.cos(r);
  const s = Math.sin(r);
  // локальные оси: lx = c·dx + s·dy, ly = −s·dx + c·dy
  const planes = localPlanes(roof).map(({ kx, ky, k0 }) => {
    const a = kx * c - ky * s;
    const b = kx * s + ky * c;
    return { a, b, c: baseHeight + k0 - a * roof.x - b * roof.y };
  });
  const contains = (p) => {
    const dx = p.x - roof.x;
    const dy = p.y - roof.y;
    return Math.abs(c * dx + s * dy) <= w / 2 + ox + 1e-6 && Math.abs(-s * dx + c * dy) <= d / 2 + oy + 1e-6;
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
