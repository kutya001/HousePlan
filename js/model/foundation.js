/**
 * Фундамент: вид, отделка цоколя и отмостка — свойства проекта.
 *
 *  project.foundation     — высота цоколя над землёй (пол первого этажа), м;
 *  project.foundationType — вид фундамента (id из FOUNDATION_TYPES);
 *  project.plinthFinish   — отделка цоколя (id из PLINTH_FINISHES);
 *  project.plinthColor    — свой цвет цоколя (null — цвет отделки);
 *  project.blindArea      — ширина отмостки вокруг дома, м (0 — без неё).
 *
 * Если нижний этаж — подвал или цокольный, фундаментом служат его стены и плита:
 * вид фундамента тогда не используется (отделка цоколя и отмостка — действуют).
 */
import { COLORS, DEFAULTS } from './defaults.js';

/**
 * open — под домом просвет (сваи): пол первого этажа — плита, а не засыпка;
 * beam — высота ростверка / обвязки под стенами.
 */
export const FOUNDATION_TYPES = {
  strip: { name: 'Ленточный', hint: 'Бетонная лента под несущими стенами' },
  slab: { name: 'Плитный', hint: 'Монолитная плита под всем домом' },
  piles: { name: 'Свайно-ростверковый', hint: 'Буронабивные сваи и бетонный ростверк', open: true, beam: 0.4 },
  screw: { name: 'Винтовые сваи', hint: 'Стальные сваи и обвязка брусом — для лёгких домов', open: true, beam: 0.2 },
};

/** Отделка цоколя: tex — рисунок (view3d/textures.js), color — цвет по умолчанию. */
export const PLINTH_FINISHES = {
  stone: { name: 'Камень', tex: 'stone', color: COLORS.plinth },
  brick: { name: 'Клинкерный кирпич', tex: 'brick', color: '#8a5646' },
  tile: { name: 'Плитка', tex: 'walltile', color: '#a8a29a' },
  panels: { name: 'Цокольные панели', tex: 'panels', color: '#9a938a' },
  plaster: { name: 'Штукатурка', tex: 'plaster', color: '#b7b2a9' },
  concrete: { name: 'Бетон без отделки', tex: 'concrete', color: '#b1afaa' },
};

/** Ширина отмостки по умолчанию, м. */
export const BLIND_AREA = 0.8;
/** Шаг свай вдоль стен, м. */
export const PILE_STEP = { piles: 2.5, screw: 2 };

const names = (table) => Object.fromEntries(Object.entries(table).map(([k, v]) => [k, v.name]));
export const FOUNDATION_NAMES = names(FOUNDATION_TYPES);
export const PLINTH_NAMES = names(PLINTH_FINISHES);

const isColor = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

/**
 * Фундамент проекта с подставленными умолчаниями.
 * @returns {{ type, info, height, finish, tex, color, blind }}
 */
export function foundationOf(project) {
  const type = FOUNDATION_TYPES[project.foundationType] ? project.foundationType : 'strip';
  const finish = PLINTH_FINISHES[project.plinthFinish] ? project.plinthFinish : 'stone';
  const f = PLINTH_FINISHES[finish];
  const blind = Number.isFinite(project.blindArea) ? Math.max(0, project.blindArea) : BLIND_AREA;
  return {
    type,
    info: FOUNDATION_TYPES[type],
    height: project.foundation ?? DEFAULTS.foundation,
    finish,
    tex: f.tex,
    color: isColor(project.plinthColor) ? project.plinthColor : f.color,
    blind,
  };
}
