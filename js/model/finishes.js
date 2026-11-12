/** Отделка фасада и покрытия кровли — выбор в свойствах проекта и крыши (текстуры в 3D). */
import { COLORS } from './defaults.js';

export const FACADE_FINISHES = { plaster: 'Штукатурка', brick: 'Кирпич', siding: 'Сайдинг, доска', stone: 'Камень' };

/** Покрытия кровли: id — и название рисунка в view3d/textures.js. */
export const ROOF_COVERS = {
  metal: 'Металлочерепица',
  tiles: 'Керамическая черепица',
  shingle: 'Гибкая черепица',
  seam: 'Фальцевая кровля',
  profsheet: 'Профнастил',
  slate: 'Шифер',
  ondulin: 'Ондулин',
  membrane: 'Мембрана',
  sedum: 'Зелёная кровля',
  plain: 'Гладкое покрытие',
};

/** Что кладут на плоскую крышу и что — на скатную (первое — по умолчанию). */
const FLAT_COVERS = ['membrane', 'sedum', 'plain'];
const PITCHED_COVERS = ['metal', 'tiles', 'shingle', 'seam', 'profsheet', 'slate', 'ondulin', 'plain'];

/** Привычный цвет покрытия — подставляется, пока цвет кровли не выбрали сами. */
export const ROOF_COVER_COLOR = { tiles: '#a8553b', seam: '#5a5f66', profsheet: '#5c6b78', slate: '#9da3a6', ondulin: '#7a3f3a', membrane: '#8d9297', sedum: '#7fa35c' };

const coversFor = (roof) => (roof.type === 'flat' ? FLAT_COVERS : PITCHED_COVERS);

/** Покрытие крыши с учётом её вида: у плоской — мембрана, у скатной — металлочерепица. */
export function roofCover(roof) {
  const list = coversFor(roof);
  return list.includes(roof.cover) ? roof.cover : list[0];
}

/** Покрытия для выпадающего списка: { id: название }. */
export function roofCoverOptions(roof) {
  return Object.fromEntries(coversFor(roof).map((id) => [id, ROOF_COVERS[id]]));
}

/** Сменить покрытие; цвет меняется вместе с ним, если его не выбирали сами. */
export function setRoofCover(roof, cover) {
  const stock = [COLORS.roof, ...Object.values(ROOF_COVER_COLOR)].map((c) => c.toLowerCase());
  const own = roof.color && !stock.includes(String(roof.color).toLowerCase());
  roof.cover = cover;
  if (!own) roof.color = ROOF_COVER_COLOR[cover] || COLORS.roof;
}
