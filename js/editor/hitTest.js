/** Поиск объекта под курсором и объектов в рамке выделения. */
import { pointInPolygon, pointInRotRect, distToPolygonEdges, polygonArea, dist } from '../core/geometry.js';
import { isGroundLevel, SITE_LEVEL } from '../model/project.js';
import { openingFrame } from './render/drawOpenings.js';
import { stairLayout } from '../geometry/stairGeometry.js';
import { stairRise } from './render/drawStairs.js';
import { roofGeometry } from '../geometry/roofGeometry.js';

const ROUND_ITEMS = new Set(['tree', 'conifer', 'fruit_tree', 'bush', 'plant', 'round_table', 'well']);

export function hitTest(editor, p, { tolPx = 6, kinds = null } = {}) {
  const { project, state } = editor.app;
  const levelId = state.activeLevelId;
  const tol = editor.viewport.px(tolPx);
  const geoms = editor.geomsFor(levelId);
  const ground = isGroundLevel(project, levelId);
  const want = (k) => !kinds || kinds.includes(k);

  if (want('opening')) {
    for (const o of project.openings) {
      const g = geoms.get(o.wallId);
      if (!g) continue;
      const f = openingFrame(g, o);
      if (pointInPolygon(p, f.poly) || distToPolygonEdges(p, f.poly) < tol * 0.6) return { kind: 'opening', id: o.id };
    }
  }

  if (want('item')) {
    const items = project.items.filter((i) => i.levelId === levelId).sort((a, b) => b.elevation + b.h - (a.elevation + a.h));
    for (const it of items) if (pointInRotRect(p, it.x, it.y, it.w, it.d, it.rotation, tol * 0.5)) return { kind: 'item', id: it.id };
  }

  if (want('stair')) {
    for (const s of project.stairs.filter((x) => x.levelId === levelId)) {
      if (pointInPolygon(p, stairLayout(s, stairRise(project, s)).outline)) return { kind: 'stair', id: s.id };
    }
  }

  if (want('wall')) {
    let best = null;
    let bestD = tol;
    for (const g of geoms.values()) {
      if (pointInPolygon(p, g.poly)) return { kind: 'wall', id: g.wall.id };
      const d = distToPolygonEdges(p, g.poly);
      if (d < bestD) {
        best = g;
        bestD = d;
      }
    }
    if (best) return { kind: 'wall', id: best.wall.id };
  }

  if (want('roof') && state.settings.roofs2d) {
    for (const roof of project.roofs.filter((x) => x.levelId === levelId)) {
      const geo = roofGeometry(roof, 0);
      if (distToPolygonEdges(p, geo.plan.outline) < tol * 1.5) return { kind: 'roof', id: roof.id };
    }
  }

  if (ground && want('item')) {
    const items = project.items.filter((i) => i.levelId === SITE_LEVEL).sort((a, b) => a.w * a.d - b.w * b.d);
    for (const it of items) {
      if (ROUND_ITEMS.has(it.type)) {
        if (dist(p, it) < Math.min(it.w, it.d) / 2) return { kind: 'item', id: it.id };
      } else if (pointInRotRect(p, it.x, it.y, it.w, it.d, it.rotation, tol * 0.5)) return { kind: 'item', id: it.id };
    }
  }

  if (want('room')) {
    const rooms = project.rooms.filter((r) => r.levelId === levelId && pointInPolygon(p, r.points));
    if (rooms.length) {
      rooms.sort((a, b) => polygonArea(a.points) - polygonArea(b.points));
      return { kind: 'room', id: rooms[0].id };
    }
  }

  if (ground && want('zone')) {
    const zones = project.zones.filter((z) => pointInPolygon(p, z.points));
    if (zones.length) {
      zones.sort((a, b) => polygonArea(a.points) - polygonArea(b.points));
      return { kind: 'zone', id: zones[0].id };
    }
  }

  if (want('site') && distToPolygonEdges(p, project.site.boundary) < tol * 1.5) return { kind: 'site', id: 'site' };
  return null;
}

/** Объекты, целиком попавшие в прямоугольник рамки. */
export function entitiesInRect(editor, rect) {
  const { project, state } = editor.app;
  const levelId = state.activeLevelId;
  const ground = isGroundLevel(project, levelId);
  const inside = (pt) => pt.x >= rect.minX && pt.x <= rect.maxX && pt.y >= rect.minY && pt.y <= rect.maxY;
  const out = [];
  for (const w of project.walls)
    if (w.levelId === levelId && inside({ x: w.x1, y: w.y1 }) && inside({ x: w.x2, y: w.y2 })) out.push({ kind: 'wall', id: w.id });
  for (const it of project.items)
    if ((it.levelId === levelId || (ground && it.levelId === SITE_LEVEL)) && inside(it)) out.push({ kind: 'item', id: it.id });
  for (const s of project.stairs) if (s.levelId === levelId && inside(s)) out.push({ kind: 'stair', id: s.id });
  for (const r of project.rooms) if (r.levelId === levelId && r.points.every(inside)) out.push({ kind: 'room', id: r.id });
  for (const r of project.roofs) if (r.levelId === levelId && inside(r)) out.push({ kind: 'roof', id: r.id });
  if (ground) for (const z of project.zones) if (z.points.every(inside)) out.push({ kind: 'zone', id: z.id });
  return out;
}
