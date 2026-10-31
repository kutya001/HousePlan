/**
 * Где появляется манекен при начале прогулки.
 *  entrance — на участке перед главным входом, лицом к двери (по умолчанию);
 *  inside   — в комнате активного этажа, на которую смотрит камера;
 *  point    — в своей точке, отмеченной на плане (project.site.spawn).
 */
import { computeWallGeometry, pointOnWall } from '../../geometry/wallGeometry.js';
import { outsideSide } from '../../geometry/porch.js';
import { levelFootprints } from '../../geometry/roomDetect.js';
import { add, mul, pointInPolygon, polygonLabelPoint, polygonArea, bboxOf } from '../../core/geometry.js';
import { groundLevel, levelElevation, getLevel, SITE_LEVEL } from '../../model/project.js';

const ENTRY_ROOM = /прихож|тамбур|холл|вход|коридор|сени|веранд/i;
const WALKWAY = new Set(['paving', 'gravel', 'asphalt', 'deck']);
const PORCH_RISER = 0.17;

/** Своя точка появления, если она задана и её этаж существует. */
export function customSpawn(project) {
  const s = project.site?.spawn;
  if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) return null;
  if (s.levelId !== SITE_LEVEL && !getLevel(project, s.levelId)) return null;
  return s;
}

/**
 * Точка у главного входа. Ищем наружную дверь первого этажа (лучше — в прихожую
 * и к дорожке), отходим от крыльца на пару метров и проверяем, что место свободно.
 * @returns {{ x, y, yaw, levelId } | null}
 */
export function entranceSpawn(project, world) {
  const ground = groundLevel(project);
  if (!ground) return null;
  const walls = project.walls.filter((w) => w.levelId === ground.id);
  if (!walls.length) return null;
  const geoms = computeWallGeometry(walls);
  const rooms = project.rooms.filter((r) => r.levelId === ground.id);
  const base = levelElevation(project, ground.id);
  const porch = base >= 0.12 ? 0.7 + (Math.max(1, Math.round(base / PORCH_RISER)) - 1) * 0.3 : 0;

  const doors = [];
  for (const o of project.openings) {
    const g = geoms.get(o.wallId);
    if (!g || o.kind === 'window' || o.sill > 0.05) continue;
    const side = outsideSide(g, o, rooms, geoms);
    if (!side) continue;
    const c = pointOnWall(g, o.t);
    const nn = mul(g.n, side);
    const inside = add(c, mul(nn, -(g.half + 0.5)));
    const room = rooms.find((r) => pointInPolygon(inside, r.points));
    const front = add(c, mul(nn, g.half + porch + 2.5));
    let score = o.width + (o.kind === 'door' ? 0.5 : 0);
    if (g.wall.kind === 'exterior') score += 1;
    if (room && ENTRY_ROOM.test(room.name || '')) score += 2;
    if (project.zones.some((z) => WALKWAY.has(z.material) && pointInPolygon(front, z.points))) score += 1.5;
    doors.push({ o, g, c, nn, score });
  }
  doors.sort((a, b) => b.score - a.score);
  for (const d of doors) {
    const t = { x: -d.nn.y, y: d.nn.x };
    for (const dist of [2.2, 1.6, 3.0, 4.0, 5.2]) {
      for (const lat of [0, 0.7, -0.7, 1.4, -1.4]) {
        const p = add(add(d.c, mul(d.nn, d.g.half + porch + dist)), mul(t, lat));
        if (freeOnGround(project, world, p)) return { x: p.x, y: p.y, yaw: Math.atan2(-d.nn.x, -d.nn.y), levelId: ground.id };
      }
    }
  }

  // дверей наружу нет — встаём перед самой длинной стороной дома, где больше места
  const fps = levelFootprints(walls);
  if (!fps.length) return null;
  const fp = fps.reduce((a, b) => (polygonArea(a) >= polygonArea(b) ? a : b));
  const bb = bboxOf(fp);
  const cx = (bb.minX + bb.maxX) / 2;
  const cy = (bb.minY + bb.maxY) / 2;
  const sides = [
    { p: { x: cx, y: bb.maxY }, n: { x: 0, y: 1 } },
    { p: { x: cx, y: bb.minY }, n: { x: 0, y: -1 } },
    { p: { x: bb.maxX, y: cy }, n: { x: 1, y: 0 } },
    { p: { x: bb.minX, y: cy }, n: { x: -1, y: 0 } },
  ];
  for (const s of sides) {
    for (const dist of [2.5, 3.5, 5]) {
      const p = add(s.p, mul(s.n, dist));
      if (freeOnGround(project, world, p)) return { x: p.x, y: p.y, yaw: Math.atan2(-s.n.x, -s.n.y), levelId: ground.id };
    }
  }
  return null;
}

/** Точка в комнате активного этажа: под центром вида, иначе — в самой большой. */
export function insideSpawn(project, levelId, target) {
  const rooms = project.rooms.filter((r) => r.levelId === levelId);
  const here = target && rooms.find((r) => pointInPolygon(target, r.points));
  if (here) return { ...polygonLabelPoint(here.points), levelId };
  if (rooms.length) {
    const big = rooms.reduce((a, b) => (polygonArea(a.points) >= polygonArea(b.points) ? a : b));
    return { ...polygonLabelPoint(big.points), levelId };
  }
  return target ? { ...target, levelId } : null;
}

function freeOnGround(project, world, p) {
  const b = project.site?.boundary;
  if (b?.length >= 3 && !pointInPolygon(p, b)) return false;
  const sup = world.supportAt(p.x, p.y, 0.5);
  if (sup.y < -0.05 || sup.y > 0.4) return false; // яма котлована или высокий предмет
  return world.freeAt(p.x, p.y, 0.32, sup.y + 0.3, sup.y + 1.75);
}
