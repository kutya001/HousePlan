/**
 * Крыша по контуру этажа. Прямоугольный дом — одна крыша. Г-, Т-, П-образный —
 * несколько пересекающихся крыш: главный объём и крылья. Крыло заходит в главный
 * объём до его конька: при одном уклоне скаты сходятся ендовами, а лишнее
 * оказывается под кровлей главного объёма.
 */
import { levelFootprints } from './roomDetect.js';
import { toLocal, toWorld, pointInPolygon, DEG } from '../core/geometry.js';

const wallLength = (w) => Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
const EPS = 1e-6;
const MAX_ROOFS = 6;

/** Угол «главной оси» дома — по самой длинной наружной стене, в пределах [0, 90). */
function mainAngle(walls) {
  let longest = walls[0];
  for (const w of walls) if (wallLength(w) > wallLength(longest)) longest = w;
  const ang = Math.atan2(longest.y2 - longest.y1, longest.x2 - longest.x1) / DEG;
  return ((ang % 90) + 90) % 90;
}

/** Сетка ячеек по координатам вершин (контур в осях дома). */
function cellGrid(polys) {
  const uniq = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    return s.filter((v, i) => i === 0 || v - s[i - 1] > 0.02);
  };
  const xs = uniq(polys.flat().map((p) => p.x));
  const ys = uniq(polys.flat().map((p) => p.y));
  const filled = [];
  for (let i = 0; i < xs.length - 1; i++) {
    filled.push([]);
    for (let j = 0; j < ys.length - 1; j++) {
      const c = { x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 };
      filled[i].push(polys.some((poly) => pointInPolygon(c, poly)));
    }
  }
  return { xs, ys, filled };
}

/**
 * Покрытие клеток прямоугольниками: каждый раз — самый большой прямоугольник
 * из заполненных клеток, в котором есть ещё не покрытые.
 */
function coverRects({ xs, ys, filled }) {
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const covered = filled.map((col) => col.map(() => false));
  const rects = [];
  const full = (i0, i1, j0, j1) => {
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (!filled[i][j]) return false;
    return true;
  };
  const fresh = (i0, i1, j0, j1) => {
    let a = 0;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (!covered[i][j]) a += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
    return a;
  };
  while (rects.length < MAX_ROOFS) {
    let best = null;
    for (let i0 = 0; i0 < nx; i0++)
      for (let i1 = i0; i1 < nx; i1++)
        for (let j0 = 0; j0 < ny; j0++)
          for (let j1 = j0; j1 < ny; j1++) {
            if (!full(i0, i1, j0, j1)) break;
            const f = fresh(i0, i1, j0, j1);
            if (f < 0.5) continue;
            const area = (xs[i1 + 1] - xs[i0]) * (ys[j1 + 1] - ys[j0]);
            // главный объём — самый большой; крыло — с наибольшей новой площадью
            const score = rects.length ? f * 1000 + area : area;
            if (!best || score > best.score + EPS) best = { i0, i1, j0, j1, score };
          }
    if (!best) break;
    for (let i = best.i0; i <= best.i1; i++) for (let j = best.j0; j <= best.j1; j++) covered[i][j] = true;
    rects.push({ minX: xs[best.i0], maxX: xs[best.i1 + 1], minY: ys[best.j0], maxY: ys[best.j1 + 1] });
  }
  return rects;
}

const overlap1 = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

/**
 * Крыло, наложенное на уже стоящий объём, обрезаем по его коньку,
 * а конёк крыла ведём от главного объёма наружу.
 */
function shapeWings(rects) {
  const out = [];
  for (const r of rects) {
    const R = { ...r, axis: r.maxX - r.minX >= r.maxY - r.minY ? 'x' : 'y' };
    for (const M of out) {
      const ox = overlap1(R.minX, R.maxX, M.minX, M.maxX);
      const oy = overlap1(R.minY, R.maxY, M.minY, M.maxY);
      if (ox <= 0.05 || oy <= 0.05) continue;
      // направление, в котором крыло выходит из объёма
      const outX = R.minX < M.minX - 0.05 || R.maxX > M.maxX + 0.05;
      const outY = R.minY < M.minY - 0.05 || R.maxY > M.maxY + 0.05;
      if (outY && !outX) {
        const cy = (M.minY + M.maxY) / 2;
        if (R.minY < M.minY - 0.05) R.maxY = Math.min(R.maxY, cy);
        else R.minY = Math.max(R.minY, cy);
        R.axis = 'y';
      } else if (outX && !outY) {
        const cx = (M.minX + M.maxX) / 2;
        if (R.minX < M.minX - 0.05) R.maxX = Math.min(R.maxX, cx);
        else R.minX = Math.max(R.minX, cx);
        R.axis = 'x';
      }
    }
    if (R.maxX - R.minX > 0.3 && R.maxY - R.minY > 0.3) out.push(R);
  }
  return out;
}

/**
 * Прямоугольники крыш по контуру наружных стен этажа.
 * @returns {Array<{x, y, w, d, rotation}>} w — вдоль конька
 */
export function autoRoofRects(project, levelId) {
  const ext = project.walls.filter((w) => w.levelId === levelId && w.kind === 'exterior');
  const walls = ext.length ? ext : project.walls.filter((w) => w.levelId === levelId);
  if (!walls.length) return [];
  const rot = mainAngle(walls);
  const polys = levelFootprints(walls).map((poly) => poly.map((p) => toLocal(p, 0, 0, rot)));
  if (!polys.length) return [];
  // контур не из прямых углов (эркер, скос) — одна крыша по габариту
  const ortho = polys.every((poly) =>
    poly.every((p, i) => {
      const q = poly[(i + 1) % poly.length];
      return Math.abs(p.x - q.x) < 0.02 || Math.abs(p.y - q.y) < 0.02;
    }),
  );
  let rects;
  if (ortho) rects = shapeWings(coverRects(cellGrid(polys)));
  if (!rects?.length) {
    const all = polys.flat();
    const minX = Math.min(...all.map((p) => p.x));
    const maxX = Math.max(...all.map((p) => p.x));
    const minY = Math.min(...all.map((p) => p.y));
    const maxY = Math.max(...all.map((p) => p.y));
    rects = [{ minX, maxX, minY, maxY, axis: maxX - minX >= maxY - minY ? 'x' : 'y' }];
  }
  return rects.map((r) => {
    const c = toWorld({ x: (r.minX + r.maxX) / 2, y: (r.minY + r.maxY) / 2 }, 0, 0, rot);
    const along = r.axis === 'x';
    return {
      x: round(c.x),
      y: round(c.y),
      w: round(along ? r.maxX - r.minX : r.maxY - r.minY),
      d: round(along ? r.maxY - r.minY : r.maxX - r.minX),
      rotation: Math.round((along ? rot : rot + 90) * 100) / 100,
    };
  });
}

const round = (v) => Math.round(v * 1000) / 1000;
