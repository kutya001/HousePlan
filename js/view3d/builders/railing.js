/**
 * Ограждения: стойки, заполнение и поручень вдоль ломаной. Общие для перил
 * лестниц, ограждения проёма, балконов, приямков и предметов «Ограждение».
 * Стиль (model/railings.js): балясины, дерево, ригели, стекло, ковка.
 */
import * as THREE from 'three';
import { box, mergeGeometries, mesh } from '../meshUtils.js';
import { mat, glassMat } from '../materials.js';
import { RAIL_STYLES } from '../../model/railings.js';

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
 * @param opts { style, balusters, posts }
 * @returns {{ rail, metal, glass }} списки геометрий: поручень, стойки с заполнением, стекло
 */
export function railingGeos(line, height, { style = 'bars', balusters = 0.13, posts = 1.2 } = {}) {
  const rail = [];
  const metal = [];
  const glass = [];
  const wood = style === 'wood';
  const post = wood ? 0.07 : 0.045;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 0.05) continue;
    const P = (t, dy = 0) => ({ x: a.x + (b.x - a.x) * t, y: a.h + (b.h - a.h) * t + dy, z: a.y + (b.y - a.y) * t });
    const along = (dy, w, h, list) => {
      const g = beam(P(0, dy), P(1, dy), w, h);
      if (g) list.push(g);
    };
    // поручень
    along(height, wood ? 0.07 : 0.055, wood ? 0.045 : 0.05, rail);
    // стойки по концам и через ~1,2 м (у стекла — реже)
    const np = Math.max(1, Math.round(L / (style === 'glass' ? 1.5 : posts)));
    for (let k = 0; k <= np; k++) {
      if (k === 0 && i > 0) continue;
      const q = P(k / np);
      metal.push(box(post, height, post, q.x, q.y, q.z));
    }
    if (style === 'glass') {
      // стеклянные экраны между стойками, с зазором у пола
      for (let k = 0; k < np; k++) {
        const g = beam(P((k + 0.04) / np, 0.1 + (height - 0.16) / 2), P((k + 0.96) / np, 0.1 + (height - 0.16) / 2), 0.012, height - 0.16);
        if (g) glass.push(g);
      }
      continue;
    }
    if (style === 'horizontal') {
      // ригели — параллельно поручню
      const n = Math.max(2, Math.round((height - 0.15) / 0.2));
      for (let k = 0; k < n; k++) along(0.12 + ((height - 0.2) * k) / n, 0.02, 0.02, metal);
      continue;
    }
    // нижняя обвязка (параллельно поручню) и вертикальное заполнение
    along(0.1, 0.03, 0.03, metal);
    if (style === 'forged') along(height - 0.14, 0.02, 0.02, metal);
    const step = wood ? 0.12 : style === 'forged' ? 0.11 : balusters;
    const bar = wood ? 0.035 : style === 'forged' ? 0.014 : 0.018;
    const nb = Math.floor(L / step);
    for (let k = 1; k < nb; k++) {
      const q = P(k / nb, 0.1);
      metal.push(box(bar, height - 0.12, bar, q.x, q.y, q.z));
      // ковка: через одну — «пика» над поручнем
      if (style === 'forged' && k % 2 === 0) metal.push(box(bar, 0.09, bar, q.x, q.y + height - 0.08, q.z));
    }
  }
  return { rail, metal, glass };
}

/**
 * Готовая сетка ограды из нескольких ломаных.
 * @param look — railLook(): { style, rail, fill } (без него — прежние балясины)
 */
export function railingMesh(lines, height, ref, look = null) {
  const style = look?.style || 'bars';
  const colors = look || RAIL_STYLES.bars;
  const rail = [];
  const metal = [];
  const glass = [];
  for (const l of lines) {
    const g = railingGeos(l, height, { style });
    rail.push(...g.rail);
    metal.push(...g.metal);
    glass.push(...g.glass);
  }
  const group = new THREE.Group();
  const wood = style === 'wood';
  const rg = mergeGeometries(rail);
  if (rg) group.add(mesh(rg, mat(colors.rail, { roughness: 0.55, metalness: wood || style === 'bars' ? 0 : 0.4 }), ref));
  const mg = mergeGeometries(metal);
  if (mg) group.add(mesh(mg, mat(colors.fill, { roughness: wood ? 0.6 : 0.45, metalness: wood ? 0 : 0.5 }), ref));
  const gg = mergeGeometries(glass);
  if (gg) group.add(mesh(gg, glassMat(), ref, { cast: false }));
  return group;
}
