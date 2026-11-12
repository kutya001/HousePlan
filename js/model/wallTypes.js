/**
 * Типы стен и отделка их поверхностей.
 *
 * Тип — конструкция стены (из чего сложена): задаёт роль (наружная или внутренняя),
 * толщину по умолчанию, вид на срезе в 3D, штриховку на плане, строку сметы и отделку
 * по умолчанию. Отделка — то, что видно на каждой из двух сторон стены.
 *
 * У стены: kind — роль ('exterior' | 'interior'), type — id типа, а отделка сторон —
 * finishA / colorA — сторона справа по ходу от начала стены к концу (если смотреть на
 * план), finishB / colorB — слева. В геометрии это стороны +n и −n (см. wallGeometry.js).
 * Старые проекты без type читаются как прежде: наружная — газобетон, внутренняя —
 * перегородка или несущая по толщине.
 */

/** Толще этого внутренняя стена считается несущей (для старых проектов без типа). */
export const PARTITION_MAX = 0.15;

/**
 * role: exterior | interior; bearing — несущая (перемычки, фундамент);
 * unit — единица сметы: m3 (кладка) или m2 (перегородки, каркас);
 * body — цвет «тела» стены на срезе; hatch — штриховка на плане;
 * out / in — отделка по умолчанию снаружи и внутри (для внутренних — in с обеих сторон);
 * glass — прозрачная.
 */
export const WALL_TYPES = {
  // ── наружные ──
  aerated: { name: 'Газобетон', role: 'exterior', bearing: true, thickness: 0.4, unit: 'm3', body: '#d9d7d1', hatch: 'block', in: 'plaster' },
  brick: { name: 'Кирпич', role: 'exterior', bearing: true, thickness: 0.51, unit: 'm3', body: '#b8694d', hatch: 'brick', out: 'brick', in: 'plaster' },
  ceramic: { name: 'Керамоблок', role: 'exterior', bearing: true, thickness: 0.44, unit: 'm3', body: '#c98a5c', hatch: 'block', in: 'plaster' },
  timber: { name: 'Брус', role: 'exterior', bearing: true, thickness: 0.2, unit: 'm3', body: '#d6b07a', hatch: 'wood', out: 'timber', in: 'timber' },
  log: { name: 'Бревно', role: 'exterior', bearing: true, thickness: 0.24, unit: 'm3', body: '#c99a62', hatch: 'wood', out: 'log', in: 'log' },
  frame: { name: 'Каркас с утеплителем', role: 'exterior', bearing: true, thickness: 0.2, unit: 'm2', body: '#e6d79a', hatch: 'frame', out: 'siding', in: 'plaster' },
  sip: { name: 'СИП-панель', role: 'exterior', bearing: true, thickness: 0.174, unit: 'm2', body: '#efe6c4', hatch: 'frame', out: 'siding', in: 'plaster' },
  concrete: { name: 'Монолитный бетон', role: 'exterior', bearing: true, thickness: 0.3, unit: 'm3', body: '#aaa9a4', hatch: 'concrete', in: 'plaster' },
  // ── внутренние несущие ──
  bearing_block: { name: 'Несущая из блоков', role: 'interior', bearing: true, thickness: 0.3, unit: 'm3', body: '#d9d7d1', hatch: 'block', in: 'plaster' },
  bearing_brick: { name: 'Несущая кирпичная', role: 'interior', bearing: true, thickness: 0.25, unit: 'm3', body: '#b8694d', hatch: 'brick', in: 'plaster' },
  bearing_timber: { name: 'Несущая из бруса', role: 'interior', bearing: true, thickness: 0.15, unit: 'm3', body: '#d6b07a', hatch: 'wood', in: 'timber' },
  bearing_concrete: { name: 'Несущая монолитная', role: 'interior', bearing: true, thickness: 0.2, unit: 'm3', body: '#aaa9a4', hatch: 'concrete', in: 'plaster' },
  // ── перегородки ──
  part_block: { name: 'Перегородка из блоков', role: 'interior', thickness: 0.12, unit: 'm2', body: '#dddbd5', hatch: 'none', in: 'plaster' },
  part_brick: { name: 'Перегородка кирпичная', role: 'interior', thickness: 0.12, unit: 'm2', body: '#b8694d', hatch: 'brick', in: 'plaster' },
  drywall: { name: 'Гипсокартон на каркасе', role: 'interior', thickness: 0.1, unit: 'm2', body: '#eceae4', hatch: 'frame', in: 'paint' },
  tongue: { name: 'Пазогребневая плита', role: 'interior', thickness: 0.08, unit: 'm2', body: '#e3e1dc', hatch: 'none', in: 'plaster' },
  part_wood: { name: 'Перегородка деревянная', role: 'interior', thickness: 0.075, unit: 'm2', body: '#d6b07a', hatch: 'wood', in: 'wood' },
  glassblock: { name: 'Стеклоблоки', role: 'interior', thickness: 0.1, unit: 'm2', body: '#bcd9e6', hatch: 'glass', in: 'glassblock', glass: 0.55 },
  glass: { name: 'Стеклянная перегородка', role: 'interior', thickness: 0.02, unit: 'm2', body: '#a9cde3', hatch: 'glass', in: 'glass', glass: 0.32 },
};

/** Группы для выпадающего списка. */
export const WALL_TYPE_GROUPS = [
  { label: 'Наружные', ids: ['aerated', 'brick', 'ceramic', 'timber', 'log', 'frame', 'sip', 'concrete'] },
  { label: 'Внутренние несущие', ids: ['bearing_block', 'bearing_brick', 'bearing_timber', 'bearing_concrete'] },
  { label: 'Перегородки', ids: ['part_block', 'part_brick', 'drywall', 'tongue', 'part_wood', 'glassblock', 'glass'] },
];

/** Группы типов в виде { label, options: { id: название } } — для выпадающих списков. */
export function wallTypeGroups() {
  return WALL_TYPE_GROUPS.map((g) => ({ label: g.label, options: Object.fromEntries(g.ids.map((id) => [id, WALL_TYPES[id].name])) }));
}

/**
 * Отделка поверхности. tex — рисунок (view3d/textures.js), color — цвет по умолчанию,
 * where — где предлагать: out (фасад), in (помещение) или both.
 */
export const WALL_FINISHES = {
  plaster: { name: 'Штукатурка', tex: 'plaster', where: 'both' },
  paint: { name: 'Покраска', tex: '', where: 'both' },
  brick: { name: 'Кирпич', tex: 'brick', where: 'both' },
  stone: { name: 'Камень', tex: 'stone', where: 'both' },
  siding: { name: 'Сайдинг, доска', tex: 'siding', where: 'out' },
  panels: { name: 'Фасадные панели', tex: 'panels', color: '#d9dcdf', where: 'out' },
  timber: { name: 'Брус', tex: 'timber', color: '#d9b582', where: 'both' },
  log: { name: 'Бревно', tex: 'log', color: '#cfa46e', where: 'both' },
  wood: { name: 'Вагонка', tex: 'wood', color: '#dcc095', where: 'both' },
  tile: { name: 'Плитка', tex: 'walltile', color: '#eef1f2', where: 'in' },
  wallpaper: { name: 'Обои', tex: 'wallpaper', color: '#eee8dc', where: 'in' },
  concrete: { name: 'Бетон', tex: 'concrete', color: '#b9b8b3', where: 'both' },
  glassblock: { name: 'Стеклоблок', tex: 'walltile', color: '#cfe6f0', where: 'none' },
  glass: { name: 'Стекло', tex: '', color: '#a9cde3', where: 'none' },
};

/** Тип стены (id) с учётом старых проектов без поля type. */
export function wallTypeId(w) {
  if (w?.type && WALL_TYPES[w.type]) return w.type;
  if (w?.kind === 'exterior') return 'aerated';
  return (w?.thickness ?? 0) > PARTITION_MAX + 1e-6 ? 'bearing_block' : 'part_block';
}

export const wallType = (w) => WALL_TYPES[wallTypeId(w)];

/** Несущая ли стена (перемычки над проёмами, лента фундамента). */
export const isBearing = (w) => !!wallType(w).bearing;

/** Списки отделок для стороны: снаружи дома или в помещении. */
export function finishOptions(outside) {
  const want = outside ? 'out' : 'in';
  return Object.fromEntries(Object.entries(WALL_FINISHES).filter(([, f]) => f.where === 'both' || f.where === want).map(([k, f]) => [k, f.name]));
}

/**
 * Отделка стороны стены.
 * @param side — 'A' | 'B'
 * @param ctx { outside — эта сторона смотрит на улицу, facade — отделка фасада проекта,
 *              underground — стена подвала в грунте (снаружи отделана как цоколь: plinthFinish, plinthColor),
 *              facadeColor, interiorColor }
 * @returns {{ finish, color, tex, glass }}
 */
export function wallSideFinish(w, side, ctx = {}) {
  const t = wallType(w);
  const own = side === 'A' ? w.finishA : w.finishB;
  const ownColor = side === 'A' ? w.colorA : w.colorB;
  let finish;
  if (own && WALL_FINISHES[own]) finish = own;
  else if (t.glass) finish = t.in;
  else if (ctx.underground && ctx.outside) finish = WALL_FINISHES[ctx.plinthFinish] ? ctx.plinthFinish : 'concrete';
  else if (ctx.outside) finish = t.out || (WALL_FINISHES[ctx.facade] ? ctx.facade : 'plaster');
  else finish = t.in || 'plaster';
  const def = WALL_FINISHES[finish];
  // цвет: свой цвет стороны → общий цвет стены (старое поле color) → цвет цоколя (стена подвала
  // снаружи) → цвет отделки → фасад / интерьер
  const plinth = ctx.underground && ctx.outside ? ctx.plinthColor : null;
  const base = ctx.outside ? ctx.facadeColor : ctx.interiorColor;
  const color = ownColor || w.color || plinth || def.color || base || '#f1eee8';
  return { finish, color, tex: def.tex, glass: t.glass || 0 };
}
