/** Перекрытия (полы комнат с проёмами под лестницы), лестницы и крыши. */
import * as THREE from 'three';
import { extrudePolygon, prism3D, mergeGeometries, mesh, cylinder, box, planarUV } from '../meshUtils.js';
import { mat, TEX } from '../materials.js';
import { FLOOR_TEXTURE } from '../textures.js';
import { COLORS, FLOOR_MATERIALS, TREAD, stairStyle } from '../../model/defaults.js';
import { stairLayout } from '../../geometry/stairGeometry.js';
import { roofGeometry } from '../../geometry/roofGeometry.js';
import { pointInPolygon } from '../../core/geometry.js';
import { levelBelow, levelTop, getLevel, levelWallHeight, isAttic, isBasement } from '../../model/project.js';
import { levelFootprints } from '../../geometry/roomDetect.js';
import { computeWallGeometry } from '../../geometry/wallGeometry.js';
import { stairRails, RAIL_HEIGHT, GUARD_HEIGHT, STRINGER_D, stairFootprintsAbove, stairFootprintsOverOpening } from '../../geometry/stairRails.js';
import { railingMesh } from './railing.js';

/** Подъём чистого пола над отметкой этажа в 3D — против мерцания совпадающих граней. */
export const FLOOR_LIFT = 0.006;

export function stairRise3D(project, stair) {
  const lvl = getLevel(project, stair.levelId);
  return lvl ? levelWallHeight(lvl) : 3;
}

/** Полы комнат. На этажах выше первого — с вырезами под лестницы снизу. */
export function buildFloors(project, level, base, index) {
  const group = new THREE.Group();
  const below = levelBelow(project, level.id);
  const holes = [];
  if (below) {
    for (const s of project.stairs.filter((x) => x.levelId === below.id)) holes.push(stairLayout(s, stairRise3D(project, s)).outline);
  }
  // нижний этаж над землёй — пол на засыпке до земли; подвал — на бетонной плите
  const y0 = index === 0 ? (base > 0.01 ? 0 : base - 0.1) : base - (below?.slab ?? 0.25);
  for (const room of project.rooms.filter((r) => r.levelId === level.id)) {
    const inner = holes.filter((h) => h.every((p) => pointInPolygon(p, room.points)));
    // чистый пол на несколько миллиметров выше верха стен этажа ниже и цоколя: иначе
    // их верхние грани лежат в одной плоскости с полом и «моргают» (z-fighting)
    let geo = extrudePolygon(room.points, y0, base + FLOOR_LIFT, inner);
    if (!geo) continue;
    const color = (FLOOR_MATERIALS[room.floor] || FLOOR_MATERIALS.laminate).color;
    if (TEX.on) geo = planarUV(geo);
    group.add(mesh(geo, mat(color, { roughness: 0.7, map: FLOOR_TEXTURE[room.floor] || 'laminate' }), { kind: 'room', id: room.id }, { cast: index > 0 }));
  }
  // дно котлована под подвалом — бетонная плита по пятну стен
  if (isBasement(level)) {
    const slabs = levelFootprints(project.walls.filter((w) => w.levelId === level.id)).map((fp) => extrudePolygon(fp, base - 0.35, base - 0.015));
    const geo = mergeGeometries(slabs);
    if (geo) group.add(mesh(geo, mat('#a29d95', { roughness: 0.95 }), null, { cast: false }));
  }
  return group;
}

/**
 * Лестницы трёх конструкций:
 *  solid    — монолитный марш: каждая ступень — сплошной блок до пола;
 *  stringer — открытые проступи на двух наклонных косоурах, площадки на стойках;
 *  floating — консольные «парящие» проступи без опор (крепятся к стене).
 * Винтовая — тонкие проступи вокруг стойки.
 */
export function buildStairs(project, levelId, base) {
  const group = new THREE.Group();
  for (const s of project.stairs.filter((x) => x.levelId === levelId)) {
    const lay = stairLayout(s, stairRise3D(project, s));
    const style = stairStyle(s);
    const geos = [];
    if (s.shape === 'spiral') {
      for (const st of lay.steps) geos.push(extrudePolygon(st.poly, base + st.top - 0.05, base + st.top));
      geos.push(cylinder(0.06, lay.risers * lay.riser + 0.9, s.x, base, s.y, 12));
    } else if (style === 'solid') {
      for (const st of lay.steps) geos.push(extrudePolygon(st.poly, base, base + st.top));
    } else {
      for (const st of lay.steps) {
        const th = st.landing ? TREAD.landing : TREAD[style];
        geos.push(extrudePolygon(st.poly, base + st.top - th, base + st.top));
        // площадка на косоурах стоит на четырёх тонких стойках
        if (st.landing && style === 'stringer') geos.push(...landingPosts(st.poly, base, base + st.top - th));
      }
      if (style === 'stringer') geos.push(...stringers(lay.steps, base));
    }
    const geo = mergeGeometries(geos.filter(Boolean));
    if (!geo) continue;
    const m = mesh(geo, mat(s.color || COLORS.stair, { roughness: 0.6 }), { kind: 'stair', id: s.id });
    m.userData.edges = true;
    group.add(m);
    // перила со свободных сторон маршей и площадок; лестница, стоящая прямо
    // над этой (марш в марш), не должна оставлять свои перила внутри неё
    const rails = stairRails(s, lay, wallPolys(project, levelId), null, { blocked: stairFootprintsAbove(project, s) });
    if (rails.sides.length) {
      group.add(railingMesh(rails.sides.map((l) => l.map((p) => ({ ...p, h: base + p.h }))), RAIL_HEIGHT, { kind: 'stair', id: s.id }));
    }
  }
  return group;
}

/** Ограждение проёмов в перекрытии этого этажа над лестницами с этажа ниже. */
export function buildStairGuards(project, levelId, base) {
  const group = new THREE.Group();
  const below = levelBelow(project, levelId);
  if (!below) return group;
  const upper = wallPolys(project, levelId);
  for (const s of project.stairs.filter((x) => x.levelId === below.id)) {
    const lay = stairLayout(s, stairRise3D(project, s));
    // лестница этого этажа может стоять прямо над проёмом — забор сквозь неё не ставим
    const { guards } = stairRails(s, lay, [], upper, { blocked: stairFootprintsOverOpening(project, levelId, lay.outline) });
    if (guards.length) group.add(railingMesh(guards.map((l) => l.map((p) => ({ ...p, h: base + FLOOR_LIFT }))), GUARD_HEIGHT, { kind: 'stair', id: s.id }));
  }
  return group;
}

/** Многоугольники стен этажа (для поиска свободных сторон лестницы). */
export function wallPolys(project, levelId) {
  return [...computeWallGeometry(project.walls.filter((w) => w.levelId === levelId)).values()].map((g) => g.poly);
}

const STRINGER_T = 0.05; // толщина косоура

/** Косоуры каждого марша: две наклонные доски под краями проступей. */
function stringers(steps, base) {
  const out = [];
  let prevTop = 0;
  let run = [];
  const flush = () => {
    if (run.length >= 2) out.push(...runStringers(run, base, prevTop));
    if (run.length) prevTop = run[run.length - 1].top;
    run = [];
  };
  for (const st of steps) {
    if (st.landing) {
      flush();
      prevTop = st.top;
    } else run.push(st);
  }
  flush();
  return out;
}

function runStringers(run, base, yStart) {
  const c0 = centroid(run[0].poly);
  const c1 = centroid(run[run.length - 1].poly);
  let dx = c1.x - c0.x;
  let dy = c1.y - c0.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-3) return [];
  dx /= L;
  dy /= L;
  const vx = -dy;
  const vy = dx;
  let u0 = Infinity;
  let u1 = -Infinity;
  let w0 = Infinity;
  let w1 = -Infinity;
  for (const st of run) {
    for (const p of st.poly) {
      const u = p.x * dx + p.y * dy;
      const w = p.x * vx + p.y * vy;
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      w0 = Math.min(w0, w);
      w1 = Math.max(w1, w);
    }
  }
  const depth = (u1 - u0) / run.length;
  const th = TREAD.stringer;
  const t1 = run[0].top;
  const tN = run[run.length - 1].top;
  const slope = (tN - t1) / Math.max(0.05, u1 - u0 - depth);
  const yA = Math.max(yStart, t1 - th - (slope * depth) / 2);
  const yB = tN - th;
  const k = (yB - yA) / Math.max(0.05, u1 - u0);
  // сечение в плоскости (u, высота): низ упирается в пол или площадку
  let shape;
  if (yA - STRINGER_D < yStart) {
    const uC = Math.min(u1, u0 + (yStart - (yA - STRINGER_D)) / Math.max(1e-3, k));
    shape = [
      [u0, yStart],
      [u0, yA],
      [u1, yB],
      [u1, Math.max(yStart, yB - STRINGER_D)],
      [uC, yStart],
    ];
  } else {
    shape = [
      [u0, yA - STRINGER_D],
      [u0, yA],
      [u1, yB],
      [u1, yB - STRINGER_D],
    ];
  }
  const out = [];
  for (const w of [w0, w1 - STRINGER_T]) {
    const poly = shape.map(([u, y]) => ({ x: dx * u + vx * w, y: base + y, z: dy * u + vy * w }));
    out.push(prism3D(poly, { x: vx * STRINGER_T, y: 0, z: vy * STRINGER_T }));
  }
  return out;
}

function landingPosts(poly, y0, y1) {
  if (y1 - y0 < 0.1) return [];
  const c = centroid(poly);
  return poly.map((p) => {
    const L = Math.hypot(c.x - p.x, c.y - p.y) || 1;
    const k = Math.min(0.06, L / 2) / L;
    return box(0.06, y1 - y0, 0.06, p.x + (c.x - p.x) * k, y0, p.y + (c.y - p.y) * k);
  });
}

function centroid(poly) {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / poly.length, y: y / poly.length };
}

export function buildRoof(project, roof) {
  const group = new THREE.Group();
  const H = levelTop(project, roof.levelId);
  const geo = roofGeometry(roof, H);
  const ref = { kind: 'roof', id: roof.id };
  const surf = [];
  for (const s of geo.surfaces) {
    if (s.flat) {
      const pts = s.poly.map((p) => ({ x: p.x, y: p.z }));
      surf.push(extrudePolygon(pts, H, H + s.thickness));
    } else {
      surf.push(prism3D(s.poly, { x: 0, y: -0.2, z: 0 }));
    }
  }
  let sg = mergeGeometries(surf);
  if (sg) {
    const cover = roof.type === 'flat' ? 'concrete' : roof.cover || 'metal';
    if (TEX.on && cover !== 'plain') sg = planarUV(sg);
    const m = mesh(sg, mat(roof.color || COLORS.roof, { roughness: 0.75, map: cover === 'plain' ? null : cover }), ref);
    m.userData.edges = true;
    group.add(m);
  }
  const gab = [];
  // у мансарды фронтоны — это её стены (срезанные скатами), отдельные треугольники не нужны
  const gables = isAttic(getLevel(project, roof.levelId)) ? [] : geo.gables;
  for (const poly of gables) {
    const a = poly[0];
    const b = poly[1];
    const c = poly[2];
    const u = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
    const v = new THREE.Vector3(c.x - a.x, 0, c.z - a.z);
    const n = u.cross(v).normalize();
    const toCenter = new THREE.Vector3(roof.x - a.x, 0, roof.y - a.z);
    if (n.dot(toCenter) < 0) n.negate();
    n.multiplyScalar(0.3);
    gab.push(prism3D(poly, { x: n.x, y: n.y, z: n.z }));
  }
  let gg = mergeGeometries(gab);
  if (gg) {
    if (TEX.on) gg = planarUV(gg);
    const m = mesh(gg, mat(COLORS.facade, { map: project.facade || 'plaster' }), ref);
    m.userData.edges = true;
    group.add(m);
  }
  group.userData.ref = ref;
  return group;
}
