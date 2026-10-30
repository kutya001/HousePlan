/**
 * Каталог мебели и объектов участка.
 * w — ширина (вдоль стены), d — глубина, h — высота, метры.
 * wallSnap — при установке прижимать спинкой к стене.
 * outdoor  — объект участка (ставится на землю, виден на первом этаже).
 * Внешний вид в 2D задаётся в editor/render/symbols2d.js, в 3D — в view3d/builders/buildItems.js.
 */

export const CATEGORIES = [
  { id: 'living', name: 'Гостиная' },
  { id: 'bedroom', name: 'Спальня' },
  { id: 'kitchen', name: 'Кухня' },
  { id: 'bath', name: 'Санузел' },
  { id: 'other', name: 'Разное' },
  { id: 'outdoor', name: 'Участок' },
];

export const CATALOG = [
  // Гостиная
  { type: 'sofa', name: 'Диван', category: 'living', w: 2.1, d: 0.95, h: 0.85, color: '#7d8a99', wallSnap: true },
  { type: 'sofa_corner', name: 'Угловой диван', category: 'living', w: 2.7, d: 1.7, h: 0.85, color: '#8c8f7d', wallSnap: true },
  { type: 'armchair', name: 'Кресло', category: 'living', w: 0.85, d: 0.85, h: 0.85, color: '#a8806a' },
  { type: 'coffee_table', name: 'Журнальный столик', category: 'living', w: 1.1, d: 0.6, h: 0.42, color: '#8b6a4e' },
  { type: 'tv_stand', name: 'ТВ-тумба с телевизором', category: 'living', w: 1.8, d: 0.45, h: 0.5, color: '#3d3f43', wallSnap: true },
  { type: 'bookshelf', name: 'Стеллаж', category: 'living', w: 1.0, d: 0.35, h: 2.0, color: '#b89572', wallSnap: true },
  { type: 'rug', name: 'Ковёр', category: 'living', w: 2.0, d: 1.4, h: 0.01, color: '#c9a99a' },
  { type: 'fireplace', name: 'Камин', category: 'living', w: 1.4, d: 0.5, h: 1.1, color: '#a9a39b', wallSnap: true },
  { type: 'plant', name: 'Комнатное растение', category: 'living', w: 0.5, d: 0.5, h: 1.2, color: '#5e8f4e' },

  // Спальня
  { type: 'bed_double', name: 'Кровать двуспальная', category: 'bedroom', w: 1.8, d: 2.1, h: 0.5, color: '#e6e2da', wallSnap: true },
  { type: 'bed_single', name: 'Кровать односпальная', category: 'bedroom', w: 0.9, d: 2.0, h: 0.5, color: '#e6e2da', wallSnap: true },
  { type: 'nightstand', name: 'Тумбочка', category: 'bedroom', w: 0.5, d: 0.4, h: 0.55, color: '#b89572', wallSnap: true },
  { type: 'wardrobe', name: 'Шкаф', category: 'bedroom', w: 1.8, d: 0.6, h: 2.3, color: '#d9cbb8', wallSnap: true },
  { type: 'dresser', name: 'Комод', category: 'bedroom', w: 1.2, d: 0.5, h: 0.85, color: '#b89572', wallSnap: true },
  { type: 'desk', name: 'Письменный стол', category: 'bedroom', w: 1.3, d: 0.65, h: 0.75, color: '#c8b296', wallSnap: true },
  { type: 'office_chair', name: 'Рабочее кресло', category: 'bedroom', w: 0.6, d: 0.6, h: 1.1, color: '#45484d' },
  { type: 'crib', name: 'Детская кроватка', category: 'bedroom', w: 0.7, d: 1.3, h: 0.9, color: '#f0ebe3', wallSnap: true },

  // Кухня
  { type: 'kitchen_counter', name: 'Кухонный модуль', category: 'kitchen', w: 2.4, d: 0.6, h: 0.9, color: '#e9e6e1', wallSnap: true },
  { type: 'kitchen_sink', name: 'Мойка', category: 'kitchen', w: 0.8, d: 0.6, h: 0.9, color: '#e9e6e1', wallSnap: true },
  { type: 'stove', name: 'Плита', category: 'kitchen', w: 0.6, d: 0.6, h: 0.9, color: '#d7d9db', wallSnap: true },
  { type: 'fridge', name: 'Холодильник', category: 'kitchen', w: 0.7, d: 0.7, h: 1.95, color: '#e4e6e8', wallSnap: true },
  { type: 'kitchen_island', name: 'Остров', category: 'kitchen', w: 1.8, d: 0.9, h: 0.9, color: '#cfc6b8' },
  { type: 'dining_table', name: 'Обеденный стол', category: 'kitchen', w: 1.6, d: 0.9, h: 0.75, color: '#a07a56' },
  { type: 'round_table', name: 'Круглый стол', category: 'kitchen', w: 1.1, d: 1.1, h: 0.75, color: '#a07a56' },
  { type: 'chair', name: 'Стул', category: 'kitchen', w: 0.45, d: 0.5, h: 0.9, color: '#8b6a4e' },

  // Санузел
  { type: 'toilet', name: 'Унитаз', category: 'bath', w: 0.4, d: 0.7, h: 0.8, color: '#f4f5f6', wallSnap: true },
  { type: 'bathtub', name: 'Ванна', category: 'bath', w: 1.7, d: 0.75, h: 0.6, color: '#f4f5f6', wallSnap: true },
  { type: 'shower', name: 'Душевая', category: 'bath', w: 0.9, d: 0.9, h: 2.1, color: '#dfe9ee', wallSnap: true },
  { type: 'washbasin', name: 'Раковина', category: 'bath', w: 0.6, d: 0.45, h: 0.85, color: '#f4f5f6', wallSnap: true },
  { type: 'washing_machine', name: 'Стиральная машина', category: 'bath', w: 0.6, d: 0.6, h: 0.85, color: '#eef0f2', wallSnap: true },
  { type: 'boiler', name: 'Котёл', category: 'bath', w: 0.45, d: 0.4, h: 0.75, color: '#eef0f2', wallSnap: true, elevation: 1.2 },

  // Разное
  { type: 'box', name: 'Блок / тумба', category: 'other', w: 1.0, d: 0.6, h: 0.8, color: '#c9c3b8' },
  { type: 'column', name: 'Колонна', category: 'other', w: 0.4, d: 0.4, h: 2.8, color: '#e0dcd5' },
  { type: 'piano', name: 'Пианино', category: 'other', w: 1.5, d: 0.6, h: 1.3, color: '#2f2a28', wallSnap: true },
  { type: 'treadmill', name: 'Беговая дорожка', category: 'other', w: 0.8, d: 1.9, h: 1.4, color: '#4a4d52' },

  // Участок
  { type: 'tree', name: 'Дерево лиственное', category: 'outdoor', w: 4.5, d: 4.5, h: 6.5, color: '#6f9d4f', outdoor: true },
  { type: 'conifer', name: 'Ель / сосна', category: 'outdoor', w: 3, d: 3, h: 7, color: '#3f6f4a', outdoor: true },
  { type: 'fruit_tree', name: 'Плодовое дерево', category: 'outdoor', w: 3.2, d: 3.2, h: 4, color: '#7fae58', outdoor: true },
  { type: 'bush', name: 'Куст', category: 'outdoor', w: 1.3, d: 1.3, h: 1.1, color: '#6b9a52', outdoor: true },
  { type: 'flowerbed', name: 'Клумба', category: 'outdoor', w: 2.0, d: 1.0, h: 0.35, color: '#d895b4', outdoor: true },
  { type: 'garden_bed', name: 'Грядка', category: 'outdoor', w: 3.0, d: 1.2, h: 0.25, color: '#8a6a4f', outdoor: true },
  { type: 'greenhouse', name: 'Теплица', category: 'outdoor', w: 3.0, d: 6.0, h: 2.3, color: '#d9ecf2', outdoor: true },
  { type: 'gazebo', name: 'Беседка', category: 'outdoor', w: 3.5, d: 3.5, h: 2.9, color: '#a77a52', outdoor: true },
  { type: 'bench', name: 'Скамейка', category: 'outdoor', w: 1.6, d: 0.55, h: 0.85, color: '#9a6b47', outdoor: true },
  { type: 'bbq', name: 'Мангал', category: 'outdoor', w: 1.0, d: 0.5, h: 0.95, color: '#3b3c3e', outdoor: true },
  { type: 'pool', name: 'Бассейн', category: 'outdoor', w: 6, d: 3, h: 0.3, color: '#5fb0d8', outdoor: true },
  { type: 'car', name: 'Автомобиль', category: 'outdoor', w: 4.6, d: 1.85, h: 1.5, color: '#556b8a', outdoor: true },
  { type: 'playground', name: 'Детская площадка', category: 'outdoor', w: 3, d: 2.5, h: 2.4, color: '#e2a446', outdoor: true },
  { type: 'well', name: 'Колодец', category: 'outdoor', w: 1.2, d: 1.2, h: 1.6, color: '#9b938a', outdoor: true },
];

const BY_TYPE = new Map(CATALOG.map((c) => [c.type, c]));

export function catalogItem(type) {
  return BY_TYPE.get(type) || null;
}
