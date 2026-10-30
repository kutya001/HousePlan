/**
 * Описание редактируемых свойств для панели «Свойства».
 * Панель строит форму автоматически: каждое поле знает, как прочитать и записать значение.
 */
import { DEG, polygonArea } from '../core/geometry.js';
import { fmtArea, fmtSotki } from '../core/format.js';
import {
  WALL_KINDS,
  FLOOR_MATERIALS,
  ZONE_MATERIALS,
  ROOF_TYPES,
  STAIR_SHAPES,
  OPENING_KINDS,
  OPENING_STYLES,
  DEFAULTS,
  ROOM_NAMES,
} from './defaults.js';
import { catalogItem } from './catalog.js';
import { roomNetArea } from '../geometry/roomDetect.js';
import { wallLength } from './operations.js';

const num = (key, label, opts = {}) => ({
  type: 'number',
  label,
  unit: opts.unit ?? 'м',
  min: opts.min ?? 0,
  max: opts.max ?? 1000,
  step: opts.step ?? 0.01,
  get: (e) => e[key],
  set: (e, v) => {
    e[key] = v;
  },
  ...opts,
});

const select = (key, label, options, extra = {}) => ({
  type: 'select',
  label,
  options,
  get: (e) => e[key],
  set: (e, v) => {
    e[key] = v;
  },
  ...extra,
});

const color = (key, label, extra = {}) => ({
  type: 'color',
  label,
  get: (e) => e[key],
  set: (e, v) => {
    e[key] = v;
  },
  ...extra,
});

const check = (key, label) => ({
  type: 'checkbox',
  label,
  get: (e) => !!e[key],
  set: (e, v) => {
    e[key] = v;
  },
});

const rotation = num('rotation', 'Поворот', { unit: '°', min: -360, max: 360, step: 1 });
const posX = num('x', 'Положение X', { min: -1000, max: 1000, step: 0.05, hint: 'Центр объекта, м' });
const posY = num('y', 'Положение Y', { min: -1000, max: 1000, step: 0.05, hint: 'Центр объекта, м' });

const readonly = (label, get) => ({ type: 'readonly', label, get });

export const SCHEMAS = {
  wall: [
    {
      type: 'number',
      label: 'Длина',
      unit: 'м',
      min: 0.1,
      max: 200,
      step: 0.01,
      get: (w) => wallLength(w),
      set: (w, v) => {
        const L = wallLength(w) || 1;
        const k = v / L;
        w.x2 = w.x1 + (w.x2 - w.x1) * k;
        w.y2 = w.y1 + (w.y2 - w.y1) * k;
      },
      hint: 'Конец стены сдвигается, начало остаётся на месте',
    },
    num('thickness', 'Толщина', { min: 0.05, max: 1.5 }),
    {
      ...num('height', 'Высота', { min: 0.3, max: 12 }),
      placeholder: 'как у этажа',
      allowEmpty: true,
    },
    select('kind', 'Тип', WALL_KINDS),
    { ...color('color', 'Цвет'), allowReset: true },
  ],
  opening: [
    select('kind', 'Вид', OPENING_KINDS, {
      set: (o, v) => {
        o.kind = v;
        o.style = Object.keys(OPENING_STYLES[v])[0];
        const d = DEFAULTS[v];
        o.width = d.width;
        o.height = d.height;
        o.sill = d.sill;
      },
      rebuild: true,
    }),
    { type: 'select', label: 'Конструкция', options: (o) => OPENING_STYLES[o.kind] || {}, get: (o) => o.style, set: (o, v) => (o.style = v) },
    num('width', 'Ширина', { min: 0.3, max: 8 }),
    num('height', 'Высота', { min: 0.3, max: 5 }),
    num('sill', 'От пола', { min: 0, max: 3, hint: 'Высота подоконника или порога' }),
    num('t', 'Центр от начала стены', { min: 0, max: 200 }),
    check('flipSide', 'Открывание на другую сторону'),
    check('flipHinge', 'Петли с другой стороны'),
  ],
  room: [
    { type: 'text', label: 'Название', list: ROOM_NAMES, get: (r) => r.name, set: (r, v) => (r.name = v) },
    select('floor', 'Пол', Object.fromEntries(Object.entries(FLOOR_MATERIALS).map(([k, m]) => [k, m.name]))),
    readonly('Площадь (чистая)', (r, p) => fmtArea(roomNetArea(r, p.walls.filter((w) => w.levelId === r.levelId)))),
    readonly('Площадь по осям', (r) => fmtArea(polygonArea(r.points))),
  ],
  stair: [
    select('shape', 'Форма', STAIR_SHAPES, {
      set: (s, v) => {
        s.shape = v;
        const dims = { straight: [1.0, 3.6], L: [2.4, 3.0], U: [2.3, 3.0], spiral: [1.8, 1.8] }[v];
        [s.width, s.length] = dims;
      },
      rebuild: true,
    }),
    num('width', 'Ширина', { min: 0.6, max: 6 }),
    num('length', 'Длина', { min: 0.6, max: 10, visible: (s) => s.shape !== 'spiral' }),
    num('flight', 'Ширина марша', { min: 0.6, max: 2, visible: (s) => s.shape === 'L' || s.shape === 'U' }),
    rotation,
    posX,
    posY,
    check('flip', 'Зеркально'),
    color('color', 'Цвет'),
  ],
  item: [
    readonly('Объект', (i) => catalogItem(i.type)?.name || i.type),
    num('w', 'Ширина', { min: 0.05, max: 30 }),
    num('d', 'Глубина', { min: 0.05, max: 30 }),
    num('h', 'Высота', { min: 0.01, max: 20 }),
    rotation,
    posX,
    posY,
    num('elevation', 'Над полом', { min: 0, max: 5 }),
    color('color', 'Цвет'),
  ],
  roof: [
    select('type', 'Тип', ROOF_TYPES),
    num('pitch', 'Уклон', { unit: '°', min: 0, max: 60, step: 1, visible: (r) => r.type !== 'flat' }),
    num('overhang', 'Свес', { min: 0, max: 2 }),
    num('w', 'Ширина (вдоль конька)', { min: 1, max: 60 }),
    num('d', 'Глубина', { min: 1, max: 60 }),
    rotation,
    posX,
    posY,
    color('color', 'Цвет кровли'),
    readonly('Высота конька', (r) => {
      const t = Math.tan((r.pitch || 0) * DEG);
      const rise = r.type === 'flat' ? 0.25 : r.type === 'shed' ? r.d * t : (Math.min(r.w, r.d) / 2) * t;
      return `${rise.toFixed(2).replace('.', ',')} м`;
    }),
  ],
  zone: [
    select('material', 'Покрытие', Object.fromEntries(Object.entries(ZONE_MATERIALS).map(([k, m]) => [k, m.name]))),
    readonly('Площадь', (z) => fmtArea(polygonArea(z.points))),
  ],
  site: [
    readonly('Площадь', (s) => `${fmtArea(polygonArea(s.boundary))} · ${fmtSotki(polygonArea(s.boundary))}`),
    { type: 'checkbox', label: 'Забор', get: (s) => !!s.fence.enabled, set: (s, v) => (s.fence.enabled = v) },
    {
      ...num('height', 'Высота забора', { min: 0.3, max: 4 }),
      get: (s) => s.fence.height,
      set: (s, v) => (s.fence.height = v),
      visible: (s) => s.fence.enabled,
    },
    { type: 'color', label: 'Цвет забора', get: (s) => s.fence.color, set: (s, v) => (s.fence.color = v), visible: (s) => s.fence.enabled },
  ],
};

export const LEVEL_SCHEMA = [
  { type: 'text', label: 'Название', get: (l) => l.name, set: (l, v) => (l.name = v) },
  num('height', 'Высота в чистоте', { min: 2, max: 8, step: 0.05 }),
  num('slab', 'Толщина перекрытия', { min: 0.1, max: 0.6 }),
];

export const PROJECT_SCHEMA = [
  { type: 'text', label: 'Название проекта', get: (p) => p.name, set: (p, v) => (p.name = v) },
  num('foundation', 'Высота цоколя', { min: 0, max: 2, step: 0.05 }),
];
