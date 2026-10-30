/** Кэш материалов: один материал на цвет, отдельно — подсветка выделения. */
import * as THREE from 'three';

const cache = new Map();
const highlightCache = new Map();

export function mat(color, opts = {}) {
  const key = `${color}|${opts.roughness ?? 0.85}|${opts.metalness ?? 0}|${opts.opacity ?? 1}|${opts.emissive ?? ''}`;
  if (!cache.has(key)) {
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: opts.roughness ?? 0.85,
      metalness: opts.metalness ?? 0,
      side: THREE.DoubleSide,
      transparent: (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1,
      depthWrite: (opts.opacity ?? 1) >= 1,
    });
    if (opts.emissive) {
      m.emissive = new THREE.Color(opts.emissive);
      m.emissiveIntensity = opts.emissiveIntensity ?? 0.6;
    }
    cache.set(key, m);
  }
  return cache.get(key);
}

export function glassMat() {
  return mat('#a9cde3', { roughness: 0.08, metalness: 0.1, opacity: 0.38 });
}

/** Подсвеченная копия материала для выделенного объекта. */
export function highlighted(material) {
  if (!highlightCache.has(material.uuid)) {
    const m = material.clone();
    m.emissive = new THREE.Color('#2456d6');
    m.emissiveIntensity = 0.45;
    highlightCache.set(material.uuid, m);
  }
  return highlightCache.get(material.uuid);
}

export const edgeMaterial = new THREE.LineBasicMaterial({ color: '#2b3036', transparent: true, opacity: 0.28 });
