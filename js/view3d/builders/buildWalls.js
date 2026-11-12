/**
 * Стены этажа в 3D: куски между проёмами, перемычки, крыльцо.
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
import { extrudePolygon, prismVarTop, mergeGeometries, mesh, planarUV } from '../meshUtils.js';
import { mat, TEX } from '../materials.js';
import { buildOpening } from './buildOpenings.js';
import { splitWallFaces } from './wallFaces.js';
import { wallSides } from '../../geometry/wallSides.js';
import { wallType, wallSideFinish } from '../../model/wallTypes.js';
import { foundationOf } from '../../model/foundation.js';

/**
 * @param opts { porch — крыльцо у наружных дверей (первый надземный этаж) }
 * Цоколь и фундамент под стенами — в buildFoundation.js.
 */
export function buildWalls(project, levelId, base, { porch = false } = {}) {
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

  const sides = wallSides(project, levelId, geoms);
  const underground = isBasement(level);
  // стены подвала снаружи отделаны как цоколь
  const fnd = foundationOf(project);
  const ctx = { facade: project.facade || 'plaster', facadeColor: COLORS.facade, interiorColor: COLORS.interior, plinthColor: fnd.color, plinthFinish: fnd.finish };
  for (const g of geoms.values()) {
    const w = g.wall;
    const h = wallHeight(project, w);
    const ops = byWall.get(w.id) || [];
    const parts = wallPieces3D(g, ops, h, { overlap: 0.004 }).map((p) => piece(p.poly, base + p.y0, base + p.y1));
    const geo = mergeGeometries(parts);
    if (geo) {
      // стена — четыре поверхности: две стороны со своей отделкой, верхний срез (видно,
      // из чего сложена) и откосы проёмов с торцами
      const type = wallType(w);
      const side = sides.get(w.id);
      const below = underground && w.kind === 'exterior';
      const fa = wallSideFinish(w, 'A', { ...ctx, outside: side.A.outside, underground: below });
      const fb = wallSideFinish(w, 'B', { ...ctx, outside: side.B.outside, underground: below });
      const inner = side.A.outside ? fb : fa; // откосы — как сторона в помещении
      const faces = splitWallFaces(geo, g.n.x, g.n.y);
      const ref = { kind: 'wall', id: w.id };
      const surface = (f) =>
        f.glass ? mat(f.color, { roughness: 0.08, metalness: 0.1, opacity: f.glass }) : mat(f.color, { roughness: f.finish === 'concrete' ? 0.95 : 0.85, map: f.tex || undefined });
      const add = (part, material, cast = true) => {
        if (!part) return null;
        const m = mesh(TEX.on ? planarUV(part) : part, material, ref, { cast });
        group.add(m);
        return m;
      };
      const first = add(faces.A, surface(fa), !fa.glass) || add(faces.B, surface(fb), !fb.glass);
      if (first && faces.A) add(faces.B, surface(fb), !fb.glass);
      add(faces.top, type.glass ? surface(fa) : mat(below ? COLORS.plinth : type.body, { roughness: 0.95 }), !type.glass);
      add(faces.rest, type.glass ? surface(fa) : surface({ ...inner, tex: inner.tex === 'brick' || inner.tex === 'stone' ? 'plaster' : inner.tex }), !type.glass);
      // контур стены целиком, без «швов» между кусками у проёмов
      const host = first || group.children[group.children.length - 1];
      if (host) host.userData.edgesFrom = piece(g.poly, base, base + h);
    }
    for (const o of ops) group.add(buildOpening(g, o, base, h));
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
