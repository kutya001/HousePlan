/**
 * Составные операции над проектом: коробка, проёмы, этажи, автокрыша, копирование.
 * Функции меняют переданный project и не знают об интерфейсе — их вызывают
 * инструменты, команды и пресеты (внутри store.commit).
 */
import { uid } from '../core/ids.js';
import { DEG, dist, projectOnSegment, toLocal, toWorld, bboxOf, polygonSignedArea, polygonArea, pointInPolygon, polygonLabelPoint } from '../core/geometry.js';
import { findFaces } from '../geometry/roomDetect.js';
import { createWall, createRoom, createOpening, createRoof } from './factories.js';
import { createLevel, getLevel, levelIndex, COLLECTION, getEntity, SITE_LEVEL } from './project.js';
import { DEFAULTS } from './defaults.js';
import { JOIN_EPS } from '../geometry/wallGeometry.js';

/** Гарантирует, что существует этаж с индексом index; возвращает его. */
export function ensureLevel(project, index, template = null) {
  while (project.levels.length <= index) {
    const prev = project.levels[project.levels.length - 1];
    project.levels.push(
      createLevel(project.levels.length, {
        height: template?.height ?? prev?.height ?? DEFAULTS.levelHeight,
        slab: template?.slab ?? prev?.slab ?? DEFAULTS.slab,
      }),
    );
  }
  return project.levels[index];
}

/**
 * Коробка: 4 стены по осям прямоугольника + комната (пол).
 * x, y — левый верхний угол по осям стен.
 */
export function addBox(project, levelId, x, y, w, d, opts = {}) {
  const pts = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + d },
    { x, y: y + d },
  ];
  const walls = [];
  for (let i = 0; i < 4; i++) {
    const wall = createWall(levelId, pts[i], pts[(i + 1) % 4], {
      kind: opts.kind || 'exterior',
      thickness: opts.thickness,
    });
    project.walls.push(wall);
    walls.push(wall);
  }
  let room = null;
  if (opts.room !== false) {
    room = createRoom(levelId, pts, { name: opts.roomName || 'Комната', floor: opts.floor });
    project.rooms.push(room);
  }
  return { walls, room };
}

/**
 * Многоэтажная коробка, при желании с крышей.
 * @returns {{ levels: string[] }}
 */
export function addStackedBox(project, startLevelId, x, y, w, d, opts = {}) {
  const floors = Math.max(1, opts.floors || 1);
  const start = Math.max(0, levelIndex(project, startLevelId));
  const levels = [];
  for (let i = 0; i < floors; i++) {
    const lvl = ensureLevel(project, start + i);
    addBox(project, lvl.id, x, y, w, d, { ...opts, roomName: opts.roomName || 'Комната' });
    levels.push(lvl.id);
  }
  if (opts.roof && opts.roof !== 'none') {
    const top = levels[levels.length - 1];
    const t = opts.thickness ?? DEFAULTS.wall.exterior.thickness;
    const longX = w >= d;
    project.roofs.push(
      createRoof(top, x + w / 2, y + d / 2, (longX ? w : d) + t, (longX ? d : w) + t, {
        type: opts.roof,
        rotation: longX ? 0 : 90,
      }),
    );
  }
  return { levels };
}

/** Проём на стене в точке плана (проецируется на ось стены). */
export function addOpeningAt(project, wall, point, kind, opts = {}) {
  const a = { x: wall.x1, y: wall.y1 };
  const b = { x: wall.x2, y: wall.y2 };
  const pr = projectOnSegment(point, a, b);
  const op = createOpening(wall.id, kind, { ...opts, t: pr.along });
  project.openings.push(op);
  return op;
}

/** Копия стен (и при желании комнат) одного этажа на другой. */
export function copyLevelLayout(project, fromLevelId, toLevelId, { exteriorOnly = true, rooms = false } = {}) {
  const map = new Map();
  for (const w of project.walls.filter((x) => x.levelId === fromLevelId)) {
    if (exteriorOnly && w.kind !== 'exterior') continue;
    const copy = { ...w, id: uid('wall'), levelId: toLevelId };
    map.set(w.id, copy.id);
    project.walls.push(copy);
  }
  if (rooms) {
    for (const r of project.rooms.filter((x) => x.levelId === fromLevelId)) {
      project.rooms.push({ ...r, id: uid('room'), levelId: toLevelId, points: r.points.map((p) => ({ ...p })) });
    }
  }
  return map;
}

/**
 * Прямоугольник крыши по наружным стенам этажа: ориентирован по самой длинной стене,
 * ширина — по длинной стороне (конёк вдоль дома).
 */
export function autoRoofRect(project, levelId) {
  const walls = project.walls.filter((w) => w.levelId === levelId && w.kind === 'exterior');
  const src = walls.length ? walls : project.walls.filter((w) => w.levelId === levelId);
  if (!src.length) return null;
  let longest = src[0];
  for (const w of src) if (wallLength(w) > wallLength(longest)) longest = w;
  const ang = Math.atan2(longest.y2 - longest.y1, longest.x2 - longest.x1) / DEG;
  const rot = ((ang % 90) + 90) % 90;
  const pts = [];
  for (const w of src) {
    const h = w.thickness / 2;
    for (const p of [
      { x: w.x1, y: w.y1 },
      { x: w.x2, y: w.y2 },
    ]) {
      const l = toLocal(p, 0, 0, rot);
      pts.push({ x: l.x - h, y: l.y - h }, { x: l.x + h, y: l.y + h });
    }
  }
  const bb = bboxOf(pts);
  const c = toWorld({ x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 }, 0, 0, rot);
  let w = bb.w;
  let d = bb.h;
  let rotation = rot;
  if (d > w) {
    [w, d] = [d, w];
    rotation = rot + 90;
  }
  return { x: c.x, y: c.y, w, d, rotation: Math.round(rotation * 100) / 100 };
}

export function wallLength(w) {
  return Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
}

/**
 * Точки, которые нужно двигать вместе с перемещаемыми объектами.
 * Возвращает список ссылок { key, get(), set(p) }; дубликаты убраны.
 * Для стен подтягиваются: концы соседних стен в тех же точках,
 * концы стен, примыкающих к стене «буквой Т», и вершины комнат.
 */
export function collectMoveRefs(project, selection, { attach = true } = {}) {
  const refs = new Map();
  const addRef = (key, get, set) => {
    if (!refs.has(key)) refs.set(key, { key, get, set, orig: { ...get() } });
  };
  const wallEnd = (w, end) => {
    const k1 = end === 1 ? 'x1' : 'x2';
    const k2 = end === 1 ? 'y1' : 'y2';
    addRef(
      `w:${w.id}:${end}`,
      () => ({ x: w[k1], y: w[k2] }),
      (p) => {
        w[k1] = p.x;
        w[k2] = p.y;
      },
    );
  };
  const movedPoints = [];
  const movedWalls = new Set();

  for (const ref of selection) {
    const e = getEntity(project, ref.kind, ref.id);
    if (!e) continue;
    if (ref.kind === 'wall') {
      wallEnd(e, 1);
      wallEnd(e, 2);
      movedWalls.add(e.id);
      movedPoints.push({ p: { x: e.x1, y: e.y1 }, levelId: e.levelId }, { p: { x: e.x2, y: e.y2 }, levelId: e.levelId });
    } else if (['item', 'stair', 'roof'].includes(ref.kind)) {
      addRef(
        `${ref.kind}:${e.id}`,
        () => ({ x: e.x, y: e.y }),
        (p) => {
          e.x = p.x;
          e.y = p.y;
        },
      );
    } else if (ref.kind === 'room' || ref.kind === 'zone') {
      e.points.forEach((pt, i) =>
        addRef(
          `${ref.kind}:${e.id}:${i}`,
          () => ({ x: pt.x, y: pt.y }),
          (p) => {
            pt.x = p.x;
            pt.y = p.y;
          },
        ),
      );
    } else if (ref.kind === 'site') {
      project.site.boundary.forEach((pt, i) =>
        addRef(
          `site:${i}`,
          () => ({ x: pt.x, y: pt.y }),
          (p) => {
            pt.x = p.x;
            pt.y = p.y;
          },
        ),
      );
    }
  }

  if (attach && movedPoints.length) {
    for (const w of project.walls) {
      if (movedWalls.has(w.id)) continue;
      for (const end of [1, 2]) {
        const p = end === 1 ? { x: w.x1, y: w.y1 } : { x: w.x2, y: w.y2 };
        if (movedPoints.some((m) => m.levelId === w.levelId && dist(m.p, p) < JOIN_EPS)) wallEnd(w, end);
        else {
          // Т-примыкание к перемещаемой стене
          for (const id of movedWalls) {
            const mw = project.walls.find((x) => x.id === id);
            if (!mw || mw.levelId !== w.levelId) continue;
            const pr = projectOnSegment(p, { x: mw.x1, y: mw.y1 }, { x: mw.x2, y: mw.y2 });
            if (pr.dist < JOIN_EPS * 2 && pr.rawT > 0.001 && pr.rawT < 0.999) wallEnd(w, end);
          }
        }
      }
    }
    for (const r of project.rooms) {
      if (selection.some((s) => s.kind === 'room' && s.id === r.id)) continue;
      r.points.forEach((pt, i) => {
        if (movedPoints.some((m) => m.levelId === r.levelId && dist(m.p, pt) < JOIN_EPS)) {
          addRef(
            `room:${r.id}:${i}`,
            () => ({ x: pt.x, y: pt.y }),
            (p) => {
              pt.x = p.x;
              pt.y = p.y;
            },
          );
        }
      });
    }
  }
  return [...refs.values()];
}

/** Ссылки на одну точку (конец стены) вместе со всеми совпадающими точками. */
export function collectPointRefs(project, levelId, point, { excludeWallIds = [] } = {}) {
  const refs = [];
  for (const w of project.walls) {
    if (w.levelId !== levelId || excludeWallIds.includes(w.id)) continue;
    if (dist({ x: w.x1, y: w.y1 }, point) < JOIN_EPS)
      refs.push({
        key: `w:${w.id}:1`,
        wall: w,
        end: 1,
        set: (p) => {
          w.x1 = p.x;
          w.y1 = p.y;
        },
      });
    if (dist({ x: w.x2, y: w.y2 }, point) < JOIN_EPS)
      refs.push({
        key: `w:${w.id}:2`,
        wall: w,
        end: 2,
        set: (p) => {
          w.x2 = p.x;
          w.y2 = p.y;
        },
      });
  }
  for (const r of project.rooms) {
    if (r.levelId !== levelId) continue;
    r.points.forEach((pt, i) => {
      if (dist(pt, point) < JOIN_EPS)
        refs.push({
          key: `room:${r.id}:${i}`,
          set: (p) => {
            pt.x = p.x;
            pt.y = p.y;
          },
        });
    });
  }
  return refs;
}

/**
 * Копирует объекты (со связанными проёмами) со сдвигом.
 * @returns {Array<{kind,id}>} ссылки на новые объекты
 */
export function duplicateEntities(project, entities, offset, targetLevelId) {
  const out = [];
  const wallMap = new Map();
  for (const { kind, data } of entities) {
    if (kind === 'opening' || kind === 'site') continue;
    const copy = JSON.parse(JSON.stringify(data));
    copy.id = uid(kind);
    if (kind === 'wall') {
      copy.x1 += offset.x;
      copy.y1 += offset.y;
      copy.x2 += offset.x;
      copy.y2 += offset.y;
      copy.levelId = targetLevelId;
      wallMap.set(data.id, copy.id);
    } else if (kind === 'room' || kind === 'zone') {
      copy.points = copy.points.map((p) => ({ x: p.x + offset.x, y: p.y + offset.y }));
      if (kind === 'room') copy.levelId = targetLevelId;
    } else {
      copy.x += offset.x;
      copy.y += offset.y;
      if (copy.levelId !== SITE_LEVEL) copy.levelId = targetLevelId;
    }
    project[COLLECTION[kind]].push(copy);
    out.push({ kind, id: copy.id });
  }
  for (const { kind, data } of entities) {
    if (kind !== 'opening') continue;
    const wallId = wallMap.get(data.wallId);
    if (!wallId) continue;
    const copy = { ...data, id: uid('open'), wallId };
    project.openings.push(copy);
    out.push({ kind: 'opening', id: copy.id });
  }
  return out;
}

/**
 * Если новая стена разрезала комнату на части, комната делится:
 * часть с исходной подписью сохраняет название, остальные становятся новыми комнатами
 * с тем же покрытием пола. Комнаты, нарисованные вручную вне стен, не трогаются.
 * @returns {number} сколько комнат добавлено
 */
export function syncRoomsWithWalls(project, levelId) {
  const rooms = project.rooms.filter((r) => r.levelId === levelId);
  if (!rooms.length) return 0;
  const faces = findFaces(project.walls.filter((w) => w.levelId === levelId));
  if (faces.length < 2) return 0;
  let added = 0;
  for (const room of rooms) {
    const inside = faces.filter((f) => pointInPolygon(polygonLabelPoint(f.poly), room.points) && polygonArea(f.poly) < polygonArea(room.points) + 0.01);
    if (inside.length < 2) continue;
    const label = polygonLabelPoint(room.points);
    let keep = inside.find((f) => pointInPolygon(label, f.poly));
    if (!keep) keep = inside.reduce((a, b) => (polygonArea(a.poly) >= polygonArea(b.poly) ? a : b));
    room.points = keep.poly.map((q) => ({ x: q.x, y: q.y }));
    for (const f of inside) {
      if (f === keep) continue;
      project.rooms.push(createRoom(levelId, f.poly, { name: 'Комната', floor: room.floor }));
      added++;
    }
  }
  return added;
}

/** Нормализует ориентацию многоугольника (против часовой — положительная площадь). */
export function orientCCW(points) {
  return polygonSignedArea(points) < 0 ? [...points].reverse() : points;
}

export { getLevel };
