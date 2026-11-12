/**
 * Забор участка: вид, высота и цвет — общие и для каждой стороны отдельно.
 *
 *  site.fence = { enabled, height, color, type,
 *                 sides: { [номер стороны]: { type?, height?, off? } } }
 * Сторона i — от угла i границы участка до следующего. Чего у стороны нет — берётся
 * общее; off — на этой стороне забора нет. Ворота и калитка — предметы каталога
 * (fenceGate): там, где они стоят на линии забора, пролёт размыкается сам.
 */
import { COLORS } from './defaults.js';
import { catalogItem } from './catalog.js';

/** tex — рисунок панели; see — сквозь забор видно (сетка, штакетник, ковка). */
export const FENCE_TYPES = {
  profsheet: { name: 'Профнастил', tex: 'profsheet' },
  wood: { name: 'Деревянный сплошной', tex: 'siding', color: '#8a6a4a' },
  picket: { name: 'Штакетник', see: true, color: '#8a6a4a' },
  mesh: { name: 'Сетка (3D-панели)', see: true, color: '#4f6b57' },
  forged: { name: 'Кованый', see: true, color: '#2f3134' },
  brick: { name: 'Кирпичные столбы', tex: 'profsheet' },
  concrete: { name: 'Бетонные панели', tex: 'concrete', color: '#b5b2ab' },
};

export const FENCE_NAMES = Object.fromEntries(Object.entries(FENCE_TYPES).map(([k, v]) => [k, v.name]));

const isColor = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

/** Забор целиком: вид по умолчанию — профнастил, как раньше. */
export function fenceOf(site) {
  const f = site?.fence || {};
  const type = FENCE_TYPES[f.type] ? f.type : 'profsheet';
  return { enabled: !!f.enabled, type, height: f.height || 1.8, color: isColor(f.color) ? f.color : FENCE_TYPES[type].color || COLORS.fence, sides: f.sides || {} };
}

/**
 * Забор на стороне i.
 * @returns {{ type, height, color, off }} off — забора на этой стороне нет
 */
export function fenceSide(site, i) {
  const f = fenceOf(site);
  const s = f.sides[i] || {};
  const type = FENCE_TYPES[s.type] ? s.type : f.type;
  // у стороны со своим видом — привычный цвет этого вида, иначе общий цвет забора
  const color = type !== f.type ? FENCE_TYPES[type].color || COLORS.fence : f.color;
  return { type, height: Number.isFinite(s.height) && s.height > 0 ? s.height : f.height, color, off: !f.enabled || !!s.off };
}

/** Записать настройку стороны; пустые записи не храним. */
export function setFenceSide(site, i, patch) {
  const f = site.fence;
  f.sides = { ...(f.sides || {}) };
  const next = { ...(f.sides[i] || {}), ...patch };
  for (const k of Object.keys(next)) if (next[k] === null || next[k] === undefined || next[k] === false || next[k] === '') delete next[k];
  if (Object.keys(next).length) f.sides[i] = next;
  else delete f.sides[i];
  if (!Object.keys(f.sides).length) delete f.sides;
}

/** Ворота или калитка участка (предмет каталога на линии забора). */
export const isFenceGate = (item) => !!catalogItem(item?.type)?.fenceGate;
