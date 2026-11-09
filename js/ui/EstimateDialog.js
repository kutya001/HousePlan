/**
 * «Смета и спецификации»: объёмы и примерная стоимость (цены можно править —
 * они запоминаются в браузере), экспликация помещений, ведомость проёмов,
 * выгрузка всего в Excel.
 */
import { h, icon } from './dom.js';
import { openModal } from './feedback.js';
import { computeEstimate, priceOf, estimateTotal, PRICE_DEFAULTS, CURRENCY } from '../model/estimate.js';
import { estimateWorkbook } from '../io/estimateXlsx.js';
import { download, safeName } from '../io/fileio.js';

const PRICES_KEY = 'houseplan.prices.v1';

export function loadPrices() {
  try {
    return JSON.parse(localStorage.getItem(PRICES_KEY) || '{}');
  } catch {
    return {};
  }
}

function savePrices(p) {
  try {
    localStorage.setItem(PRICES_KEY, JSON.stringify(p));
  } catch {
    /* хранилище недоступно — цены останутся до закрытия */
  }
}

const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
export const money = (v) => `${nf0.format(Math.round(v))} ${CURRENCY}`;
const qty = (v) => nf2.format(v);

export class EstimateDialog {
  constructor(app) {
    this.app = app;
  }

  open(tab = 'cost') {
    const { app } = this;
    const est = computeEstimate(app.project);
    const prices = loadPrices();

    // ── Смета ──
    const totalEl = h('strong', { class: 'est-total-sum' });
    const perM2 = h('span', { class: 'muted' });
    const sync = () => {
      const t = estimateTotal(est, prices);
      totalEl.textContent = money(t);
      perM2.textContent = est.summary.total > 0 ? `≈ ${money(t / est.summary.total)} за м² общей площади` : '';
    };
    const body = h('tbody');
    for (const sec of est.sections) {
      const subEl = h('td', { class: 'num' });
      const sub = () => (subEl.textContent = money(sec.rows.reduce((s, r) => s + r.qty * priceOf(prices, r.key), 0)));
      body.append(h('tr', { class: 'est-sec' }, h('td', { colspan: 4 }, sec.title), subEl));
      for (const r of sec.rows) {
        const sumEl = h('td', { class: 'num' });
        const upd = () => (sumEl.textContent = money(r.qty * priceOf(prices, r.key)));
        const input = h('input', {
          type: 'number',
          min: 0,
          step: 10,
          class: 'est-price',
          value: priceOf(prices, r.key),
          'aria-label': `Цена: ${r.name}`,
          oninput: (e) => {
            const v = Number(e.target.value);
            if (!Number.isFinite(v) || v < 0) return;
            if (v === PRICE_DEFAULTS[r.key]) delete prices[r.key];
            else prices[r.key] = v;
            savePrices(prices);
            input.classList.toggle('changed', prices[r.key] != null);
            upd();
            sub();
            sync();
          },
        });
        input.classList.toggle('changed', prices[r.key] != null);
        body.append(
          h(
            'tr',
            {},
            h('td', {}, r.name, r.note ? h('small', { class: 'muted' }, r.note) : null),
            h('td', { class: 'num' }, qty(r.qty)),
            h('td', {}, r.unit),
            h('td', { class: 'num' }, input),
            sumEl,
          ),
        );
        upd();
      }
      sub();
    }
    const cost = h(
      'div',
      { class: 'est-pane' },
      h('p', { class: 'muted est-note' }, `Ориентировочный расчёт по модели: объёмы считаются по стенам, перекрытиям, крыше и комнатам. Цены — в сомах за единицу, их можно поправить (запоминаются в этом браузере).`),
      h(
        'div',
        { class: 'est-scroll' },
        h(
          'table',
          { class: 'est-table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Наименование'), h('th', { class: 'num' }, 'Кол-во'), h('th', {}, 'Ед.'), h('th', { class: 'num' }, `Цена, ${CURRENCY}`), h('th', { class: 'num' }, 'Сумма'))),
          body,
        ),
      ),
      h('div', { class: 'est-total' }, h('span', {}, 'Итого'), totalEl, perM2),
    );

    // ── Показатели ──
    const s = est.summary;
    const kv = (k, v) => h('div', { class: 'est-kv' }, h('span', { class: 'muted' }, k), h('strong', {}, v));
    const m2 = (v) => `${qty(v)} м²`;
    const facts = h(
      'div',
      { class: 'est-facts' },
      kv('Площадь застройки', m2(s.built)),
      kv('Общая площадь', m2(s.total)),
      kv('Жилая площадь', m2(s.living)),
      kv('Этажей над землёй', String(s.floors) + (s.basement ? ' + подвал' : '')),
      kv('Высота до конька', `${qty(s.ridge)} м`),
      kv('Площадь кровли', m2(s.roof)),
      kv('Площадь окон', m2(s.windows) + (s.total ? ` · ${Math.round((s.windows / s.total) * 100)}% пола` : '')),
      kv('Участок', m2(s.site)),
    );

    // ── Помещения ──
    const rooms = h(
      'div',
      { class: 'est-pane' },
      h(
        'div',
        { class: 'est-scroll' },
        h(
          'table',
          { class: 'est-table' },
          h('thead', {}, h('tr', {}, ...['№', 'Этаж', 'Помещение', 'Площадь', 'Пол', 'Тёплый пол', 'Окна на'].map((t, i) => h('th', { class: i === 3 ? 'num' : '' }, t)))),
          h(
            'tbody',
            {},
            est.rooms.map((r) => h('tr', {}, h('td', {}, r.no), h('td', {}, r.level), h('td', {}, r.name), h('td', { class: 'num' }, m2(r.area)), h('td', {}, r.floor), h('td', {}, r.heated ? 'да' : ''), h('td', {}, r.windows))),
            h('tr', { class: 'est-sec' }, h('td', { colspan: 3 }, 'Всего'), h('td', { class: 'num' }, m2(est.rooms.reduce((a, r) => a + r.area, 0))), h('td', { colspan: 3 })),
          ),
        ),
      ),
    );

    // ── Проёмы ──
    const ops = h(
      'div',
      { class: 'est-pane' },
      h('p', { class: 'muted est-note' }, 'Одинаковые проёмы — одна марка. Марки подписаны на чертежах планов.'),
      h(
        'div',
        { class: 'est-scroll' },
        h(
          'table',
          { class: 'est-table' },
          h('thead', {}, h('tr', {}, ...['Марка', 'Наименование', 'Ш × В, м', 'Подоконник', 'Кол-во', 'Площадь', 'Этажи'].map((t, i) => h('th', { class: i >= 4 && i <= 5 ? 'num' : '' }, t)))),
          h(
            'tbody',
            {},
            est.openings.map((o) =>
              h(
                'tr',
                {},
                h('td', {}, h('strong', {}, o.mark)),
                h('td', {}, o.name),
                h('td', {}, `${qty(o.width)} × ${qty(o.height)}`),
                h('td', {}, o.sill == null ? '' : `${qty(o.sill)} м`),
                h('td', { class: 'num' }, String(o.count)),
                h('td', { class: 'num' }, m2(o.area)),
                h('td', {}, o.levels),
              ),
            ),
          ),
        ),
      ),
    );

    const panes = { cost, facts: h('div', { class: 'est-pane' }, facts), rooms, ops };
    const tabs = h('div', { class: 'seg modal-tabs', role: 'tablist' });
    const show = (id) => {
      for (const [k, el] of Object.entries(panes)) el.hidden = k !== id;
      for (const b of tabs.children) b.classList.toggle('active', b.dataset.tab === id);
    };
    for (const [id, label, ic] of [
      ['cost', 'Смета', 'calc'],
      ['facts', 'Показатели', 'ruler'],
      ['rooms', 'Помещения', 'room'],
      ['ops', 'Проёмы', 'door'],
    ]) {
      tabs.append(h('button', { class: 'seg-btn', role: 'tab', dataset: { tab: id }, onclick: () => show(id) }, icon(ic, 18), label));
    }
    sync();
    const content = h('div', { class: 'est' }, tabs, ...Object.values(panes));
    openModal(app, {
      title: 'Смета и спецификации',
      content,
      wide: true,
      actions: [
        {
          label: 'Сбросить цены',
          onClick: () => {
            savePrices({});
            setTimeout(() => this.open('cost'), 0);
          },
        },
        { label: 'Чертежи (PDF)', onClick: () => app.ui.drawings?.open() },
        {
          label: 'Скачать Excel',
          primary: true,
          onClick: () => {
            const data = estimateWorkbook(app.project, est, prices);
            download(`${safeName(app.project.name)} — смета.xlsx`, new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
            app.toast('Смета выгружена в Excel');
            return false;
          },
        },
      ],
    });
    show(tab);
  }
}
