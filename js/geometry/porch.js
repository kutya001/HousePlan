/**
 * Крыльцо: ступени у наружных дверей первого этажа, когда пол поднят
 * над землёй на высоту цоколя. Нужны и для 3D-вида, и чтобы манекен
 * мог войти в дом.
 */
import { add, mul, pointInPolygon } from '../core/geometry.js';
import { pointOnWall, outwardSign, wallsCenter } from './wallGeometry.js';

const RISER = 0.17;
const TREAD = 0.3;
const LANDING = 0.7;

/** Сторона «улицы» для проёма: +1 / −1 по нормали стены. */
export function outsideSide(g, o, rooms, geoms) {
  const c = pointOnWall(g, o.t);
  const probe = (s) => add(c, mul(g.n, s * (g.half + 0.4)));
  const inRoom = (p) => rooms.some((r) => pointInPolygon(p, r.points));
  const pos = inRoom(probe(1));
  const neg = inRoom(probe(-1));
  if (pos && !neg) return -1;
  if (neg && !pos) return 1;
  if (pos && neg) return 0; // проём между комнатами — крыльцо не нужно
  return outwardSign(g, wallsCenter(geoms));
}

/**
 * Ступени крыльца для всех наружных дверей этажа.
 * @returns {Array<{ poly, top, openingId }>} poly — в плане, top — отметка верха от земли
 */
export function porchSteps(project, levelId, geoms, base) {
  if (base < 0.12) return [];
  const rooms = project.rooms.filter((r) => r.levelId === levelId);
  const out = [];
  for (const g of geoms.values()) {
    if (g.wall.kind !== 'exterior') continue;
    for (const o of project.openings) {
      if (o.wallId !== g.wall.id || o.kind === 'window' || o.sill > 0.05) continue;
      const side = outsideSide(g, o, rooms, geoms);
      if (!side) continue;
      const n = Math.max(1, Math.round(base / RISER));
      const half = o.width / 2 + 0.25;
      const s0 = o.t - half;
      const s1 = o.t + half;
      const nn = mul(g.n, side);
      let from = g.half;
      for (let k = 0; k < n; k++) {
        const depth = k === 0 ? LANDING : TREAD;
        const to = from + depth;
        const a0 = add(pointOnWall(g, s0), mul(nn, from));
        const a1 = add(pointOnWall(g, s1), mul(nn, from));
        const b1 = add(pointOnWall(g, s1), mul(nn, to));
        const b0 = add(pointOnWall(g, s0), mul(nn, to));
        out.push({ poly: [a0, a1, b1, b0], top: (base * (n - k)) / n, openingId: o.id });
        from = to;
      }
    }
  }
  return out;
}

