/**
 * Процедурные текстуры без файлов: кирпич, сайдинг, камень, штукатурка, полы,
 * кровля. Рисуются на canvas светлыми оттенками серого — цвет материала
 * умножается на текстуру, поэтому выбранный пользователем цвет сохраняется.
 * UV у геометрии — в метрах (planarUV), повтор текстуры — по её реальному размеру.
 */
import * as THREE from 'three';

const cache = new Map();

/** Детерминированный «случай» — текстура одинакова при каждой сборке. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const gray = (v) => {
  const c = Math.max(0, Math.min(255, Math.round(v * 255)));
  return `rgb(${c},${c},${c})`;
};

export function noise(g, w, h, amount, rand, size = 2) {
  for (let i = 0; i < (w * h) / (size * size * 3); i++) {
    g.fillStyle = `rgba(0,0,0,${rand() * amount})`;
    g.fillRect(rand() * w, rand() * h, size, size);
  }
}

/**
 * period — размер повторяющегося фрагмента в метрах [по u, по v];
 * px — размер холста.
 */
const PATTERNS = {
  plaster: {
    period: [2, 2],
    px: [256, 256],
    draw(g, w, h, r) {
      g.fillStyle = gray(0.97);
      g.fillRect(0, 0, w, h);
      noise(g, w, h, 0.035, r, 3);
    },
  },
  brick: {
    period: [1.04, 0.6],
    px: [512, 296],
    draw(g, w, h, r) {
      const rows = 8;
      const cols = 4;
      const rh = h / rows;
      const cw = w / cols;
      const mortar = Math.max(2, rh * 0.14);
      g.fillStyle = gray(0.7);
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < rows; y++) {
        const off = y % 2 ? cw / 2 : 0;
        for (let x = -1; x <= cols; x++) {
          g.fillStyle = gray(0.84 + r() * 0.16);
          g.fillRect(x * cw + off + mortar / 2, y * rh + mortar / 2, cw - mortar, rh - mortar);
        }
      }
      noise(g, w, h, 0.08, r, 2);
    },
  },
  siding: {
    period: [1, 0.6],
    px: [256, 256],
    draw(g, w, h, r) {
      const n = 4;
      const bh = h / n;
      for (let i = 0; i < n; i++) {
        const grd = g.createLinearGradient(0, i * bh, 0, (i + 1) * bh);
        grd.addColorStop(0, gray(0.99));
        grd.addColorStop(0.85, gray(0.9));
        grd.addColorStop(1, gray(0.7));
        g.fillStyle = grd;
        g.fillRect(0, i * bh, w, bh);
      }
      // волокна
      g.strokeStyle = 'rgba(0,0,0,0.05)';
      for (let i = 0; i < 40; i++) {
        const y = r() * h;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y + (r() - 0.5) * 3);
        g.stroke();
      }
    },
  },
  stone: {
    period: [1.2, 1.2],
    px: [384, 384],
    draw(g, w, h, r) {
      g.fillStyle = gray(0.66);
      g.fillRect(0, 0, w, h);
      const rows = 5;
      const rh = h / rows;
      for (let y = 0; y < rows; y++) {
        let x = -r() * 60;
        while (x < w) {
          const sw = 50 + r() * 70;
          g.fillStyle = gray(0.78 + r() * 0.2);
          g.fillRect(x + 3, y * rh + 3, sw - 6, rh - 6);
          x += sw;
        }
      }
      noise(g, w, h, 0.1, r, 2);
    },
  },
  // ── полы ──
  parquet: {
    period: [0.6, 0.6],
    px: [256, 256],
    draw(g, w, h, r) {
      // «ёлочка» упрощённо: планки 0,6 × 0,075 со сдвигом
      const n = 8;
      const ph = h / n;
      for (let i = 0; i < n; i++) {
        const off = (i % 2) * (w / 2);
        for (let k = -1; k < 2; k++) {
          g.fillStyle = gray(0.82 + r() * 0.18);
          g.fillRect(k * w + off, i * ph, w - 1, ph - 1);
        }
      }
      g.strokeStyle = 'rgba(0,0,0,0.06)';
      for (let i = 0; i < 70; i++) {
        const y = r() * h;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y + (r() - 0.5) * 2);
        g.stroke();
      }
    },
  },
  laminate: {
    period: [2.4, 0.8],
    px: [512, 256],
    draw(g, w, h, r) {
      g.fillStyle = gray(0.74);
      g.fillRect(0, 0, w, h);
      const n = 4;
      const ph = h / n;
      for (let i = 0; i < n; i++) {
        const off = r() * w;
        for (let k = -2; k < 3; k++) {
          g.fillStyle = gray(0.84 + r() * 0.16);
          g.fillRect(k * (w / 2) + off, i * ph, w / 2 - 1.5, ph - 1.5);
        }
      }
      g.strokeStyle = 'rgba(0,0,0,0.05)';
      for (let i = 0; i < 90; i++) {
        const y = r() * h;
        g.beginPath();
        g.moveTo(0, y);
        g.bezierCurveTo(w / 3, y + r() * 4 - 2, (2 * w) / 3, y + r() * 4 - 2, w, y);
        g.stroke();
      }
    },
  },
  tile: {
    period: [0.6, 0.6],
    px: [256, 256],
    draw(g, w, h, r) {
      g.fillStyle = gray(0.72);
      g.fillRect(0, 0, w, h);
      const n = 2;
      const s = w / n;
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          g.fillStyle = gray(0.92 + r() * 0.08);
          g.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
        }
    },
  },
  floorstone: {
    period: [1.2, 1.2],
    px: [256, 256],
    draw(g, w, h, r) {
      g.fillStyle = gray(0.7);
      g.fillRect(0, 0, w, h);
      const s = w / 2;
      for (let y = 0; y < 2; y++)
        for (let x = 0; x < 2; x++) {
          g.fillStyle = gray(0.84 + r() * 0.14);
          g.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
        }
      noise(g, w, h, 0.12, r, 3);
    },
  },
  carpet: {
    period: [1, 1],
    px: [128, 128],
    draw(g, w, h, r) {
      g.fillStyle = gray(0.92);
      g.fillRect(0, 0, w, h);
      noise(g, w, h, 0.18, r, 1);
    },
  },
  concrete: {
    period: [3, 3],
    px: [256, 256],
    draw(g, w, h, r) {
      g.fillStyle = gray(0.94);
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(0,0,0,${r() * 0.04})`;
        g.beginPath();
        g.arc(r() * w, r() * h, 8 + r() * 30, 0, Math.PI * 2);
        g.fill();
      }
      noise(g, w, h, 0.07, r, 2);
    },
  },
  // ── кровля: u — вдоль карниза, v — вверх по скату ──
  metal: {
    period: [0.36, 0.35],
    px: [128, 128],
    draw(g, w, h) {
      // металлочерепица: волна поперёк и ступенька через 35 см
      const grd = g.createLinearGradient(0, 0, w, 0);
      grd.addColorStop(0, gray(0.78));
      grd.addColorStop(0.5, gray(1));
      grd.addColorStop(1, gray(0.78));
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      const st = g.createLinearGradient(0, h, 0, h * 0.75);
      st.addColorStop(0, 'rgba(0,0,0,0.32)');
      st.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = st;
      g.fillRect(0, h * 0.75, w, h * 0.25);
    },
  },
  tiles: {
    period: [0.6, 0.32],
    px: [256, 140],
    draw(g, w, h, r) {
      // керамическая черепица: полукруглые ряды
      g.fillStyle = gray(0.7);
      g.fillRect(0, 0, w, h);
      const n = 3;
      const tw = w / n;
      for (let i = -1; i <= n; i++) {
        const grd = g.createLinearGradient(i * tw, 0, (i + 1) * tw, 0);
        const v = 0.86 + r() * 0.12;
        grd.addColorStop(0, gray(v - 0.18));
        grd.addColorStop(0.45, gray(v));
        grd.addColorStop(1, gray(v - 0.22));
        g.fillStyle = grd;
        g.beginPath();
        g.moveTo(i * tw + 1, 0);
        g.lineTo(i * tw + 1, h * 0.7);
        g.quadraticCurveTo(i * tw + tw / 2, h * 1.02, (i + 1) * tw - 1, h * 0.7);
        g.lineTo((i + 1) * tw - 1, 0);
        g.fill();
      }
    },
  },
  shingle: {
    period: [1, 0.4],
    px: [256, 104],
    draw(g, w, h, r) {
      // гибкая черепица: ряды «бобровый хвост» со сдвигом
      g.fillStyle = gray(0.62);
      g.fillRect(0, 0, w, h);
      for (let row = 0; row < 2; row++) {
        const y0 = row * (h / 2);
        const off = row ? w / 8 : 0;
        for (let i = -1; i < 4; i++) {
          g.fillStyle = gray(0.8 + r() * 0.18);
          const x = i * (w / 4) + off;
          g.beginPath();
          g.moveTo(x + 2, y0);
          g.lineTo(x + w / 4 - 2, y0);
          g.lineTo(x + w / 4 - 2, y0 + h / 2 - 8);
          g.quadraticCurveTo(x + w / 8, y0 + h / 2 + 2, x + 2, y0 + h / 2 - 8);
          g.fill();
        }
      }
      noise(g, w, h, 0.12, r, 1);
    },
  },
  // ── участок ──
  grass: {
    period: [3, 3],
    px: [256, 256],
    draw(g, w, h, r) {
      g.fillStyle = gray(0.92);
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.08})`;
        g.fillRect(r() * w, r() * h, 1, 2 + r() * 3);
      }
    },
  },
  paving: {
    period: [0.8, 0.8],
    px: [256, 256],
    draw(g, w, h, r) {
      g.fillStyle = gray(0.68);
      g.fillRect(0, 0, w, h);
      const n = 4;
      const s = w / n;
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const off = y % 2 ? s / 2 : 0;
          g.fillStyle = gray(0.85 + r() * 0.15);
          g.fillRect(x * s + off + 2, y * s + 2, s - 4, s - 4);
          if (off) {
            g.fillRect(-s / 2 + 2, y * s + 2, s - 4, s - 4);
          }
        }
    },
  },
  deck: {
    period: [1.2, 0.6],
    px: [256, 128],
    draw(g, w, h, r) {
      const n = 4;
      const bh = h / n;
      for (let i = 0; i < n; i++) {
        g.fillStyle = gray(0.82 + r() * 0.16);
        g.fillRect(0, i * bh, w, bh - 3);
      }
      g.fillStyle = gray(0.45);
      for (let i = 0; i < n; i++) g.fillRect(0, (i + 1) * bh - 3, w, 3);
    },
  },
  gravel: {
    period: [1, 1],
    px: [192, 192],
    draw(g, w, h, r) {
      g.fillStyle = gray(0.88);
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = gray(0.65 + r() * 0.35);
        g.beginPath();
        g.arc(r() * w, r() * h, 1 + r() * 2.2, 0, Math.PI * 2);
        g.fill();
      }
    },
  },
};

/** Добавить текстуры (см. texturePack.js). */
export function registerPatterns(defs) {
  Object.assign(PATTERNS, defs);
}

/** Какой текстурой покрыть пол из данного материала. */
export const FLOOR_TEXTURE = { parquet: 'parquet', laminate: 'laminate', tile: 'tile', stone: 'floorstone', carpet: 'carpet', concrete: 'concrete' };
export const ZONE_TEXTURE = { lawn: 'grass', paving: 'paving', deck: 'deck', gravel: 'gravel', asphalt: 'concrete', soil: 'carpet' };

export function patternTexture(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const def = PATTERNS[kind];
  if (!def || typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  [c.width, c.height] = def.px;
  def.draw(c.getContext('2d'), c.width, c.height, rng(kind.length * 7919 + kind.charCodeAt(0)));
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / def.period[0], 1 / def.period[1]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(kind, tex);
  return tex;
}
