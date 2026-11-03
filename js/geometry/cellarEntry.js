/**
 * Вход в подвал с улицы. У двери (или проёма) в наружной стене подвала, пол
 * которого ниже земли, строится приямок: площадка перед дверью на уровне пола
 * подвала, ступени до земли и подпорные стенки. Нужен для 3D, плана, проверки
 * и чтобы манекен мог спуститься и войти.
 *
 * Направление спуска — свойство проёма descent:
 *  out   — ступени уходят от двери прямо (по умолчанию);
 *  left / right — вдоль стены, влево или вправо, если смотреть на дверь снаружи;
 *  none  — без спуска.
 */
import { add, mul, dot } from '../core/geometry.js';
import { computeWallGeometry, pointOnWall } from './wallGeometry.js';
import { outsideSide } from './porch.js';
import { isBasement, levelElevation } from '../model/project.js';

export const DESCENTS = {
  out: 'Ступени прямо от двери',
  left: 'Вдоль стены — влево',
  right: 'Вдоль стены — вправо',
  none: 'Без спуска',
};

const RISER = 0.17;
const TREAD = 0.28;
const LANDING = 1.1; // площадка перед дверью
const SIDE = 0.25; // запас площадки по бокам двери
const FLIGHT = 1.0; // ширина марша вдоль стены
export const PIT_WALL = 0.15; // подпорная стенка
export const PIT_CURB = 0.12; // бортик над землёй
export const RAIL_H = 1.0; // высота ограждения над землёй

/** Может ли у проёма быть спуск (дверь или арка в наружной стене подвала). */
export function canHaveDescent(project, opening) {
  const w = project.walls.find((x) => x.id === opening?.wallId);
  if (!w || w.kind !== 'exterior' || opening.kind === 'window') return false;
  const lvl = project.levels.find((l) => l.id === w.levelId);
  return isBasement(lvl) && levelElevation(project, lvl.id) < -0.15;
}

/**
 * Все приямки проекта.
 * @returns {Array<{ openingId, levelId, base, landing, steps, walls, pit, hole, top, dir }>}
 *   landing / steps — { poly, top } (top — абсолютная отметка); walls — { poly, y0, y1, rail? }
 *   (rail — ограждение по бортику: отрезок [a, b] в плане, высота RAIL_H над землёй);
 *   pit — контур приямка в плане; hole — вырез в земле (чуть шире — края грунта прячутся в стенках);
 *   dir — направление подъёма (единичный вектор в плане).
 */
export function cellarEntries(project) {
  const out = [];
  for (const level of project.levels) {
    if (!isBasement(level)) continue;
    const base = levelElevation(project, level.id);
    if (base > -0.15) continue;
    const walls = project.walls.filter((w) => w.levelId === level.id);
    const geoms = computeWallGeometry(walls);
    const rooms = project.rooms.filter((r) => r.levelId === level.id);
    for (const o of project.openings) {
      const g = geoms.get(o.wallId);
      if (!g || g.wall.kind !== 'exterior' || o.kind === 'window' || o.sill > 0.05 || o.descent === 'none') continue;
      const side = outsideSide(g, o, rooms, geoms);
      if (!side) continue;
      const e = buildEntry(g, o, side, base);
      if (e) out.push({ ...e, openingId: o.id, levelId: level.id, base });
    }
  }
  return out;
}

function buildEntry(g, o, side, base) {
  const nn = mul(g.n, side); // наружу от стены
  const depthTotal = -base;
  const n = Math.max(2, Math.round(depthTotal / RISER));
  const r = depthTotal / n;
  const f0 = g.half + 0.003; // от наружной грани стены
  const halfW = o.width / 2 + SIDE;
  // точка: s — вдоль стены, q — от оси стены наружу
  const P = (s, q) => add(pointOnWall(g, s), mul(nn, q));
  const rect = (s0, s1, q0, q1) => {
    const a = Math.min(s0, s1);
    const b = Math.max(s0, s1);
    return [P(a, q0), P(b, q0), P(b, q1), P(a, q1)];
  };
  // «вправо», если стоять снаружи лицом к двери
  const right = { x: nn.y, y: -nn.x };
  const sRight = dot(right, g.d) >= 0 ? 1 : -1;
  const mode = o.descent === 'left' || o.descent === 'right' ? o.descent : 'out';
  const steps = [];
  const walls = [];
  let pit;
  let hole;
  let dir;
  const yTop = PIT_CURB;
  const yLow = base - 0.12;

  if (mode === 'out') {
    const s0 = o.t - halfW;
    const s1 = o.t + halfW;
    const landing = { poly: rect(s0, s1, f0, f0 + LANDING), top: base };
    let q = f0 + LANDING;
    for (let k = 1; k < n; k++) {
      steps.push({ poly: rect(s0, s1, q, q + TREAD), top: base + k * r });
      q += TREAD;
    }
    pit = rect(s0, s1, f0, q);
    hole = rect(s0 - 0.05, s1 + 0.05, f0, q + 0.05);
    walls.push({ poly: rect(s0 - PIT_WALL, s0, g.half, q + PIT_WALL), y0: yLow, y1: yTop, rail: [P(s0 - PIT_WALL / 2, g.half + 0.05), P(s0 - PIT_WALL / 2, q + PIT_WALL / 2)] });
    walls.push({ poly: rect(s1, s1 + PIT_WALL, g.half, q + PIT_WALL), y0: yLow, y1: yTop, rail: [P(s1 + PIT_WALL / 2, g.half + 0.05), P(s1 + PIT_WALL / 2, q + PIT_WALL / 2)] });
    walls.push({ poly: rect(s0, s1, q, q + PIT_WALL), y0: yLow, y1: 0 }); // торец у верхней ступени — вровень с землёй
    dir = nn;
    return { landing, steps, walls, pit, hole, top: 0, dir };
  }

  // вдоль стены: площадка у двери, марш уходит влево или вправо
  const ds = (mode === 'right' ? 1 : -1) * sRight; // направление подъёма вдоль оси стены
  const qa = f0;
  const qb = f0 + FLIGHT;
  const sDoor = o.t - ds * halfW; // дальний от марша край площадки
  const sEdge = o.t + ds * halfW; // край площадки, откуда начинается марш
  const landing = { poly: rect(sDoor, sEdge, qa, qb), top: base };
  let s = sEdge;
  for (let k = 1; k < n; k++) {
    steps.push({ poly: rect(s, s + ds * TREAD, qa, qb), top: base + k * r });
    s += ds * TREAD;
  }
  pit = rect(sDoor, s, qa, qb);
  hole = rect(sDoor - ds * 0.05, s + ds * 0.05, qa, qb + 0.05);
  walls.push({ poly: rect(sDoor - ds * PIT_WALL, s + ds * PIT_WALL, qb, qb + PIT_WALL), y0: yLow, y1: yTop, rail: [P(sDoor - ds * PIT_WALL / 2, qb + PIT_WALL / 2), P(s + ds * PIT_WALL / 2, qb + PIT_WALL / 2)] });
  walls.push({ poly: rect(sDoor - ds * PIT_WALL, sDoor, g.half, qb), y0: yLow, y1: yTop, rail: [P(sDoor - ds * PIT_WALL / 2, g.half + 0.05), P(sDoor - ds * PIT_WALL / 2, qb + PIT_WALL / 2)] });
  walls.push({ poly: rect(s, s + ds * PIT_WALL, g.half, qb), y0: yLow, y1: 0 });
  dir = mul(g.d, ds);
  return { landing, steps, walls, pit, hole, top: 0, dir };
}
