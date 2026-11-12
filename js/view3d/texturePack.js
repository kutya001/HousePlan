/**
 * Дополнительные процедурные текстуры: отделка стен (брус, бревно, вагонка, плитка,
 * обои, панели), кровля (фальц, профнастил, шифер, ондулин, мембрана, зелёная),
 * заборы (профнастил, штакетник, сетка, кладка) и грунт.
 * Правила те же, что в textures.js: оттенки серого, цвет даёт материал.
 */
import { registerPatterns, gray, noise } from './textures.js';

/** Горизонтальные ряды с тенью снизу — брус, доска, блок-хаус. */
function courses(g, w, h, r, rows, { round = false, gap = 0.06, grain = 30 } = {}) {
  const rh = h / rows;
  for (let i = 0; i < rows; i++) {
    const grd = g.createLinearGradient(0, i * rh, 0, (i + 1) * rh);
    if (round) {
      grd.addColorStop(0, gray(0.72));
      grd.addColorStop(0.3, gray(1));
      grd.addColorStop(0.75, gray(0.86));
      grd.addColorStop(1, gray(0.55));
    } else {
      grd.addColorStop(0, gray(0.98));
      grd.addColorStop(1 - gap * 2, gray(0.9));
      grd.addColorStop(1 - gap, gray(0.62));
      grd.addColorStop(1, gray(0.5));
    }
    g.fillStyle = grd;
    g.fillRect(0, i * rh, w, rh);
  }
  g.strokeStyle = 'rgba(0,0,0,0.06)';
  for (let i = 0; i < grain; i++) {
    const y = r() * h;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 4, w * 0.7, y + (r() - 0.5) * 4, w, y);
    g.stroke();
  }
}

/** Вертикальные полосы: доски, листы, волны профнастила. */
function stripes(g, w, h, n, stops) {
  const sw = w / n;
  for (let i = 0; i < n; i++) {
    const grd = g.createLinearGradient(i * sw, 0, (i + 1) * sw, 0);
    for (const [t, v] of stops) grd.addColorStop(t, gray(v));
    g.fillStyle = grd;
    g.fillRect(i * sw, 0, sw + 1, h);
  }
}

registerPatterns({
  // ── стены ──
  timber: {
    period: [3, 0.6],
    px: [512, 256],
    draw(g, w, h, r) {
      courses(g, w, h, r, 4, { gap: 0.05 });
    },
  },
  log: {
    period: [3, 0.72],
    px: [512, 256],
    draw(g, w, h, r) {
      courses(g, w, h, r, 3, { round: true, grain: 36 });
    },
  },
  wood: {
    period: [0.6, 2.4],
    px: [256, 512],
    draw(g, w, h, r) {
      stripes(g, w, h, 6, [
        [0, 0.72],
        [0.08, 0.98],
        [0.9, 0.93],
        [1, 0.7],
      ]);
      g.strokeStyle = 'rgba(0,0,0,0.05)';
      for (let i = 0; i < 60; i++) {
        const x = r() * w;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + (r() - 0.5) * 3, h);
        g.stroke();
      }
    },
  },
  walltile: {
    period: [0.6, 0.6],
    px: [256, 256],
    draw(g, w, h, r) {
      g.fillStyle = gray(0.74);
      g.fillRect(0, 0, w, h);
      const n = 2;
      const s = w / n;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          g.fillStyle = gray(0.94 + r() * 0.06);
          g.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
        }
      }
    },
  },
  wallpaper: {
    period: [0.53, 0.53],
    px: [256, 256],
    draw(g, w, h, r) {
      g.fillStyle = gray(0.96);
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.045)';
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const cx = (x + (y % 2 ? 0.5 : 0)) * (w / 4);
          const cy = (y + 0.5) * (h / 4);
          g.beginPath();
          g.ellipse(cx, cy, w / 20, h / 12, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
      noise(g, w, h, 0.02, r, 2);
    },
  },
  panels: {
    period: [1.2, 0.6],
    px: [512, 256],
    draw(g, w, h, r) {
      g.fillStyle = gray(0.62);
      g.fillRect(0, 0, w, h);
      for (let x = 0; x < 2; x++) {
        g.fillStyle = gray(0.93 + r() * 0.06);
        g.fillRect(x * (w / 2) + 3, 3, w / 2 - 6, h - 6);
      }
      noise(g, w, h, 0.03, r, 2);
    },
  },
  blockwork: {
    period: [1.25, 0.5],
    px: [512, 204],
    draw(g, w, h, r) {
      g.fillStyle = gray(0.78);
      g.fillRect(0, 0, w, h);
      const rh = h / 2;
      const cw = w / 2;
      for (let y = 0; y < 2; y++) {
        for (let x = -1; x <= 2; x++) {
          g.fillStyle = gray(0.92 + r() * 0.08);
          g.fillRect(x * cw + (y ? cw / 2 : 0) + 2, y * rh + 2, cw - 4, rh - 4);
        }
      }
      noise(g, w, h, 0.05, r, 2);
    },
  },
  // ── кровля ──
  seam: {
    period: [0.55, 2],
    px: [128, 256],
    draw(g, w, h, r) {
      g.fillStyle = gray(0.94);
      g.fillRect(0, 0, w, h);
      g.fillStyle = gray(0.62);
      g.fillRect(w - 10, 0, 4, h);
      g.fillStyle = gray(1);
      g.fillRect(w - 6, 0, 4, h);
      noise(g, w, h, 0.02, r, 2);
    },
  },
  profsheet: {
    period: [0.2, 2],
    px: [64, 128],
    draw(g, w, h) {
      stripes(g, w, h, 1, [
        [0, 0.66],
        [0.18, 0.98],
        [0.5, 1],
        [0.68, 0.84],
        [0.8, 0.66],
        [1, 0.66],
      ]);
    },
  },
  slate: {
    period: [1.13, 1.75],
    px: [256, 256],
    draw(g, w, h, r) {
      stripes(g, w, h, 8, [
        [0, 0.74],
        [0.5, 1],
        [1, 0.74],
      ]);
      g.fillStyle = 'rgba(0,0,0,0.16)';
      g.fillRect(0, h - 5, w, 5);
      noise(g, w, h, 0.07, r, 2);
    },
  },
  ondulin: {
    period: [0.95, 2],
    px: [256, 256],
    draw(g, w, h, r) {
      stripes(g, w, h, 10, [
        [0, 0.7],
        [0.5, 0.98],
        [1, 0.7],
      ]);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(0, h - 4, w, 4);
      noise(g, w, h, 0.05, r, 3);
    },
  },
  membrane: {
    period: [2, 2],
    px: [256, 256],
    draw(g, w, h, r) {
      g.fillStyle = gray(0.95);
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.fillRect(0, 0, w, 3);
      noise(g, w, h, 0.03, r, 3);
    },
  },
  sedum: {
    period: [1.5, 1.5],
    px: [256, 256],
    draw(g, w, h, r) {
      g.fillStyle = gray(0.86);
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = gray(0.68 + r() * 0.32);
        g.beginPath();
        g.arc(r() * w, r() * h, 2 + r() * 4, 0, Math.PI * 2);
        g.fill();
      }
    },
  },
  // ── заборы ──
  picket: {
    period: [0.3, 2],
    px: [96, 128],
    draw(g, w, h) {
      g.fillStyle = gray(0.05);
      g.fillRect(0, 0, w, h);
      stripes(g, (w * 2) / 3, h, 1, [
        [0, 0.8],
        [0.2, 1],
        [0.8, 0.94],
        [1, 0.74],
      ]);
    },
  },
  soil: {
    period: [2, 2],
    px: [256, 256],
    draw(g, w, h, r) {
      g.fillStyle = gray(0.9);
      g.fillRect(0, 0, w, h);
      noise(g, w, h, 0.16, r, 4);
      noise(g, w, h, 0.1, r, 2);
    },
  },
});
