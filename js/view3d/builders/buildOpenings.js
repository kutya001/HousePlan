/**
 * Окна и двери в 3D. Модель строится в локальной системе проёма:
 * X — вдоль стены, Y — вверх от пола, Z — по нормали стены.
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
    if (o.style === 'garage') {
      leaf.push(box(w, H, 0.05, 0, 0, 0));
      for (let y = 0.45; y < H - 0.1; y += 0.5) metal.push(box(w - 0.02, 0.015, 0.06, 0, y, 0));
    } else {
      frame.push(box(fw, H, fd, -w / 2 + fw / 2, 0, 0));
      frame.push(box(fw, H, fd, w / 2 - fw / 2, 0, 0));
      frame.push(box(w, fw, fd, 0, H - fw, 0));
      const iw = w - 2 * fw;
      const ih = H - fw;
      const sgn = o.flipSide ? -1 : 1;
      const zOff = sgn * (fd / 2 - 0.025);
      if (o.style === 'sliding') {
        glass.push(box(iw / 2 + 0.05, ih - 0.02, 0.02, -iw / 4, 0, 0.02));
        glass.push(box(iw / 2 + 0.05, ih - 0.02, 0.02, iw / 4, 0, -0.02));
        frame.push(box(iw, 0.04, 0.08, 0, 0, 0));
      } else if (o.style === 'double') {
        leaf.push(box(iw / 2 - 0.005, ih - 0.01, 0.045, -iw / 4, 0, zOff));
        leaf.push(box(iw / 2 - 0.005, ih - 0.01, 0.045, iw / 4, 0, zOff));
        metal.push(box(0.02, 0.2, 0.06, -0.06, 1.0, zOff), box(0.02, 0.2, 0.06, 0.06, 1.0, zOff));
      } else {
        leaf.push(box(iw - 0.01, ih - 0.01, 0.045, 0, 0, zOff));
        const hx = (o.flipHinge ? -1 : 1) * (iw / 2 - 0.08);
        metal.push(box(0.12, 0.025, 0.07, hx, 1.0, zOff));
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
  add(frame, mat(COLORS.frame, { roughness: 0.5 }));
  add(leaf, mat(o.style === 'garage' ? '#d7dadd' : COLORS.doorLeaf, { roughness: 0.6 }));
  add(metal, mat('#9aa1a8', { roughness: 0.35, metalness: 0.6 }));
  add(glass, glassMat(), false);
  group.userData.ref = ref;
  return group;
}
