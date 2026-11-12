/**
 * Забор участка в 3D: пролёты между воротами по видам (model/fence.js) —
 * профнастил, дерево, штакетник, сетка, ковка, кирпичные столбы, бетонные панели.
 */
import * as THREE from 'three';
import { box, mergeGeometries, mesh, planarUV } from '../meshUtils.js';
import { mat, TEX } from '../materials.js';
import { fenceRuns } from '../../geometry/fence.js';
import { FENCE_TYPES } from '../../model/fence.js';

const POST = '#55504a';

export function buildFence(project) {
  const group = new THREE.Group();
  // геометрии по материалам: ключ → { geoms, material, uv }
  const bins = new Map();
  const bin = (key, make, uv = false) => {
    if (!bins.has(key)) bins.set(key, { geoms: [], material: make(), uv });
    return bins.get(key).geoms;
  };
  for (const run of fenceRuns(project)) {
    const { a, b, height: h, color, type } = run;
    const L = run.length;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const mx = (a.x + b.x) / 2;
    const mz = (a.y + b.y) / 2;
    // деталь в осях пролёта (x — вдоль, от −L/2 до L/2) → на место
    const place = (g) => {
      g.rotateY(-ang);
      g.translate(mx, 0, mz);
      return g;
    };
    const t = FENCE_TYPES[type];
    const posts = bin('post', () => mat(POST, { roughness: 0.7 }));
    const panel = (tex, opts = {}) => bin(`panel|${color}|${tex}|${opts.opacity ?? 1}`, () => mat(color, { roughness: 0.6, map: tex || undefined, opacity: opts.opacity }), !!tex);
    const n = Math.max(1, Math.round(L / (type === 'brick' ? 3 : 2.5)));
    const postAt = (k) => -L / 2 + (L * k) / n;
    if (type === 'brick') {
      const brick = bin('brick', () => mat('#9a5a45', { roughness: 0.9, map: 'brick' }), true);
      const base = bin('concrete', () => mat('#b5b2ab', { roughness: 0.95, map: 'concrete' }), true);
      for (let k = 0; k <= n; k++) {
        brick.push(place(box(0.38, h + 0.12, 0.38, postAt(k), 0, 0)));
        base.push(place(box(0.46, 0.05, 0.46, postAt(k), h + 0.12, 0)));
      }
      base.push(place(box(L, 0.3, 0.2, 0, 0, 0)));
      panel(t.tex).push(place(box(L - 0.38, h - 0.4, 0.025, 0, 0.3, 0)));
      continue;
    }
    const ps = type === 'concrete' ? 0.14 : 0.08;
    for (let k = 0; k <= n; k++) posts.push(place(box(ps, h + 0.1, ps, postAt(k), 0, 0)));
    if (type === 'picket' || type === 'forged') {
      const rails = type === 'forged' ? bin(`rail|${color}`, () => mat(color, { roughness: 0.5, metalness: 0.5 })) : panel('');
      const bars = rails;
      for (const y of type === 'forged' ? [0.15, h - 0.14] : [0.3, h - 0.35]) rails.push(place(box(L, type === 'forged' ? 0.025 : 0.06, type === 'forged' ? 0.025 : 0.035, 0, y, 0)));
      const step = type === 'forged' ? 0.13 : 0.15;
      const bw = type === 'forged' ? 0.016 : 0.095;
      const count = Math.max(1, Math.floor(L / step));
      for (let k = 0; k < count; k++) {
        const x = -L / 2 + (L * (k + 0.5)) / count;
        // у кованого каждая вторая пика выше, у штакетника доски ровные
        const top = type === 'forged' ? h - 0.05 + (k % 2 ? 0.1 : 0) : h - 0.05;
        bars.push(place(box(bw, top - 0.08, type === 'forged' ? 0.016 : 0.02, x, 0.08, type === 'forged' ? 0 : 0.028)));
      }
    } else if (type === 'mesh') {
      const wire = bin(`rail|${color}`, () => mat(color, { roughness: 0.5, metalness: 0.4 }));
      for (const y of [0.08, h - 0.04, h * 0.5]) wire.push(place(box(L, 0.02, 0.02, 0, y, 0)));
      panel('', { opacity: 0.28 }).push(place(box(L, h - 0.1, 0.006, 0, 0.08, 0)));
    } else {
      // сплошные: профнастил, доска, бетон
      panel(t.tex).push(place(box(L, h - 0.15, type === 'concrete' ? 0.06 : 0.025, 0, 0.1, 0)));
    }
  }
  for (const { geoms, material, uv } of bins.values()) {
    let g = mergeGeometries(geoms);
    if (!g) continue;
    if (uv && TEX.on) g = planarUV(g);
    group.add(mesh(g, material, { kind: 'site', id: 'site' }, { cast: material.opacity >= 1 }));
  }
  return group;
}
