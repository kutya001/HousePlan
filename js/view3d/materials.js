/** Кэш материалов: один материал на цвет, отдельно — подсветка выделения. */
import * as THREE from 'three';
import { patternTexture } from './textures.js';
import './texturePack.js';

/** Текстуры в 3D (настройка «Текстуры»): выставляет сборка сцены. */
export const TEX = { on: true };

const cache = new Map();
const highlightCache = new Map();

/** Глубина рельефа по рисункам (bumpScale): кладка и камень — заметнее, доска и черепица — слабее. */
const RELIEF = { brick: 2.2, stone: 2.6, blockwork: 1.6, paving: 1.8, tiles: 2, metal: 1.6, shingle: 1.2, siding: 1.4, timber: 1.6, log: 2.4, wood: 1, profsheet: 2, seam: 1.6, slate: 1.6, ondulin: 2, walltile: 0.8, panels: 0.8, gravel: 1.4, plaster: 0.5, concrete: 0.5, picket: 1.2, deck: 1.2 };
let quality = 'medium';

/** Качество графики: на «быстром» материалы без рельефа. Меняется вместе с пересборкой сцены. */
export function setQuality(q) {
  quality = q;
}

export function mat(color, opts = {}) {
  const map = TEX.on && opts.map ? opts.map : '';
  const key = `${quality === 'low' ? 'L' : ''}${color}|${opts.roughness ?? 0.85}|${opts.metalness ?? 0}|${opts.opacity ?? 1}|${opts.emissive ?? ''}|${map}`;
  if (!cache.has(key)) {
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: opts.roughness ?? 0.85,
      metalness: opts.metalness ?? 0,
      side: THREE.DoubleSide,
      transparent: (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1,
      depthWrite: (opts.opacity ?? 1) >= 1,
      // грани чуть «отодвинуты» в буфере глубины — тонкие контуры рёбер (EdgesGeometry)
      // рисуются поверх стабильно и не мерцают на стыках стен
      polygonOffset: true,
      polygonOffsetFactor: 0,
      polygonOffsetUnits: 1,
    });
    if (map) {
      m.map = patternTexture(map);
      // рельеф из того же рисунка: швы кладки и доски читаются под боковым светом
      if (RELIEF[map] && quality !== 'low' && m.map) {
        m.bumpMap = m.map;
        m.bumpScale = RELIEF[map];
      }
    }
    if (opts.emissive) {
      m.emissive = new THREE.Color(opts.emissive);
      m.emissiveIntensity = opts.emissiveIntensity ?? 0.6;
    }
    cache.set(key, m);
  }
  return cache.get(key);
}

/**
 * Плафоны светильников: один общий материал, вечером «зажигается»
 * (setLampGlow из View3D по положению солнца).
 */
export const lampGlowMat = new THREE.MeshStandardMaterial({
  color: new THREE.Color('#fbf4e4'),
  roughness: 0.6,
  emissive: new THREE.Color('#ffcf86'),
  emissiveIntensity: 0,
  side: THREE.DoubleSide,
});

export function setLampGlow(k, windows = true) {
  lampGlowMat.emissiveIntensity = 1.6 * k;
  const g = glassMat();
  g.emissive = g.emissive || new THREE.Color();
  g.emissive.set('#ffc477');
  g.emissiveIntensity = windows ? 0.85 * k : 0;
}

export function glassMat() {
  // гладкое и чуть «металлическое»: в стекле отражается небо
  return mat('#a9cde3', { roughness: 0.04, metalness: 0.25, opacity: 0.36 });
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
