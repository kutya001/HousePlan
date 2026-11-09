/**
 * Ограждения: стойки, балясины и поручень вдоль ломаной. Общие для перил
 * лестниц, ограждения проёма, балконов и приямков.
 */
import * as THREE from 'three';
import { box, mergeGeometries, mesh } from '../meshUtils.js';
import { mat } from '../materials.js';

const X = new THREE.Vector3(1, 0, 0);

/** Брус сечением w×h от точки a до b (в 3D). */
export function beam(a, b, w, h) {
  const A = new THREE.Vector3(a.x, a.y, a.z);
  const B = new THREE.Vector3(b.x, b.y, b.z);
  const dir = B.clone().sub(A);
  const L = dir.length();
  if (L < 1e-4) return null;
  const g = new THREE.BoxGeometry(L, h, w);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(X, dir.normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}

/**
 * Геометрия ограды по ломаной.
 * @param line [{x, y, h}] — точки в плане, h — абсолютная высота низа
 * @param height — высота поручня над низом
 * @returns {{ rail: BufferGeometry[], metal: BufferGeometry[] }}
 */
export function railingGeos(line, height, { balusters = 0.13, posts = 1.2 } = {}) {
  const rail = [];
  const metal = [];
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 0.05) continue;
    // поручень
    const r = beam({ x: a.x, y: a.h + height, z: a.y }, { x: b.x, y: b.h + height, z: b.y }, 0.055, 0.05);
    if (r) rail.push(r);
    // нижняя обвязка (параллельно поручню)
    const lo = beam({ x: a.x, y: a.h + 0.1, z: a.y }, { x: b.x, y: b.h + 0.1, z: b.y }, 0.03, 0.03);
    if (lo) metal.push(lo);
    // стойки по концам и через ~1,2 м, балясины между ними
    const np = Math.max(1, Math.round(L / posts));
    for (let k = 0; k <= np; k++) {
      if (k === 0 && i > 0) continue;
      const t = k / np;
      const x = a.x + (b.x - a.x) * t;
      const z = a.y + (b.y - a.y) * t;
      const y = a.h + (b.h - a.h) * t;
      metal.push(box(0.045, height, 0.045, x, y, z));
    }
    const nb = Math.floor(L / balusters);
    for (let k = 1; k < nb; k++) {
      const t = k / nb;
      const x = a.x + (b.x - a.x) * t;
      const z = a.y + (b.y - a.y) * t;
      const y = a.h + (b.h - a.h) * t;
      metal.push(box(0.018, height - 0.12, 0.018, x, y + 0.1, z));
    }
  }
  return { rail, metal };
}

/** Готовая сетка ограды из нескольких ломаных. */
export function railingMesh(lines, height, ref, opts) {
  const rail = [];
  const metal = [];
  for (const l of lines) {
    const g = railingGeos(l, height, opts);
    rail.push(...g.rail);
    metal.push(...g.metal);
  }
  const group = new THREE.Group();
  const rg = mergeGeometries(rail);
  if (rg) group.add(mesh(rg, mat('#7a5a3f', { roughness: 0.55 }), ref));
  const mg = mergeGeometries(metal);
  if (mg) group.add(mesh(mg, mat('#3d4146', { roughness: 0.45, metalness: 0.5 }), ref));
  return group;
}
