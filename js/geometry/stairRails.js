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
 *
 * Лестницы друг над другом: opts.blocked — занятые области { poly, y0, y1 } с высотами
 * над тем же полом, что и h. Перила убираются только там, где реально пересекают
 * тело верхней лестницы по высоте, а не по одному лишь плану.
 */
import { pointInPolygon } from '../core/geometry.js';
import { stairLayout } from './stairGeometry.js';
import { levelElevation, getLevel, levelWallHeight } from '../model/project.js';
import { stairStyle, TREAD } from '../model/defaults.js';

export const RAILINGS = { auto: 'Со свободных сторон', both: 'С обеих сторон', none: 'Без перил' };
export const RAIL_HEIGHT = 0.9; // поручень над ступенью
export const GUARD_HEIGHT = 0.95; // ограждение проёма над полом
export const STRINGER_D = 0.24; // высота сечения косоура (общая с 3D-сборкой)

const PIECE = 0.25; // шаг проверки «есть ли рядом стена»
const NEAR = 0.14; // дальше этого от стены — сторона свободна
const EPS = 0.02; // допуск высотного пересечения

/**
 * @param stair
 * @param layout — stairLayout()
 * @param wallPolys — многоугольники стен этажа лестницы
 * @param upperWallPolys — стены этажа выше (для ограждения проёма); null — проём не ограждаем
 * @param opts — { blocked: Array<{poly, y0, y1} | Array<{x,y}>> } — занятые области
 *   (ступени других лестниц). y0/y1 — над полом лестницы (для sides) или над полом
 *   этажа с проёмом (для guards). Старый формат — просто полигон — занят на любой высоте.
 * @returns {{ sides: Array<Array<{x,y,h}>>, guards: Array<Array<{x,y}>> }}
 */
export function stairRails(stair, layout, wallPolys, upperWallPolys, opts = {}) {
  const mode = RAILINGS[stair.railing] ? stair.railing : 'auto';
  const out = { sides: [], guards: [] };
  if (mode === 'none') return out;
  const blocked = (opts.blocked || [])
    .map((b) => (Array.isArray(b) ? { poly: b, y0: -Infinity, y1: Infinity } : b))
    .filter((b) => b && b.poly && b.poly.length >= 3);
  // пересекает ли ограждение [hBot, hTop] занятую область в точке p
  const hits = (p, hBot, hTop) =>
    blocked.some((b) => hBot < b.y1 - EPS && hTop > b.y0 + EPS && pointInPolygon(p, b.poly));
  const free = (p, n, polys, hBot, hTop, hp = p) =>
    mode === 'both' ||
    (!polys.some((w) => pointInPolygon({ x: p.x + n.x * NEAR, y: p.y + n.y * NEAR }, w)) && !hits(hp, hBot, hTop));
  const steps = layout.steps;

  if (stair.shape === 'spiral') {
    // по внешнему краю ступеней — винтом; разрыв только где верхняя лестница мешает по высоте
    let line = [];
    let segs = [];
    for (const st of steps) {
      const a = st.poly[0];
      const b = st.poly[Math.floor((st.poly.length - 2) / 2)];
      const p = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, h: st.top };
      if (hits(p, st.top, st.top + RAIL_HEIGHT)) {
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
        for (const [ua, ub] of freeSpans(f.u0, f.u1, (u) => free(P(u), n, wallPolys, H(u), H(u) + RAIL_HEIGHT))) {
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
          // точку проверки занятых областей сдвигаем внутрь площадки: на общем ребре
          // с верхней лестницей pointInPolygon нестабилен
          return free(p, n, wallPolys, st.top, st.top + RAIL_HEIGHT, { x: p.x - n.x * 0.03, y: p.y - n.y * 0.03 });
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

  // ограждение проёма на этаже выше: все края, кроме выхода с лестницы, стен
  // и мест, где над проёмом стоит лестница этого этажа
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
        // над проёмом стоит верхняя лестница: забор сквозь её ступени не ставим
        // (точка внутрь проёма — на общем ребре pointInPolygon нестабилен)
        if (hits({ x: p.x - n.x * 0.05, y: p.y - n.y * 0.05 }, 0, GUARD_HEIGHT)) return false;
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

// ── Занятые области от лестниц, стоящих друг над другом ─────────────────────

const riseOf = (project, stair) => {
  const lvl = getLevel(project, stair.levelId);
  return lvl ? levelWallHeight(lvl) : 3;
};

/** Вертикальный габарит ступени над её полом: верх и низ конструкции под ней. */
function stepSpan(st, style) {
  if (style === 'solid') return { y0: 0, y1: st.top }; // монолит — масса до самого пола
  const th = st.thin ? 0.05 : st.landing ? TREAD.landing : TREAD[style];
  const extra = style === 'stringer' && !st.landing && !st.thin ? STRINGER_D : 0; // косоур под проступью
  return { y0: st.top - th - extra, y1: st.top };
}

function polyBounds(poly) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}

const overlaps = (b, own, pad) => b.x1 > own.x0 - pad && b.x0 < own.x1 + pad && b.y1 > own.y0 - pad && b.y0 < own.y1 + pad;

/**
 * Ступени лестниц этажей выше, стоящих над данной, — с высотами над полом данной.
 * Без этого перила нижней лестницы оказывались внутри верхней; с блокировкой по
 * одному лишь плану у нижней лестницы пропадали нужные перила (зазор ~2 м).
 */
export function stairFootprintsAbove(project, stair) {
  const own = polyBounds(stairLayout(stair, riseOf(project, stair)).outline);
  const PAD = RAIL_HEIGHT + 0.15; // зона, куда могут попасть перила этой лестницы
  const base = levelElevation(project, stair.levelId);
  const out = [];
  for (const up of project.stairs) {
    if (up.id === stair.id || up.levelId === stair.levelId) continue;
    const upBase = levelElevation(project, up.levelId);
    if (upBase <= base + 0.01) continue;
    const style = stairStyle(up);
    for (const st of stairLayout(up, riseOf(project, up)).steps) {
      if (!overlaps(polyBounds(st.poly), own, PAD)) continue;
      const { y0, y1 } = stepSpan(st, style);
      out.push({ poly: st.poly, y0: upBase - base + y0, y1: upBase - base + y1 });
    }
  }
  return out;
}

/** Ступени лестниц этого этажа, стоящие над проёмом, — для ограждения проёма. */
export function stairFootprintsOverOpening(project, levelId, outline) {
  const own = polyBounds(outline);
  const out = [];
  for (const s of project.stairs.filter((x) => x.levelId === levelId)) {
    const style = stairStyle(s);
    for (const st of stairLayout(s, riseOf(project, s)).steps) {
      if (!overlaps(polyBounds(st.poly), own, 0.3)) continue;
      out.push({ poly: st.poly, ...stepSpan(st, style) });
    }
  }
  return out;
}

// ── Вспомогательное ─────────────────────────────────────────────────────────

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
