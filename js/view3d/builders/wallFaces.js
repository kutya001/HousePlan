/**
 * Разделение тела стены по граням: сторона A (+n), сторона B (−n), верхний срез
 * и остальное (откосы проёмов, торцы). Каждая часть получает свой материал —
 * отделка снаружи и внутри, а на срезе видно, из чего стена сложена.
 */
import * as THREE from 'three';

/**
 * @param geo — геометрия стены (треугольники)
 * @param nx, nz — нормаль стены в плане (g.n.x, g.n.y)
 * @returns {{ A, B, top, rest }} — BufferGeometry или null
 */
export function splitWallFaces(geo, nx, nz) {
  if (!geo) return { A: null, B: null, top: null, rest: null };
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  const buckets = { A: [], B: [], top: [], rest: [] };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.subVectors(b, a).cross(c.clone().sub(a));
    if (n.lengthSq() < 1e-14) continue;
    n.normalize();
    const side = n.x * nx + n.z * nz;
    const key = side > 0.7 ? 'A' : side < -0.7 ? 'B' : n.y > 0.5 ? 'top' : 'rest';
    buckets[key].push(a.x, a.y, a.z, n.x, n.y, n.z, b.x, b.y, b.z, n.x, n.y, n.z, c.x, c.y, c.z, n.x, n.y, n.z);
  }
  const out = {};
  for (const [key, data] of Object.entries(buckets)) {
    if (!data.length) {
      out[key] = null;
      continue;
    }
    const count = data.length / 6;
    const position = new Float32Array(count * 3);
    const normal = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      position.set(data.slice(i * 6, i * 6 + 3), i * 3);
      normal.set(data.slice(i * 6 + 3, i * 6 + 6), i * 3);
    }
    const plain = new THREE.BufferGeometry();
    plain.setAttribute('position', new THREE.BufferAttribute(position, 3));
    plain.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    out[key] = plain;
  }
  return out;
}
