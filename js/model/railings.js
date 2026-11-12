/**
 * Перила и ограждения: стиль, высота, цвет. Общие для лестниц (stair.railStyle,
 * railHeight, railColor), ограждения проёма над лестницей и предметов «Ограждение».
 */
export const RAIL_STYLES = {
  bars: { name: 'Балясины металлические', rail: '#7a5a3f', fill: '#3d4146' },
  wood: { name: 'Деревянные балясины', rail: '#8a6a4a', fill: '#8a6a4a' },
  horizontal: { name: 'Ригели (горизонтальные)', rail: '#3d4146', fill: '#3d4146' },
  glass: { name: 'Стекло', rail: '#9aa1a8', fill: '#9aa1a8' },
  forged: { name: 'Кованые', rail: '#2f3134', fill: '#2f3134' },
};

export const RAIL_STYLE_NAMES = Object.fromEntries(Object.entries(RAIL_STYLES).map(([k, v]) => [k, v.name]));
export const RAIL_HEIGHT_DEFAULT = 0.9;

const isColor = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

/**
 * Вид перил объекта (лестницы или ограждения).
 * @returns {{ style, height, rail, fill }} rail — цвет поручня, fill — стоек и заполнения
 */
export function railLook(obj = {}, def = {}) {
  const style = RAIL_STYLES[obj.railStyle] ? obj.railStyle : RAIL_STYLES[def.style] ? def.style : 'bars';
  const s = RAIL_STYLES[style];
  const own = isColor(obj.railColor) ? obj.railColor : null;
  const h = Number(obj.railHeight);
  return {
    style,
    height: h >= 0.5 && h <= 1.5 ? h : def.height || RAIL_HEIGHT_DEFAULT,
    // свой цвет — поручню; у дерева, ригелей и ковки — всему ограждению
    rail: own || s.rail,
    fill: own && style !== 'bars' && style !== 'glass' ? own : s.fill,
  };
}
