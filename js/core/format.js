/** Форматирование чисел для интерфейса (русская запятая, метры). */

const nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

/** 3.456 → «3,46 м» */
export function fmtLen(meters) {
  return `${nf2.format(meters)} м`;
}

/** Отметка со знаком: 0.45 → «+0,45», −2.35 → «−2,35» */
export function fmtElev(meters) {
  const v = Math.round(meters * 100) / 100;
  return `${v < 0 ? '−' : '+'}${nf2.format(Math.abs(v))}`;
}

/** Без единиц: 3.456 → «3,46» */
export function fmtLenShort(meters) {
  return nf2.format(meters);
}

/** 12.345 → «12,3 м²» */
export function fmtArea(m2) {
  return `${nf1.format(m2)} м²`;
}

/** 37.4 → «37°» */
export function fmtAngle(deg) {
  return `${nf0.format(deg)}°`;
}

/** Площадь участка в сотках: 600 → «6 сот.» */
export function fmtSotki(m2) {
  return `${nf1.format(m2 / 100)} сот.`;
}

/** Округление до шага (по умолчанию 1 мм), чтобы не копить ошибки float. */
export function round(value, step = 0.001) {
  return Math.round(value / step) * step;
}
