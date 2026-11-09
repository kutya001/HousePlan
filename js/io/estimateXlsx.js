/** Книга Excel по смете: смета с формулами, показатели, помещения, проёмы. */
import { buildXlsx } from './xlsx.js';
import { priceOf, CURRENCY } from '../model/estimate.js';

export function estimateWorkbook(project, est, prices) {
  const name = project.name || 'Проект';
  const date = new Date().toLocaleDateString('ru-RU');

  // ── Смета ──
  const rows = [
    [null, { v: `Смета: ${name}`, s: 't' }],
    [null, { v: `Ориентировочный расчёт от ${date}. Цены в сомах за единицу — поправьте под своих поставщиков и подрядчиков.`, s: 'i' }],
    [],
    ['№', 'Наименование', 'Кол-во', 'Ед.', `Цена, ${CURRENCY}`, `Сумма, ${CURRENCY}`, 'Примечание'].map((v) => ({ v, s: 'h' })),
  ];
  const subtotals = [];
  let n = 0;
  for (const sec of est.sections) {
    rows.push([null, { v: sec.title, s: 'b' }]);
    const first = rows.length + 1;
    for (const r of sec.rows) {
      n++;
      const i = rows.length + 1;
      const price = priceOf(prices, r.key);
      rows.push([n, r.name, { v: r.qty, s: 'n' }, r.unit, { v: price, s: 'm' }, { v: Math.round(r.qty * price), f: `C${i}*E${i}`, s: 'm' }, r.note || null]);
    }
    const last = rows.length;
    const i = rows.length + 1;
    const sum = sec.rows.reduce((s, r) => s + r.qty * priceOf(prices, r.key), 0);
    rows.push([null, { v: 'Итого по разделу', s: 'b' }, null, null, null, { v: Math.round(sum), f: `SUM(F${first}:F${last})`, s: 'mb' }]);
    subtotals.push(`F${i}`);
    rows.push([]);
  }
  const total = est.sections.reduce((s, sec) => s + sec.rows.reduce((a, r) => a + r.qty * priceOf(prices, r.key), 0), 0);
  rows.push([null, { v: 'ВСЕГО', s: 'b' }, null, null, null, { v: Math.round(total), f: subtotals.join('+') || '0', s: 'mb' }]);
  const totalCell = `F${rows.length}`;
  if (est.summary.total > 0) {
    rows.push([null, 'За 1 м² общей площади', null, null, null, { v: Math.round(total / est.summary.total), f: `${totalCell}/${est.summary.total}`, s: 'm' }]);
  }

  // ── Показатели ──
  const s = est.summary;
  const info = [
    [{ v: `Основные показатели: ${name}`, s: 't' }],
    [],
    [{ v: 'Показатель', s: 'h' }, { v: 'Значение', s: 'h' }, { v: 'Ед.', s: 'h' }],
    ['Площадь застройки', { v: s.built, s: 'n' }, 'м²'],
    ['Общая площадь помещений', { v: s.total, s: 'n' }, 'м²'],
    ['Жилая площадь', { v: s.living, s: 'n' }, 'м²'],
    ['Надземных этажей', s.floors, 'шт'],
    ['Подвал или цоколь', s.basement ? 'есть' : 'нет', null],
    ['Высота до конька от земли', { v: s.ridge, s: 'n' }, 'м'],
    ['Площадь кровли', { v: s.roof, s: 'n' }, 'м²'],
    ['Площадь окон', { v: s.windows, s: 'n' }, 'м²'],
    ['Площадь участка', { v: s.site, s: 'n' }, 'м²'],
  ];

  // ── Помещения ──
  const rooms = [
    [{ v: 'Экспликация помещений', s: 't' }],
    [],
    ['№', 'Этаж', 'Помещение', 'Площадь, м²', 'Пол', 'Тёплый пол', 'Окна на'].map((v) => ({ v, s: 'h' })),
  ];
  const r0 = rooms.length + 1;
  for (const r of est.rooms) rooms.push([r.no, r.level, r.name, { v: r.area, s: 'n' }, r.floor, r.heated ? 'да' : '', r.windows || '']);
  const r1 = rooms.length;
  rooms.push([null, null, { v: 'Всего', s: 'b' }, { v: est.rooms.reduce((a, r) => a + r.area, 0), f: `SUM(D${r0}:D${r1})`, s: 'n' }]);

  // ── Проёмы ──
  const ops = [
    [{ v: 'Ведомость проёмов', s: 't' }],
    [],
    ['Марка', 'Наименование', 'Ширина, м', 'Высота, м', 'Подоконник, м', 'Кол-во', 'Площадь, м²', 'Этажи'].map((v) => ({ v, s: 'h' })),
  ];
  const o0 = ops.length + 1;
  for (const o of est.openings) {
    const i = ops.length + 1;
    ops.push([o.mark, o.name, { v: o.width, s: 'n' }, { v: o.height, s: 'n' }, o.sill == null ? null : { v: o.sill, s: 'n' }, o.count, { v: o.area, f: `C${i}*D${i}*F${i}`, s: 'n' }, o.levels]);
  }
  const o1 = ops.length;
  ops.push([null, { v: 'Всего', s: 'b' }, null, null, null, { v: est.openings.reduce((a, o) => a + o.count, 0), f: `SUM(F${o0}:F${o1})` }, { v: est.openings.reduce((a, o) => a + o.area, 0), f: `SUM(G${o0}:G${o1})`, s: 'n' }]);

  return buildXlsx([
    { name: 'Смета', cols: [5, 58, 11, 6, 12, 15, 34], rows, freeze: 4 },
    { name: 'Показатели', cols: [34, 14, 6], rows: info },
    { name: 'Помещения', cols: [6, 18, 28, 13, 14, 11, 14], rows: rooms, freeze: 3 },
    { name: 'Проёмы', cols: [8, 40, 11, 11, 14, 8, 13, 30], rows: ops, freeze: 3 },
  ]);
}
