/**
 * Двери, окна, ворота и проёмы: из чего они состоят и как выглядят.
 *
 * У проёма (project.openings):
 *   kind  — door | window | arch;
 *   style — конструкция (OPENING_STYLES в defaults.js): как открывается, сколько створок;
 *   leaf  — полотно двери (DOOR_LEAVES): глухое, филёнчатое, со стеклом, стеклянное, металлическое;
 *   color — цвет полотна (ворот), frameColor — цвет коробки двери или рамы окна;
 *   transom — фрамуга над дверью, м; sidelight — боковое остекление двери (SIDELIGHTS);
 *   grid — раскладка (шпросы) окна; arched — арочный верх окна.
 * Всего этого может не быть: openingLook() подставляет умолчания, так что старые
 * проекты выглядят как раньше.
 */
import { COLORS } from './defaults.js';

/** Полотно двери. glass — прозрачность (сквозь дверь видно). */
export const DOOR_LEAVES = {
  solid: { name: 'Глухое', color: COLORS.doorLeaf },
  panel: { name: 'Филёнчатое', color: COLORS.doorLeaf },
  glazed: { name: 'Со стеклом', color: COLORS.doorLeaf, glass: 'part' },
  glass: { name: 'Стеклянное', color: '#9aa1a8', glass: 'full' },
  metal: { name: 'Металлическое входное', color: '#4b4f55' },
};

export const SIDELIGHTS = { none: 'Нет', left: 'Слева', right: 'Справа', both: 'С двух сторон' };

/** Ворота: проём для машины, а не для человека. */
const GATES = { garage: { color: '#d7dadd' }, garage_swing: { color: '#6b5a4a' }, garage_roll: { color: '#c9cdd1' } };

export const isGate = (o) => o?.kind === 'door' && !!GATES[o.style];

/** Размеры новой двери по её конструкции: [ширина, высота]. */
export const DOOR_SIZE = { single: [0.9, 2.1], double: [1.4, 2.1], sliding: [1.6, 2.1], fold: [2.4, 2.1], garage: [2.8, 2.3], garage_swing: [2.8, 2.3], garage_roll: [2.8, 2.3] };

const isColor = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const names = (table) => Object.fromEntries(Object.entries(table).map(([k, v]) => [k, v.name]));
export const DOOR_LEAF_NAMES = names(DOOR_LEAVES);

/** Полотно двери: своё или по конструкции (раздвижная — стеклянная, как раньше). */
export function doorLeaf(o) {
  if (DOOR_LEAVES[o.leaf]) return o.leaf;
  return o.style === 'sliding' ? 'glass' : 'solid';
}

/** Ширина бокового остекления двери: не шире трети проёма с каждой стороны. */
export function sidelightWidth(o) {
  const n = o.sidelight === 'both' ? 2 : o.sidelight === 'left' || o.sidelight === 'right' ? 1 : 0;
  if (!n || o.kind !== 'door' || isGate(o)) return { n: 0, w: 0, left: 0, right: 0 };
  const w = Math.min(0.45, Math.max(0.2, o.width * 0.22));
  // на двери должно остаться хотя бы 0,6 м
  if (o.width - n * w < 0.6) return { n: 0, w: 0, left: 0, right: 0 };
  return { n, w, left: o.sidelight !== 'right' ? w : 0, right: o.sidelight !== 'left' ? w : 0 };
}

/** Высота фрамуги: над дверью должно остаться не меньше 1,8 м полотна. */
export function transomHeight(o, height = o.height) {
  if (o.kind !== 'door' || isGate(o) || !(o.transom > 0.05)) return 0;
  return Math.max(0, Math.min(o.transom, height - 1.8));
}

/**
 * Внешний вид проёма с подставленными умолчаниями.
 * @returns {{ leaf, leafColor, frameColor, glass, transom, side, grid, arched, gate }}
 */
export function openingLook(o) {
  const gate = isGate(o);
  const leaf = doorLeaf(o);
  const stock = gate ? GATES[o.style].color : DOOR_LEAVES[leaf].color;
  return {
    gate,
    leaf,
    leafColor: isColor(o.color) ? o.color : stock,
    frameColor: isColor(o.frameColor) ? o.frameColor : COLORS.frame,
    glass: o.kind === 'door' && !gate ? DOOR_LEAVES[leaf].glass || null : null,
    transom: transomHeight(o),
    side: sidelightWidth(o),
    grid: o.kind === 'window' && !!o.grid,
    arched: (o.kind === 'window' && !!o.arched) || (o.kind === 'arch' && o.style === 'arched'),
  };
}

/** Подъём арки над её пятами: полуциркульная, если хватает высоты, иначе пологая. */
export function archRise(width, height) {
  return Math.max(0.05, Math.min(width / 2, height * 0.3));
}

/** Сквозь проём видно соседнюю комнату (стеклянная дверь, окно, открытый проём). */
export function seeThrough(o) {
  if (o.kind !== 'door') return true;
  const look = openingLook(o);
  return look.glass === 'full';
}
