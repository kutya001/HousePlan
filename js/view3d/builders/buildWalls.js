/** Стены этажа в 3D: куски между проёмами, перемычки, цоколь. */
import * as THREE from 'three';
import { computeWallGeometry, wallPieces3D } from '../../geometry/wallGeometry.js';
import { wallHeight } from '../../model/project.js';
import { COLORS } from '../../model/defaults.js';
import { extrudePolygon, mergeGeometries, mesh } from '../meshUtils.js';
import { mat } from '../materials.js';
import { buildOpening } from './buildOpenings.js';

export function buildWalls(project, levelId, base, { ground = false } = {}) {
  const group = new THREE.Group();
  const walls = project.walls.filter((w) => w.levelId === levelId);
  const geoms = computeWallGeometry(walls);
  const byWall = new Map();
  for (const o of project.openings) {
    if (!byWall.has(o.wallId)) byWall.set(o.wallId, []);
    byWall.get(o.wallId).push(o);
  }
  const plinth = [];
  for (const g of geoms.values()) {
    const w = g.wall;
    const h = wallHeight(project, w);
    const ops = byWall.get(w.id) || [];
    const parts = wallPieces3D(g, ops, h).map((p) => extrudePolygon(p.poly, base + p.y0, base + p.y1));
    const geo = mergeGeometries(parts);
    if (geo) {
      const color = w.color || (w.kind === 'exterior' ? COLORS.facade : COLORS.interior);
      const m = mesh(geo, mat(color), { kind: 'wall', id: w.id });
      // контур стены целиком, без «швов» между кусками у проёмов
      m.userData.edgesFrom = extrudePolygon(g.poly, base, base + h);
      group.add(m);
    }
    if (ground && w.kind === 'exterior' && base > 0.01) plinth.push(extrudePolygon(g.poly, 0, base));
    for (const o of ops) group.add(buildOpening(g, o, base, h));
  }
  const pg = mergeGeometries(plinth);
  if (pg) {
    const m = mesh(pg, mat(COLORS.plinth, { roughness: 0.95 }));
    m.userData.edges = true;
    group.add(m);
  }
  return group;
}
