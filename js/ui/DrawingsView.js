/**
 * «Чертежи»: листы А4 (альбомные) для печати или сохранения в PDF через
 * системный диалог печати. Масштабы стандартные, при печати в 100% размеры
 * на бумаге соответствуют масштабу листа.
 */
import { h, icon } from './dom.js';
import { computeEstimate, estimateTotal, priceOf } from '../model/estimate.js';
import { loadPrices, money } from './EstimateDialog.js';
import { houseBBox, pickScale, renderPlanImage, planExtras, sectionPlan, facadeViews, render3DViews, frontAzimuth } from '../app/drawings.js';
import { groundLevel } from '../model/project.js';
import { bboxOf } from '../core/geometry.js';

/** Область чертежа на листе А4 альбомном (мм). */
const AREA = { w: 277, h: 156 };
const nf2 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

const tick = () => new Promise((r) => setTimeout(r, 0));

export class DrawingsView {
  constructor(app) {
    this.app = app;
    this.root = null;
  }

  async open() {
    const { app } = this;
    const project = app.project;
    const bbox = houseBBox(project);
    if (!bbox || !project.walls.length) {
      app.toast('Сначала нарисуйте стены — чертить пока нечего', 'warn');
      return;
    }
    this.close();
    const status = h('span', { class: 'print-status' }, 'Готовлю листы…');
    const pagesEl = h('div', { class: 'print-pages' });
    const printBtn = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => window.print() }, icon('print', 18), 'Печать или PDF');
    const bar = h(
      'div',
      { class: 'print-bar' },
      h('strong', {}, 'Чертежи'),
      status,
      h('span', { class: 'print-tip muted' }, 'Бумага А4, альбомная, масштаб 100% — тогда масштабы листов точные. Для PDF выберите «Сохранить как PDF».'),
      h('div', { class: 'print-actions' }, printBtn, h('button', { class: 'btn btn-ghost', onclick: () => this.close() }, icon('close', 18), 'Закрыть')),
    );
    this.root = h('div', { id: 'print-root', class: 'print-root', role: 'dialog', 'aria-label': 'Чертежи для печати' }, bar, pagesEl);
    document.body.append(this.root);
    document.body.classList.add('print-drawings');
    this._onKey = (e) => e.key === 'Escape' && this.close();
    document.addEventListener('keydown', this._onKey);
    app.modalOpen = true;
    await tick();

    try {
      const sheets = await this._build(project, bbox, (t) => (status.textContent = t));
      const total = sheets.length;
      sheets.forEach((s, i) => pagesEl.append(this._sheet(project, s, i + 1, total)));
      status.textContent = `${total} ${total < 5 ? 'листа' : 'листов'}`;
      printBtn.disabled = false;
      this._fit(pagesEl);
      this._onResize = () => this._fit(pagesEl);
      window.addEventListener('resize', this._onResize);
    } catch (err) {
      console.error(err);
      status.textContent = `Не получилось: ${err.message}`;
    }
  }

  close() {
    if (!this.root) return;
    this.root.remove();
    this.root = null;
    document.body.classList.remove('print-drawings');
    document.removeEventListener('keydown', this._onKey);
    window.removeEventListener('resize', this._onResize);
    this.app.modalOpen = false;
  }

  /** На экране листы уменьшаются под ширину окна, при печати — 1:1. */
  _fit(pagesEl) {
    const sheetPx = (297 / 25.4) * 96;
    const k = Math.min(1, (window.innerWidth - 24) / sheetPx);
    pagesEl.style.zoom = String(k);
  }

  async _build(project, bbox, progress) {
    const app = this.app;
    const est = computeEstimate(project);
    const prices = loadPrices();
    const ground = groundLevel(project);
    const pad = 1.9; // место под размерные линии и марки
    const scale = pickScale(bbox.w + pad * 2, bbox.h + pad * 2, AREA.w, AREA.h);
    const center = { x: (bbox.minX + bbox.maxX) / 2, y: (bbox.minY + bbox.maxY) / 2 };
    const roomNos = new Map(est.rooms.map((r) => [r.id, r.no]));
    const sec = sectionPlan(project, bbox);
    const sheets = [];

    // фасады, разрез и перспектива — одним 3D-проходом
    progress('Фасады и разрез…');
    await tick();
    const fv = facadeViews(project);
    const extent = Math.hypot(bbox.w, bbox.h);
    const height = est.summary.ridge + 2.2 + (project.levels.some((l) => l.kind === 'basement') ? 3.5 : 0);
    const scale3 = pickScale(extent + 2.4, height, AREA.w - 32, AREA.h);
    const shots = await render3DViews(app, [...fv, { kind: 'section', p: sec.p, n: sec.n }, { kind: 'persp', azimuth: frontAzimuth(project) }], { scale: scale3, widthMm: AREA.w - 32, heightMm: AREA.h });
    const persp = shots.pop();
    const secShot = shots.pop();

    // титульный
    sheets.push({ title: 'Общие данные', kind: 'cover', persp, est });

    for (const level of project.levels) {
      progress(`План: ${level.name}…`);
      await tick();
      const url = renderPlanImage(app, level.id, {
        scale,
        center,
        widthMm: AREA.w,
        heightMm: AREA.h,
        extras: planExtras(project, level.id, { marks: est.marks, roomNos, section: level.id === ground.id ? sec : null }),
      });
      sheets.push({ title: `План: ${level.name}`, scale, img: { url, wMm: AREA.w, hMm: AREA.h } });
    }

    if (project.site?.boundary?.length > 2) {
      progress('План участка…');
      await tick();
      const sb = bboxOf(project.site.boundary);
      const sscale = pickScale(sb.w + 4, sb.h + 4, AREA.w, AREA.h);
      const url = renderPlanImage(app, ground.id, { scale: sscale, center: { x: (sb.minX + sb.maxX) / 2, y: (sb.minY + sb.maxY) / 2 }, widthMm: AREA.w, heightMm: AREA.h, settings: { dims: false }, noSite: false });
      sheets.push({ title: 'Схема участка', scale: sscale, img: { url, wMm: AREA.w, hMm: AREA.h } });
    }

    fv.forEach((v, i) => sheets.push({ title: v.title, scale: scale3, img: shots[i] }));
    sheets.push({ title: 'Разрез 1–1', scale: scale3, img: secShot, note: 'Линия разреза показана на плане первого этажа.' });

    // экспликация помещений
    const rows = est.rooms.map((r) => [r.no, r.level, r.name, `${nf2.format(r.area)} м²`, r.floor, r.heated ? 'да' : '', r.windows]);
    const totalArea = est.rooms.reduce((a, r) => a + r.area, 0);
    chunk(rows, 20).forEach((part, i, all) =>
      sheets.push({
        title: all.length > 1 ? `Экспликация помещений (${i + 1})` : 'Экспликация помещений',
        table: { head: ['№', 'Этаж', 'Помещение', 'Площадь', 'Пол', 'Тёплый пол', 'Окна на'], rows: part, foot: i === all.length - 1 ? ['', '', 'Всего', `${nf2.format(totalArea)} м²`, '', '', ''] : null, num: [3] },
      }),
    );

    // ведомость проёмов
    const orows = est.openings.map((o) => [o.mark, o.name, `${nf2.format(o.width)} × ${nf2.format(o.height)}`, o.sill == null ? '' : `${nf2.format(o.sill)}`, String(o.count), `${nf2.format(o.area)} м²`, o.levels]);
    chunk(orows, 18).forEach((part, i, all) =>
      sheets.push({
        title: all.length > 1 ? `Ведомость проёмов (${i + 1})` : 'Ведомость проёмов',
        table: { head: ['Марка', 'Наименование', 'Ш × В, м', 'Подоконник, м', 'Кол-во', 'Площадь', 'Этажи'], rows: part, num: [4, 5] },
      }),
    );

    // сводка сметы
    const srows = est.sections.map((s) => [s.title, money(s.rows.reduce((a, r) => a + r.qty * priceOf(prices, r.key), 0))]);
    const total = estimateTotal(est, prices);
    sheets.push({
      title: 'Сводка сметы',
      table: { head: ['Раздел', 'Сумма'], rows: srows, foot: ['Итого', money(total)], num: [1] },
      note: `Ориентировочно, по ценам из окна «Смета» (их можно поправить). ${est.summary.total > 0 ? `≈ ${money(total / est.summary.total)} за м² общей площади.` : ''} Подробная смета — выгрузка в Excel.`,
    });
    sheets[0].contents = sheets.map((x) => x.title);
    return sheets;
  }

  _sheet(project, s, no, total) {
    const date = new Date().toLocaleDateString('ru-RU');
    let body;
    if (s.kind === 'cover') {
      const sm = s.est.summary;
      const kv = (k, v) => h('tr', {}, h('td', {}, k), h('td', { class: 'num' }, v));
      body = h(
        'div',
        { class: 'sheet-cover' },
        h(
          'div',
          { class: 'cover-left' },
          h('h1', {}, project.name || 'Проект дома'),
          h('p', { class: 'muted' }, `Эскизный проект · ${date}`),
          h(
            'table',
            { class: 'sheet-table cover-kv' },
            h(
              'tbody',
              {},
              kv('Площадь застройки', `${nf2.format(sm.built)} м²`),
              kv('Общая площадь', `${nf2.format(sm.total)} м²`),
              kv('Жилая площадь', `${nf2.format(sm.living)} м²`),
              kv('Этажность', `${sm.floors}${sm.basement ? ' + подвал' : ''}`),
              kv('Высота до конька', `${nf2.format(sm.ridge)} м`),
              kv('Площадь участка', `${nf2.format(sm.site)} м²`),
            ),
          ),
          h('p', { class: 'cover-note muted' }, 'За отметку ±0,000 принят уровень чистого пола первого этажа. Размеры — в метрах.'),
          s.contents ? h('div', { class: 'cover-contents' }, h('strong', {}, 'Состав листов'), h('ol', {}, s.contents.map((t) => h('li', {}, t)))) : null,
        ),
        h('div', { class: 'cover-right' }, s.persp ? h('img', { src: s.persp.url, alt: 'Общий вид', class: 'cover-img' }) : null),
      );
    } else if (s.table) {
      const t = s.table;
      body = h(
        'div',
        { class: 'sheet-tablewrap' },
        h(
          'table',
          { class: 'sheet-table' },
          h('thead', {}, h('tr', {}, t.head.map((x, i) => h('th', { class: t.num?.includes(i) ? 'num' : '' }, x)))),
          h(
            'tbody',
            {},
            t.rows.map((r) => h('tr', {}, r.map((x, i) => h('td', { class: t.num?.includes(i) ? 'num' : '' }, x ?? '')))),
            t.foot ? h('tr', { class: 'foot' }, t.foot.map((x, i) => h('td', { class: t.num?.includes(i) ? 'num' : '' }, x))) : null,
          ),
        ),
        s.note ? h('p', { class: 'muted sheet-note' }, s.note) : null,
      );
    } else {
      body = h(
        'div',
        { class: 'sheet-figure' },
        h('img', { src: s.img.url, alt: s.title, style: { width: `${s.img.wMm}mm`, height: `${s.img.hMm}mm` } }),
        s.note ? h('p', { class: 'muted sheet-note' }, s.note) : null,
      );
    }
    return h(
      'section',
      { class: 'sheet' },
      h('div', { class: 'sheet-body' }, body),
      h(
        'div',
        { class: 'sheet-stamp' },
        h('div', { class: 'st-proj' }, h('small', {}, 'Проект'), project.name || 'Проект дома'),
        h('div', { class: 'st-title' }, h('small', {}, 'Лист'), s.title),
        h('div', {}, h('small', {}, 'Масштаб'), s.scale ? `1:${s.scale}` : '—'),
        h('div', {}, h('small', {}, 'Лист'), `${no} из ${total}`),
        h('div', {}, h('small', {}, 'Дата'), date),
        h('div', { class: 'st-brand' }, 'HousePlan'),
      ),
    );
  }
}

function chunk(arr, n) {
  if (!arr.length) return [[]];
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
