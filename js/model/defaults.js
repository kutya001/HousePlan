/** Значения по умолчанию, справочники материалов и подписи. */

export const DEFAULTS = {
  foundation: 0.45, // высота цоколя над землёй, м
  levelHeight: 2.8, // высота этажа «в чистоте», м
  slab: 0.25, // толщина перекрытия, м
  wall: {
    exterior: { thickness: 0.4 },
    interior: { thickness: 0.12 },
  },
  door: { width: 0.9, height: 2.1, sill: 0 },
  window: { width: 1.4, height: 1.4, sill: 0.85 },
  arch: { width: 1.2, height: 2.2, sill: 0 },
  stair: { width: 1.0, length: 3.6, flight: 1.0 },
  roof: { pitch: 30, overhang: 0.5 },
  grid: 0.05, // шаг привязки к сетке, м
};

export const COLORS = {
  facade: '#ece7de',
  interior: '#f5f3ef',
  plinth: '#8f8b85',
  roof: '#8a4a3a',
  ground: '#b9c7a5',
  lawn: '#8dbb6e',
  fence: '#7a6a58',
  frame: '#f7f7f5',
  glass: '#9cc3dc',
  doorLeaf: '#9a6b47',
  stair: '#c8a27a',
};

export const WALL_KINDS = {
  exterior: 'Наружная',
  interior: 'Перегородка',
};

export const FLOOR_MATERIALS = {
  parquet: { name: 'Паркет', color: '#d2ad85' },
  laminate: { name: 'Ламинат', color: '#ddc29f' },
  tile: { name: 'Плитка', color: '#d8dde0' },
  stone: { name: 'Камень', color: '#c3bdb3' },
  carpet: { name: 'Ковролин', color: '#b3adbf' },
  concrete: { name: 'Бетон', color: '#bfbfba' },
};

export const ZONE_MATERIALS = {
  lawn: { name: 'Газон', color: '#8dbb6e' },
  paving: { name: 'Плитка', color: '#cdc6ba' },
  gravel: { name: 'Гравий', color: '#d9d2c3' },
  asphalt: { name: 'Асфальт', color: '#74787c' },
  deck: { name: 'Терраса', color: '#b98a5e' },
  water: { name: 'Вода', color: '#6fb3d9' },
  soil: { name: 'Земля, грядки', color: '#8a6a4f' },
  flowers: { name: 'Цветник', color: '#d895b4' },
};

export const ROOF_TYPES = {
  gable: 'Двускатная',
  hip: 'Вальмовая',
  shed: 'Односкатная',
  flat: 'Плоская',
};

export const STAIR_SHAPES = {
  straight: 'Прямая',
  L: 'Г-образная',
  U: 'П-образная',
  spiral: 'Винтовая',
};

export const OPENING_STYLES = {
  door: {
    single: 'Одностворчатая',
    double: 'Двустворчатая',
    sliding: 'Раздвижная',
    garage: 'Гаражные ворота',
  },
  window: {
    single: 'Одностворчатое',
    double: 'Двустворчатое',
    triple: 'Трёхстворчатое',
    panoramic: 'Панорамное',
  },
  arch: {
    open: 'Проём без двери',
  },
};

export const OPENING_KINDS = {
  door: 'Дверь',
  window: 'Окно',
  arch: 'Проём',
};

export const ROOM_NAMES = [
  'Гостиная',
  'Кухня',
  'Кухня-гостиная',
  'Спальня',
  'Детская',
  'Кабинет',
  'Санузел',
  'Ванная',
  'Прихожая',
  'Холл',
  'Коридор',
  'Гардероб',
  'Кладовая',
  'Котельная',
  'Терраса',
  'Гараж',
];

/** Где появляется манекен при начале прогулки (настройка walkSpawn). */
export const SPAWN_MODES = [
  ['entrance', 'У входа на участке', 'Снаружи перед входной дверью — можно подняться на крыльцо и войти в дом'],
  ['inside', 'В доме, на активном этаже', 'В комнате активного этажа, на которую смотрит камера'],
  ['point', 'В своей точке', 'В точке, отмеченной на плане: правая кнопка (долгое нажатие) → «Появляться здесь»'],
];
