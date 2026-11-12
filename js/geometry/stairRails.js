/**
 * Перила лестниц и ограждение лестничного проёма.
 *
 * Перила идут вдоль свободных сторон маршей и площадок (там, где нет стены),
 * ограждение — по краям проёма в перекрытии этажа выше, кроме края, где лестница
 * выходит на этаж, и краёв у стен. Возвращает ломаные в плане с высотой низа
 * (h — над полом своего этажа); саму ограду строят 3D и физика.
 *
 * Свойство лестницы railing: auto — со свободных сторон (по умолчанию), both — с обеих,
 * none — без перил.
 */
import { pointInPolygon } from '../core/geometry.js';

export const RAILINGS = { auto: 'Со свободных сторон', both: 'С обеих сторон', none: 'Без перил' };
export const RAIL_HEIGHT = 0.9; // поручень над ступенью
export const GUARD_HEIGHT = 0.95; // ограждение проёма над полом

const PIECE = 0.25; // шаг проверки «есть ли рядом стена»
const NEAR = 0.14; // дальше этого от стены — сторона свободна

/**
 * @param stair
 * @param layout — stairLayout()
 * @param wallPolys — многоугольники стен этажа лестницы
 * @param upperWallPolys — стены этажа выше (для ограждения проёма); null — проём не ограждаем
 * @param opts — { blocked: Array<Array<{x,y}>> } — планы «занятых» областей (ступени
 *   других лестниц, стоящих над этой): перила в этих местах не ставим
 * @returns {{ sides: Array<Array<{x,y,h}>>, guards: Array<Array<{x,y}>> }}
 */
export function stairRails(stair, layout, wallPolys, upperWallPolys, opts = {}) {
  const mode = RAILINGS[stair.railing] ? stair.railing : 'auto';
  const out = { sides: [], guards: [] };
  if (mode === 'none') return out;
  const blocked = (opts.blocked || []).filter((poly) => poly && poly.length >= 3);
  const free = (p, n, polys) => mode === 'both' || (!polys.some((w) => pointInPolygon({ x: p.x + n.x * NEAR, y: p.y + n.y * NEAR }, w)) && !blocked.some((b) => pointInPolygon(p, b)));
  const steps = layout.steps;

  if (stair.shape === 'spiral') {
    // по внешнему краю ступеней — винтом; где сверху стоит другая лестница — разрыв
    let line = [];
    let segs = [];
    for (const st of steps) {
      const a = st.poly[0];
      const b = st.poly[Math.floor((st.poly.length - 2) / 2)];
      const p = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, h: st.top };
      if (blocked.some((bl) => pointInPolygon(p, bl))) {
        if (line.length > 1) segs.push(line);
        line = [];
      } else {
        line.push(p);
      }
    }
    if (line.length > 1) segs.push(line);
    out.sides.push(...segs);
  } else {
    // марши: две боковые линии на высоте ступеней
    let run = [];
    const runs = [];
    for (const st of steps) {
      if (st.landing) {
        if (run.length) runs.push(run);
        run = [];
      } else run.push(st);
    }
    if (run.length) runs.push(run);
    for (const r of runs) {
      const f = runFrame(r);
      if (!f) continue;
      for (const [w, sgn] of [
        [f.w0 + 0.03, -1],
        [f.w1 - 0.03, 1],
      ]) {
        const n = { x: f.v.x * sgn, y: f.v.y * sgn };
        const P = (u) => ({ x: f.d.x * u + f.v.x * w, y: f.d.y * u + f.v.y * w });
        const H = (u) => f.t0 + ((f.t1 - f.t0) * (u - f.u0)) / Math.max(1e-6, f.u1 - f.u0);
        for (const [ua, ub] of freeSpans(f.u0, f.u1, (u) => free(P(u), n, wallPolys))) {
          out.sides.push([
            { ...P(ua), h: H(ua) },
            { ...P(ub), h: H(ub) },
          ]);
        }
      }
    }
    // площадки: края, не прилегающие к маршам, стенам и лестнице сверху
    for (const st of steps.filter((s) => s.landing)) {
      const others = steps.filter((s) => !s.landing);
      edgesOf(st.poly).forEach(([a, b]) => {
        const n = outward(st.poly, a, b);
        const along = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        const test = (t) => {
          const p = along(t);
          const q = { x: p.x + n.x * 0.08, y: p.y + n.y * 0.08 };
          if (others.some((o) => pointInPolygon(q, o.poly))) return false; // сюда приходит марш
          return free(p, n, wallPolys);
        };
        for (const [ta, tb] of freeSpans(0, L, (s) => test(s / L))) {
          const pa = along(ta / L);
          const pb = along(tb / L);
          const ins = 0.03;
          out.sides.push([
            { x: pa.x - n.x * ins, y: pa.y - n.y * ins, h: st.top },
            { x: pb.x - n.x * ins, y: pb.y - n.y * ins, h: st.top },
          ]);
        }
      });
    }
  }

  // ограждение проёма на этаже выше: все края, кроме выхода с лестницы и стен
  if (upperWallPolys) {
    const top = steps[steps.length - 1];
    const outline = layout.outline;
    edgesOf(outline).forEach(([a, b]) => {
      const n = outward(outline, a, b);
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L < 0.05) return;
      const along = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      const test = (s) => {
        const p = along(s / L);
        // здесь выходит верхняя ступень — проход
        const q = { x: p.x - n.x * 0.08, y: p.y - n.y * 0.08 };
        if (pointInPolygon(q, top.poly)) return false;
        return !upperWallPolys.some((w) => pointInPolygon({ x: p.x + n.x * 0.1, y: p.y + n.y * 0.1 }, w) || pointInPolygon(p, w));
      };
      for (const [sa, sb] of freeSpans(0, L, test)) {
        const pa = along(sa / L);
        const pb = along(sb / L);
        out.guards.push([
          { x: pa.x + n.x * 0.03, y: pa.y + n.y * 0.03 },
          { x: pb.x + n.x * 0.03, y: pb.y + n.y * 0.03 },
        ]);
      }
    });
  }
  return out;
}

/** Отрезки [a, b] на [lo, hi], где ok(середина куска) истинно; короткие отбрасываем. */
function freeSpans(lo, hi, ok) {
  const L = hi - lo;
  if (L <= 0.05) return [];
  const n = Math.max(1, Math.ceil(L / PIECE));
  const step = L / n;
  const spans = [];
  let start = null;
  for (let i = 0; i < n; i++) {
    const good = ok(lo + (i + 0.5) * step);
    if (good && start === null) start = lo + i * step;
    if (!good && start !== null) {
      spans.push([start, lo + i * step]);
      start = null;
    }
  }
  if (start !== null) spans.push([start, hi]);
  return spans.filter(([a, b]) => b - a > 0.2);
}

function edgesOf(poly) {
  return poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);
}

/** Единичная нормаль ребра ab, смотрящая наружу многоугольника. */
function outward(poly, a, b) {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let n = { x: (b.y - a.y) / L, y: -(b.x - a.x) / L };
  const m = { x: (a.x + b.x) / 2 + n.x * 0.01, y: (a.y + b.y) / 2 + n.y * 0.01 };
  if (pointInPolygon(m, poly)) n = { x: -n.x, y: -n.y };
  return n;
}

/** Система координат марша: d — вверх по маршу, v — поперёк; границы и высоты. */
function runFrame(run) {
  const c = (poly) => poly.reduce((s, p) => ({ x: s.x + p.x / poly.length, y: s.y + p.y / poly.length }), { x: 0, y: 0 });
  const c0 = c(run[0].poly);
  const c1 = c(run[run.length - 1].poly);
  let d;
  if (run.length > 1) {
    const L = Math.hypot(c1.x - c0.x, c1.y - c0.y);
    if (L < 1e-3) return null;
    d = { x: (c1.x - c0.x) / L, y: (c1.y - c0.y) / L };
  } else return null;
  const v = { x: -d.y, y: d.x };
  let u0 = Infinity;
  let u1 = -Infinity;
  let w0 = Infinity;
  let w1 = -Infinity;
  for (const st of run) {
    for (const p of st.poly) {
      const u = p.x * d.x + p.y * d.y;
      const w = p.x * v.x + p.y * v.y;
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      w0 = Math.min(w0, w);
      w1 = Math.max(w1, w);
    }
  }
  return { d, v, u0, u1, w0, w1, t0: run[0].top, t1: run[run.length - 1].top };
}
