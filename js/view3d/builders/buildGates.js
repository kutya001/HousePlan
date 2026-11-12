/**
 * Ворота и калитка участка в 3D: столбы и створки. Створки — отдельные узлы,
 * чтобы открываться в прогулке (group.userData.door, как у дверей дома).
 * Локальная система: X — вдоль забора, Y — вверх, Z — поперёк (открывание — в +Z).
 */
import * as THREE from 'three';
import { box, mergeGeometries, mesh, planarUV } from '../meshUtils.js';
import { mat, TEX } from '../materials.js';
import { DEG } from '../../core/geometry.js';

const POST = '#4b4f55';
const shade = (hex, k) => `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;

/** Створка: рама из профиля и глухая зашивка. Петля в x = 0, створка — на dir · lw. */
function leaf(lw, h, dir) {
  const cx = (dir * lw) / 2;
  const frame = [
    box(lw, 0.05, 0.05, cx, 0.08, 0),
    box(lw, 0.05, 0.05, cx, h - 0.05, 0),
    box(0.05, h - 0.08, 0.05, dir * 0.025, 0.08, 0),
    box(0.05, h - 0.08, 0.05, dir * (lw - 0.025), 0.08, 0),
    box(lw, 0.04, 0.04, cx, h * 0.5, 0),
  ];
  return { frame, panel: [box(lw - 0.06, h - 0.2, 0.012, cx, 0.12, 0.012)] };
}

export function buildGate(item, baseY) {
  const group = new THREE.Group();
  const ref = { kind: 'item', id: item.id };
  const { w, h } = item;
  const color = item.color || '#6f5a48';
  const frameMat = mat(shade(color, 0.6), { roughness: 0.5, metalness: 0.3 });
  const panelMat = mat(color, { roughness: 0.6, map: 'profsheet' });
  const postMat = mat(POST, { roughness: 0.6, metalness: 0.2 });
  const put = (host, list, material, uv = false) => {
    let g = mergeGeometries(list.filter(Boolean));
    if (!g) return;
    if (uv && TEX.on) g = planarUV(g);
    host.add(mesh(g, material, ref));
  };
  // столбы по краям
  put(group, [box(0.12, h + 0.15, 0.12, -w / 2 + 0.06, 0, 0), box(0.12, h + 0.15, 0.12, w / 2 - 0.06, 0, 0)], postMat);
  const parts = [];
  const node = (pivotX, lf, motion) => {
    const n = new THREE.Group();
    n.position.set(pivotX, 0, 0);
    put(n, lf.frame, frameMat);
    put(n, lf.panel, panelMat, true);
    group.add(n);
    parts.push({ node: n, motion, base: n.position.clone() });
  };
  const inner = w - 0.24; // просвет между столбами
  if (item.type === 'gate_slide') {
    // одно полотно откатывается вдоль забора; противовес — за столбом
    node(-inner / 2, leaf(inner, h, 1), { type: 'slide', dx: -(inner - 0.05) });
    put(group, [box(inner + 0.2, 0.04, 0.06, 0, 0.02, 0)], postMat);
  } else if (item.type === 'wicket') {
    node(-inner / 2, leaf(inner, h, 1), { type: 'swing', angle: -(Math.PI / 2) * 0.95 });
  } else {
    node(-inner / 2, leaf(inner / 2 - 0.01, h, 1), { type: 'swing', angle: -(Math.PI / 2) * 0.95 });
    node(inner / 2, leaf(inner / 2 - 0.01, h, -1), { type: 'swing', angle: (Math.PI / 2) * 0.95 });
  }
  group.position.set(item.x, baseY, item.y);
  group.rotation.y = -(item.rotation || 0) * DEG;
  group.userData.door = { id: item.id, parts };
  group.userData.ref = ref;
  return group;
}
