/**
 * Фундамент в 3D: цоколь по виду фундамента (лента, плита, сваи с ростверком,
 * винтовые сваи с обвязкой) и отмостка вокруг дома.
 */
import * as THREE from 'three';
import { extrudePolygon, mergeGeometries, mesh, box, cylinder, planarUV } from '../meshUtils.js';
import { mat, TEX } from '../materials.js';
import { foundationOf } from '../../model/foundation.js';
import { foundationParts, blindArea } from '../../geometry/foundation.js';
import { excavationPits } from '../../geometry/excavation.js';
import { polygonsOverlap, subtractPolygons } from '../../core/geometry.js';

const CONCRETE = '#b1afaa';
const STEEL = '#4b4f55';
const TIMBER = '#b08a5a';
const SLAB_TOP = 0.25; // верх плиты над землёй
const PILE = 0.3; // сторона буронабивной сваи (оголовок)
const SCREW_R = 0.054; // радиус винтовой сваи

/** Цоколь и то, на чём стоит дом. Возвращает группу для нижнего этажа. */
export function buildFoundation(project) {
  const group = new THREE.Group();
  const f = foundationOf(project);
  const p = foundationParts(project);
  if (p.basement || p.base <= 0.01) return group;
  const base = p.base;
  const finish = mat(f.color, { roughness: 0.95, map: f.tex });
  const concrete = mat(CONCRETE, { roughness: 0.95, map: 'concrete' });
  const add = (geos, material, { edges = true, uv = true } = {}) => {
    let g = mergeGeometries(geos.filter(Boolean).map((x) => (x.index ? x.toNonIndexed() : x)));
    if (!g) return;
    if (uv && TEX.on) g = planarUV(g);
    const m = mesh(g, material);
    m.userData.edges = edges;
    group.add(m);
  };

  if (f.type === 'slab') {
    const top = Math.min(base, SLAB_TOP);
    add(p.slab.map((poly) => extrudePolygon(poly, -0.05, top)), concrete);
    if (base - top > 0.02) add(p.exterior.map((poly) => extrudePolygon(poly, top, base)), finish);
  } else if (f.info.open) {
    const y1 = base - p.beam; // низ ростверка
    if (f.type === 'screw') {
      add(p.bearing.map((poly) => extrudePolygon(poly, y1, base)), mat(TIMBER, { roughness: 0.8, map: 'timber' }));
      if (y1 > 0.05) {
        const steel = mat(STEEL, { roughness: 0.5, metalness: 0.5 });
        add(p.piles.flatMap((q) => [cylinder(SCREW_R, y1 + 0.1, q.x, -0.1, q.y, 10), box(0.24, 0.02, 0.24, q.x, y1 - 0.02, q.y)]), steel, { edges: false, uv: false });
      }
    } else {
      add(p.bearing.map((poly) => extrudePolygon(poly, y1, base)), finish);
      if (y1 > 0.05) add(p.piles.map((q) => box(PILE, y1 + 0.1, PILE, q.x, -0.1, q.y)), concrete);
    }
  } else {
    // лента: цоколь под наружными стенами, чуть заглублён — без щели у земли
    add(p.exterior.map((poly) => extrudePolygon(poly, -0.05, base)), finish);
  }
  return group;
}

/** Отмостка — бетонная полоса вокруг дома. Лежит на земле, под дорожками и террасами. */
export function buildBlindArea(project) {
  const { rings } = blindArea(project);
  if (!rings.length) return null;
  // приямки входов в подвал отмостку прорезают
  const pits = excavationPits(project)
    .filter((p) => p.kind === 'entry')
    .map((p) => p.poly);
  const parts = [];
  for (const { outer, hole } of rings) {
    const cut = pits.filter((pit) => polygonsOverlap(pit, outer));
    if (!cut.length) parts.push(extrudePolygon(outer, 0.008, 0.024, [hole]));
    else for (const piece of subtractPolygons(outer, [hole, ...cut])) parts.push(extrudePolygon(piece, 0.008, 0.024));
  }
  let geo = mergeGeometries(parts.filter(Boolean));
  if (!geo) return null;
  if (TEX.on) geo = planarUV(geo);
  return mesh(geo, mat('#bcb9b2', { roughness: 0.95, map: 'concrete' }), null, { cast: false });
}
