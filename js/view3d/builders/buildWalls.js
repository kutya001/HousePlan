/**
 * Стены этажа в 3D: куски между проёмами, перемычки, цоколь, крыльцо.
 * В мансарде стены срезаются скатами крыши — фронтоны и «колено» получаются сами.
 * Наружные стены подвала — бетонные, как цоколь.
 */
import * as THREE from 'three';
import { computeWallGeometry, wallPieces3D } from '../../geometry/wallGeometry.js';
import { coveringPlanes, splitByLowestPlane, planeAt } from '../../geometry/roofClip.js';
import { porchSteps } from '../../geometry/porch.js';
import { polygonCentroid } from '../../core/geometry.js';
import { wallHeight, getLevel, isAttic, isBasement, levelTop } from '../../model/project.js';
import { COLORS } from '../../model/defaults.js';
import { extrudePolygon, prismVarTop, mergeGeometries, mesh } from '../meshUtils.js';
import { mat } from '../materials.js';
import { buildOpening } from './buildOpenings.js';

/**
 * @param opts { plinth — цоколь под наружными стенами (нижний этаж над землёй),
 *               porch — крыльцо у наружных дверей (первый надземный этаж) }
 */
export function buildWalls(project, levelId, base, { plinth = false, porch = false } = {}) {
  const group = new THREE.Group();
  const level = getLevel(project, levelId);
  const walls = project.walls.filter((w) => w.levelId === levelId);
  const geoms = computeWallGeometry(walls);
  const byWall = new Map();
  for (const o of project.openings) {
    if (!byWall.has(o.wallId)) byWall.set(o.wallId, []);
    byWall.get(o.wallId).push(o);
  }
  // мансарда: скаты крыш этого этажа срезают стены
  const roofs = isAttic(level) ? project.roofs.filter((r) => r.levelId === levelId) : [];
  const roofBase = roofs.length ? levelTop(project, levelId) : 0;
  const piece = (poly, y0, y1) => {
    if (!roofs.length) return extrudePolygon(poly, y0, y1);
    const planes = coveringPlanes(roofs, roofBase, polygonCentroid(poly));
    if (!planes.length) return extrudePolygon(poly, y0, y1);
    const parts = splitByLowestPlane(poly, y1, planes)
      .filter((pt) => pt.poly.some((p) => planeAt(pt.plane, p) > y0 + 0.02))
      .map((pt) => prismVarTop(pt.poly, y0, (p) => planeAt(pt.plane, p)));
    return mergeGeometries(parts);
  };

  const plinthGeo = [];
  for (const g of geoms.values()) {
    const w = g.wall;
    const h = wallHeight(project, w);
    const ops = byWall.get(w.id) || [];
    const parts = wallPieces3D(g, ops, h).map((p) => piece(p.poly, base + p.y0, base + p.y1));
    const geo = mergeGeometries(parts);
    if (geo) {
      const underground = isBasement(level) && w.kind === 'exterior';
      const color = w.color || (underground ? COLORS.plinth : w.kind === 'exterior' ? COLORS.facade : COLORS.interior);
      const m = mesh(geo, mat(color, underground ? { roughness: 0.95 } : {}), { kind: 'wall', id: w.id });
      // контур стены целиком, без «швов» между кусками у проёмов
      m.userData.edgesFrom = piece(g.poly, base, base + h);
      group.add(m);
    }
    if (plinth && w.kind === 'exterior' && base > 0.01) plinthGeo.push(extrudePolygon(g.poly, 0, base));
    for (const o of ops) group.add(buildOpening(g, o, base, h));
  }
  const pg = mergeGeometries(plinthGeo);
  if (pg) {
    const m = mesh(pg, mat(COLORS.plinth, { roughness: 0.95 }));
    m.userData.edges = true;
    group.add(m);
  }
  // крыльцо у наружных дверей, если пол поднят на цоколь
  if (porch) {
    const steps = porchSteps(project, levelId, geoms, base).map((st) => extrudePolygon(st.poly, 0, st.top));
    const sg = mergeGeometries(steps);
    if (sg) {
      const m = mesh(sg, mat('#b7b1a7', { roughness: 0.9 }));
      m.userData.edges = true;
      group.add(m);
    }
  }
  return group;
}
