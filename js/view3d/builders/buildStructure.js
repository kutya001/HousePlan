/** Перекрытия (полы комнат с проёмами под лестницы), лестницы и крыши. */
import * as THREE from 'three';
import { extrudePolygon, prism3D, mergeGeometries, mesh, cylinder } from '../meshUtils.js';
import { mat } from '../materials.js';
import { COLORS, FLOOR_MATERIALS } from '../../model/defaults.js';
import { stairLayout } from '../../geometry/stairGeometry.js';
import { roofGeometry } from '../../geometry/roofGeometry.js';
import { pointInPolygon } from '../../core/geometry.js';
import { levelBelow, levelTop, getLevel, levelWallHeight } from '../../model/project.js';

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
  const y0 = index === 0 ? 0 : base - (below?.slab ?? 0.25);
  for (const room of project.rooms.filter((r) => r.levelId === level.id)) {
    const inner = holes.filter((h) => h.every((p) => pointInPolygon(p, room.points)));
    const geo = extrudePolygon(room.points, y0, base, inner);
    if (!geo) continue;
    const color = (FLOOR_MATERIALS[room.floor] || FLOOR_MATERIALS.laminate).color;
    group.add(mesh(geo, mat(color, { roughness: 0.7 }), { kind: 'room', id: room.id }, { cast: index > 0 }));
  }
  return group;
}

export function buildStairs(project, levelId, base) {
  const group = new THREE.Group();
  for (const s of project.stairs.filter((x) => x.levelId === levelId)) {
    const lay = stairLayout(s, stairRise3D(project, s));
    const geos = lay.steps.map((st) =>
      st.thin ? extrudePolygon(st.poly, base + st.top - 0.05, base + st.top) : extrudePolygon(st.poly, base, base + st.top),
    );
    if (s.shape === 'spiral') geos.push(cylinder(0.06, lay.risers * lay.riser + 0.9, s.x, base, s.y, 12));
    const geo = mergeGeometries(geos);
    if (!geo) continue;
    const m = mesh(geo, mat(s.color || COLORS.stair, { roughness: 0.6 }), { kind: 'stair', id: s.id });
    m.userData.edges = true;
    group.add(m);
  }
  return group;
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
  const sg = mergeGeometries(surf);
  if (sg) {
    const m = mesh(sg, mat(roof.color || COLORS.roof, { roughness: 0.75 }), ref);
    m.userData.edges = true;
    group.add(m);
  }
  const gab = [];
  for (const poly of geo.gables) {
    // толщина фронтона — внутрь крыши
    const a = poly[0];
    const b = poly[1];
    const c = poly[2];
    const u = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
    const v = new THREE.Vector3(c.x - a.x, c.y - a.y, c.z - a.z);
    const n = u.cross(v).normalize();
    const toCenter = new THREE.Vector3(roof.x - a.x, 0, roof.y - a.z);
    if (n.dot(toCenter) < 0) n.negate();
    n.multiplyScalar(0.3);
    gab.push(prism3D(poly, { x: n.x, y: n.y, z: n.z }));
  }
  const gg = mergeGeometries(gab);
  if (gg) {
    const m = mesh(gg, mat(COLORS.facade), ref);
    m.userData.edges = true;
    group.add(m);
  }
  group.userData.ref = ref;
  return group;
}
