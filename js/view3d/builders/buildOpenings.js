/**
 * Окна, двери, ворота и проёмы в 3D. Модель строится в локальной системе проёма:
 * X — вдоль стены, Y — вверх от пола, Z — по нормали стены (сторона A стены — +Z).
 * Створки дверей — отдельные узлы (петля, рельс, подъём, рулон), чтобы их можно было
 * открывать в режиме прогулки: описание движений — в group.userData.door.
 * Что именно строить (полотно, фрамуга, боковое остекление, арка) — model/openings.js.
 */
import * as THREE from 'three';
import { box, mergeGeometries, mesh, prism3D, planarUV } from '../meshUtils.js';
import { mat, glassMat, TEX } from '../materials.js';
import { pointOnWall } from '../../geometry/wallGeometry.js';
import { openingLook, archRise } from '../../model/openings.js';

const FW = 0.06; // толщина бруска коробки и рамы
const LEAF_T = 0.045; // толщина полотна

const shade = (hex, k) => `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;

/**
 * @param wallMats { a, b } — материалы сторон стены (+Z и −Z): ими закрыты углы над аркой
 */
export function buildOpening(g, o, base, wallH, wallMats = null) {
  const group = new THREE.Group();
  const c = pointOnWall(g, o.t);
  group.position.set(c.x, base, c.y);
  group.rotation.y = Math.atan2(-g.d.y, g.d.x);
  const ref = { kind: 'opening', id: o.id };
  const look = openingLook(o);
  const size = { w: o.width, H: Math.min(o.height, wallH - o.sill), T: g.half * 2, y0: o.kind === 'window' ? o.sill : 0 };
  // статичные части по материалам и подвижные створки
  const parts = { frame: [], glass: [], leaf: [], trim: [], metal: [], wallA: [], wallB: [], moving: [] };

  if (o.kind === 'window') windowParts(parts, o, look, size);
  else if (o.kind === 'door') (look.gate ? gateParts : doorParts)(parts, o, look, size);
  else archParts(parts, o, look, size);

  const mats = {
    frame: mat(look.frameColor, { roughness: 0.5 }),
    leaf: mat(look.leafColor, { roughness: look.leaf === 'metal' || look.gate ? 0.45 : 0.6, metalness: look.leaf === 'metal' ? 0.3 : 0 }),
    trim: mat(shade(look.leafColor, 0.82), { roughness: 0.6 }),
    metal: mat('#9aa1a8', { roughness: 0.35, metalness: 0.6 }),
    glass: glassMat(),
  };
  const add = (host, list, material, cast = true) => {
    const geo = mergeGeometries(list.filter(Boolean));
    if (geo) host.add(mesh(geo, material, ref, { cast }));
  };
  const fill = (host, p) => {
    add(host, p.frame || [], mats.frame);
    add(host, p.leaf || [], mats.leaf);
    add(host, p.trim || [], mats.trim);
    add(host, p.metal || [], mats.metal);
    add(host, p.glass || [], mats.glass, false);
  };
  fill(group, parts);
  // углы над аркой — продолжение стены: с каждой стороны своя отделка
  for (const [list, material] of [
    [parts.wallA, wallMats?.a || mats.frame],
    [parts.wallB, wallMats?.b || mats.frame],
  ]) {
    let geo = mergeGeometries(list.filter(Boolean));
    if (!geo) continue;
    if (TEX.on && material.map) geo = planarUV(geo);
    group.add(mesh(geo, material, ref));
  }

  if (parts.moving.length) {
    const moving = [];
    const make = (mv) => {
      const node = new THREE.Group();
      node.position.set(mv.pivot.x, mv.pivot.y, mv.pivot.z);
      fill(node, mv);
      moving.push({ node, motion: mv.motion, base: node.position.clone() });
      for (const child of mv.children || []) node.add(make(child));
      return node;
    };
    for (const mv of parts.moving) group.add(make(mv));
    group.userData.door = { id: o.id, parts: moving };
  }
  group.userData.ref = ref;
  return group;
}

// ── Арка ─────────────────────────────────────────────────────────────────

/** Высота арки над полом проёма в точке x (x — от центра проёма). */
function archY(x, w, top, rise) {
  const R = (w * w) / 4 + rise * rise;
  const r = R / (2 * rise);
  return top - r + Math.sqrt(Math.max(0, r * r - x * x));
}

/**
 * Арочный верх: углы между прямоугольником проёма и дугой закрыты «стеной»
 * (две половины толщины — у каждой стороны своя отделка), по дуге — обрамление.
 */
function archTop(parts, { w, T }, top, rise, { casing = FW, depth = T + 0.02 } = {}) {
  const N = 12;
  const pts = [];
  for (let k = 0; k <= N; k++) {
    const x = -w / 2 + (w / 2) * (k / N);
    pts.push({ x, y: archY(x, w, top, rise) });
  }
  const gap = 0.008; // щель под стекло между половинами
  for (const side of [-1, 1]) {
    // угол проёма первым: от него видна вся дуга, веер треугольников не выходит за контур
    const poly = [{ x: side * (-w / 2), y: top }, ...pts.map((p) => ({ x: side * p.x, y: p.y }))];
    parts.wallA.push(prism3D(poly.map((p) => ({ ...p, z: gap })), { x: 0, y: 0, z: T / 2 - gap }));
    parts.wallB.push(prism3D(poly.map((p) => ({ ...p, z: -gap })), { x: 0, y: 0, z: -(T / 2 - gap) }));
    // обрамление по дуге — короткие бруски
    for (let k = 0; k < N; k++) {
      const a = pts[k];
      const b = pts[k + 1];
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      const seg = new THREE.BoxGeometry(L + 0.01, casing, depth);
      seg.rotateZ(Math.atan2(b.y - a.y, b.x - a.x) * side);
      seg.translate((side * (a.x + b.x)) / 2, (a.y + b.y) / 2 - casing / 2, 0);
      parts.frame.push(seg);
    }
  }
}

// ── Окно ─────────────────────────────────────────────────────────────────

function windowParts(parts, o, look, { w, H, T, y0 }) {
  const fd = Math.min(0.09, T * 0.6);
  const top = y0 + H;
  const rise = look.arched ? archRise(w, H) : 0;
  const { frame, glass } = parts;
  // высота в свету в точке x: под аркой — до дуги
  const clear = (x) => (look.arched ? archY(Math.min(Math.abs(x), w / 2), w, top, rise) : top) - FW;
  frame.push(box(FW, H - rise, fd, -w / 2 + FW / 2, y0, 0));
  frame.push(box(FW, H - rise, fd, w / 2 - FW / 2, y0, 0));
  frame.push(box(w, FW, fd, 0, y0, 0));
  if (look.arched) archTop(parts, { w, T }, top, rise, { depth: fd });
  else frame.push(box(w, FW, fd, 0, top - FW, 0));
  const n = { single: 1, double: 2, triple: 3, panoramic: Math.max(2, Math.round(w / 1)) }[o.style] || 2;
  for (let i = 1; i < n; i++) {
    const x = -w / 2 + (w / n) * i;
    frame.push(box(0.05, Math.max(0.05, clear(x) - y0 - FW), fd * 0.9, x, y0 + FW, 0));
  }
  glass.push(box(w - 2 * FW, H - 2 * FW + (look.arched ? FW : 0), 0.012, 0, y0 + FW, 0));
  // раскладка: тонкие горбыльки делят каждую створку на клетки
  if (look.grid) {
    const bar = 0.022;
    const sash = w / n;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + sash * (i + 0.5);
      if (sash > 0.5) frame.push(box(bar, Math.max(0.05, clear(x) - y0 - FW), 0.03, x, y0 + FW, 0));
    }
    const rows = Math.max(2, Math.round((H - 2 * FW) / 0.45));
    for (let r = 1; r < rows; r++) {
      const y = y0 + FW + ((H - 2 * FW) / rows) * r;
      // под аркой горбылёк короче — до дуги
      let half = w / 2 - FW;
      if (look.arched && y > top - rise) {
        const R = ((w * w) / 4 + rise * rise) / (2 * rise);
        half = Math.min(half, Math.sqrt(Math.max(0, R * R - (y - (top - R)) ** 2)) - FW);
      }
      if (half > 0.1) frame.push(box(half * 2, bar, 0.03, 0, y - bar / 2, 0));
    }
  }
  // подоконник с двух сторон
  // верх доски на 4 мм выше низа проёма — иначе совпадает с верхом стены под окном и мерцает
  if (o.sill > 0.2) frame.push(box(w + 0.08, 0.034, T + 0.1, 0, y0 - 0.03, 0));
}

// ── Полотно двери ────────────────────────────────────────────────────────

/**
 * Полотно в осях створки: петля в x = 0, полотно — от неё на dir · lw, низ в y = 0.
 * @returns {{ leaf, trim, glass, metal }} списки геометрий по материалам
 */
function leafGeoms(kind, lw, lh, dir, { handle = 'lever' } = {}) {
  const cx = (dir * lw) / 2;
  const out = { leaf: [], trim: [], glass: [], metal: [] };
  const hx = dir * (lw - 0.08); // ручка — у свободного края
  if (kind === 'glass') {
    // стекло без рамы: фурнитура у петель и ручка-скоба
    out.glass.push(box(lw, lh - 0.01, 0.012, cx, 0, 0));
    for (const y of [0.02, lh - 0.09]) out.metal.push(box(0.14, 0.06, 0.03, dir * 0.07, y, 0));
    if (handle) out.metal.push(box(0.022, 0.42, 0.07, hx, 0.85, 0));
    return out;
  }
  if (kind === 'glazed') {
    // обвязка, глухая филёнка снизу и стекло сверху
    const st = Math.min(0.11, lw * 0.18);
    const rail = 0.95;
    out.leaf.push(box(st, lh, LEAF_T, dir * (st / 2), 0, 0), box(st, lh, LEAF_T, dir * (lw - st / 2), 0, 0));
    out.leaf.push(box(lw - 2 * st, 0.12, LEAF_T, cx, lh - 0.12, 0), box(lw - 2 * st, 0.13, LEAF_T, cx, rail - 0.13, 0), box(lw - 2 * st, 0.2, LEAF_T, cx, 0, 0));
    out.trim.push(box(lw - 2 * st, rail - 0.33, 0.028, cx, 0.2, 0));
    out.glass.push(box(lw - 2 * st, lh - 0.12 - rail, 0.012, cx, rail, 0));
  } else if (kind === 'panel') {
    // филёнки: две выступающие вставки
    out.leaf.push(box(lw, lh, LEAF_T, cx, 0, 0));
    const pw = lw - 0.24;
    if (pw > 0.15) {
      out.trim.push(box(pw, lh * 0.34, LEAF_T + 0.012, cx, 0.16, 0));
      out.trim.push(box(pw, lh * 0.44, LEAF_T + 0.012, cx, 0.16 + lh * 0.34 + 0.12, 0));
    }
  } else if (kind === 'metal') {
    // входная: толще, с горизонтальным тиснением и накладкой замка
    out.leaf.push(box(lw, lh, 0.06, cx, 0, 0));
    for (const k of [0.25, 0.5, 0.75]) out.trim.push(box(lw - 0.16, 0.012, 0.068, cx, lh * k, 0));
    if (handle) out.metal.push(box(0.05, 0.3, 0.075, hx, 0.9, 0));
  } else {
    out.leaf.push(box(lw, lh, LEAF_T, cx, 0, 0));
  }
  if (handle === 'lever') out.metal.push(box(0.12, 0.025, 0.075, hx - dir * 0.02, 1.0, 0));
  else if (handle === 'pull') out.metal.push(box(0.02, 0.2, 0.075, hx + dir * 0.02, 0.95, 0));
  return out;
}

// ── Дверь ────────────────────────────────────────────────────────────────

function doorParts(parts, o, look, { w, H, T }) {
  const { frame, glass, moving } = parts;
  const fd = Math.min(0.12, T * 0.8);
  const sgn = o.flipSide ? -1 : 1;
  // коробка по всему проёму
  frame.push(box(FW, H, fd, -w / 2 + FW / 2, 0, 0));
  frame.push(box(FW, H, fd, w / 2 - FW / 2, 0, 0));
  frame.push(box(w, FW, fd, 0, H - FW, 0));
  // дверь занимает проём без бокового остекления и фрамуги
  const { side, transom } = look;
  const dl = -w / 2 + FW + side.left;
  const dr = w / 2 - FW - side.right;
  const ih = H - FW - transom;
  if (transom > 0) {
    frame.push(box(w - 2 * FW, FW, fd, 0, ih, 0));
    if (transom > FW + 0.05) glass.push(box(w - 2 * FW, transom - FW, 0.012, 0, ih + FW, 0));
  }
  for (const [sw, edge, dirX] of [
    [side.left, -w / 2 + FW, 1],
    [side.right, w / 2 - FW, -1],
  ]) {
    if (!sw) continue;
    frame.push(box(FW, ih, fd, edge + dirX * (sw - FW / 2), 0, 0)); // стойка между остеклением и дверью
    glass.push(box(sw - FW, ih - 0.12, 0.012, edge + (dirX * (sw - FW)) / 2, 0.12, 0));
    frame.push(box(sw - FW, 0.12, fd * 0.8, edge + (dirX * (sw - FW)) / 2, 0, 0)); // глухой низ
  }
  const cx = (dl + dr) / 2;
  const iw = dr - dl;
  const zOff = sgn * (fd / 2 - 0.025);
  const leaf = look.leaf;

  if (o.style === 'sliding') {
    // одна половина стоит, вторая едет вдоль неё
    const pw = iw / 2 + 0.05;
    const fixed = leafGeoms(leaf, pw, ih - 0.02, 1, { handle: null });
    const still = { pivot: { x: cx - 0.025, y: 0, z: -0.02 } };
    for (const k of ['leaf', 'trim', 'glass', 'metal']) for (const geo of fixed[k]) parts[k].push(geo.translate(still.pivot.x, 0, still.pivot.z));
    moving.push({ ...leafGeoms(leaf, pw, ih - 0.02, 1, { handle: 'pull' }), pivot: { x: cx - iw / 2, y: 0, z: 0.02 }, motion: { type: 'slide', dx: iw / 2 - 0.02 } });
    frame.push(box(iw, 0.02, 0.08, cx, 0, 0)); // направляющая в полу
    return;
  }
  if (o.style === 'fold') {
    // гармошка: панели на петлях друг за другом, складываются к косяку
    const n = iw > 1.5 ? 4 : 2;
    const pw = iw / n;
    const dir = o.flipHinge ? -1 : 1;
    const A = -sgn * dir * (Math.PI / 2) * 0.93;
    let chain = null;
    for (let i = n - 1; i >= 0; i--) {
      const panel = {
        ...leafGeoms(leaf, pw - 0.006, ih - 0.01, dir, { handle: i === n - 1 ? 'pull' : null }),
        pivot: i === 0 ? { x: cx - dir * (iw / 2), y: 0, z: zOff } : { x: dir * pw, y: 0, z: 0 },
        // соседние панели поворачиваются навстречу: первая на A, остальные — на ∓2A от предыдущей
        motion: { type: 'swing', angle: i === 0 ? A : (i % 2 ? -2 : 2) * A },
        children: chain ? [chain] : [],
      };
      chain = panel;
    }
    moving.push(chain);
    return;
  }
  // створки на петлях: петля у края, полотно — от петли вдоль X
  const leaves =
    o.style === 'double'
      ? [
          { hinge: cx - iw / 2, dir: 1, width: iw / 2 - 0.005 },
          { hinge: cx + iw / 2, dir: -1, width: iw / 2 - 0.005 },
        ]
      : [{ hinge: cx + (o.flipHinge ? 1 : -1) * (iw / 2), dir: o.flipHinge ? -1 : 1, width: iw - 0.01 }];
  for (const lf of leaves) {
    moving.push({
      ...leafGeoms(leaf, lf.width, ih - 0.01, lf.dir, { handle: o.style === 'double' ? 'pull' : 'lever' }),
      pivot: { x: lf.hinge, y: 0, z: zOff },
      // полотно уходит в сторону открывания (как дуга на плане)
      motion: { type: 'swing', angle: -sgn * lf.dir * (Math.PI / 2) * 0.96 },
    });
  }
}

// ── Ворота ───────────────────────────────────────────────────────────────

function gateParts(parts, o, look, { w, H, T }) {
  const { moving, frame } = parts;
  const sgn = o.flipSide ? -1 : 1;
  if (o.style === 'garage_swing') {
    // две створки на петлях: обвязка, доски и накладные петли
    for (const dir of [1, -1]) {
      const lw = w / 2 - 0.01;
      const cx = (dir * lw) / 2;
      const leaf = [box(lw, H - 0.02, 0.05, cx, 0.01, 0)];
      const trim = [];
      for (const y of [0.12, H / 2 - 0.06, H - 0.26]) trim.push(box(lw - 0.04, 0.12, 0.07, cx, y, 0));
      for (const x of [0.06, lw - 0.06]) trim.push(box(0.1, H - 0.06, 0.066, dir * x, 0.03, 0));
      const metal = [box(0.03, 0.26, 0.085, dir * (lw - 0.1), H * 0.45, 0)];
      for (const y of [0.3, H - 0.4]) metal.push(box(0.5, 0.05, 0.075, dir * 0.25, y, 0));
      moving.push({ leaf, trim, metal, glass: [], pivot: { x: (-dir * w) / 2, y: 0, z: sgn * (T / 2 - 0.03) }, motion: { type: 'swing', angle: -sgn * dir * (Math.PI / 2) * 0.98 } });
    }
    return;
  }
  if (o.style === 'garage_roll') {
    // полотно из ламелей сматывается в короб над проёмом
    const leaf = [box(w - 0.04, H, 0.022, 0, -H, 0)];
    const trim = [];
    for (let y = 0.08; y < H; y += 0.09) trim.push(box(w - 0.04, 0.012, 0.03, 0, -y, 0));
    moving.push({ leaf, trim, metal: [box(w - 0.04, 0.05, 0.035, 0, -H, 0)], glass: [], pivot: { x: 0, y: H, z: 0 }, motion: { type: 'roll', amount: 0.93 } });
    frame.push(box(w + 0.1, 0.24, 0.24, 0, H - 0.02, -sgn * (T / 2 + 0.1))); // короб
    for (const x of [-w / 2 + 0.02, w / 2 - 0.02]) frame.push(box(0.04, H, 0.06, x, 0, 0)); // направляющие
    return;
  }
  // секционные: полотно уходит вверх
  const part = { leaf: [box(w, H, 0.05, 0, 0, 0)], trim: [], metal: [], glass: [], pivot: { x: 0, y: 0, z: 0 }, motion: { type: 'lift', dy: H * 0.92 } };
  for (let y = 0.45; y < H - 0.1; y += 0.5) part.metal.push(box(w - 0.02, 0.015, 0.06, 0, y, 0));
  moving.push(part);
}

// ── Проём без двери ──────────────────────────────────────────────────────

function archParts(parts, o, look, { w, H, T }) {
  const { frame } = parts;
  const fd = T + 0.02;
  // наличник
  const rise = look.arched ? archRise(w, H) : 0;
  frame.push(box(0.04, H - rise, fd, -w / 2 + 0.02, 0, 0));
  frame.push(box(0.04, H - rise, fd, w / 2 - 0.02, 0, 0));
  if (look.arched) archTop(parts, { w, T }, H, rise, { casing: 0.04, depth: fd });
  else frame.push(box(w, 0.04, fd, 0, H - 0.04, 0));
}
