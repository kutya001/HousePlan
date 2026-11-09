/**
 * Слои плана: мебель, электрика, сантехника, отопление. Слой предмета — из каталога
 * (у инженерии свой), видимость — настройки layer_<слой>. Тёплый пол — отопление.
 */
import { catalogItem } from './catalog.js';
import { getLevel } from './project.js';
import { toWorld } from '../core/geometry.js';

export const LAYERS = [
  ['furniture', 'Мебель и объекты', 'sofa'],
  ['electric', 'Электрика', 'bolt'],
  ['plumbing', 'Сантехника', 'drop'],
  ['heating', 'Отопление и тёплый пол', 'flame'],
];

export const LAYER_COLORS = { electric: '#d39a12', plumbing: '#2f7fd1', heating: '#d6452f' };

export function itemLayer(it) {
  const c = catalogItem(it.type);
  // балкон, козырёк, навес, мансардное окно — часть здания, не прячутся со слоем мебели
  if (c?.category === 'structure') return 'structure';
  return c?.layer || 'furniture';
}

export function layerVisible(settings, layer) {
  return settings?.[`layer_${layer}`] !== false;
}

export function itemVisible(settings, it) {
  return layerVisible(settings, itemLayer(it));
}

/** Высота низа предмета над полом этажа: потолочные светильники — под потолком. */
export function itemElevation(project, it) {
  const c = catalogItem(it.type);
  if (c?.ceiling) {
    const lvl = getLevel(project, it.levelId);
    return Math.max(0, (lvl?.height ?? 2.8) - (it.h || 0.1));
  }
  return it.elevation || 0;
}

export const isMarker = (it) => !!catalogItem(it.type)?.marker;

/** Минимальный размер значка на экране, пиксели: у стены (ширина × глубина) и под потолком. */
const WALL_PX = [16, 9];
const FREE_PX = 14;

/**
 * Прямоугольник объекта на плане. Мелкие значки инженерии не меньше
 * нескольких пикселей при любом масштабе; у стены значок растёт в комнату.
 * @param px метров в пикселе (Viewport.px(1)); без него — настоящий размер
 */
export function planRect(it, px) {
  const r = { x: it.x, y: it.y, w: it.w, d: it.d, rotation: it.rotation || 0 };
  const c = catalogItem(it.type);
  if (!c?.marker || !px) return r;
  const [mw, md] = c.markerPx || (c.wallSnap ? WALL_PX : [FREE_PX, FREE_PX]);
  const w = Math.max(it.w, mw * px);
  const d = Math.max(it.d, md * px);
  if (w === it.w && d === it.d) return r;
  const shift = c.wallSnap ? (d - it.d) / 2 : 0;
  const p = toWorld({ x: 0, y: shift }, it.x, it.y, r.rotation);
  return { ...r, x: p.x, y: p.y, w, d };
}
