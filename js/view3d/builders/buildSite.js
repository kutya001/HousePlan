/** Земля, газон участка, зоны ландшафта и забор. */
import * as THREE from 'three';
import { extrudePolygon, mergeGeometries, mesh, box, planarUV } from '../meshUtils.js';
import { mat, TEX } from '../materials.js';
import { ZONE_TEXTURE } from '../textures.js';
import { COLORS, ZONE_MATERIALS } from '../../model/defaults.js';
import { bboxOf, dist, pointInPolygon, polygonsOverlap, subtractPolygons, segmentIntersect } from '../../core/geometry.js';
import { excavationPits } from '../../geometry/excavation.js';
import { cellarEntries, RAIL_H, PIT_CURB } from '../../geometry/cellarEntry.js';

export function buildSite(project) {
  const group = new THREE.Group();
  group.name = 'site';
  const b = project.site.boundary;
  const bb = bboxOf(b);
  const size = Math.max(160, Math.max(bb.w, bb.h) * 4);

  // над подвалом в земле вырезан котлован — его видно при разрезе по этажу
  const pitList = excavationPits(project);
  const pits = pitList.map((p) => p.poly);
  const cx = (bb.minX + bb.maxX) / 2;
  const cy = (bb.minY + bb.maxY) / 2;
  const half = size / 2;
  const square = [
    { x: cx - half, y: cy - half },
    { x: cx + half, y: cy - half },
    { x: cx + half, y: cy + half },
    { x: cx - half, y: cy + half },
  ];
  const ground = groundLayer(square, -0.03, -0.01, pits);
  if (ground) group.add(mesh(ground, mat('#cdd5c3', { roughness: 1 }), null, { cast: false }));
  buildPitSoil(pitList, group);

  let lawn = groundLayer(b, -0.01, 0.01, pits);
  if (lawn && TEX.on) lawn = planarUV(lawn);
  if (lawn) group.add(mesh(lawn, mat(COLORS.lawn, { roughness: 1, map: 'grass' }), { kind: 'site', id: 'site' }, { cast: false }));

  for (const z of project.zones) {
    const m = ZONE_MATERIALS[z.material] || ZONE_MATERIALS.lawn;
    const top = z.material === 'water' ? 0.015 : z.material === 'deck' ? 0.12 : 0.03;
    // ямы вырезаем и из дорожек, террас, грядок: покрытие не висит над подвалом и ступенями приямка
    let geo = groundLayer(z.points, 0, top, pits);
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

/** Яма целиком внутри контура и не задевает его край. */
function contains(outer, inner) {
  if (!inner.every((p) => pointInPolygon(p, outer))) return false;
  for (let i = 0; i < inner.length; i++) {
    for (let j = 0; j < outer.length; j++) {
      if (segmentIntersect(inner[i], inner[(i + 1) % inner.length], outer[j], outer[(j + 1) % outer.length], 1e-9)) return false;
    }
  }
  return true;
}

/**
 * Плоский слой земли (газон, дорожка) с вырезами под ямы.
 * Обычный случай — ямы целиком внутри и не задевают друг друга: отверстия в одном
 * многоугольнике. Иначе (ямы пересекаются или выходят за край) — вычитание по кускам.
 */
export function groundLayer(poly, y0, y1, pits) {
  const hit = pits.filter((h) => h.length >= 3 && polygonsOverlap(h, poly));
  if (!hit.length) return extrudePolygon(poly, y0, y1);
  const apart = hit.every((h, i) => contains(poly, h) && hit.every((g, j) => j <= i || !polygonsOverlap(h, g)));
  if (apart) return extrudePolygon(poly, y0, y1, hit);
  return mergeGeometries(subtractPolygons(poly, hit).map((p) => extrudePolygon(p, y0, y1)).filter(Boolean));
}

const SOIL = '#8a7560';

/**
 * Грунт котлована: дно и откосы. Нужны, пока подвал не достроен (стены не замкнуты,
 * пола нет) — иначе сквозь яму видно пустоту. Откос не ставим там, где к яме
 * примыкает другая (приямок входа, соседняя часть подвала).
 */
function buildPitSoil(pitList, group) {
  const parts = [];
  const house = pitList.filter((p) => p.kind === 'house');
  for (const pit of house) {
    const bottom = pit.floor - 0.5;
    parts.push(extrudePolygon(pit.poly, bottom, pit.floor - 0.36));
    const others = pitList.filter((q) => q !== pit).map((q) => q.poly);
    const n = pit.poly.length;
    const ccw = signedArea(pit.poly) > 0;
    for (let i = 0; i < n; i++) {
      const a = pit.poly[i];
      const c = pit.poly[(i + 1) % n];
      const L = dist(a, c);
      if (L < 0.02) continue;
      const k = Math.max(1, Math.ceil(L / 0.6));
      // наружная нормаль ребра
      const nx = ((c.y - a.y) / L) * (ccw ? 1 : -1);
      const ny = (-(c.x - a.x) / L) * (ccw ? 1 : -1);
      for (let s = 0; s < k; s++) {
        const p = { x: a.x + ((c.x - a.x) * s) / k, y: a.y + ((c.y - a.y) * s) / k };
        const q = { x: a.x + ((c.x - a.x) * (s + 1)) / k, y: a.y + ((c.y - a.y) * (s + 1)) / k };
        const m = { x: (p.x + q.x) / 2 + nx * 0.03, y: (p.y + q.y) / 2 + ny * 0.03 };
        if (others.some((o) => pointInPolygon(m, o))) continue;
        parts.push(
          extrudePolygon(
            [p, q, { x: q.x + nx * 0.06, y: q.y + ny * 0.06 }, { x: p.x + nx * 0.06, y: p.y + ny * 0.06 }],
            bottom,
            -0.012,
          ),
        );
      }
    }
  }
  const geo = mergeGeometries(parts.filter(Boolean));
  if (geo) group.add(mesh(geo, mat(SOIL, { roughness: 1 }), null, { cast: false }));
}

function signedArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
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
