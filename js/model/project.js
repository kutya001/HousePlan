/**
 * Схема проекта и запросы к нему.
 *
 * Проект — один JSON-объект:
 * {
 *   version, name,
 *   foundation,                       // высота цоколя
 *   site:   { boundary:[{x,y}], fence:{ enabled, height } },
 *   levels: [{ id, name, kind, height, slab, kneeWall }], // kind: floor | basement | attic
 *   walls:    [{ id, levelId, x1,y1,x2,y2, thickness, height|null, kind, color|null }],
 *   openings: [{ id, wallId, kind, style, t, width, height, sill, flipSide, flipHinge }],
 *   rooms:    [{ id, levelId, name, points:[{x,y}], floor }],
 *   stairs:   [{ id, levelId, shape, x, y, rotation, width, length, flight, flip }],
 *   items:    [{ id, levelId|'site', type, x, y, rotation, w, d, h, elevation, color }],
 *   roofs:    [{ id, levelId, type, x, y, w, d, rotation, pitch, overhang, color }],
 *   zones:    [{ id, material, points:[{x,y}] }]   // ландшафт участка
 * }
 */
import { uid } from '../core/ids.js';
import { DEFAULTS, COLORS } from './defaults.js';
import { roofPeak } from '../geometry/roofGeometry.js';

export const SCHEMA_VERSION = 1;
export const SITE_LEVEL = 'site';

/** Тип выделения → имя коллекции в проекте. */
export const COLLECTION = {
  wall: 'walls',
  opening: 'openings',
  room: 'rooms',
  stair: 'stairs',
  item: 'items',
  roof: 'roofs',
  zone: 'zones',
};

export const KIND_LABEL = {
  wall: 'Стена',
  opening: 'Проём',
  room: 'Комната',
  stair: 'Лестница',
  item: 'Объект',
  roof: 'Крыша',
  zone: 'Зона участка',
  site: 'Участок',
};

/** Виды этажей: обычный, подземный (подвал или цокольный), мансарда под скатами крыши. */
export const LEVEL_KINDS = { floor: 'Обычный', basement: 'Подвал / цокольный', attic: 'Мансарда' };

export function createLevel(index, overrides = {}) {
  return {
    id: uid('lvl'),
    name: `${index + 1} этаж`,
    kind: 'floor',
    height: DEFAULTS.levelHeight,
    slab: DEFAULTS.slab,
    ...overrides,
  };
}

export function rectPoints(x, y, w, d) {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + d },
    { x, y: y + d },
  ];
}

export function createEmptyProject(name = 'Новый проект') {
  return {
    version: SCHEMA_VERSION,
    name,
    foundation: DEFAULTS.foundation,
    site: {
      boundary: rectPoints(-12.5, -20, 25, 40), // 10 соток
      fence: { enabled: true, height: 1.8, color: COLORS.fence },
    },
    levels: [createLevel(0)],
    walls: [],
    openings: [],
    rooms: [],
    stairs: [],
    items: [],
    roofs: [],
    zones: [],
  };
}

/** Приводит загруженный JSON к актуальной схеме, заполняет пропуски. */
export function normalizeProject(raw) {
  const base = createEmptyProject();
  if (!raw || typeof raw !== 'object') return base;
  const p = { ...base, ...raw };
  p.version = SCHEMA_VERSION;
  p.site = { ...base.site, ...(raw.site || {}) };
  p.site.fence = { ...base.site.fence, ...(raw.site?.fence || {}) };
  if (!Array.isArray(p.site.boundary) || p.site.boundary.length < 3) p.site.boundary = base.site.boundary;
  for (const key of Object.values(COLLECTION)) if (!Array.isArray(p[key])) p[key] = [];
  if (!Array.isArray(p.levels) || p.levels.length === 0) p.levels = [createLevel(0)];
  p.levels = p.levels.map((l, i) => ({ ...createLevel(i), ...l }));
  const levelIds = new Set(p.levels.map((l) => l.id));
  // Удаляем «висящие» объекты
  p.walls = p.walls.filter((w) => levelIds.has(w.levelId));
  const wallIds = new Set(p.walls.map((w) => w.id));
  p.openings = p.openings.filter((o) => wallIds.has(o.wallId));
  for (const key of ['rooms', 'stairs', 'roofs']) p[key] = p[key].filter((e) => levelIds.has(e.levelId));
  p.items = p.items.filter((e) => e.levelId === SITE_LEVEL || levelIds.has(e.levelId));
  return p;
}

// ── Этажи ────────────────────────────────────────────────────────────────

export function getLevel(project, levelId) {
  return project.levels.find((l) => l.id === levelId) || null;
}

export function levelIndex(project, levelId) {
  return project.levels.findIndex((l) => l.id === levelId);
}

export const isBasement = (level) => level?.kind === 'basement';
export const isAttic = (level) => level?.kind === 'attic';

/** Первый надземный этаж: на нём участок, крыльцо и объекты сада. */
export function groundLevel(project) {
  return project.levels.find((l) => !isBasement(l)) || project.levels[0];
}

/**
 * Отметка пола этажа относительно земли. Первый надземный этаж стоит на цоколе,
 * этажи выше — над ним, подвалы — ниже (отметка отрицательная).
 */
export function levelElevation(project, levelId) {
  if (levelId === SITE_LEVEL) return 0;
  const levels = project.levels;
  const g = Math.max(0, levels.indexOf(groundLevel(project)));
  let i = levels.findIndex((l) => l.id === levelId);
  if (i < 0) i = levels.length;
  let z = project.foundation ?? DEFAULTS.foundation;
  if (i >= g) for (let k = g; k < i; k++) z += levels[k].height + levels[k].slab;
  else for (let k = i; k < g; k++) z -= levels[k].height + levels[k].slab;
  return z;
}

/** Высота стен этажа по умолчанию (до низа следующего пола). */
export function levelWallHeight(level) {
  return level.height + level.slab;
}

/** Высота «колена» мансарды — от пола до низа скатов у наружных стен. */
export function kneeWall(level) {
  return level?.kneeWall ?? 1.2;
}

/**
 * Высота стен по умолчанию. В мансарде стены доходят до конька —
 * лишнее срезают скаты крыши (фронтоны получаются сами).
 */
export function wallHeight(project, wall) {
  if (wall.height) return wall.height;
  const level = getLevel(project, wall.levelId);
  if (!level) return DEFAULTS.levelHeight + DEFAULTS.slab;
  if (isAttic(level)) {
    let peak = 0;
    for (const r of project.roofs) if (r.levelId === level.id) peak = Math.max(peak, roofPeak(r));
    if (peak > 0) return kneeWall(level) + peak + 0.4;
  }
  return levelWallHeight(level);
}

/** Отметка, на которой лежит крыша: верх стен этажа, у мансарды — верх «колена». */
export function levelTop(project, levelId) {
  const level = getLevel(project, levelId);
  if (!level) return 0;
  return levelElevation(project, levelId) + (isAttic(level) ? kneeWall(level) : levelWallHeight(level));
}

export function levelAbove(project, levelId) {
  const i = levelIndex(project, levelId);
  return i >= 0 ? project.levels[i + 1] || null : null;
}

export function levelBelow(project, levelId) {
  const i = levelIndex(project, levelId);
  return i > 0 ? project.levels[i - 1] : null;
}

// ── Поиск объектов ───────────────────────────────────────────────────────

export function getEntity(project, kind, id) {
  if (kind === 'site') return project.site;
  const coll = COLLECTION[kind];
  return coll ? project[coll].find((e) => e.id === id) || null : null;
}

export function onLevel(project, kind, levelId) {
  return project[COLLECTION[kind]].filter((e) => e.levelId === levelId);
}

export function openingsOfWall(project, wallId) {
  return project.openings.filter((o) => o.wallId === wallId);
}

export function isGroundLevel(project, levelId) {
  return groundLevel(project)?.id === levelId;
}

/** Обычные этажи нумеруются от первого надземного: «1 этаж», «2 этаж»… */
export function renumberLevels(project) {
  const g = project.levels.indexOf(groundLevel(project));
  project.levels.forEach((l, i) => {
    if (/^\d+ этаж$/.test(l.name) && !isBasement(l) && !isAttic(l)) l.name = `${i - g + 1} этаж`;
  });
}

/** Удаляет объект и всё, что от него зависит. */
export function removeEntity(project, kind, id) {
  const coll = COLLECTION[kind];
  if (!coll) return;
  project[coll] = project[coll].filter((e) => e.id !== id);
  if (kind === 'wall') project.openings = project.openings.filter((o) => o.wallId !== id);
}

export function removeLevel(project, levelId) {
  if (project.levels.length <= 1) return false;
  const wallIds = new Set(project.walls.filter((w) => w.levelId === levelId).map((w) => w.id));
  project.levels = project.levels.filter((l) => l.id !== levelId);
  project.walls = project.walls.filter((w) => w.levelId !== levelId);
  project.openings = project.openings.filter((o) => !wallIds.has(o.wallId));
  for (const key of ['rooms', 'stairs', 'items', 'roofs']) project[key] = project[key].filter((e) => e.levelId !== levelId);
  renumberLevels(project);
  return true;
}
