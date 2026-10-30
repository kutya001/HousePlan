/**
 * Умное прилегание и центрирование.
 *
 * Каждая функция берёт «сырое» положение под курсором и подставляет ближайшее
 * осмысленное: середину стены или простенка, центр комнаты, симметричное место,
 * ось окна на соседней стене или этаже, угол, место вплотную к соседнему предмету.
 * Результат несёт подпись («по центру», «в угол»…) и линии-подсказки для отрисовки.
 */
import { add, sub, mul, dot, cross, dist, snapValue, normalizeDeg, pointInPolygon, rectCorners } from '../core/geometry.js';
import { getEntity, openingsOfWall, levelIndex, getLevel, SITE_LEVEL } from '../model/project.js';
import { pointOnWall } from '../geometry/wallGeometry.js';
import { clearSegmentAt, clearSegments, parallelWalls, rayToWalls } from '../geometry/alignment.js';
import { fmtLenShort } from '../core/format.js';
import { THEME } from './render/theme.js';
import { dimLine } from './render/drawDimensions.js';

const NOUN = {
  window: ['окно', 'окна', 'окном'],
  door: ['дверь', 'двери', 'дверью'],
  arch: ['проём', 'проёма', 'проёмом'],
};

/** Допуск «прилипания» в метрах: не меньше 8 см и не меньше ~10 пикселей. */
function tolerance(editor, px = 10, min = 0.08) {
  return Math.max(min, editor.viewport.px(px));
}

/** Ближайший кандидат в пределах допуска; при равенстве — с меньшим приоритетом. */
function pick(cands, raw, tol) {
  let best = null;
  for (const c of cands) {
    const d = Math.abs(c.v - raw);
    if (d > tol) continue;
    if (!best || d < best.d - 1e-4 || (Math.abs(d - best.d) <= 1e-4 && (c.prio ?? 9) < (best.prio ?? 9))) best = { ...c, d };
  }
  return best;
}

// ── Проёмы ───────────────────────────────────────────────────────────────

/**
 * Положение проёма вдоль стены.
 * @returns {{ t, label, guide, seg, side }}
 */
export function snapOpening(editor, g, rawAlong, width, { ignoreId = null, side = 1, kind = 'window', disabled = false } = {}) {
  const project = editor.project;
  const geoms = editor.geomsFor(g.wall.levelId);
  // side = 0 — курсор на самой стене: учитываем участки с обеих сторон,
  // размеры показываем для более короткого (это комната, а не фасад)
  const segs = side ? [{ seg: clearSegmentAt(geoms, g, rawAlong, side), side }] : [1, -1].map((sd) => ({ seg: clearSegmentAt(geoms, g, rawAlong, sd), side: sd }));
  segs.sort((p, q) => p.seg.s1 - p.seg.s0 - (q.seg.s1 - q.seg.s0));
  const seg = segs[0].seg;
  const res = { t: snapValue(rawAlong, editor.gridStep), label: null, guide: null, seg, side: segs[0].side };
  if (disabled || !editor.app.state.settings.snap) {
    res.t = rawAlong;
    return res;
  }
  const cands = segs.map((x, i) => ({ v: x.seg.c, label: 'по центру', prio: i }));
  const others = openingsOfWall(project, g.wall.id)
    .filter((o) => o.id !== ignoreId && o.t > seg.s0 && o.t < seg.s1)
    .sort((a, b) => a.t - b.t);
  if (others.length) {
    // центр простенка между соседними проёмами
    let left = seg.s0;
    for (const [e0, e1] of [...others.map((o) => [o.t - o.width / 2, o.t + o.width / 2]), [seg.s1, seg.s1]]) {
      if (e0 - left > width + 0.1) cands.push({ v: (left + e0) / 2, label: 'по центру простенка', prio: 1 });
      left = e1;
    }
    for (const o of others) cands.push({ v: seg.s0 + seg.s1 - o.t, label: 'симметрично', prio: 2 });
    // равные простенки: все проёмы одинаковой ширины на равном шаге
    const n = others.length + 1;
    const gap = (seg.s1 - seg.s0 - n * width) / (n + 1);
    if (gap > 0.1) {
      const slots = Array.from({ length: n }, (_, k) => seg.s0 + gap * (k + 1) + width * (k + 0.5));
      const free = slots.filter((s) => !others.some((o) => Math.abs(o.t - s) < 0.03));
      if (free.length === 1) cands.push({ v: free[0], label: 'равные простенки', prio: 1 });
    }
  }
  if (kind === 'door') {
    cands.push({ v: seg.s0 + width / 2 + 0.1, label: '10 см от угла', prio: 3 });
    cands.push({ v: seg.s1 - width / 2 - 0.1, label: '10 см от угла', prio: 3 });
  }
  // ось проёмов на параллельных стенах и на других этажах
  const myIdx = levelIndex(project, g.wall.levelId);
  for (const o of project.openings) {
    if (o.id === ignoreId || o.wallId === g.wall.id) continue;
    const w = getEntity(project, 'wall', o.wallId);
    if (!w) continue;
    const a = { x: w.x1, y: w.y1 };
    const L = dist(a, { x: w.x2, y: w.y2 });
    if (L < 1e-3) continue;
    const d = { x: (w.x2 - w.x1) / L, y: (w.y2 - w.y1) / L };
    if (Math.abs(cross(d, g.d)) > 0.02) continue;
    const c = add(a, mul(d, o.t));
    const along = dot(sub(c, g.a), g.d);
    if (along < seg.s0 || along > seg.s1) continue;
    const off = Math.abs(dot(sub(c, g.a), g.n));
    if (off > 25) continue;
    const noun = NOUN[o.kind] || NOUN.window;
    let label;
    const idx = levelIndex(project, w.levelId);
    if (w.levelId !== g.wall.levelId && off < 0.3) {
      label = `${idx < myIdx ? 'над' : 'под'} ${noun[2]} · ${getLevel(project, w.levelId)?.name || ''}`.trim();
    } else label = `по оси ${noun[1]} напротив`;
    cands.push({ v: along, label, prio: w.levelId !== g.wall.levelId ? 2 : 4, from: c });
  }
  const best = pick(cands, rawAlong, tolerance(editor, 10, 0.1));
  if (best) {
    res.t = best.v;
    res.label = best.label;
    if (best.from && dist(best.from, pointOnWall(g, best.v)) > 0.3) res.guide = { a: best.from, b: pointOnWall(g, best.v) };
  }
  return res;
}

/** Размеры от проёма до граней соседних стен и подпись привязки. */
export function drawOpeningSnap(ctx, r, g, o, snap) {
  const side = snap?.side || 1;
  const seg = snap?.seg || { s0: 0, s1: g.len };
  const n = mul(g.n, side);
  const face = mul(n, g.half);
  const s0 = o.t - o.width / 2;
  const s1 = o.t + o.width / 2;
  const hl = !!snap?.label;
  if (s0 - seg.s0 > 0.01) dimLine(ctx, r, add(pointOnWall(g, seg.s0), face), add(pointOnWall(g, s0), face), n, 18, hl);
  if (seg.s1 - s1 > 0.01) dimLine(ctx, r, add(pointOnWall(g, s1), face), add(pointOnWall(g, seg.s1), face), n, 18, hl);
  if (snap?.guide) drawGuide(ctx, r, snap.guide.a, snap.guide.b);
  if (snap?.label) {
    const p = add(pointOnWall(g, o.t), mul(n, -(g.half + r.px(16))));
    snapLabel(ctx, r, p, snap.label);
  }
}

// ── Мебель у стены ───────────────────────────────────────────────────────

/**
 * Положение предмета вдоль стены, к которой он прижат спинкой.
 * @param side — с какой стороны стены стоит предмет (+1/−1 по нормали g.n)
 * @returns {{ along, label, guide }}
 */
export function snapAlongWall(editor, g, rawAlong, width, side, { ignoreId = null } = {}) {
  const geoms = editor.geomsFor(g.wall.levelId);
  const seg = clearSegmentAt(geoms, g, rawAlong, side);
  const half = width / 2;
  const cands = [
    { v: seg.c, label: 'по центру стены', prio: 0 },
    { v: seg.s0 + half, label: 'в угол', prio: 1 },
    { v: seg.s1 - half, label: 'в угол', prio: 1 },
  ];
  // по оси окон и дверей этой стены
  for (const o of openingsOfWall(editor.project, g.wall.id)) {
    cands.push({ v: o.t, label: o.kind === 'window' ? 'под окном' : `по оси ${(NOUN[o.kind] || NOUN.arch)[1]}`, prio: 2 });
  }
  // вплотную к соседям вдоль той же стены (кухня, шкафы)
  for (const it of editor.project.items) {
    if (it.id === ignoreId || it.levelId !== g.wall.levelId) continue;
    const corners = rectCorners(it.x, it.y, it.w, it.d, it.rotation || 0);
    const offs = corners.map((p) => dot(sub(p, g.a), g.n) * side);
    if (Math.min(...offs) > g.half + 0.08 || Math.max(...offs) < g.half) continue;
    const al = corners.map((p) => dot(sub(p, g.a), g.d));
    const lo = Math.min(...al);
    const hi = Math.max(...al);
    cands.push({ v: hi + half, label: 'вплотную', prio: 0 }, { v: lo - half, label: 'вплотную', prio: 0 });
    cands.push({ v: (lo + hi) / 2, label: 'по оси соседа', prio: 3 });
  }
  const valid = cands.filter((c) => c.v - half >= seg.s0 - 0.01 && c.v + half <= seg.s1 + 0.01);
  const best = pick(valid, rawAlong, tolerance(editor, 12, 0.12));
  if (best) return { along: best.v, label: best.label };
  let along = snapValue(rawAlong, editor.gridStep);
  if (seg.s1 - seg.s0 > width) along = Math.max(seg.s0 + half, Math.min(seg.s1 - half, along));
  return { along, label: null };
}

// ── Свободная расстановка: мебель, лестницы, крыши ───────────────────────

/** Комната этажа под точкой. */
export function roomAt(project, levelId, p) {
  let best = null;
  for (const r of project.rooms) {
    if (r.levelId !== levelId || !pointInPolygon(p, r.points)) continue;
    if (!best || area(r.points) < area(best.points)) best = r;
  }
  return best;
}

function area(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s / 2);
}

/** Чистый центр комнаты по граням стен вдоль X и Y от точки p. */
export function clearCenterAt(geoms, p) {
  const out = {};
  const L = rayToWalls(geoms, p, { x: -1, y: 0 });
  const R = rayToWalls(geoms, p, { x: 1, y: 0 });
  const U = rayToWalls(geoms, p, { x: 0, y: -1 });
  const D = rayToWalls(geoms, p, { x: 0, y: 1 });
  if (L && R) out.x = { v: (p.x - L.t + p.x + R.t) / 2, a: L.point, b: R.point };
  if (U && D) out.y = { v: (p.y - U.t + p.y + D.t) / 2, a: U.point, b: D.point };
  return out;
}

/** Осевые полуразмеры прямоугольника (или null, если он повёрнут не кратно 90°). */
function halfExtents(w, d, rotation) {
  const rot = normalizeDeg(rotation || 0);
  const k = Math.round(rot / 90);
  if (Math.abs(rot - k * 90) > 0.5) return null;
  return k % 2 ? { hx: d / 2, hy: w / 2 } : { hx: w / 2, hy: d / 2 };
}

function boxOf(kind, e) {
  if (kind === 'stair') {
    const h = halfExtents(e.width, e.length, e.rotation);
    return h && { x: e.x, y: e.y, ...h };
  }
  if (kind === 'roof') {
    const h = halfExtents(e.w, e.d, e.rotation);
    return h && { x: e.x, y: e.y, ...h };
  }
  const h = halfExtents(e.w, e.d, e.rotation);
  return { x: e.x, y: e.y, ...(h || { hx: 0, hy: 0 }), free: !h };
}

/**
 * Выравнивание прямоугольного объекта: центр комнаты, вплотную к стене,
 * по краю, по центру или вплотную к соседям, по оси окна.
 * @param obj { kind, id, x, y, w, d, rotation, levelId }
 * @returns {{ x, y, labels:[], guides:[], dims:[] }}
 */
export function alignRect(editor, obj, { disabled = false } = {}) {
  const project = editor.project;
  const grid = editor.gridStep;
  const res = { x: obj.x, y: obj.y, labels: [], guides: [], dims: [] };
  if (disabled || !editor.app.state.settings.snap) return res;
  const levelId = obj.levelId === SITE_LEVEL ? project.levels[0]?.id : obj.levelId;
  const geoms = editor.geomsFor(levelId);
  const ext = halfExtents(obj.w, obj.d, obj.rotation);
  const hx = ext?.hx ?? 0;
  const hy = ext?.hy ?? 0;
  const p = { x: obj.x, y: obj.y };
  const cx = [];
  const cy = [];

  // центр комнаты — по граням стен
  const room = roomAt(project, levelId, p);
  if (room) {
    const cc = clearCenterAt(geoms, p);
    if (cc.x) cx.push({ v: cc.x.v, label: 'центр комнаты', prio: 0, line: [cc.x.a, cc.x.b] });
    if (cc.y) cy.push({ v: cc.y.v, label: 'центр комнаты', prio: 0, line: [cc.y.a, cc.y.b] });
  }

  // вплотную к стене
  if (ext) {
    for (const [dir, list, h, axis] of [
      [{ x: 1, y: 0 }, cx, hx, 'x'],
      [{ x: -1, y: 0 }, cx, hx, 'x'],
      [{ x: 0, y: 1 }, cy, hy, 'y'],
      [{ x: 0, y: -1 }, cy, hy, 'y'],
    ]) {
      const hit = rayToWalls(geoms, p, dir);
      if (!hit) continue;
      const s = axis === 'x' ? dir.x : dir.y;
      list.push({ v: p[axis] + s * (hit.t - h), label: 'к стене', prio: 1 });
      // заодно — расстояние до стены для подсказки
      if (hit.t - h > 0.02 && hit.t - h < 8) {
        const edge = { ...p };
        edge[axis] += s * h;
        res.dims.push({ a: edge, b: hit.point, axis, dir: s });
      }
    }
  }

  // соседние объекты
  const others = [];
  for (const it of project.items) {
    if (it.id === obj.id) continue;
    if (it.levelId !== obj.levelId && !(it.levelId === SITE_LEVEL && obj.levelId === levelId)) continue;
    others.push(boxOf('item', it));
  }
  for (const s of project.stairs) if (s.id !== obj.id && s.levelId === levelId) others.push(boxOf('stair', s));
  for (const o of others) {
    if (!o) continue;
    const near = Math.abs(o.x - p.x) < 12 && Math.abs(o.y - p.y) < 12;
    if (!near) continue;
    const ref = { x: o.x, y: o.y };
    cx.push({ v: o.x, label: 'по центру', prio: 2, from: ref });
    cy.push({ v: o.y, label: 'по центру', prio: 2, from: ref });
    if (!ext || o.free) continue;
    const overlapY = Math.abs(o.y - p.y) < o.hy + hy + 0.05;
    const overlapX = Math.abs(o.x - p.x) < o.hx + hx + 0.05;
    cx.push({ v: o.x - o.hx + hx, label: 'по краю', prio: 3, from: { x: o.x - o.hx, y: o.y } });
    cx.push({ v: o.x + o.hx - hx, label: 'по краю', prio: 3, from: { x: o.x + o.hx, y: o.y } });
    cy.push({ v: o.y - o.hy + hy, label: 'по краю', prio: 3, from: { x: o.x, y: o.y - o.hy } });
    cy.push({ v: o.y + o.hy - hy, label: 'по краю', prio: 3, from: { x: o.x, y: o.y + o.hy } });
    if (overlapY) cx.push({ v: o.x + o.hx + hx, label: 'вплотную', prio: 1 }, { v: o.x - o.hx - hx, label: 'вплотную', prio: 1 });
    if (overlapX) cy.push({ v: o.y + o.hy + hy, label: 'вплотную', prio: 1 }, { v: o.y - o.hy - hy, label: 'вплотную', prio: 1 });
  }

  // ось окон и дверей на стенах поперёк
  for (const g of geoms.values()) {
    for (const o of openingsOfWall(project, g.wall.id)) {
      const c = pointOnWall(g, o.t);
      if (dist(c, p) > 7) continue;
      const noun = (NOUN[o.kind] || NOUN.window)[1];
      if (Math.abs(g.d.y) < 0.02) cx.push({ v: c.x, label: `по оси ${noun}`, prio: 2, from: c });
      if (Math.abs(g.d.x) < 0.02) cy.push({ v: c.y, label: `по оси ${noun}`, prio: 2, from: c });
    }
  }

  const tol = tolerance(editor, 9, 0.07);
  const bx = pick(cx, p.x, tol);
  const by = pick(cy, p.y, tol);
  res.x = bx ? bx.v : snapValue(p.x, grid);
  res.y = by ? by.v : snapValue(p.y, grid);
  const at = { x: res.x, y: res.y };
  for (const [b, axis] of [
    [bx, 'x'],
    [by, 'y'],
  ]) {
    if (!b) continue;
    if (!res.labels.includes(b.label)) res.labels.push(b.label);
    if (b.line) {
      // линия через центр комнаты
      const a = axis === 'x' ? { x: b.v, y: b.line[0].y } : { x: b.line[0].x, y: b.v };
      res.guides.push({ a, b: at, center: true });
    } else if (b.from) {
      const a = axis === 'x' ? { x: b.v, y: b.from.y } : { x: b.from.x, y: b.v };
      if (dist(a, at) > 0.05) res.guides.push({ a, b: at });
    }
  }
  // размеры до стен пересчитываем от итогового положения
  res.dims = res.dims.map((d) => {
    const shift = d.axis === 'x' ? res.x - p.x : res.y - p.y;
    const a = { ...d.a };
    a[d.axis] += shift;
    const b = { ...d.b };
    if (d.axis === 'x') b.y = a.y;
    else b.x = a.x;
    return { a, b };
  });
  return res;
}

/** Подписи, линии и размеры до стен для alignRect. */
export function drawAlign(ctx, r, res, at) {
  if (!res) return;
  for (const g of res.guides) drawGuide(ctx, r, g.a, g.b);
  for (const d of res.dims) {
    const L = dist(d.a, d.b);
    if (L < 0.03) continue;
    const v = sub(d.b, d.a);
    dimLine(ctx, r, d.a, d.b, { x: -v.y, y: v.x }, 0, false, fmtLenShort(L));
  }
  if (res.labels.length && at) snapLabel(ctx, r, add(at, { x: 0, y: r.px(-30) }), res.labels.join(' · '));
}

// ── Перемещение стены ────────────────────────────────────────────────────

/**
 * Смещение стены по нормали: середина комнаты между соседними параллельными стенами,
 * одна линия с другими стенами.
 * @param g0 — геометрия стены в исходном положении (a, b, d, n, len, half)
 * @returns {{ k, label, dims:[{a,b}] }}
 */
export function snapWallOffset(editor, g0, rawK, { disabled = false } = {}) {
  const geoms = editor.geomsFor(g0.wall.levelId);
  const par = parallelWalls(geoms, g0, 0.2).filter((p) => p.g.wall.id !== g0.wall.id);
  const res = { k: disabled ? rawK : snapValue(rawK, editor.gridStep), label: null, dims: [] };
  if (!disabled && editor.app.state.settings.snap) {
    const cands = [];
    for (let i = 0; i < par.length - 1; i++) {
      const lo = par[i].off + par[i].half + g0.half;
      const hi = par[i + 1].off - par[i + 1].half - g0.half;
      if (hi - lo > 0.2) cands.push({ v: (lo + hi) / 2, label: 'середина комнаты', prio: 0 });
    }
    // на одной линии с другими параллельными стенами этажа
    for (const h of geoms.values()) {
      if (h.wall.id === g0.wall.id || Math.abs(cross(h.d, g0.d)) > 0.02) continue;
      const off = dot(sub(h.a, g0.a), g0.n);
      if (Math.abs(off) > 0.05) cands.push({ v: off, label: 'на одной линии', prio: 2 });
    }
    const best = pick(cands, rawK, tolerance(editor, 10, 0.08));
    if (best) {
      res.k = best.v;
      res.label = best.label;
    }
  }
  // чистые расстояния до соседних стен по обе стороны
  const k = res.k;
  // размеры — на трети длины стены, чтобы не спорить с подписью сдвига и названием комнаты
  const m = add(add(g0.a, mul(g0.d, g0.len * 0.3)), mul(g0.n, k));
  const below = par.filter((p) => p.off < k - 0.01).pop();
  const above = par.find((p) => p.off > k + 0.01);
  if (below) {
    const a = add(m, mul(g0.n, -(g0.half)));
    const b = add(m, mul(g0.n, below.off + below.half - k));
    res.dims.push({ a: b, b: a });
  }
  if (above) {
    const a = add(m, mul(g0.n, g0.half));
    const b = add(m, mul(g0.n, above.off - above.half - k));
    res.dims.push({ a, b });
  }
  return res;
}

export function drawWallOffset(ctx, r, res) {
  if (!res) return;
  const [d1, d2] = res.dims;
  const equal = d1 && d2 && Math.abs(dist(d1.a, d1.b) - dist(d2.a, d2.b)) < 0.005;
  for (const d of res.dims) {
    const v = sub(d.b, d.a);
    dimLine(ctx, r, d.a, d.b, { x: -v.y, y: v.x }, 0, equal || !!res.label);
  }
}

// ── Отрисовка ────────────────────────────────────────────────────────────

export function drawGuide(ctx, r, a, b) {
  ctx.save();
  ctx.setLineDash([r.px(5), r.px(4)]);
  ctx.strokeStyle = THEME.guide;
  ctx.lineWidth = r.px(1);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
  r.dot(ctx, a, 3, THEME.guide, null);
}

export function snapLabel(ctx, r, p, text) {
  r.label(ctx, p, text, { size: 11, weight: 600, color: '#fff', bg: THEME.snap, halo: false });
}

/** Середины чистых участков всех стен этажа — для привязки и направляющих. */
export function wallMidpoints(geoms) {
  const out = [];
  for (const g of geoms.values()) {
    const seen = [];
    for (const side of [1, -1]) {
      for (const sg of clearSegments(geoms, g, side)) {
        if (seen.some((s) => Math.abs(s - sg.c) < 0.02)) continue;
        seen.push(sg.c);
        out.push({ g, s: sg.c, p: pointOnWall(g, sg.c) });
      }
    }
    if (!seen.some((s) => Math.abs(s - g.len / 2) < 0.02)) out.push({ g, s: g.len / 2, p: pointOnWall(g, g.len / 2), whole: true });
  }
  return out;
}

