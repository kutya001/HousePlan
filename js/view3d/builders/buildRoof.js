/** Крыша в 3D: скаты с покрытием, фронтоны, водостоки, парапет плоской крыши. */
import * as THREE from 'three';
import { extrudePolygon, prism3D, mergeGeometries, mesh, planarUV } from '../meshUtils.js';
import { mat, TEX } from '../materials.js';
import { COLORS } from '../../model/defaults.js';
import { roofGeometry } from '../../geometry/roofGeometry.js';
import { roofGutters, GUTTER_R, PIPE_R } from '../../geometry/roofGutters.js';
import { roofCover } from '../../model/finishes.js';
import { insetPolygon } from '../../core/geometry.js';
import { levelTop, getLevel, isAttic } from '../../model/project.js';

const ROOF_T = 0.2; // толщина кровли со стропилами
const GABLE_T = 0.3; // толщина стенки фронтона
const PARAPET_T = 0.15;
/**
 * Кровля приподнята на пару сантиметров: её плоскость проходит ровно по верхней кромке
 * стен, и без зазора контур стены «просвечивает» сквозь скат пунктиром.
 */
export const ROOF_LIFT = 0.02;

export function buildRoof(project, roof) {
  const group = new THREE.Group();
  const H = levelTop(project, roof.levelId);
  const geo = roofGeometry(roof, H);
  const ref = { kind: 'roof', id: roof.id };
  const color = roof.color || COLORS.roof;
  const cover = roofCover(roof);

  const surf = [];
  for (const s of geo.surfaces) {
    if (s.flat) surf.push(extrudePolygon(s.poly.map((p) => ({ x: p.x, y: p.z })), H, H + s.thickness));
    else surf.push(prism3D(s.poly, { x: 0, y: -ROOF_T, z: 0 }));
  }
  let sg = mergeGeometries(surf);
  if (sg) {
    if (TEX.on && cover !== 'plain') sg = planarUV(sg);
    const m = mesh(sg, mat(color, { roughness: cover === 'seam' || cover === 'profsheet' || cover === 'metal' ? 0.55 : 0.8, metalness: cover === 'seam' || cover === 'profsheet' ? 0.25 : 0, map: cover === 'plain' ? null : cover }), ref);
    m.userData.edges = true;
    group.add(m);
  }

  const facade = mat(COLORS.facade, { map: project.facade || 'plaster' });
  const walls = [];
  // у мансарды фронтоны — это её стены (срезанные скатами), отдельные стенки не нужны
  const gables = isAttic(getLevel(project, roof.levelId)) ? [] : geo.gables;
  for (const poly of gables) {
    // стенка по линии стен дома, толщиной внутрь
    const dx = poly[1].x - poly[0].x;
    const dz = poly[1].z - poly[0].z;
    const L = Math.hypot(dx, dz) || 1;
    let nx = -dz / L;
    let nz = dx / L;
    if (nx * (roof.x - poly[0].x) + nz * (roof.y - poly[0].z) < 0) {
      nx = -nx;
      nz = -nz;
    }
    walls.push(prism3D(poly, { x: nx * GABLE_T, y: 0, z: nz * GABLE_T }));
  }
  // парапет плоской крыши — бортик по краю
  if (roof.type === 'flat' && roof.parapet > 0.02) {
    const outer = geo.plan.outline;
    const inner = insetPolygon(outer, outer.map(() => PARAPET_T));
    const top = H + geo.surfaces[0].thickness;
    walls.push(extrudePolygon(outer, top, top + roof.parapet, [inner]));
  }
  let wg = mergeGeometries(walls);
  if (wg) {
    if (TEX.on) wg = planarUV(wg);
    const m = mesh(wg, facade, ref);
    m.userData.edges = true;
    group.add(m);
  }

  const gut = buildGutters(project, roof, color);
  if (gut) group.add(gut);
  group.position.y = ROOF_LIFT;
  group.userData.ref = ref;
  return group;
}

/** Круглый пруток между двумя точками (водосточная труба, колено). */
function rod(p, q, r, seg = 10) {
  const v = new THREE.Vector3(q.x - p.x, q.y - p.y, q.z - p.z);
  const L = v.length();
  if (L < 1e-3) return null;
  const g = new THREE.CylinderGeometry(r, r, L, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()));
  g.translate((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
  return g;
}

/** Желоб: открытая сверху половина трубы вдоль карниза. */
function trough(a, b) {
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  if (L < 1e-3) return null;
  const g = new THREE.CylinderGeometry(GUTTER_R, GUTTER_R, L, 10, 1, true, Math.PI, Math.PI);
  g.rotateZ(Math.PI / 2); // ось — вдоль X, открытая сторона — вверх
  g.rotateY(-Math.atan2(b.z - a.z, b.x - a.x));
  g.translate((a.x + b.x) / 2, a.y - 0.02, (a.z + b.z) / 2);
  return g;
}

/** Водостоки крыши: желоба и трубы — темнее кровли, чтобы читались на фасаде. */
function buildGutters(project, roof, color) {
  const { gutters, pipes } = roofGutters(project, roof);
  if (!gutters.length) return null;
  const parts = gutters.map(([a, b]) => trough(a, b));
  for (const p of pipes) {
    parts.push(rod(p.from, p.top, PIPE_R), rod(p.top, p.bottom, PIPE_R));
    // отвод внизу — от стены
    const dx = p.from.x - p.top.x;
    const dz = p.from.z - p.top.z;
    const d = Math.hypot(dx, dz);
    const out = d > 0.05 ? { x: p.bottom.x + (dx / d) * 0.18, y: p.bottom.y - 0.12, z: p.bottom.z + (dz / d) * 0.18 } : null;
    if (out) parts.push(rod(p.bottom, out, PIPE_R));
  }
  const geo = mergeGeometries(parts.filter(Boolean).map((g) => (g.index ? g.toNonIndexed() : g)));
  if (!geo) return null;
  const dark = new THREE.Color(color).multiplyScalar(0.6);
  const m = mesh(geo, mat(`#${dark.getHexString()}`, { roughness: 0.5, metalness: 0.3 }), { kind: 'roof', id: roof.id });
  return m;
}
