/**
 * Варианты проекта: сохранить текущий как вариант, открыть сохранённый
 * (с отменой), сравнить площади, комнаты и смету бок о бок.
 * Варианты хранятся в этом браузере (IndexedDB), отдельно от файла проекта.
 */
import { h, icon } from './dom.js';
import { openModal } from './feedback.js';
import { idbAll, idbSet, idbDel } from '../io/idb.js';
import { projectMetrics } from '../model/compare.js';
import { loadPrices } from './EstimateDialog.js';
import { planThumb } from '../app/drawings.js';
import { uid } from '../core/ids.js';

const MAX = 8;
const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const fmt = (m) => (m.unit === 'сом' ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(m.value)} сом` : `${nf.format(m.value)}${m.unit ? ` ${m.unit}` : ''}`);

export async function listVariants() {
  const all = await idbAll('variants');
  return all.map((x) => x.value).sort((a, b) => a.savedAt - b.savedAt);
}

export class VariantsDialog {
  constructor(app) {
    this.app = app;
    this.close = null;
  }

  async saveCurrent(name) {
    const { app } = this;
    const list = await listVariants();
    if (list.length >= MAX) {
      app.toast(`Вариантов уже ${MAX} — удалите ненужный`, 'warn');
      return null;
    }
    const v = {
      id: uid('var'),
      name: (name || '').trim() || `Вариант ${list.length + 1}`,
      savedAt: Date.now(),
      project: JSON.parse(JSON.stringify(app.project)),
      thumb: planThumb(app),
    };
    try {
      await idbSet('variants', v.id, v);
    } catch (err) {
      app.toast(`Не удалось сохранить вариант: ${err.message}`, 'warn');
      return null;
    }
    app.toast(`Сохранён вариант «${v.name}»`);
    return v;
  }

  async open() {
    const { app } = this;
    this.close?.();
    const list = await listVariants();
    const prices = loadPrices();
    const current = { id: null, name: 'Сейчас на экране', project: app.project, thumb: null, current: true };
    const cols = [current, ...list];
    const metrics = cols.map((c) => projectMetrics(c.project, prices));

    const nameInput = h('input', { type: 'text', class: 'input var-name', placeholder: `Вариант ${list.length + 1}`, 'aria-label': 'Название варианта', maxlength: 60 });
    const saveBtn = h(
      'button',
      {
        class: 'btn btn-primary',
        onclick: async () => {
          saveBtn.disabled = true;
          const v = await this.saveCurrent(nameInput.value);
          saveBtn.disabled = false;
          if (v) this.open();
        },
      },
      icon('save', 18),
      'Сохранить текущий как вариант',
    );

    const cards = h(
      'div',
      { class: 'var-cards' },
      list.length
        ? list.map((v) => this._card(v))
        : h('p', { class: 'muted' }, 'Сохраните текущий проект как вариант, поменяйте планировку и сохраните ещё один — здесь появится сравнение.'),
    );

    // таблица сравнения: строки — показатели, столбцы — варианты
    const best = metrics[0].map((m, i) => {
      if (!m.better || cols.length < 2) return null;
      const vals = metrics.map((ms) => ms[i].value).filter((x) => x > 0);
      if (!vals.length) return null;
      return m.better === 'min' ? Math.min(...vals) : Math.max(...vals);
    });
    const table = h(
      'div',
      { class: 'est-scroll var-compare' },
      h(
        'table',
        { class: 'est-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Показатель'), cols.map((c) => h('th', { class: `num ${c.current ? 'var-cur' : ''}` }, c.name)))),
        h(
          'tbody',
          {},
          metrics[0].map((m, i) =>
            h(
              'tr',
              {},
              h('td', {}, m.label),
              metrics.map((ms, k) => {
                const x = ms[i];
                const isBest = best[i] != null && x.value === best[i] && metrics.some((o) => o[i].value !== x.value);
                return h('td', { class: `num ${isBest ? 'var-best' : ''} ${cols[k].current ? 'var-cur' : ''}` }, fmt(x));
              }),
            ),
          ),
        ),
      ),
    );

    const content = h(
      'div',
      { class: 'var' },
      h('div', { class: 'var-save' }, nameInput, saveBtn),
      cards,
      list.length ? h('h3', { class: 'var-h' }, 'Сравнение') : null,
      list.length ? table : null,
      list.length ? h('p', { class: 'muted var-note' }, 'Зелёным — лучшее значение среди вариантов. Смета — по ценам из окна «Смета». Варианты хранятся в этом браузере; чтобы перенести на другое устройство, откройте вариант и сохраните проект в файл.') : null,
    );
    const m = openModal(app, { title: 'Варианты проекта', content, wide: true, onClose: () => (this.close = null) });
    this.close = m.close;
  }

  _card(v) {
    const { app } = this;
    const date = new Date(v.savedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const title = h('strong', { class: 'var-title' }, v.name);
    return h(
      'div',
      { class: 'var-card' },
      v.thumb ? h('img', { src: v.thumb, alt: '', class: 'var-thumb' }) : h('div', { class: 'var-thumb' }),
      h('div', { class: 'var-meta' }, title, h('span', { class: 'muted' }, date)),
      h(
        'div',
        { class: 'var-actions' },
        h(
          'button',
          {
            class: 'btn btn-small',
            onclick: async () => {
              if (!(await app.confirm(`Открыть вариант «${v.name}»? Текущий проект заменится — вернуть можно отменой (Ctrl+Z) или сохранив его вариантом заранее.`, 'Открыть'))) return;
              app.commands.loadProject(v.project);
              this.close?.();
              app.toast(`Открыт вариант «${v.name}»`, 'info', { action: { label: 'Отменить', onClick: () => app.commands.undo() } });
            },
          },
          icon('open', 16),
          'Открыть',
        ),
        h(
          'button',
          {
            class: 'icon-btn',
            'aria-label': 'Переименовать',
            'data-tip': 'Переименовать',
            onclick: () => {
              // переименование прямо в карточке: Enter или уход фокуса — сохранить, Esc — отмена
              const input = h('input', { type: 'text', class: 'var-rename', value: v.name, maxlength: 60, 'aria-label': 'Название варианта' });
              let done = false;
              const finish = async (save) => {
                if (done) return;
                done = true;
                const next = input.value.trim();
                if (save && next && next !== v.name) {
                  v.name = next;
                  await idbSet('variants', v.id, v);
                }
                title.textContent = v.name;
                input.replaceWith(title);
              };
              input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') finish(true);
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  finish(false);
                }
              });
              input.addEventListener('blur', () => finish(true));
              title.replaceWith(input);
              input.focus();
              input.select();
            },
          },
          icon('file', 16),
        ),
        h(
          'button',
          {
            class: 'icon-btn',
            'aria-label': 'Удалить',
            'data-tip': 'Удалить вариант',
            onclick: async () => {
              if (!(await app.confirm(`Удалить вариант «${v.name}»?`, 'Удалить'))) return;
              await idbDel('variants', v.id);
              this.open();
            },
          },
          icon('trash', 16),
        ),
      ),
    );
  }
}
