/**
 * Модели навесов, козырьков, перголы и ограждений — виды одного предмета
 * (family в каталоге). Подключаются к общему набору в buildItems.js.
 * Локальная система: X — ширина, Y — вверх, Z — глубина; у козырька стена — на −Z.
 */
import * as THREE from 'three';
import { box } from '../meshUtils.js';
import { railingGeos, beam } from './railing.js';
import { RAIL_STYLES } from '../../model/railings.js';
import { CATALOG } from '../../model/catalog.js';

const shade = (hex, k) => `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;
const POLY = '#cfe3ea'; // поликарбонат
const METAL = '#4b4f55';

/** Дуга над пролётом w со стрелой rise, вытянутая по глубине d: n плоских сегментов. */
function arcRoof(add, w, d, y0, rise, color, opts, n = 10) {
  const R = (w * w) / (8 * rise) + rise / 2;
  const yc = y0 + rise - R;
  const pt = (k) => {
    const x = -w / 2 + (w * k) / n;
    return { x, y: yc + Math.sqrt(Math.max(0, R * R - x * x)), z: 0 };
  };
  for (let k = 0; k < n; k++) {
    const g = beam(pt(k), pt(k + 1), d, 0.02);
    if (g) add(g, color, opts);
  }
  return pt;
}

/** Стойки навеса: по углам и посередине длинной стороны. */
function posts(add, w, d, h, c, size = 0.1) {
  const n = d > 4.5 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const z = -d / 2 + 0.1 + ((d - 0.2) * i) / (n - 1);
    for (const sx of [-1, 1]) add(box(size, h, size, sx * (w / 2 - 0.1), 0, z), c);
  }
}

/** Кронштейны козырька к стене. */
function brackets(add, w, d, yTop) {
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - 0.18);
    const br = beam({ x, y: -0.6, z: -d / 2 + 0.03 }, { x, y: yTop, z: d / 2 - 0.15 }, 0.05, 0.05);
    if (br) add(br, METAL);
    add(box(0.05, 0.7, 0.05, x, -0.6, -d / 2 + 0.03), METAL);
  }
}

export const OUTDOOR = {
  // ── козырьки над входом ──
  canopy_gable(add, w, d, h, c) {
    // два ската, конёк — от стены
    for (const sx of [-1, 1]) {
      const g = beam({ x: (sx * w) / 2, y: 0.04, z: 0 }, { x: 0, y: h, z: 0 }, d, 0.05);
      if (g) add(g, c);
    }
    add(box(0.07, 0.07, d, 0, h - 0.02, 0), shade(c, 0.75)); // конёк
    brackets(add, w, d, 0.02);
  },
  canopy_arch(add, w, d, h) {
    const pt = arcRoof(add, w, d, 0, h, POLY, { opacity: 0.55 });
    // дуги каркаса по краям
    for (const z of [-d / 2 + 0.02, d / 2 - 0.02]) {
      for (let k = 0; k < 10; k++) {
        const a = pt(k);
        const b = pt(k + 1);
        const g = beam({ ...a, z }, { ...b, z }, 0.04, 0.04);
        if (g) add(g, METAL);
      }
    }
    brackets(add, w, d, 0);
  },
  canopy_glass(add, w, d, h) {
    // стекло с небольшим уклоном от стены, на двух тягах
    const g = beam({ x: 0, y: 0.12, z: -d / 2 }, { x: 0, y: 0, z: d / 2 }, w, 0.02);
    if (g) add(g, null, { glass: true });
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 0.2);
      const rod = beam({ x, y: h + 0.3, z: -d / 2 + 0.02 }, { x, y: 0.04, z: d / 2 - 0.25 }, 0.02, 0.02);
      if (rod) add(rod, '#9aa1a8');
      add(box(0.08, 0.08, 0.03, x, h + 0.26, -d / 2 + 0.015), '#9aa1a8');
    }
  },

  // ── навесы для машины ──
  carport_gable(add, w, d, h, c) {
    const eave = h - 0.7;
    posts(add, w, d, eave, c);
    for (const sx of [-1, 1]) add(box(0.1, 0.16, d, sx * (w / 2 - 0.1), eave - 0.16, 0), c);
    const roof = shade(c, 0.7);
    for (const sx of [-1, 1]) {
      const g = beam({ x: sx * (w / 2 + 0.25), y: eave - 0.08, z: 0 }, { x: 0, y: h, z: 0 }, d + 0.4, 0.05);
      if (g) add(g, roof);
    }
    // стропильные фермы по торцам
    for (const z of [-d / 2 + 0.1, d / 2 - 0.1]) add(box(w - 0.2, 0.08, 0.08, 0, eave - 0.04, z), c);
  },
  carport_arch(add, w, d, h, c) {
    const eave = h - 0.6;
    posts(add, w, d, eave, c);
    for (const sx of [-1, 1]) add(box(0.1, 0.12, d, sx * (w / 2 - 0.1), eave - 0.12, 0), c);
    const pt = arcRoof(add, w + 0.3, d + 0.3, eave, 0.6, POLY, { opacity: 0.55 });
    for (let i = 0; i < 4; i++) {
      const z = -d / 2 + 0.05 + ((d - 0.1) * i) / 3;
      for (let k = 0; k < 10; k++) {
        const g = beam({ ...pt(k), z }, { ...pt(k + 1), z }, 0.05, 0.05);
        if (g) add(g, c);
      }
    }
  },
  carport_flat(add, w, d, h, c) {
    posts(add, w, d, h - 0.14, c, 0.12);
    add(box(w + 0.3, 0.14, d + 0.3, 0, h - 0.14, 0), c);
    add(box(w + 0.34, 0.03, d + 0.34, 0, h, 0), shade(c, 0.7));
  },
  pergola(add, w, d, h, c) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(0.12, h - 0.2, 0.12, sx * (w / 2 - 0.12), 0, sz * (d / 2 - 0.12)), c);
    for (const sx of [-1, 1]) add(box(0.08, 0.18, d + 0.4, sx * (w / 2 - 0.12), h - 0.36, 0), c);
    const n = Math.max(4, Math.round(d / 0.5));
    for (let i = 0; i <= n; i++) add(box(w + 0.4, 0.14, 0.05, 0, h - 0.18, -d / 2 + (d * i) / n), shade(c, 0.9));
  },
};

// ── ограждения: один участок в своём стиле; цвет предмета — цвет стоек и заполнения ──
for (const item of CATALOG.filter((x) => x.rail)) {
  OUTDOOR[item.type] = (add, w, d, h, c) => {
    const s = RAIL_STYLES[item.rail];
    const g = railingGeos(
      [
        { x: -w / 2, y: 0, h: 0 },
        { x: w / 2, y: 0, h: 0 },
      ],
      h,
      { style: item.rail },
    );
    const own = c && c.toLowerCase() !== item.color.toLowerCase();
    for (const r of g.rail) add(r, own && item.rail !== 'bars' ? c : s.rail);
    for (const m of g.metal) add(m, own ? c : s.fill);
    for (const gl of g.glass) add(gl, null, { glass: true });
  };
}
