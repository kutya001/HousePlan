/** Земля, газон участка, зоны ландшафта и забор. */
import * as THREE from 'three';
import { extrudePolygon, mergeGeometries, mesh, box, planarUV } from '../meshUtils.js';
import { mat, TEX } from '../materials.js';
import { ZONE_TEXTURE } from '../textures.js';
import { COLORS, ZONE_MATERIALS } from '../../model/defaults.js';
import { bboxOf, dist, pointInPolygon, subtractConvex, isConvex } from '../../core/geometry.js';
import { excavationOutlines } from '../../geometry/excavation.js';
import { cellarEntries, RAIL_H, PIT_CURB } from '../../geometry/cellarEntry.js';

export function buildSite(project) {
  const group = new THREE.Group();
  group.name = 'site';
  const b = project.site.boundary;
  const bb = bboxOf(b);
  const size = Math.max(160, Math.max(bb.w, bb.h) * 4);

  // над подвалом в земле вырезан котлован — его видно при разрезе по этажу
  const pits = excavationOutlines(project);
  const inside = (poly, outer) => poly.every((p) => pointInPolygon(p, outer));
  const cx = (bb.minX + bb.maxX) / 2;
  const cy = (bb.minY + bb.maxY) / 2;
  const half = size / 2;
  const square = [
    { x: cx - half, y: cy - half },
    { x: cx + half, y: cy - half },
    { x: cx + half, y: cy + half },
    { x: cx - half, y: cy + half },
  ];
  const ground = mesh(extrudePolygon(square, -0.03, -0.01, pits.filter((h) => inside(h, square))), mat('#cdd5c3', { roughness: 1 }), null, { cast: false });
  group.add(ground);

  let lawn = extrudePolygon(b, -0.01, 0.01, pits.filter((h) => inside(h, b)));
  if (lawn && TEX.on) lawn = planarUV(lawn);
  if (lawn) group.add(mesh(lawn, mat(COLORS.lawn, { roughness: 1, map: 'grass' }), { kind: 'site', id: 'site' }, { cast: false }));

  for (const z of project.zones) {
    const m = ZONE_MATERIALS[z.material] || ZONE_MATERIALS.lawn;
    const top = z.material === 'water' ? 0.015 : z.material === 'deck' ? 0.12 : 0.03;
    // приямок, задевающий край дорожки, вырезаем из неё: дорожка не висит над ступенями
    let pieces = [z.points];
    for (const h of pits) {
      if (inside(h, z.points) || !isConvex(h)) continue;
      pieces = pieces.flatMap((p) => subtractConvex(p, h));
    }
    let geo = mergeGeometries(pieces.map((p) => extrudePolygon(p, 0, top, pits.filter((h) => inside(h, p)))));
    if (!geo) continue;
    if (TEX.on && ZONE_TEXTURE[z.material]) geo = planarUV(geo);
    const material = z.material === 'water' ? mat(m.color, { roughness: 0.1, metalness: 0.1 }) : mat(m.color, { roughness: 0.95, map: ZONE_TEXTURE[z.material] });
    group.add(mesh(geo, material, { kind: 'zone', id: z.id }, { cast: false }));
  }

  buildCellarEntries(project, group);

  const fence = project.site.fence;
  if (fence?.enabled) {
    const h = fence.height || 1.8;
    const posts = [];
    const panels = [];
    for (let i = 0; i < b.length; i++) {
      const a = b[i];
      const c = b[(i + 1) % b.length];
      const L = dist(a, c);
      if (L < 0.05) continue;
      const ang = Math.atan2(c.y - a.y, c.x - a.x);
      const n = Math.max(1, Math.round(L / 2.5));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const g = box(0.08, h + 0.1, 0.08, a.x + (c.x - a.x) * t, 0, a.y + (c.y - a.y) * t);
        posts.push(g);
      }
      const panel = box(L, h - 0.15, 0.025, 0, 0.1, 0);
      panel.rotateY(-ang);
      panel.translate((a.x + c.x) / 2, 0, (a.y + c.y) / 2);
      panels.push(panel);
    }
    const pg = mergeGeometries(posts);
    if (pg) group.add(mesh(pg, mat('#55504a')));
    const panelGeo = mergeGeometries(panels);
    if (panelGeo) group.add(mesh(panelGeo, mat(fence.color || COLORS.fence, { roughness: 0.6 }), { kind: 'site', id: 'site' }));
  }
  return group;
}

/** Приямки входов в подвал: площадка, ступени, подпорные стенки и ограждение. */
function buildCellarEntries(project, group) {
  const steps = [];
  const walls = [];
  const rails = [];
  for (const e of cellarEntries(project)) {
    steps.push(extrudePolygon(e.landing.poly, e.base - 0.12, e.base));
    for (const st of e.steps) steps.push(extrudePolygon(st.poly, e.base - 0.12, st.top));
    for (const w of e.walls) {
      walls.push(extrudePolygon(w.poly, w.y0, w.y1));
      if (w.rail) rails.push(...railing(w.rail[0], w.rail[1]));
    }
  }
  const sg = mergeGeometries(steps.filter(Boolean));
  if (sg) {
    const m = mesh(sg, mat('#b7b1a7', { roughness: 0.9 }));
    m.userData.edges = true;
    group.add(m);
  }
  const wg = mergeGeometries(walls.filter(Boolean));
  if (wg) {
    const m = mesh(wg, mat(COLORS.plinth, { roughness: 0.95 }));
    m.userData.edges = true;
    group.add(m);
  }
  const rg = mergeGeometries(rails);
  if (rg) group.add(mesh(rg, mat('#3d4146', { roughness: 0.4, metalness: 0.5 })));
}

/** Ограждение: стойки и поручень вдоль отрезка ab на бортике. */
function railing(a, b) {
  const L = dist(a, b);
  if (L < 0.2) return [];
  const out = [];
  const n = Math.max(1, Math.round(L / 1.2));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    out.push(box(0.04, RAIL_H - PIT_CURB, 0.04, a.x + (b.x - a.x) * t, PIT_CURB, a.y + (b.y - a.y) * t));
  }
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  for (const y of [RAIL_H - 0.04, (RAIL_H + PIT_CURB) / 2]) {
    const r = box(L + 0.04, 0.04, 0.04, 0, 0, 0);
    r.rotateY(-ang);
    r.translate((a.x + b.x) / 2, y, (a.y + b.y) / 2);
    out.push(r);
  }
  return out;
}
