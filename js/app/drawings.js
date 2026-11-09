/**
 * Комплект чертежей для печати и PDF: планы этажей с размерами, марками проёмов и
 * номерами помещений, план участка, фасады и разрез (ортогональные 3D-виды с
 * отметками высот), экспликация, ведомость проёмов, сводка сметы.
 * Здесь только картинки и данные листов; вёрстка — в ui/DrawingsView.js.
 */
import { applyCanvasTheme, THEME } from '../editor/render/theme.js';
import { pointOnWall, computeWallGeometry, wallPieces3D } from '../geometry/wallGeometry.js';
import { roofPlanes } from '../geometry/roofGeometry.js';
import { roofSurfaceAt } from '../geometry/roofSurface.js';
import { stairLayout } from '../geometry/stairGeometry.js';
import { outsideSide } from '../geometry/porch.js';
import { polygonLabelPoint, bboxOf, toWorld, DEG } from '../core/geometry.js';
import { roofGeometry } from '../geometry/roofGeometry.js';
import { groundLevel, levelElevation, levelTop, isBasement, isAttic, levelWallHeight, levelBelow, wallHeight } from '../model/project.js';
import { siteGeo, vectorAzimuth, compassPoint } from '../geometry/sun.js';

/** Миллиметров бумаги на «экранный» пиксель плана: подписи 12 px ≈ 2,5 мм. */
export const MM_PER_PX = 0.21;
const DPR = 2.5;
const SCALES = [50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000];

/** Самый крупный стандартный масштаб, в который помещается габарит. */
export function pickScale(wM, hM, wMm, hMm) {
  return SCALES.find((s) => (wM * 1000) / s <= wMm && (hM * 1000) / s <= hMm) || 1000;
}

const pxPerM = (scale) => 1000 / scale / MM_PER_PX;

export function fmtMark(v) {
  const r = Math.round(v * 1000) / 1000;
  if (Math.abs(r) < 0.0005) return '±0,000';
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(3).replace('.', ',')}`;
}

// ── Габарит дома ─────────────────────────────────────────────────────────

/** Габарит всех этажей (стены и свесы крыш) — общий для листов планов. */
export function houseBBox(project) {
  const pts = [];
  for (const w of project.walls) pts.push({ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
  for (const r of project.roofs) pts.push(...roofGeometry(r, 0).plan.outline);
  if (!pts.length) return null;
  return bboxOf(pts);
}

/** Главная ось дома — по самой длинной наружной стене, градусы. */
function mainAngle(project) {
  const ext = project.walls.filter((w) => w.kind === 'exterior');
  const src = ext.length ? ext : project.walls;
  let best = null;
  let len = -1;
  for (const w of src) {
    const l = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    if (l > len) {
      len = l;
      best = w;
    }
  }
  if (!best) return 0;
  const a = Math.atan2(best.y2 - best.y1, best.x2 - best.x1) / DEG;
  return ((a % 90) + 90) % 90;
}

// ── Планы ────────────────────────────────────────────────────────────────

/**
 * Картинка плана этажа в масштабе для печати. Временно перенастраивает
 * редактор (вид, этаж, тему) и всё возвращает обратно.
 * @returns dataURL
 */
export function renderPlanImage(app, levelId, { scale, center, widthMm, heightMm, extras = null, settings = {}, noSite = true }) {
  const ed = app.editor;
  const vp = ed.viewport;
  const st = app.state;
  const r = ed.renderer;
  const saved = { cx: vp.cx, cy: vp.cy, scale: vp.scale, width: vp.width, height: vp.height, level: st.activeLevelId, settings: st.settings, sel: st.selection, hover: st.hover, dark: THEME.dark };
  const W = Math.round(widthMm / MM_PER_PX);
  const H = Math.round(heightMm / MM_PER_PX);
  try {
    applyCanvasTheme(false);
    THEME.paper = '#ffffff';
    vp.width = W;
    vp.height = H;
    vp.scale = pxPerM(scale);
    vp.cx = center.x;
    vp.cy = center.y;
    st.activeLevelId = levelId;
    st.selection = [];
    st.hover = null;
    st.settings = { ...saved.settings, dims: true, lowerLevel: false, checks: false, compass: true, roofs2d: true, ...settings };
    r.printExtras = extras;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    r.render(canvas.getContext('2d'), { dpr: DPR, overlay: false, exportMode: true, noSite });
    return canvas.toDataURL('image/png');
  } finally {
    r.printExtras = null;
    Object.assign(vp, { cx: saved.cx, cy: saved.cy, scale: saved.scale, width: saved.width, height: saved.height });
    st.activeLevelId = saved.level;
    st.settings = saved.settings;
    st.selection = saved.sel;
    st.hover = saved.hover;
    applyCanvasTheme(saved.dark);
    ed.requestRender?.();
  }
}

/** Марки проёмов, номера помещений и линия разреза поверх плана. */
export function planExtras(project, levelId, { marks, roomNos, section }) {
  return (ctx, r) => {
    const rooms = project.rooms.filter((x) => x.levelId === levelId);
    const geoms = r.geoms;
    for (const o of project.openings) {
      const g = geoms.get(o.wallId);
      const mark = marks.get(o.id);
      if (!g || !mark) continue;
      let side = g.wall.kind === 'exterior' ? outsideSide(g, o, rooms, geoms) : 1;
      if (!side) side = 1;
      const c = pointOnWall(g, o.t);
      const off = g.half + r.px(13);
      r.label(ctx, { x: c.x + g.n.x * side * off, y: c.y + g.n.y * side * off }, mark, { size: 9, weight: 700, color: '#1d3f8f', bg: 'rgba(255,255,255,0.92)', halo: false });
    }
    for (const room of rooms) {
      const no = roomNos.get(room.id);
      if (!no) continue;
      const bb = bboxOf(room.points);
      if (Math.min(bb.w, bb.h) * r.vp.scale < 40) continue;
      const p = polygonLabelPoint(room.points);
      const big = Math.min(bb.w, bb.h) * r.vp.scale > 90;
      r.label(ctx, { x: p.x, y: p.y - r.px(big ? 23 : 20) }, no, { size: 10, weight: 700, color: '#6b7480' });
    }
    if (section) drawSectionLine(ctx, r, section);
  };
}

function drawSectionLine(ctx, r, s) {
  const red = '#c0392b';
  ctx.save();
  ctx.strokeStyle = red;
  ctx.lineWidth = r.px(1.6);
  ctx.setLineDash([r.px(16), r.px(4), r.px(3), r.px(4)]);
  ctx.beginPath();
  ctx.moveTo(s.a.x, s.a.y);
  ctx.lineTo(s.b.x, s.b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  const t = { x: s.b.x - s.a.x, y: s.b.y - s.a.y };
  const tl = Math.hypot(t.x, t.y) || 1;
  const u = { x: t.x / tl, y: t.y / tl };
  for (const [e, k] of [
    [s.a, -1],
    [s.b, 1],
  ]) {
    // жирный штрих на конце и стрелка взгляда
    ctx.lineWidth = r.px(3.2);
    ctx.beginPath();
    ctx.moveTo(e.x - u.x * k * r.px(14), e.y - u.y * k * r.px(14));
    ctx.lineTo(e.x, e.y);
    ctx.stroke();
    const tip = { x: e.x + s.n.x * r.px(20), y: e.y + s.n.y * r.px(20) };
    ctx.lineWidth = r.px(1.6);
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    ctx.fillStyle = red;
    ctx.beginPath();
    ctx.moveTo(tip.x + s.n.x * r.px(6), tip.y + s.n.y * r.px(6));
    ctx.lineTo(tip.x + u.x * r.px(4), tip.y + u.y * r.px(4));
    ctx.lineTo(tip.x - u.x * r.px(4), tip.y - u.y * r.px(4));
    ctx.closePath();
    ctx.fill();
    r.label(ctx, { x: e.x + u.x * k * r.px(12) + s.n.x * r.px(12), y: e.y + u.y * k * r.px(12) + s.n.y * r.px(12) }, '1', { size: 13, weight: 700, color: red });
  }
  ctx.restore();
}

/**
 * Где режем дом: через лестницу вдоль марша (видно ступени), иначе — через
 * середину вдоль длинной стороны.
 * @returns {{ p, n, a, b }} точка и нормаль плоскости (смотрим по +n), концы линии на плане
 */
export function sectionPlan(project, bbox) {
  const ground = groundLevel(project);
  const stairs = project.stairs.filter((s) => s.levelId === ground.id).concat(project.stairs);
  let p;
  let n;
  const s = stairs.find((x) => x.shape !== 'spiral') || stairs[0];
  if (s) {
    const rot = s.rotation || 0;
    // марш вдоль локальной оси Y; у П-образной режем один из маршей
    const shift = s.shape === 'U' ? (Math.max(0.5, s.width) - Math.min(s.flight || 1, s.width)) / 2 : 0;
    p = toWorld({ x: shift, y: 0 }, s.x, s.y, rot);
    n = { x: Math.cos(rot * DEG), y: Math.sin(rot * DEG) };
  } else {
    const a = mainAngle(project);
    p = { x: (bbox.minX + bbox.maxX) / 2, y: (bbox.minY + bbox.maxY) / 2 };
    // разрез вдоль длинной стороны: нормаль — поперёк
    n = { x: -Math.sin(a * DEG), y: Math.cos(a * DEG) };
  }
  // смотрим в сторону большей части дома — в разрез попадает больше комнат
  const mid = { x: (bbox.minX + bbox.maxX) / 2, y: (bbox.minY + bbox.maxY) / 2 };
  if ((mid.x - p.x) * n.x + (mid.y - p.y) * n.y < 0) n = { x: -n.x, y: -n.y };
  const t = { x: -n.y, y: n.x };
  const R = Math.hypot(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY) / 2 + 1;
  // концы линии — по габариту, с запасом
  const proj = (q) => (q.x - p.x) * t.x + (q.y - p.y) * t.y;
  const corners = [
    { x: bbox.minX, y: bbox.minY },
    { x: bbox.maxX, y: bbox.minY },
    { x: bbox.maxX, y: bbox.maxY },
    { x: bbox.minX, y: bbox.maxY },
  ].map(proj);
  const lo = Math.max(-R, Math.min(...corners) - 1);
  const hi = Math.min(R, Math.max(...corners) + 1);
  return { p, n, a: { x: p.x + t.x * lo, y: p.y + t.y * lo }, b: { x: p.x + t.x * hi, y: p.y + t.y * hi } };
}

// ── Фасады, разрез, перспектива ─────────────────────────────────────────

const FACADE_NAME = { С: 'Северный', СВ: 'Северо-восточный', В: 'Восточный', ЮВ: 'Юго-восточный', Ю: 'Южный', ЮЗ: 'Юго-западный', З: 'Западный', СЗ: 'Северо-западный' };

/** Четыре фасада по осям дома, названные по сторонам света. */
export function facadeViews(project) {
  const a = mainAngle(project);
  const { north } = siteGeo(project.site);
  const out = [];
  for (let k = 0; k < 4; k++) {
    const t = (a + 90 * k) * DEG;
    const dir = { x: Math.cos(t), y: Math.sin(t) };
    const az = vectorAzimuth(dir, north);
    out.push({ kind: 'facade', dir, az, title: `${FACADE_NAME[compassPoint(az)]} фасад` });
  }
  // по порядку: север, восток, юг, запад
  return out.sort((x, y) => x.az - y.az);
}

/** Отметки высот (относительно чистого пола первого этажа). */
export function elevationMarks(project) {
  const zero = levelElevation(project, groundLevel(project).id);
  const marks = [{ y: 0, text: fmtMark(-zero), note: 'земля' }];
  for (const l of project.levels) {
    const y = levelElevation(project, l.id);
    if (isBasement(l) && y < 0) {
      marks.push({ y, text: fmtMark(y - zero), note: l.name, below: true });
      continue;
    }
    marks.push({ y, text: fmtMark(y - zero), note: l.name });
  }
  const top = project.levels[project.levels.length - 1];
  if (top) {
    const eave = project.roofs.some((r) => r.levelId === top.id && r.type !== 'flat') ? levelTop(project, top.id) : levelElevation(project, top.id) + levelWallHeight(top);
    marks.push({ y: eave, text: fmtMark(eave - zero), note: 'верх стен' });
  }
  return { marks, zero };
}

/**
 * Ортогональные виды здания для чертежей.
 * @param views [{ kind: 'facade', dir } | { kind: 'section', p, n } | { kind: 'persp' }]
 * @returns dataURL на каждый вид и размеры для подписи
 */
export async function render3DViews(app, views, { scale, widthMm, heightMm }) {
  const THREE = await import('three');
  const { buildScene, disposeTree } = await import('../view3d/SceneBuilder.js');
  const project = app.project;
  const root = buildScene(project, {
    activeLevelId: groundLevel(project).id,
    cutaway: false,
    roofs: true,
    furniture: true,
    layers: { layer_furniture: false, layer_electric: false, layer_plumbing: false, layer_heating: false },
    edges: true,
  });
  const site = root.getObjectByName('site');
  if (site) root.remove(site);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ffffff');
  scene.add(root);
  scene.add(new THREE.HemisphereLight('#ffffff', '#9aa0a6', 1.6));
  const sun = new THREE.DirectionalLight('#ffffff', 1.6);
  scene.add(sun);
  scene.add(sun.target);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  const box = new THREE.Box3().setFromObject(root);
  const c = box.getCenter(new THREE.Vector3());
  const ridge = box.max.y;
  const { marks } = elevationMarks(project);
  const ppm = pxPerM(scale) * DPR;
  const maxW = Math.round((widthMm / MM_PER_PX) * DPR);
  const maxH = Math.round((heightMm / MM_PER_PX) * DPR);
  const out = [];
  try {
    for (const v of views) {
      if (v.kind === 'persp') {
        out.push(renderPersp(THREE, renderer, scene, sun, root, box, v, maxW, maxH));
        continue;
      }
      const section = v.kind === 'section';
      const d = section ? new THREE.Vector3(-v.n.x, 0, -v.n.y) : new THREE.Vector3(v.dir.x, 0, v.dir.y);
      const target = section ? new THREE.Vector3(v.p.x, c.y, v.p.y) : c.clone();
      const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 600);
      cam.position.copy(target).addScaledVector(d, 200);
      cam.up.set(0, 1, 0);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      let lo = Infinity;
      let hi = -Infinity;
      for (const x of [box.min.x, box.max.x]) {
        for (const z of [box.min.z, box.max.z]) {
          const q = new THREE.Vector3(x, 0, z).sub(target).dot(right);
          lo = Math.min(lo, q);
          hi = Math.max(hi, q);
        }
      }
      const m = 1.2;
      const yBottom = section ? Math.min(box.min.y, 0) - 0.8 : -0.8;
      const yTop = ridge + 1;
      cam.left = lo - m;
      cam.right = hi + m;
      cam.top = yTop - target.y;
      cam.bottom = yBottom - target.y;
      cam.updateProjectionMatrix();
      const W = Math.min(maxW, Math.round((cam.right - cam.left) * ppm));
      const H = Math.min(maxH, Math.round((yTop - yBottom) * ppm));
      renderer.setSize(W, H, false);
      // свет сбоку-сверху, чтобы читались выступы
      sun.position.copy(target).addScaledVector(d, 30).addScaledVector(right, -20).add(new THREE.Vector3(0, 40, 0));
      sun.target.position.copy(target);
      renderer.clippingPlanes = section
        ? [new THREE.Plane(new THREE.Vector3(v.n.x, 0, v.n.y), -(v.n.x * v.p.x + v.n.y * v.p.y))]
        : [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)]; // фасад — только над землёй
      renderer.render(scene, cam);
      // поверх: линия земли и отметки высот справа
      const MARGIN = Math.round(30 / MM_PER_PX) * DPR;
      const cv = document.createElement('canvas');
      cv.width = W + MARGIN;
      cv.height = H;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(renderer.domElement, 0, 0);
      const yToPx = (y) => ((yTop - y) / (yTop - yBottom)) * H;
      const xs = (q) => ((q - cam.left) / (cam.right - cam.left)) * W;
      ctx.strokeStyle = '#2b3036';
      ctx.lineWidth = 2.2 * DPR;
      ctx.beginPath();
      if (section) {
        ctx.moveTo(xs(lo - 0.9), yToPx(0));
        ctx.lineTo(xs(lo + 0.6), yToPx(0));
        ctx.moveTo(xs(hi - 0.6), yToPx(0));
        ctx.lineTo(xs(hi + 0.9), yToPx(0));
      } else {
        ctx.moveTo(xs(lo - 0.9), yToPx(0));
        ctx.lineTo(xs(hi + 0.9), yToPx(0));
      }
      ctx.stroke();
      if (!section) {
        // штриховка грунта под линией земли
        ctx.lineWidth = 0.8 * DPR;
        ctx.strokeStyle = '#8a8f96';
        for (let x = xs(lo - 0.9); x < xs(hi + 0.9); x += 9 * DPR) {
          ctx.beginPath();
          ctx.moveTo(x, yToPx(0) + 2);
          ctx.lineTo(x - 7 * DPR, yToPx(0) + 9 * DPR);
          ctx.stroke();
        }
      }
      if (section) {
        // «пошé»: всё, что режет плоскость (стены, перекрытия, кровля), — тёмным
        const proj = (pt, y) => [xs((pt.x - target.x) * right.x + (pt.y - target.z) * right.z), yToPx(y)];
        ctx.fillStyle = '#3b4148';
        for (const shape of sectionCuts(project, v)) {
          ctx.beginPath();
          shape.forEach(([pt, y], k) => {
            const [x, yy] = proj(pt, y);
            if (k) ctx.lineTo(x, yy);
            else ctx.moveTo(x, yy);
          });
          ctx.closePath();
          ctx.fill();
        }
      }
      const list = [...marks.filter((mk) => section || !mk.below), { y: ridge, text: fmtMark(ridge - elevationMarks(project).zero), note: 'конёк' }];
      drawMarks(ctx, list, yToPx, xs(hi) + 6 * DPR, W + MARGIN);
      out.push({ url: cv.toDataURL('image/png'), wMm: (cv.width / DPR) * MM_PER_PX, hMm: (cv.height / DPR) * MM_PER_PX });
    }
  } finally {
    renderer.clippingPlanes = [];
    renderer.dispose();
    renderer.forceContextLoss?.();
    disposeTree(root);
  }
  return out;
}

/** Интервалы t, где прямая p + u·t проходит внутри многоугольника. */
function lineIntervals(poly, p, u) {
  const ts = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const d = { x: b.x - a.x, y: b.y - a.y };
    const den = u.x * d.y - u.y * d.x;
    if (Math.abs(den) < 1e-12) continue;
    const w = { x: a.x - p.x, y: a.y - p.y };
    const t = (w.x * d.y - w.y * d.x) / den;
    const sp = (w.x * u.y - w.y * u.x) / den;
    if (sp >= 0 && sp < 1) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  const out = [];
  for (let i = 0; i + 1 < ts.length; i += 2) if (ts[i + 1] - ts[i] > 1e-4) out.push([ts[i], ts[i + 1]]);
  return out;
}

function subtractIntervals(list, holes) {
  let cur = list;
  for (const [h0, h1] of holes) {
    const next = [];
    for (const [a, b] of cur) {
      if (h1 <= a || h0 >= b) next.push([a, b]);
      else {
        if (h0 > a) next.push([a, h0]);
        if (h1 < b) next.push([h1, b]);
      }
    }
    cur = next;
  }
  return cur;
}

/**
 * Что режет плоскость разреза: куски стен (с проёмами), полы и перекрытия
 * (с проёмами лестниц), кровля. Фигуры — списки [точка плана, высота].
 */
export function sectionCuts(project, sec) {
  const u = { x: -sec.n.y, y: sec.n.x };
  const at = (t) => ({ x: sec.p.x + u.x * t, y: sec.p.y + u.y * t });
  const rect = (t0, t1, y0, y1) => [
    [at(t0), y0],
    [at(t1), y0],
    [at(t1), y1],
    [at(t0), y1],
  ];
  const shapes = [];
  const opsByWall = new Map();
  for (const o of project.openings) {
    if (!opsByWall.has(o.wallId)) opsByWall.set(o.wallId, []);
    opsByWall.get(o.wallId).push(o);
  }
  project.levels.forEach((level, index) => {
    const base = levelElevation(project, level.id);
    const attic = isAttic(level) && project.roofs.some((r) => r.levelId === level.id);
    const geoms = computeWallGeometry(project.walls.filter((w) => w.levelId === level.id));
    for (const g of geoms.values()) {
      const H = wallHeight(project, g.wall);
      for (const piece of wallPieces3D(g, opsByWall.get(g.wall.id) || [], H)) {
        for (const [t0, t1] of lineIntervals(piece.poly, sec.p, u)) {
          let y1 = base + piece.y1;
          if (attic) {
            const sf = roofSurfaceAt(project, level.id, at((t0 + t1) / 2));
            if (sf) y1 = Math.min(y1, sf.h - 0.1);
          }
          if (y1 > base + piece.y0) shapes.push(rect(t0, t1, base + piece.y0, y1));
        }
      }
    }
    // пол этажа: как в 3D — плита перекрытия под ним, у нижнего — подготовка
    const below = levelBelow(project, level.id);
    const y0 = index === 0 ? (base > 0.01 ? Math.max(0, base - 0.3) : base - 0.35) : base - (below?.slab ?? 0.25);
    const holes = below ? project.stairs.filter((x) => x.levelId === below.id).map((s) => stairLayout(s, levelWallHeight(below) + (level.slab ?? 0.25)).outline) : [];
    for (const room of project.rooms.filter((r) => r.levelId === level.id)) {
      let iv = lineIntervals(room.points, sec.p, u);
      for (const hole of holes) iv = subtractIntervals(iv, lineIntervals(hole, sec.p, u));
      for (const [t0, t1] of iv) shapes.push(rect(t0, t1, y0, base));
    }
  });
  // кровля — полоса толщиной ~22 см по верху ската
  for (const roof of project.roofs) {
    const rp = roofPlanes(roof, levelTop(project, roof.levelId));
    const R = Math.hypot(roof.w, roof.d) / 2 + (roof.overhang ?? 0.5) + 1;
    let run = [];
    const flush = () => {
      if (run.length > 1) shapes.push([...run.map(([pt, h]) => [pt, h]), ...run.reverse().map(([pt, h]) => [pt, h - 0.22])]);
      run = [];
    };
    const tc = (roof.x - sec.p.x) * u.x + (roof.y - sec.p.y) * u.y;
    for (let t = tc - R; t <= tc + R; t += 0.05) {
      const pt = at(t);
      // кровля режется только если плоскость разреза проходит через крышу
      if (!rp.contains(pt)) {
        flush();
        continue;
      }
      let h = Infinity;
      for (const pl of rp.planes) h = Math.min(h, pl.a * pt.x + pl.b * pt.y + pl.c);
      run.push([pt, h]);
    }
    flush();
  }
  return shapes;
}

function drawMarks(ctx, marks, yToPx, x0, x1) {
  const s = DPR;
  const sorted = [...marks].sort((a, b) => b.y - a.y);
  let lastY = -Infinity;
  ctx.font = `600 ${11 * s}px Inter, system-ui, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  const tx = x1 - 4 * s;
  for (const m of sorted) {
    const y = yToPx(m.y);
    // подписи не налезают друг на друга
    const ty = Math.max(y - 3 * s, lastY + 15 * s);
    lastY = ty;
    ctx.strokeStyle = '#6b7480';
    ctx.lineWidth = 0.8 * s;
    ctx.setLineDash([4 * s, 3 * s]);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(tx - 64 * s, y);
    ctx.stroke();
    ctx.setLineDash([]);
    // треугольник отметки
    const mx = tx - 58 * s;
    ctx.fillStyle = '#22282e';
    ctx.beginPath();
    ctx.moveTo(mx, y);
    ctx.lineTo(mx - 5 * s, y - 7 * s);
    ctx.lineTo(mx + 5 * s, y - 7 * s);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(mx, y);
    ctx.lineTo(tx, y);
    ctx.lineWidth = 1 * s;
    ctx.strokeStyle = '#22282e';
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillStyle = '#22282e';
    ctx.font = `600 ${11 * s}px Inter, system-ui, sans-serif`;
    const textY = ty - (ty === y - 3 * s ? 6 * s : -11 * s);
    ctx.fillText(m.text, tx, textY);
    if (m.note) {
      // что за отметка: этаж, верх стен, конёк — мелко слева от значения
      ctx.font = `500 ${9 * s}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = '#6b7480';
      ctx.fillText(m.note, mx - 9 * s, textY);
    }
  }
}

function renderPersp(THREE, renderer, scene, sun, root, box, v, maxW, maxH) {
  const W = Math.min(maxW, 2000);
  const H = Math.min(maxH, Math.round(W * 0.62));
  renderer.setSize(W, H, false);
  renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const R = Math.max(size.x, size.z, size.y) * 0.62 + 1;
  const cam = new THREE.PerspectiveCamera(28, W / H, 0.1, 1000);
  const t = (v.azimuth ?? -35) * DEG;
  const dist = R / Math.sin((14 * Math.PI) / 180);
  cam.position.set(c.x + Math.cos(t) * dist * 0.82, c.y + dist * 0.42, c.z + Math.sin(t) * dist * 0.82);
  cam.lookAt(c.x, c.y * 0.8, c.z);
  sun.position.set(c.x + 30, c.y + 45, c.z + 25);
  sun.target.position.copy(c);
  renderer.render(scene, cam);
  return { url: renderer.domElement.toDataURL('image/png'), wMm: (W / DPR) * MM_PER_PX, hMm: (H / DPR) * MM_PER_PX };
}

/** Направление «на зрителя» для перспективы титульного листа: от входа, под углом. */
export function frontAzimuth(project) {
  const views = facadeViews(project);
  const bb = houseBBox(project);
  const c = bb ? { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 } : { x: 0, y: 0 };
  // фасад со входной дверью — главный
  const wallsById = new Map(project.walls.map((w) => [w.id, w]));
  let best = views[0];
  let bestN = -1;
  for (const v of views) {
    let n = 0;
    for (const o of project.openings) {
      const w = wallsById.get(o.wallId);
      if (!w || w.kind !== 'exterior' || o.kind !== 'door') continue;
      const dx = w.x2 - w.x1;
      const dy = w.y2 - w.y1;
      const l = Math.hypot(dx, dy) || 1;
      const nn = { x: -dy / l, y: dx / l };
      const mid = { x: (w.x1 + w.x2) / 2 - c.x, y: (w.y1 + w.y2) / 2 - c.y };
      // стена смотрит в сторону этого фасада и стоит с его стороны дома
      if (Math.abs(nn.x * v.dir.x + nn.y * v.dir.y) > 0.9 && mid.x * v.dir.x + mid.y * v.dir.y > 0) n++;
    }
    if (n > bestN) {
      bestN = n;
      best = v;
    }
  }
  return (Math.atan2(best.dir.y, best.dir.x) / DEG) - 35;
}
