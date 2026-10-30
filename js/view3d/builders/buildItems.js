/**
 * Процедурные 3D-модели мебели и объектов участка — без внешних файлов.
 * Локальная система модели: X — ширина, Y — вверх, Z — глубина; «спинка» на −Z.
 */
import * as THREE from 'three';
import { box, cylinder, mergeGeometries, mesh } from '../meshUtils.js';
import { mat, glassMat } from '../materials.js';
import { DEG } from '../../core/geometry.js';

const WOOD = '#9a6b47';
const DARK = '#2f3236';
const WHITE = '#f3f3f1';
const METAL = '#b9bec4';

function sphere(r, x, y, z, sy = 1, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  g.scale(1, sy, 1);
  g.translate(x, y, z);
  return g;
}

function cone(r, h, x, y, z, seg = 10) {
  const g = new THREE.ConeGeometry(r, h, seg);
  g.translate(x, y + h / 2, z);
  return g;
}

function legs(add, w, d, h, r = 0.025, inset = 0.06, color = WOOD) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(cylinder(r, h, sx * (w / 2 - inset), 0, sz * (d / 2 - inset), 8), color);
}

const B = {
  sofa(add, w, d, h, c) {
    const seat = h * 0.5;
    add(box(w, seat * 0.75, d), c);
    add(box(w - 0.4, seat * 0.3, d - 0.28, 0, seat * 0.75, 0.06), lighten(c));
    add(box(w, h, 0.22, 0, 0, -d / 2 + 0.11), c);
    add(box(0.2, h * 0.7, d, -w / 2 + 0.1, 0, 0), c);
    add(box(0.2, h * 0.7, d, w / 2 - 0.1, 0, 0), c);
  },
  sofa_corner(add, w, d, h, c) {
    const dep = Math.min(0.95, d * 0.6, w * 0.45);
    const seat = h * 0.5;
    add(box(w, seat, dep, 0, 0, -d / 2 + dep / 2), c);
    add(box(dep, seat, d - dep, -w / 2 + dep / 2, 0, dep / 2), c);
    add(box(w, h, 0.22, 0, 0, -d / 2 + 0.11), c);
    add(box(0.22, h, d, -w / 2 + 0.11, 0, 0), c);
    add(box(0.2, h * 0.7, dep, w / 2 - 0.1, 0, -d / 2 + dep / 2), c);
  },
  armchair(add, w, d, h, c) {
    B.sofa(add, w, d, h, c);
  },
  coffee_table(add, w, d, h, c) {
    add(box(w, 0.04, d, 0, h - 0.04, 0), c);
    add(box(w - 0.1, 0.02, d - 0.1, 0, h * 0.25, 0), c);
    legs(add, w, d, h - 0.04, 0.02, 0.05, c);
  },
  tv_stand(add, w, d, h, c) {
    add(box(w, h, d), c);
    const tw = w * 0.82;
    add(box(0.25, 0.04, 0.18, 0, h, -d / 2 + 0.12), DARK);
    add(box(0.05, 0.1, 0.05, 0, h + 0.04, -d / 2 + 0.12), DARK);
    add(box(tw, tw * 0.56, 0.05, 0, h + 0.14, -d / 2 + 0.12), '#16181b');
  },
  bookshelf(add, w, d, h, c) {
    add(box(0.03, h, d, -w / 2 + 0.015, 0, 0), c);
    add(box(0.03, h, d, w / 2 - 0.015, 0, 0), c);
    add(box(w, h, 0.02, 0, 0, -d / 2 + 0.01), c);
    const n = Math.max(2, Math.round(h / 0.38));
    const colors = ['#7a4e3a', '#3f5d7a', '#b49a5a', '#5b7a54', '#8a3e3e'];
    for (let i = 0; i <= n; i++) {
      const y = (h - 0.03) * (i / n);
      add(box(w, 0.025, d, 0, y, 0), c);
      if (i < n) {
        let x = -w / 2 + 0.06;
        let k = i;
        while (x < w / 2 - 0.12) {
          const bw = 0.03 + ((k * 13) % 5) * 0.008;
          const bh = 0.22 + ((k * 7) % 4) * 0.025;
          add(box(bw, bh, d * 0.7, x + bw / 2, y + 0.025, 0.02), colors[k % colors.length]);
          x += bw + 0.004;
          k++;
          if ((k * 3) % 11 === 0) x += 0.1;
        }
      }
    }
  },
  rug(add, w, d, h, c) {
    add(box(w, Math.max(0.008, h), d), c);
  },
  fireplace(add, w, d, h, c) {
    add(box(w, h, d), c);
    add(box(w * 0.55, h * 0.5, 0.05, 0, h * 0.12, d / 2 - 0.02), '#2a2420');
    add(box(w + 0.1, 0.06, d + 0.08, 0, h, 0.02), lighten(c));
  },
  plant(add, w, d, h) {
    add(cylinder(w * 0.28, h * 0.3, 0, 0, 0, 12, w * 0.33), '#b8734f');
    add(sphere(w * 0.45, 0, h * 0.62, 0, 1.15), '#5e8f4e');
  },
  bed_double(add, w, d, h, c) {
    bed(add, w, d, h, c, 2);
  },
  bed_single(add, w, d, h, c) {
    bed(add, w, d, h, c, 1);
  },
  crib(add, w, d, h, c) {
    add(box(w, 0.12, d, 0, 0.25, 0), WHITE);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(0.04, h, 0.04, sx * (w / 2 - 0.02), 0, sz * (d / 2 - 0.02)), c);
    for (const y of [0.25, h - 0.04]) {
      add(box(w, 0.04, 0.03, 0, y, -d / 2 + 0.015), c);
      add(box(w, 0.04, 0.03, 0, y, d / 2 - 0.015), c);
      add(box(0.03, 0.04, d, -w / 2 + 0.015, y, 0), c);
      add(box(0.03, 0.04, d, w / 2 - 0.015, y, 0), c);
    }
  },
  nightstand(add, w, d, h, c) {
    add(box(w, h, d), c);
    add(box(w - 0.04, 0.01, 0.01, 0, h * 0.5, d / 2), DARK);
    add(cylinder(0.06, 0.03, 0, h, -0.02, 12), METAL);
    add(cylinder(0.01, 0.25, 0, h + 0.03, -0.02, 6), METAL);
    add(cylinder(0.11, 0.16, 0, h + 0.26, -0.02, 14, 0.07), '#f2e7cf');
  },
  wardrobe(add, w, d, h, c) {
    add(box(w, h, d), c);
    const n = Math.max(1, Math.round(w / 0.55));
    for (let i = 1; i < n; i++) add(box(0.008, h - 0.1, 0.01, -w / 2 + (w / n) * i, 0.05, d / 2 + 0.002), DARK);
    for (let i = 0; i < n; i++) add(box(0.015, 0.25, 0.02, -w / 2 + (w / n) * (i + 0.5) + 0.04, h * 0.45, d / 2 + 0.01), METAL);
  },
  dresser(add, w, d, h, c) {
    add(box(w, h, d), c);
    for (let i = 1; i < 3; i++) add(box(w - 0.04, 0.008, 0.01, 0, (h / 3) * i, d / 2 + 0.002), DARK);
  },
  desk(add, w, d, h, c) {
    add(box(w, 0.035, d, 0, h - 0.035, 0), c);
    add(box(0.035, h - 0.035, d - 0.04, -w / 2 + 0.02, 0, 0), c);
    add(box(0.035, h - 0.035, d - 0.04, w / 2 - 0.02, 0, 0), c);
    add(box(0.4, 0.28, 0.02, 0, h + 0.08, -d / 2 + 0.12), '#16181b');
  },
  office_chair(add, w, d, h, c) {
    add(cylinder(w * 0.35, 0.03, 0, 0.02, 0, 10), DARK);
    add(cylinder(0.025, 0.42, 0, 0.03, 0, 8), METAL);
    add(box(w * 0.85, 0.08, d * 0.8, 0, 0.45, 0.03), c);
    add(box(w * 0.75, h - 0.55, 0.06, 0, 0.55, -d / 2 + 0.08), c);
  },
  kitchen_counter(add, w, d, h, c) {
    counter(add, w, d, h, c);
    add(box(w, 0.7, 0.35, 0, 1.45, -d / 2 + 0.175), c);
  },
  kitchen_sink(add, w, d, h, c) {
    counter(add, w, d, h, c);
    add(box(w * 0.7, 0.012, d * 0.55, 0, h + 0.001, 0), METAL);
    add(cylinder(0.015, 0.28, 0, h, -d / 2 + 0.08, 8), METAL);
    add(box(0.03, 0.03, 0.18, 0, h + 0.26, -d / 2 + 0.16), METAL);
  },
  stove(add, w, d, h, c) {
    add(box(w, h - 0.02, d), c);
    add(box(w, 0.02, d, 0, h - 0.02, 0), '#1e1f22');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(cylinder(0.07, 0.006, (sx * w) / 4, h, (sz * d) / 4, 16), '#3a3c40');
    add(box(w - 0.08, h * 0.45, 0.01, 0, h * 0.12, d / 2 + 0.002), '#2b2d30');
  },
  fridge(add, w, d, h, c) {
    add(box(w, h, d), c);
    add(box(w, 0.01, 0.01, 0, h * 0.62, d / 2 + 0.002), '#8b9096');
    add(box(0.02, 0.35, 0.03, w / 2 - 0.06, h * 0.68, d / 2 + 0.015), METAL);
    add(box(0.02, 0.45, 0.03, w / 2 - 0.06, h * 0.25, d / 2 + 0.015), METAL);
  },
  kitchen_island(add, w, d, h, c) {
    add(box(w - 0.1, h - 0.04, d - 0.15), c);
    add(box(w, 0.04, d, 0, h - 0.04, 0), '#58524b');
  },
  dining_table(add, w, d, h, c) {
    add(box(w, 0.04, d, 0, h - 0.04, 0), c);
    legs(add, w, d, h - 0.04, 0.03, 0.08, c);
  },
  round_table(add, w, d, h, c) {
    const g = cylinder(0.5, 0.04, 0, h - 0.04, 0, 32);
    g.scale(w, 1, d);
    add(g, c);
    add(cylinder(0.05, h - 0.04, 0, 0, 0, 12), c);
    add(cylinder(0.25, 0.03, 0, 0, 0, 16), c);
  },
  chair(add, w, d, h, c) {
    add(box(w, 0.04, d * 0.9, 0, 0.44, d * 0.05), c);
    add(box(w, h - 0.48, 0.04, 0, 0.48, -d / 2 + 0.02), c);
    legs(add, w, d, 0.44, 0.015, 0.04, c);
  },
  toilet(add, w, d, h, c) {
    add(box(w, h - 0.4, 0.18, 0, 0.4, -d / 2 + 0.09), c);
    const bowl = cylinder(0.5, 0.4, 0, 0, 0.06, 20, 0.5);
    bowl.scale(w * 0.9, 1, d * 0.75);
    add(bowl, c);
    const seat = cylinder(0.5, 0.03, 0, 0.4, 0.06, 20);
    seat.scale(w * 0.95, 1, d * 0.78);
    add(seat, WHITE);
  },
  bathtub(add, w, d, h, c) {
    const t = 0.07;
    add(box(w, 0.12, d), c);
    add(box(w, h, t, 0, 0, -d / 2 + t / 2), c);
    add(box(w, h, t, 0, 0, d / 2 - t / 2), c);
    add(box(t, h, d, -w / 2 + t / 2, 0, 0), c);
    add(box(t, h, d, w / 2 - t / 2, 0, 0), c);
    add(box(w - 2 * t, 0.01, d - 2 * t, 0, h * 0.55, 0), '#bfe0ee', { opacity: 0.6 });
  },
  shower(add, w, d, h) {
    add(box(w, 0.08, d), '#eef2f4');
    add(box(w, h - 0.08, 0.01, 0, 0.08, d / 2 - 0.005), null, { glass: true });
    add(box(0.01, h - 0.08, d, w / 2 - 0.005, 0.08, 0), null, { glass: true });
    add(cylinder(0.012, h - 0.2, -w / 2 + 0.08, 0.1, -d / 2 + 0.08, 8), METAL);
    add(cylinder(0.08, 0.02, -w / 2 + 0.2, h - 0.12, -d / 2 + 0.2, 16), METAL);
  },
  washbasin(add, w, d, h, c) {
    add(box(w * 0.9, h - 0.15, d * 0.9, 0, 0, -d * 0.05), '#d9cbb8');
    add(box(w, 0.15, d, 0, h - 0.15, 0), c);
    add(cylinder(0.012, 0.18, 0, h, -d / 2 + 0.06, 8), METAL);
    add(box(0.5, 0.7, 0.02, 0, h + 0.25, -d / 2 + 0.01), '#cfe3ec');
  },
  washing_machine(add, w, d, h, c) {
    add(box(w, h, d), c);
    const door = cylinder(Math.min(w, h) * 0.3, 0.03, 0, 0, 0, 24);
    door.rotateX(Math.PI / 2);
    door.translate(0, h * 0.45, d / 2 + 0.01);
    add(door, '#4c5560');
  },
  boiler(add, w, d, h, c) {
    add(box(w, h, d), c);
    add(box(w * 0.5, 0.08, 0.01, 0, h * 0.2, d / 2 + 0.002), DARK);
  },
  box(add, w, d, h, c) {
    add(box(w, h, d), c);
  },
  column(add, w, d, h, c) {
    add(box(w, h, d), c);
  },
  piano(add, w, d, h, c) {
    add(box(w, h, d * 0.55, 0, 0, -d * 0.225), c);
    add(box(w, 0.06, d * 0.45, 0, 0.7, d * 0.225), c);
    add(box(w - 0.1, 0.02, d * 0.2, 0, 0.76, d * 0.25), WHITE);
    add(box(0.06, 0.7, d * 0.45, -w / 2 + 0.03, 0, d * 0.225), c);
    add(box(0.06, 0.7, d * 0.45, w / 2 - 0.03, 0, d * 0.225), c);
  },
  treadmill(add, w, d, h, c) {
    add(box(w, 0.18, d), c);
    add(box(w * 0.65, 0.01, d * 0.75, 0, 0.18, 0.08), '#1e1f22');
    add(box(0.04, h, 0.04, -w / 2 + 0.05, 0, -d / 2 + 0.15), c);
    add(box(0.04, h, 0.04, w / 2 - 0.05, 0, -d / 2 + 0.15), c);
    add(box(w, 0.08, 0.2, 0, h - 0.08, -d / 2 + 0.15), c);
  },

  // ── Участок ──
  tree(add, w, d, h, c) {
    add(cylinder(0.14, h * 0.45, 0, 0, 0, 8, 0.1), '#6b4e36');
    add(sphere(Math.min(w, d) * 0.42, 0, h * 0.62, 0, (h * 0.55) / Math.min(w, d)), c);
    add(sphere(Math.min(w, d) * 0.28, w * 0.15, h * 0.78, -d * 0.08, 0.9), lighten(c));
  },
  fruit_tree(add, w, d, h, c) {
    B.tree(add, w, d, h, c);
    for (let i = 0; i < 6; i++) {
      const a = i * 1.1;
      add(sphere(0.07, Math.cos(a) * w * 0.38, h * (0.5 + (i % 3) * 0.08), Math.sin(a) * d * 0.38, 1, 0), '#c8433a');
    }
  },
  conifer(add, w, d, h, c) {
    add(cylinder(0.12, h * 0.25, 0, 0, 0, 8), '#5b4330');
    const r = Math.min(w, d) / 2;
    add(cone(r, h * 0.5, 0, h * 0.15, 0, 10), c);
    add(cone(r * 0.78, h * 0.42, 0, h * 0.38, 0, 10), c);
    add(cone(r * 0.55, h * 0.35, 0, h * 0.62, 0, 10), c);
  },
  bush(add, w, d, h, c) {
    const g = sphere(0.5, 0, 0, 0, 1, 1);
    g.scale(w, h, d);
    g.translate(0, h * 0.5, 0);
    add(g, c);
  },
  flowerbed(add, w, d, h, c) {
    add(box(w, h * 0.7, d), '#7d6048');
    const colors = [c, '#f0c94d', '#efe9f5', '#c45b8a'];
    let k = 0;
    for (let x = -w / 2 + 0.15; x < w / 2 - 0.1; x += 0.22) {
      for (let z = -d / 2 + 0.15; z < d / 2 - 0.1; z += 0.22) add(sphere(0.07, x, h * 0.7 + 0.1, z, 1, 0), colors[k++ % 4]);
    }
  },
  garden_bed(add, w, d, h, c) {
    add(box(w, h, 0.04, 0, 0, -d / 2 + 0.02), WOOD);
    add(box(w, h, 0.04, 0, 0, d / 2 - 0.02), WOOD);
    add(box(0.04, h, d, -w / 2 + 0.02, 0, 0), WOOD);
    add(box(0.04, h, d, w / 2 - 0.02, 0, 0), WOOD);
    add(box(w - 0.08, h * 0.85, d - 0.08), c);
    const rows = Math.max(1, Math.round(d / 0.4));
    for (let i = 0; i < rows; i++) {
      const z = -d / 2 + (d / rows) * (i + 0.5);
      for (let x = -w / 2 + 0.15; x < w / 2 - 0.1; x += 0.3) add(sphere(0.09, x, h + 0.06, z, 0.8, 0), '#6c9a4c');
    }
  },
  greenhouse(add, w, d, h) {
    const wall = h * 0.55;
    add(box(w, wall, d), null, { glass: true });
    const roofG = new THREE.CylinderGeometry(w / 2, w / 2, d, 16, 1, true, -Math.PI / 2, Math.PI);
    roofG.rotateX(-Math.PI / 2);
    roofG.scale(1, (h - wall) / (w / 2), 1);
    roofG.translate(0, wall, 0);
    add(roofG, null, { glass: true });
    const step = d / Math.max(2, Math.round(d));
    for (let z = -d / 2; z <= d / 2 + 1e-6; z += step) {
      add(box(0.04, wall, 0.04, -w / 2, 0, z), METAL);
      add(box(0.04, wall, 0.04, w / 2, 0, z), METAL);
    }
  },
  gazebo(add, w, d, h, c) {
    add(box(w, 0.15, d), '#b49170');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(0.12, h * 0.75, 0.12, sx * (w / 2 - 0.12), 0.15, sz * (d / 2 - 0.12)), c);
    add(box(w * 0.55, 0.04, d * 0.35, 0, 0.75, 0), c);
    const roof = new THREE.ConeGeometry(Math.max(w, d) * 0.78, h * 0.3, 4, 1);
    roof.rotateY(Math.PI / 4);
    roof.translate(0, h * 0.75 + 0.15 + h * 0.15, 0);
    add(roof, '#7a3e30');
  },
  bench(add, w, d, h, c) {
    add(box(w, 0.05, d * 0.75, 0, 0.42, d * 0.12), c);
    add(box(w, 0.35, 0.04, 0, 0.5, -d / 2 + 0.03), c);
    for (const sx of [-1, 1]) add(box(0.05, 0.42, d * 0.7, sx * (w / 2 - 0.1), 0, d * 0.1), DARK);
  },
  bbq(add, w, d, h, c) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(0.03, h - 0.25, 0.03, sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04)), c);
    add(box(w, 0.25, d, 0, h - 0.25, 0), c);
    add(box(w - 0.06, 0.01, d - 0.06, 0, h - 0.04, 0), '#d26a2e');
  },
  pool(add, w, d, h, c) {
    const t = 0.25;
    add(box(w, h, t, 0, 0, -d / 2 + t / 2), '#e2ddd3');
    add(box(w, h, t, 0, 0, d / 2 - t / 2), '#e2ddd3');
    add(box(t, h, d, -w / 2 + t / 2, 0, 0), '#e2ddd3');
    add(box(t, h, d, w / 2 - t / 2, 0, 0), '#e2ddd3');
    add(box(w - 2 * t, h * 0.8, d - 2 * t), c, { opacity: 0.85 });
  },
  car(add, w, d, h, c) {
    // капот — к +X (как на плане)
    add(box(w, h * 0.45, d * 0.96, 0, 0.18, 0), c);
    add(box(w * 0.5, h * 0.4, d * 0.86, -w * 0.05, 0.18 + h * 0.45, 0), '#2d3742');
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const wh = cylinder(0.33, 0.22, 0, 0, 0, 16);
        wh.rotateX(Math.PI / 2);
        wh.translate(sx * w * 0.32, 0.33, sz * (d / 2 - 0.12));
        add(wh, '#1d1e20');
      }
    }
  },
  playground(add, w, d, h, c) {
    add(box(w, 0.08, d), '#e8d096');
    add(box(1.0, 1.2, 1.0, -w / 2 + 0.7, 0, -d / 2 + 0.7), c);
    add(box(0.9, 0.1, 1.0, -w / 2 + 0.7, 1.2, -d / 2 + 0.7), '#c96a3c');
    const slide = box(1.6, 0.05, 0.5, 0, 0, 0);
    slide.rotateZ(-0.6);
    slide.translate(-w / 2 + 1.8, 0.65, -d / 2 + 0.7);
    add(slide, '#3d8fd1');
    add(box(0.06, h, 0.06, w / 2 - 0.4, 0, d / 2 - 0.5), DARK);
    add(box(0.06, h, 0.06, w / 2 - 1.4, 0, d / 2 - 0.5), DARK);
    add(box(1.1, 0.06, 0.06, w / 2 - 0.9, h - 0.06, d / 2 - 0.5), DARK);
  },
  well(add, w, d, h, c) {
    const ring = new THREE.CylinderGeometry(w / 2, w / 2, 0.8, 20, 1, true);
    ring.translate(0, 0.4, 0);
    add(ring, c);
    add(box(0.08, h, 0.08, -w / 2 + 0.1, 0, 0), WOOD);
    add(box(0.08, h, 0.08, w / 2 - 0.1, 0, 0), WOOD);
    const roof = new THREE.ConeGeometry(w * 0.8, 0.5, 4);
    roof.rotateY(Math.PI / 4);
    roof.scale(1, 1, 0.7);
    roof.translate(0, h + 0.2, 0);
    add(roof, '#7a3e30');
  },
};

function bed(add, w, d, h, c, pillows) {
  add(box(w, 0.3, d), '#a88a6a');
  add(box(w - 0.04, 0.22, d - 0.1, 0, 0.3, 0.03), WHITE);
  add(box(w, 0.95, 0.08, 0, 0, -d / 2 + 0.04), '#a88a6a');
  const pw = (w - 0.16 - (pillows - 1) * 0.06) / pillows;
  for (let i = 0; i < pillows; i++) add(box(pw, 0.12, 0.35, -w / 2 + 0.08 + pw / 2 + i * (pw + 0.06), 0.52, -d / 2 + 0.3), '#fbfaf8');
  add(box(w - 0.02, 0.05, d * 0.62, 0, 0.5, d * 0.18), c === WHITE ? '#8fa3b8' : darken(c));
}

function counter(add, w, d, h, c) {
  add(box(w, h - 0.14, d - 0.04, 0, 0.1, -0.02), c);
  add(box(w, 0.1, d - 0.1, 0, 0, -0.05), DARK);
  add(box(w, 0.04, d, 0, h - 0.04, 0), '#58524b');
  const n = Math.max(1, Math.round(w / 0.6));
  for (let i = 1; i < n; i++) add(box(0.006, h - 0.2, 0.01, -w / 2 + (w / n) * i, 0.12, d / 2 - 0.035), DARK);
}

function lighten(hex) {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color('#ffffff'), 0.25);
  return `#${c.getHexString()}`;
}

function darken(hex) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(0.75);
  return `#${c.getHexString()}`;
}

/**
 * Модель объекта. Детали одного цвета объединяются в одну геометрию.
 * @returns {THREE.Group}
 */
export function buildItem(item, baseY) {
  const parts = new Map();
  const add = (geom, color, opts = {}) => {
    const key = opts.glass ? 'glass' : `${color || item.color}|${opts.opacity ?? 1}`;
    if (!parts.has(key)) parts.set(key, { geoms: [], color: color || item.color, opts });
    parts.get(key).geoms.push(geom);
  };
  const fn = B[item.type] || B.box;
  fn(add, item.w, item.d, item.h, item.color || '#c9c3b8');
  const group = new THREE.Group();
  for (const p of parts.values()) {
    const g = mergeGeometries(p.geoms);
    if (!g) continue;
    const material = p.opts.glass ? glassMat() : mat(p.color, { opacity: p.opts.opacity });
    group.add(mesh(g, material, { kind: 'item', id: item.id }, { cast: !p.opts.glass }));
  }
  group.position.set(item.x, baseY + (item.elevation || 0), item.y);
  group.rotation.y = -(item.rotation || 0) * DEG;
  group.userData.ref = { kind: 'item', id: item.id };
  return group;
}
