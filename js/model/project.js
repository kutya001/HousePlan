/**
 * Схема проекта и запросы к нему.
 *
 * Проект — один JSON-объект:
 * {
 *   version, name,
 *   foundation,                       // высота цоколя
 *   site:   { boundary:[{x,y}], fence:{ enabled, height } },
 *   levels: [{ id, name, height, slab }],
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

export function createLevel(index, overrides = {}) {
  return {
    id: uid('lvl'),
    name: `${index + 1} этаж`,
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

/** Отметка пола этажа над землёй. */
export function levelElevation(project, levelId) {
  if (levelId === SITE_LEVEL) return 0;
  let z = project.foundation ?? DEFAULTS.foundation;
  for (const l of project.levels) {
    if (l.id === levelId) return z;
    z += l.height + l.slab;
  }
  return z;
}

/** Высота стен этажа по умолчанию (до низа следующего пола). */
export function levelWallHeight(level) {
  return level.height + level.slab;
}

export function wallHeight(project, wall) {
  if (wall.height) return wall.height;
  const level = getLevel(project, wall.levelId);
  return level ? levelWallHeight(level) : DEFAULTS.levelHeight + DEFAULTS.slab;
}

/** Отметка верха стен этажа — на ней лежит крыша. */
export function levelTop(project, levelId) {
  const level = getLevel(project, levelId);
  if (!level) return 0;
  return levelElevation(project, levelId) + levelWallHeight(level);
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
  return project.levels[0]?.id === levelId;
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
  project.levels.forEach((l, i) => {
    if (/^\d+ этаж$/.test(l.name)) l.name = `${i + 1} этаж`;
  });
  return true;
}
