/**
 * Описание редактируемых свойств для панели «Свойства».
 * Панель строит форму автоматически: каждое поле знает, как прочитать и записать значение.
 */
import { DEG, polygonArea } from '../core/geometry.js';
import { fmtArea, fmtSotki, fmtElev } from '../core/format.js';
import { LEVEL_KINDS, levelElevation, kneeWall, isBasement } from './project.js';
import {
  COLORS,
  FLOOR_MATERIALS,
  ZONE_MATERIALS,
  ROOF_TYPES,
  STAIR_SHAPES,
  STAIR_STYLES,
  stairStyle,
  OPENING_KINDS,
  OPENING_STYLES,
  DEFAULTS,
  ROOM_NAMES,
} from './defaults.js';
import { catalogItem } from './catalog.js';
import { LAYERS, itemLayer } from './layers.js';
import { FACADE_FINISHES, roofCover, roofCoverOptions, setRoofCover } from './finishes.js';
import { roofPeak, isMansardRoof, MANSARD, HALF_HIP } from '../geometry/roofGeometry.js';
import { setRoofType } from './factories.js';
import { foundationOf, FOUNDATION_TYPES, FOUNDATION_NAMES, PLINTH_NAMES } from './foundation.js';
import { roofSurfaceAt, slopeAngle } from '../geometry/roofSurface.js';
import { roomNetArea } from '../geometry/roomDetect.js';
import { DESCENTS, canHaveDescent } from '../geometry/cellarEntry.js';
import { RAILINGS } from '../geometry/stairRails.js';
import { roomWindowDirections } from '../geometry/orientation.js';
import { siteGeo } from '../geometry/sun.js';
import { wallLength } from './operations.js';
import { WALL_TYPES, wallTypeGroups, wallTypeId, wallType, finishOptions, wallSideFinish } from './wallTypes.js';
import { computeWallGeometry } from '../geometry/wallGeometry.js';
import { wallSides, sideLabel } from '../geometry/wallSides.js';

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

/** Сторона стены: смотрит ли на улицу и какая комната за ней. */
function wallSide(w, p, side) {
  const geoms = computeWallGeometry(p.walls.filter((x) => x.levelId === w.levelId));
  return wallSides(p, w.levelId, geoms).get(w.id)?.[side] || { outside: false, room: null };
}

const sideCtx = (w, p, side) => ({ outside: wallSide(w, p, side).outside, facade: p.facade || 'plaster', facadeColor: COLORS.facade, interiorColor: COLORS.interior, plinthColor: foundationOf(p).color, plinthFinish: foundationOf(p).finish });

/** Два поля отделки одной стороны стены: материал и цвет. */
function wallSideFields(side) {
  const fk = `finish${side}`;
  const ck = `color${side}`;
  const visible = (w) => !wallType(w).glass;
  const where = (w, p) => (wallSide(w, p, side).outside ? 'снаружи' : 'в помещениях');
  // несколько стен разом: правим «ту же» сторону по смыслу (наружную или внутреннюю), а не по букве
  const sameSide = (w, p, first) => {
    const want = wallSide(first, p, side).outside;
    const hit = ['A', 'B'].filter((k) => wallSide(w, p, k).outside === want);
    return hit.length === 1 ? hit[0] : side;
  };
  const setColor = (w, k, v) => {
    // старый общий цвет стены переезжает на обе стороны
    if (w.color) {
      w.colorA = w.colorA || w.color;
      w.colorB = w.colorB || w.color;
      w.color = null;
    }
    if (v) w[`color${k}`] = v;
    else delete w[`color${k}`];
  };
  const setFinish = (w, k, v) => {
    if (v) w[`finish${k}`] = v;
    else delete w[`finish${k}`];
  };
  return [
    {
      type: 'select',
      label: (w, p) => `Отделка ${sideLabel(wallSide(w, p, side))}`,
      hint: 'У стены две стороны — у каждой своя отделка. «По умолчанию» — как задано типом стены и отделкой фасада проекта',
      options: (w, p) => ({ '': 'По умолчанию', ...finishOptions(wallSide(w, p, side).outside) }),
      get: (w) => w[fk] || '',
      set: (w, v) => setFinish(w, side, v),
      bulkLabel: (w, p) => `Отделка ${where(w, p)}`,
      bulkSet: (w, v, p, first) => setFinish(w, sameSide(w, p, first), v),
      visible,
      bulk: true,
    },
    {
      type: 'color',
      label: (w, p) => `Цвет ${sideLabel(wallSide(w, p, side))}`,
      allowReset: true,
      get: (w, p) => w[ck] || wallSideFinish(w, side, sideCtx(w, p, side)).color,
      set: (w, v) => setColor(w, side, v),
      bulkLabel: (w, p) => `Цвет ${where(w, p)}`,
      bulkSet: (w, v, p, first) => setColor(w, sameSide(w, p, first), v),
      visible,
      bulk: true,
    },
  ];
}

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
    {
      type: 'select',
      label: 'Тип стены',
      hint: 'Из чего сложена стена: задаёт толщину, вид на срезе, штриховку на плане и строку сметы',
      groups: wallTypeGroups(),
      options: {},
      get: (w) => wallTypeId(w),
      set: (w, v) => {
        const t = WALL_TYPES[v];
        if (!t) return;
        w.type = v;
        w.kind = t.role;
        w.thickness = t.thickness;
      },
      rebuild: true,
      bulk: true,
    },
    num('thickness', 'Толщина', { min: 0.01, max: 1.5, bulk: true }),
    {
      ...num('height', 'Высота', { min: 0.3, max: 12, bulk: true }),
      placeholder: 'как у этажа',
      allowEmpty: true,
    },
    ...wallSideFields('A'),
    ...wallSideFields('B'),
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
    {
      type: 'select',
      label: 'Спуск с улицы',
      hint: 'Дверь в наружной стене подвала: приямок со ступенями от земли до пола подвала',
      options: DESCENTS,
      get: (o) => (DESCENTS[o.descent] ? o.descent : 'out'),
      set: (o, v) => (o.descent = v),
      visible: (o, p) => !!p && canHaveDescent(p, o),
    },
  ],
  room: [
    { type: 'text', label: 'Название', list: ROOM_NAMES, get: (r) => r.name, set: (r, v) => (r.name = v) },
    select('floor', 'Пол', Object.fromEntries(Object.entries(FLOOR_MATERIALS).map(([k, m]) => [k, m.name]))),
    check('heatedFloor', 'Тёплый пол'),
    readonly('Площадь (чистая)', (r, p) => fmtArea(roomNetArea(r, p.walls.filter((w) => w.levelId === r.levelId)))),
    readonly('Площадь по осям', (r) => fmtArea(polygonArea(r.points))),
    readonly('Окна выходят на', (r, p) => roomWindowDirections(p, r).join(', ') || 'окон нет'),
  ],
  stair: [
    select('shape', 'Форма', STAIR_SHAPES, {
      set: (s, v) => {
        s.shape = v;
        const dims = { straight: [1.0, 4.8], L: [3.2, 3.4], U: [2.3, 3.3], spiral: [1.8, 1.8] }[v];
        [s.width, s.length] = dims;
      },
      rebuild: true,
    }),
    {
      type: 'select',
      label: 'Конструкция',
      options: STAIR_STYLES,
      get: (s) => stairStyle(s),
      set: (s, v) => (s.style = v),
      visible: (s) => s.shape !== 'spiral',
    },
    {
      type: 'select',
      label: 'Перила',
      options: RAILINGS,
      get: (s) => (RAILINGS[s.railing] ? s.railing : 'auto'),
      set: (s, v) => (s.railing = v),
    },
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
    readonly('Объект', (i) => i.name || catalogItem(i.type)?.name || i.type),
    num('w', 'Ширина', { min: 0.05, max: 30 }),
    num('d', 'Глубина', { min: 0.05, max: 30 }),
    num('h', 'Высота', { min: 0.01, max: 20 }),
    rotation,
    posX,
    posY,
    num('elevation', 'Над полом', { min: 0, max: 5, visible: (i) => !catalogItem(i.type)?.ceiling && !catalogItem(i.type)?.roofMount }),
    { ...readonly('Высота', () => 'под потолком'), visible: (i) => !!catalogItem(i.type)?.ceiling },
    {
      ...readonly('Положение', (i, p) => {
        const s = roofSurfaceAt(p, i.levelId, i);
        return s ? `в скате крыши, уклон ${Math.round(slopeAngle(s))}°` : 'не на крыше — передвиньте на скат';
      }),
      visible: (i) => !!catalogItem(i.type)?.roofMount,
    },
    { ...readonly('Слой', (i) => LAYERS.find(([k]) => k === itemLayer(i))?.[1]), visible: (i) => catalogItem(i.type)?.category === 'mep' },
    color('color', 'Цвет'),
  ],
  roof: [
    select('type', 'Тип', ROOF_TYPES, { set: (r, v) => setRoofType(r, v), rebuild: true, bulk: true }),
    { type: 'select', label: 'Покрытие', options: (r) => roofCoverOptions(r), get: (r) => roofCover(r), set: (r, v) => setRoofCover(r, v), bulk: true },
    num('pitch', 'Уклон', { unit: '°', min: 0, max: 60, step: 1, visible: (r) => r.type !== 'flat' && !isMansardRoof(r), bulk: true }),
    num('pitch', 'Уклон нижнего ската', { unit: '°', min: 45, max: 85, step: 1, visible: isMansardRoof }),
    num('pitch2', 'Уклон верхнего ската', { unit: '°', min: 5, max: 60, step: 1, get: (r) => r.pitch2 ?? MANSARD.pitch2, visible: isMansardRoof }),
    num('breakH', 'Высота перелома', { min: 0.5, max: 6, step: 0.05, hint: 'От верха стен до перелома скатов — высота крутой части', get: (r) => r.breakH ?? MANSARD.breakH, visible: isMansardRoof }),
    num('hipPart', 'Вальма срезает', {
      unit: '%',
      min: 10,
      max: 90,
      step: 5,
      hint: 'Какую часть высоты фронтона занимает вальма',
      get: (r) => Math.round((r.hipPart ?? HALF_HIP) * 100),
      set: (r, v) => (r.hipPart = v / 100),
      visible: (r) => r.type === 'halfhip',
    }),
    num('overhang', 'Свес', { min: 0, max: 2, bulk: true }),
    num('parapet', 'Парапет', { min: 0, max: 1.5, step: 0.05, hint: 'Бортик по краю плоской крыши; 0 — без парапета', get: (r) => r.parapet ?? 0, visible: (r) => r.type === 'flat' }),
    { ...check('gutters', 'Водостоки'), visible: (r) => r.type !== 'flat', bulk: true },
    num('w', 'Ширина (вдоль конька)', { min: 1, max: 60 }),
    num('d', 'Глубина', { min: 1, max: 60 }),
    rotation,
    posX,
    posY,
    color('color', 'Цвет кровли', { bulk: true }),
    readonly('Высота конька', (r) => `${roofPeak(r).toFixed(2).replace('.', ',')} м`),
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
    {
      ...num('north', 'Север на плане', { min: -180, max: 180, step: 5, unit: '°', hint: '0 — север вверху плана, 90 — справа. Стрелка севера — в углу плана' }),
      get: (s) => siteGeo(s).north,
      set: (s, v) => (s.north = v),
    },
    { ...num('lat', 'Широта', { min: -66, max: 66, step: 0.01, unit: '°', hint: 'Для солнца по дате и времени. По умолчанию — Бишкек' }), get: (s) => siteGeo(s).lat, set: (s, v) => (s.lat = v) },
    { ...num('lon', 'Долгота', { min: -180, max: 180, step: 0.01, unit: '°' }), get: (s) => siteGeo(s).lon, set: (s, v) => (s.lon = v) },
    { ...num('tz', 'Часовой пояс (UTC+)', { min: -12, max: 14, step: 1, unit: 'ч' }), get: (s) => siteGeo(s).tz, set: (s, v) => (s.tz = v) },
    {
      ...num('setback', 'Отступ дома от границ', { min: 0, max: 20, step: 0.5, hint: 'Проверка предупредит, если дом стоит ближе к забору' }),
      get: (s) => (Number.isFinite(s.setback) ? s.setback : 3),
      set: (s, v) => (s.setback = v),
    },
  ],
};

export const LEVEL_SCHEMA = [
  { type: 'text', label: 'Название', get: (l) => l.name, set: (l, v) => (l.name = v) },
  select('kind', 'Тип этажа', LEVEL_KINDS, { get: (l) => l.kind || 'floor' }),
  num('height', 'Высота в чистоте', { min: 2, max: 8, step: 0.05, visible: (l) => l.kind !== 'attic' }),
  num('kneeWall', 'Высота «колена»', {
    min: 0.3,
    max: 2.5,
    step: 0.05,
    hint: 'От пола мансарды до начала скатов крыши у наружных стен',
    get: (l) => kneeWall(l),
    visible: (l) => l.kind === 'attic',
  }),
  num('foundation', 'Над землёй', {
    min: 0,
    max: 2.5,
    step: 0.05,
    hint: 'Насколько верх подвала (пол первого этажа) поднят над землёй — это высота цоколя',
    get: (l, p) => p.foundation,
    set: (l, v, p) => (p.foundation = v),
    visible: (l) => l.kind === 'basement',
  }),
  num('slab', 'Толщина перекрытия', { min: 0.1, max: 0.6 }),
  { type: 'readonly', label: 'Отметка пола', get: (l, p) => `${fmtElev(levelElevation(p, l.id))} м` },
];

/** Нижний этаж — подвал: фундаментом служат его стены и плита, вид фундамента не выбирают. */
const onBasement = (p) => isBasement(p.levels[0]);

export const PROJECT_SCHEMA = [
  { type: 'text', label: 'Название проекта', get: (p) => p.name, set: (p, v) => (p.name = v) },
  select('facade', 'Отделка фасада', FACADE_FINISHES, { get: (p) => p.facade || 'plaster' }),
  select('foundationType', 'Фундамент', FOUNDATION_NAMES, {
    get: (p) => foundationOf(p).type,
    hint: (p) => FOUNDATION_TYPES[foundationOf(p).type].hint,
    visible: (p) => !onBasement(p),
    rebuild: true,
  }),
  { type: 'readonly', label: 'Фундамент', get: () => 'стены и плита подвала', visible: onBasement },
  num('foundation', 'Высота цоколя', { min: 0, max: 2.5, step: 0.05, hint: 'На сколько пол первого этажа выше земли' }),
  select('plinthFinish', 'Отделка цоколя', PLINTH_NAMES, { get: (p) => foundationOf(p).finish }),
  color('plinthColor', 'Цвет цоколя', { get: (p) => foundationOf(p).color, allowReset: true }),
  num('blindArea', 'Отмостка', { min: 0, max: 2, step: 0.05, hint: 'Ширина бетонной полосы вокруг дома; 0 — без отмостки', get: (p) => foundationOf(p).blind }),
];
