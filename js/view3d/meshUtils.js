/**
 * Построение геометрии: выдавливание многоугольников плана, призмы для скатов,
 * объединение геометрий. Координаты плана (x, y) → мир (x, высота, y).
 */
import * as THREE from 'three';

const signed2D = (pts) => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
};

function pushTri(arr, a, b, c, want) {
  // нормаль треугольника (b-a)×(c-a); если смотрит не туда — меняем порядок
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  if (want && nx * want[0] + ny * want[1] + nz * want[2] < 0) arr.push(...a, ...c, ...b);
  else arr.push(...a, ...b, ...c);
}

/**
 * Выдавить многоугольник плана по высоте от y0 до y1.
 * holes — массив многоугольников-отверстий (должны лежать внутри контура).
 */
export function extrudePolygon(points, y0, y1, holes = []) {
  if (points.length < 3 || y1 - y0 < 1e-5) return null;
  const outer = signed2D(points) > 0 ? points : [...points].reverse();
  const hs = holes.filter((h) => h.length >= 3).map((h) => (signed2D(h) < 0 ? h : [...h].reverse()));
  const pos = [];
  const contour = outer.map((p) => new THREE.Vector2(p.x, p.y));
  const holeVecs = hs.map((h) => h.map((p) => new THREE.Vector2(p.x, p.y)));
  let tris;
  try {
    tris = THREE.ShapeUtils.triangulateShape(contour, holeVecs);
  } catch {
    tris = [];
  }
  const all = [...outer, ...hs.flat()];
  for (const [i, j, k] of tris) {
    const a = all[i];
    const b = all[j];
    const c = all[k];
    pushTri(pos, [a.x, y1, a.y], [b.x, y1, b.y], [c.x, y1, c.y], [0, 1, 0]);
    pushTri(pos, [a.x, y0, a.y], [b.x, y0, b.y], [c.x, y0, c.y], [0, -1, 0]);
  }
  for (const loop of [outer, ...hs]) {
    for (let i = 0; i < loop.length; i++) {
      const p = loop[i];
      const q = loop[(i + 1) % loop.length];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      if (Math.abs(dx) + Math.abs(dy) < 1e-7) continue;
      const want = [dy, 0, -dx];
      pushTri(pos, [p.x, y0, p.y], [q.x, y0, q.y], [q.x, y1, q.y], want);
      pushTri(pos, [p.x, y0, p.y], [q.x, y1, q.y], [p.x, y1, p.y], want);
    }
  }
  return toGeometry(pos);
}

/**
 * Призма из плоского 3D-многоугольника (скат, фронтон): верх — сам многоугольник,
 * низ — он же, сдвинутый на вектор offset.
 */
export function prism3D(poly, offset) {
  const pos = [];
  const top = poly.map((p) => [p.x, p.y, p.z]);
  const bot = poly.map((p) => [p.x + offset.x, p.y + offset.y, p.z + offset.z]);
  const n = poly.length;
  const center = top.reduce((acc, p) => [acc[0] + p[0] / n, acc[1] + p[1] / n, acc[2] + p[2] / n], [0, 0, 0]);
  const away = [-offset.x, -offset.y, -offset.z];
  for (let i = 1; i < n - 1; i++) {
    pushTri(pos, top[0], top[i], top[i + 1], away);
    pushTri(pos, bot[0], bot[i], bot[i + 1], [offset.x, offset.y, offset.z]);
  }
  for (let i = 0; i < n; i++) {
    const a = top[i];
    const b = top[(i + 1) % n];
    const c = bot[(i + 1) % n];
    const d = bot[i];
    const mx = (a[0] + b[0]) / 2 - center[0];
    const my = (a[1] + b[1]) / 2 - center[1];
    const mz = (a[2] + b[2]) / 2 - center[2];
    pushTri(pos, a, b, c, [mx, my, mz]);
    pushTri(pos, a, c, d, [mx, my, mz]);
  }
  return toGeometry(pos);
}

export function toGeometry(pos) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Объединение неиндексированных геометрий с одинаковыми атрибутами. */
export function mergeGeometries(geoms) {
  const list = geoms.filter(Boolean).map((g) => (g.index ? g.toNonIndexed() : g));
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  let total = 0;
  for (const g of list) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  let off = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, off * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, off * 3);
    off += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

/** Коробка по центру низа: удобно для мебели. */
export function box(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(Math.max(w, 0.001), Math.max(h, 0.001), Math.max(d, 0.001));
  g.translate(x, y + h / 2, z);
  return g;
}

export function cylinder(r, h, x = 0, y = 0, z = 0, seg = 16, rTop = null) {
  const g = new THREE.CylinderGeometry(rTop ?? r, r, h, seg);
  g.translate(x, y + h / 2, z);
  return g;
}

export function mesh(geometry, material, ref = null, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  if (ref) m.userData.ref = ref;
  return m;
}
