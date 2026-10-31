/**
 * Поиск замкнутых контуров стен (комнат).
 * Оси стен превращаются в планарный граф: стены режутся в точках пересечений,
 * затем обходом «правой рукой» находятся все грани графа.
 * Клик внутри контура → самая маленькая грань, содержащая точку.
 */
import {
  dist,
  sub,
  segmentIntersect,
  projectOnSegment,
  polygonSignedArea,
  pointInPolygon,
  simplifyPolygon,
  insetPolygon,
  polygonArea,
} from '../core/geometry.js';

const TOL = 0.015;

function buildGraph(walls) {
  const segs = walls.map((w) => ({ a: { x: w.x1, y: w.y1 }, b: { x: w.x2, y: w.y2 }, ts: [0, 1], wall: w }));
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s1 = segs[i];
      const s2 = segs[j];
      const hit = segmentIntersect(s1.a, s1.b, s2.a, s2.b, 1e-6);
      if (hit) {
        s1.ts.push(hit.t);
        s2.ts.push(hit.u);
      }
      // Т-примыкания с небольшим зазором
      for (const [s, o] of [
        [s1, s2],
        [s2, s1],
      ]) {
        for (const p of [o.a, o.b]) {
          const pr = projectOnSegment(p, s.a, s.b);
          if (pr.dist < TOL && pr.rawT > 0 && pr.rawT < 1) s.ts.push(pr.rawT);
        }
      }
    }
  }

  const verts = [];
  const vertAt = (p) => {
    for (let i = 0; i < verts.length; i++) if (dist(verts[i], p) < TOL) return i;
    verts.push({ x: p.x, y: p.y });
    return verts.length - 1;
  };
  const edgeSet = new Set();
  const edges = [];
  for (const s of segs) {
    const ts = [...new Set(s.ts.map((t) => Math.round(t * 1e6) / 1e6))].sort((a, b) => a - b);
    for (let k = 0; k < ts.length - 1; k++) {
      const pa = { x: s.a.x + (s.b.x - s.a.x) * ts[k], y: s.a.y + (s.b.y - s.a.y) * ts[k] };
      const pb = { x: s.a.x + (s.b.x - s.a.x) * ts[k + 1], y: s.a.y + (s.b.y - s.a.y) * ts[k + 1] };
      const u = vertAt(pa);
      const v = vertAt(pb);
      if (u === v) continue;
      const key = u < v ? `${u}_${v}` : `${v}_${u}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push({ u, v, wall: s.wall });
    }
  }
  return { verts, edges };
}

/** Все ограниченные грани графа стен. */
export function findFaces(walls) {
  return traceFaces(walls).inner;
}

/**
 * Пятно застройки этажа: внешние контуры стен, раздвинутые наружу на полутолщину
 * стен. Нужно, чтобы вырезать в грунте котлован под подвал.
 * @returns {Array<Array<{x,y}>>}
 */
export function levelFootprints(walls) {
  const out = [];
  for (const loop of traceFaces(walls).outer) {
    let pts = loop.map((e) => ({ ...e.p }));
    let dist = loop.map((e) => e.wall.thickness / 2);
    // убрать вершины на прямой (стена, разрезанная примыканием)
    for (let i = 0; i < pts.length && pts.length > 3; ) {
      const a = pts[(i + pts.length - 1) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(cr) < 1e-6 * Math.max(1, Math.hypot(c.x - a.x, c.y - a.y))) {
        const k = (i + pts.length - 1) % pts.length;
        dist[k] = Math.max(dist[k], dist[i]);
        pts.splice(i, 1);
        dist.splice(i, 1);
      } else i++;
    }
    if (pts.length < 3) continue;
    out.push(insetPolygon(pts, dist.map((d) => -d)));
  }
  return out;
}

function traceFaces(walls) {
  const { verts, edges } = buildGraph(walls);
  const out = verts.map(() => []);
  const half = [];
  for (const e of edges) {
    const h1 = { from: e.u, to: e.v, wall: e.wall, used: false };
    const h2 = { from: e.v, to: e.u, wall: e.wall, used: false };
    h1.twin = h2;
    h2.twin = h1;
    half.push(h1, h2);
    out[e.u].push(h1);
    out[e.v].push(h2);
  }
  for (let i = 0; i < verts.length; i++) {
    for (const h of out[i]) {
      const d = sub(verts[h.to], verts[i]);
      h.ang = Math.atan2(d.y, d.x);
    }
    out[i].sort((a, b) => a.ang - b.ang);
  }

  const faces = [];
  const outer = [];
  for (const start of half) {
    if (start.used) continue;
    const loop = [];
    let h = start;
    let guard = 0;
    while (!h.used && guard++ < 10000) {
      h.used = true;
      loop.push(h);
      const list = out[h.to];
      const idx = list.indexOf(h.twin);
      // следующее ребро — ближайшее по часовой стрелке от обратного
      h = list[(idx - 1 + list.length) % list.length];
    }
    if (loop.length < 3) continue;
    const poly = loop.map((e) => verts[e.from]);
    const area = polygonSignedArea(poly);
    if (area > 1e-4) faces.push({ poly: simplifyPolygon(poly.map((p) => ({ ...p }))), area, edges: loop });
    else if (area < -1e-4) outer.push(loop.map((e) => ({ p: verts[e.from], wall: e.wall })));
  }
  return { inner: faces, outer };
}

/** Контур комнаты под точкой или null. */
export function detectRoomAt(walls, point) {
  const faces = findFaces(walls).filter((f) => pointInPolygon(point, f.poly));
  if (!faces.length) return null;
  faces.sort((a, b) => a.area - b.area);
  return faces[0].poly;
}

/**
 * «Чистая» площадь комнаты: контур по осям стен, сдвинутый внутрь на половину
 * толщины стены, которая проходит вдоль каждого ребра.
 */
export function roomNetArea(room, walls) {
  const pts = room.points;
  if (pts.length < 3) return 0;
  const insets = pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length];
    let best = 0;
    for (const w of walls) {
      const wa = { x: w.x1, y: w.y1 };
      const wb = { x: w.x2, y: w.y2 };
      const d1 = projectOnSegment(a, wa, wb).dist;
      const d2 = projectOnSegment(b, wa, wb).dist;
      if (d1 < TOL && d2 < TOL) best = Math.max(best, w.thickness / 2);
    }
    return best;
  });
  const inner = insetPolygon(pts, insets);
  return polygonArea(inner);
}
