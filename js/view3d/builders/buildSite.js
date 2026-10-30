/** Земля, газон участка, зоны ландшафта и забор. */
import * as THREE from 'three';
import { extrudePolygon, mergeGeometries, mesh, box } from '../meshUtils.js';
import { mat } from '../materials.js';
import { COLORS, ZONE_MATERIALS } from '../../model/defaults.js';
import { bboxOf, dist } from '../../core/geometry.js';

export function buildSite(project) {
  const group = new THREE.Group();
  const b = project.site.boundary;
  const bb = bboxOf(b);
  const size = Math.max(160, Math.max(bb.w, bb.h) * 4);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat('#cdd5c3', { roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((bb.minX + bb.maxX) / 2, -0.01, (bb.minY + bb.maxY) / 2);
  ground.receiveShadow = true;
  group.add(ground);

  const lawn = extrudePolygon(b, -0.01, 0.01);
  if (lawn) group.add(mesh(lawn, mat(COLORS.lawn, { roughness: 1 }), { kind: 'site', id: 'site' }, { cast: false }));

  for (const z of project.zones) {
    const m = ZONE_MATERIALS[z.material] || ZONE_MATERIALS.lawn;
    const top = z.material === 'water' ? 0.015 : z.material === 'deck' ? 0.12 : 0.03;
    const geo = extrudePolygon(z.points, 0, top);
    if (!geo) continue;
    const material = z.material === 'water' ? mat(m.color, { roughness: 0.1, metalness: 0.1 }) : mat(m.color, { roughness: 0.95 });
    group.add(mesh(geo, material, { kind: 'zone', id: z.id }, { cast: false }));
  }

  const fence = project.site.fence;
  if (fence?.enabled) {
    const h = fence.height || 1.8;
    const posts = [];
    const panels = [];
    for (let i = 0; i < b.length; i++) {
      const a = b[i];
      const c = b[(i + 1) % b.length];
      const L = dist(a, c);
      if (L < 0.05) continue;
      const ang = Math.atan2(c.y - a.y, c.x - a.x);
      const n = Math.max(1, Math.round(L / 2.5));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const g = box(0.08, h + 0.1, 0.08, a.x + (c.x - a.x) * t, 0, a.y + (c.y - a.y) * t);
        posts.push(g);
      }
      const panel = box(L, h - 0.15, 0.025, 0, 0.1, 0);
      panel.rotateY(-ang);
      panel.translate((a.x + c.x) / 2, 0, (a.y + c.y) / 2);
      panels.push(panel);
    }
    const pg = mergeGeometries(posts);
    if (pg) group.add(mesh(pg, mat('#55504a')));
    const panelGeo = mergeGeometries(panels);
    if (panelGeo) group.add(mesh(panelGeo, mat(fence.color || COLORS.fence, { roughness: 0.6 }), { kind: 'site', id: 'site' }));
  }
  return group;
}
