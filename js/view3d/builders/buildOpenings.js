/**
 * Окна и двери в 3D. Модель строится в локальной системе проёма:
 * X — вдоль стены, Y — вверх от пола, Z — по нормали стены.
 * Створки дверей — отдельные узлы (петля, рельс, подъём), чтобы их можно было
 * открывать в режиме прогулки: описание движений — в group.userData.door.
 */
import * as THREE from 'three';
import { box, mergeGeometries, mesh } from '../meshUtils.js';
import { mat, glassMat } from '../materials.js';
import { COLORS } from '../../model/defaults.js';
import { pointOnWall } from '../../geometry/wallGeometry.js';

export function buildOpening(g, o, base, wallH) {
  const group = new THREE.Group();
  const c = pointOnWall(g, o.t);
  group.position.set(c.x, base, c.y);
  group.rotation.y = Math.atan2(-g.d.y, g.d.x);
  const ref = { kind: 'opening', id: o.id };
  const w = o.width;
  const H = Math.min(o.height, wallH - o.sill);
  const T = g.half * 2;
  const frame = [];
  const glass = [];
  const leaf = [];
  const metal = [];
  const fw = 0.06;
  const moving = []; // { leaf:[], metal:[], glass:[], pivot:{x,y,z}, motion }

  if (o.kind === 'window') {
    const fd = Math.min(0.09, T * 0.6);
    const y0 = o.sill;
    frame.push(box(fw, H, fd, -w / 2 + fw / 2, y0, 0));
    frame.push(box(fw, H, fd, w / 2 - fw / 2, y0, 0));
    frame.push(box(w, fw, fd, 0, y0 + H - fw, 0));
    frame.push(box(w, fw, fd, 0, y0, 0));
    const parts = { single: 1, double: 2, triple: 3, panoramic: Math.max(2, Math.round(w / 1)) }[o.style] || 2;
    for (let i = 1; i < parts; i++) frame.push(box(0.05, H - 2 * fw, fd * 0.9, -w / 2 + (w / parts) * i, y0 + fw, 0));
    glass.push(box(w - 2 * fw, H - 2 * fw, 0.012, 0, y0 + fw, 0));
    // подоконник с двух сторон
    if (o.sill > 0.2) frame.push(box(w + 0.08, 0.03, T + 0.1, 0, y0 - 0.03, 0));
  } else if (o.kind === 'door') {
    const fd = Math.min(0.12, T * 0.8);
    const sgn = o.flipSide ? -1 : 1;
    if (o.style === 'garage') {
      const part = { leaf: [box(w, H, 0.05, 0, 0, 0)], metal: [], glass: [], pivot: { x: 0, y: 0, z: 0 }, motion: { type: 'lift', dy: H * 0.92 } };
      for (let y = 0.45; y < H - 0.1; y += 0.5) part.metal.push(box(w - 0.02, 0.015, 0.06, 0, y, 0));
      moving.push(part);
    } else {
      frame.push(box(fw, H, fd, -w / 2 + fw / 2, 0, 0));
      frame.push(box(fw, H, fd, w / 2 - fw / 2, 0, 0));
      frame.push(box(w, fw, fd, 0, H - fw, 0));
      const iw = w - 2 * fw;
      const ih = H - fw;
      const zOff = sgn * (fd / 2 - 0.025);
      if (o.style === 'sliding') {
        glass.push(box(iw / 2 + 0.05, ih - 0.02, 0.02, iw / 4, 0, -0.02));
        moving.push({ leaf: [], metal: [], glass: [box(iw / 2 + 0.05, ih - 0.02, 0.02, 0, 0, 0)], pivot: { x: -iw / 4, y: 0, z: 0.02 }, motion: { type: 'slide', dx: iw / 2 - 0.02 } });
        frame.push(box(iw, 0.04, 0.08, 0, 0, 0));
      } else {
        // створки на петлях: петля у края, полотно — от петли вдоль X
        const leaves =
          o.style === 'double'
            ? [
                { hinge: -iw / 2, dir: 1, width: iw / 2 - 0.005 },
                { hinge: iw / 2, dir: -1, width: iw / 2 - 0.005 },
              ]
            : [{ hinge: (o.flipHinge ? 1 : -1) * (iw / 2), dir: o.flipHinge ? -1 : 1, width: iw - 0.01 }];
        for (const lf of leaves) {
          const cx = (lf.dir * lf.width) / 2;
          const handleX = lf.dir * (lf.width - (o.style === 'double' ? 0.06 : 0.08));
          moving.push({
            leaf: [box(lf.width, ih - 0.01, 0.045, cx, 0, 0)],
            metal: [box(o.style === 'double' ? 0.02 : 0.12, o.style === 'double' ? 0.2 : 0.025, 0.07, handleX, 1.0, 0)],
            glass: [],
            pivot: { x: lf.hinge, y: 0, z: zOff },
            // полотно уходит в сторону открывания (как дуга на плане)
            motion: { type: 'swing', angle: -sgn * lf.dir * (Math.PI / 2) * 0.96 },
          });
        }
      }
    }
  } else {
    // проём без двери — наличник
    const fd = T + 0.02;
    frame.push(box(0.04, H, fd, -w / 2 + 0.02, 0, 0));
    frame.push(box(0.04, H, fd, w / 2 - 0.02, 0, 0));
    frame.push(box(w, 0.04, fd, 0, H - 0.04, 0));
  }

  const add = (list, material, cast = true) => {
    const geo = mergeGeometries(list);
    if (geo) group.add(mesh(geo, material, ref, { cast }));
  };
  const leafMat = mat(o.style === 'garage' ? '#d7dadd' : COLORS.doorLeaf, { roughness: 0.6 });
  const metalMat = mat('#9aa1a8', { roughness: 0.35, metalness: 0.6 });
  add(frame, mat(COLORS.frame, { roughness: 0.5 }));
  add(leaf, leafMat);
  add(metal, metalMat);
  add(glass, glassMat(), false);
  if (moving.length) {
    const parts = [];
    for (const mv of moving) {
      const node = new THREE.Group();
      node.position.set(mv.pivot.x, mv.pivot.y, mv.pivot.z);
      for (const [list, material, cast] of [
        [mv.leaf, leafMat, true],
        [mv.metal, metalMat, true],
        [mv.glass, glassMat(), false],
      ]) {
        const geo = mergeGeometries(list);
        if (geo) node.add(mesh(geo, material, ref, { cast }));
      }
      group.add(node);
      parts.push({ node, motion: mv.motion, base: node.position.clone() });
    }
    group.userData.door = { id: o.id, parts };
  }
  group.userData.ref = ref;
  return group;
}
