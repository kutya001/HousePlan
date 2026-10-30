/** Каталог мебели и объектов участка: поиск, категории, перетаскивание на план. */
import { h, clear } from './dom.js';
import { CATALOG, CATEGORIES } from '../model/catalog.js';
import { drawItemSymbol } from '../editor/render/symbols2d.js';
import { fmtLenShort } from '../core/format.js';

const RECENT_KEY = 'houseplan.recent.v1';

function loadRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter((t) => CATALOG.some((c) => c.type === t));
  } catch {
    return [];
  }
}

export class CatalogPanel {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.recent = loadRecent();
    this.category = this.recent.length ? 'recent' : 'living';
    this.query = '';
    this._build();
    app.bus.on('tool:changed', () => this._syncActive());
    app.bus.on('theme:changed', () => this._renderGrid());
  }

  _build() {
    const search = h('input', {
      type: 'search',
      class: 'catalog-search',
      placeholder: 'Найти: диван, ванна, дерево…',
      'aria-label': 'Поиск по каталогу',
      oninput: (e) => {
        this.query = e.target.value.trim().toLowerCase();
        this._renderGrid();
      },
    });
    this.chips = h(
      'div',
      { class: 'chips', role: 'tablist' },
      [{ id: 'recent', name: 'Недавние' }, ...CATEGORIES].map((c) =>
        h(
          'button',
          {
            class: `chip ${c.id === this.category ? 'active' : ''}`,
            role: 'tab',
            dataset: { cat: c.id },
            onclick: () => {
              this.category = c.id;
              this.query = '';
              search.value = '';
              for (const b of this.chips.children) b.classList.toggle('active', b.dataset.cat === c.id);
              this._renderGrid();
            },
          },
          c.name,
        ),
      ),
    );
    this._syncRecentChip();
    this.grid = h('div', { class: 'catalog-grid' });
    this.root.append(search, this.chips, this.grid, h('p', { class: 'muted small' }, 'Кликните предмет и поставьте на план, или перетащите его мышью. R — повернуть.'));
    this._renderGrid();
  }

  _renderGrid() {
    clear(this.grid);
    const items = this.query
      ? CATALOG.filter((c) => c.name.toLowerCase().includes(this.query))
      : this.category === 'recent'
        ? this.recent.map((t) => CATALOG.find((c) => c.type === t)).filter(Boolean)
        : CATALOG.filter((c) => c.category === this.category);
    if (!items.length) {
      this.grid.append(h('p', { class: 'muted' }, 'Ничего не нашлось. Попробуйте другое слово.'));
      return;
    }
    for (const c of items) {
      const canvas = h('canvas', { width: 128, height: 96, class: 'catalog-thumb', 'aria-hidden': 'true' });
      drawThumb(canvas, c);
      const card = h(
        'button',
        {
          class: 'catalog-card',
          draggable: 'true',
          dataset: { type: c.type },
          title: `${c.name} — ${fmtLenShort(c.w)} × ${fmtLenShort(c.d)} м`,
          onclick: () => this._pick(c.type),
          ondragstart: (e) => {
            e.dataTransfer.setData('text/x-houseplan-item', c.type);
            e.dataTransfer.effectAllowed = 'copy';
          },
        },
        canvas,
        h('span', { class: 'catalog-name' }, c.name),
        h('span', { class: 'catalog-dims' }, `${fmtLenShort(c.w)} × ${fmtLenShort(c.d)}`),
      );
      this.grid.append(card);
    }
    this._syncActive();
  }

  _pick(type) {
    this.app.editor.setTool('item', { type });
    this.recent = [type, ...this.recent.filter((t) => t !== type)].slice(0, 8);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(this.recent));
    } catch {
      /* не критично */
    }
    this._syncRecentChip();
    // на телефоне убираем шторку, чтобы было видно, куда ставить
    if (this.app.state.isPhone) {
      this.app.ui.side.close();
      this.app.bus.emit('hint:show', { text: 'Коснитесь плана и отпустите — предмет встанет туда' });
    }
  }

  _syncRecentChip() {
    const chip = this.chips?.querySelector('[data-cat="recent"]');
    if (chip) chip.hidden = !this.recent.length;
  }

  _syncActive() {
    const tool = this.app.editor.tool;
    const type = tool?.id === 'item' ? tool.settings.type : null;
    for (const card of this.grid.querySelectorAll('.catalog-card')) card.classList.toggle('active', card.dataset.type === type);
  }
}

function drawThumb(canvas, c) {
  const ctx = canvas.getContext('2d');
  const pad = 10;
  const scale = Math.min((canvas.width - pad * 2) / c.w, (canvas.height - pad * 2) / c.d);
  ctx.setTransform(scale, 0, 0, scale, canvas.width / 2, canvas.height / 2);
  drawItemSymbol(ctx, { ...c, x: 0, y: 0, rotation: 0 }, 1.6 / scale);
}
