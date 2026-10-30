/**
 * Панель «Свойства / Каталог / Этажи».
 *  ПК — всегда справа; планшет — выезжает справа поверх плана;
 *  телефон — шторка снизу: тяните за ручку, чтобы развернуть или закрыть.
 */
import { h, icon } from './dom.js';
import { LevelsPanel } from './LevelsPanel.js';
import { PropertiesPanel } from './PropertiesPanel.js';
import { CatalogPanel } from './CatalogPanel.js';

const TABS = [
  ['properties', 'Свойства'],
  ['catalog', 'Каталог'],
  ['levels', 'Этажи'],
];

export class SidePanel {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.tab = 'properties';
    const levels = h('section', { class: 'side-levels', id: 'tab-levels', role: 'tabpanel' });
    const tabs = h('div', { class: 'side-tabs', role: 'tablist' });
    const props = h('section', { class: 'side-body', role: 'tabpanel', id: 'tab-properties' });
    const catalog = h('section', { class: 'side-body', role: 'tabpanel', id: 'tab-catalog', hidden: true });
    this.panels = { properties: props, catalog };
    this.tabBtns = {};
    for (const [id, label] of TABS) {
      const b = h(
        'button',
        { class: 'side-tab', role: 'tab', dataset: { tab: id }, 'aria-controls': `tab-${id}`, onclick: () => this.showTab(id) },
        label,
      );
      this.tabBtns[id] = b;
      tabs.append(b);
    }
    this.head = h(
      'div',
      { class: 'sheet-head' },
      h('span', { class: 'sheet-handle', 'aria-hidden': 'true' }),
      tabs,
      h('button', { class: 'icon-btn sheet-close', 'aria-label': 'Закрыть панель', onclick: () => this.close() }, icon('close')),
    );
    root.append(levels, this.head, props, catalog);
    // затемнение под выезжающей панелью (планшет)
    this.backdrop = h('div', { class: 'side-backdrop', onclick: () => this.close() });
    document.body.append(this.backdrop);

    this.levels = new LevelsPanel(app, levels);
    this.properties = new PropertiesPanel(app, props);
    this.catalog = new CatalogPanel(app, catalog);
    this.showTab('properties');
    app.bus.on('selection:changed', ({ selection }) => {
      if (selection.length && app.state.toolId !== 'item' && this.tab === 'catalog') this.showTab('properties');
    });
    app.bus.on('layout:changed', () => this.close());
    this._bindDrag();
  }

  get isOpen() {
    return document.body.classList.contains(this.app.state.isPhone ? 'sheet-open' : 'side-open');
  }

  showTab(id) {
    if (id === 'levels' && !this.app.state.isPhone) id = 'properties';
    this.tab = id;
    this.root.dataset.tab = id;
    for (const [k, el] of Object.entries(this.panels)) el.hidden = k !== id;
    for (const [k, b] of Object.entries(this.tabBtns)) {
      b.classList.toggle('active', k === id);
      b.setAttribute('aria-selected', String(k === id));
    }
  }

  /** Открыть панель на вкладке. size — для шторки телефона: 'half' | 'full'. */
  open(tab = this.tab, size = 'half') {
    const state = this.app.state;
    if (tab === 'levels' && !state.isPhone) {
      this.showTab('properties');
      if (state.compact) document.body.classList.add('side-open');
      this.root.querySelector('.side-levels')?.scrollIntoView({ block: 'nearest' });
      this._emit();
      return;
    }
    this.showTab(tab);
    if (state.isPhone) {
      document.body.classList.add('sheet-open');
      document.body.classList.toggle('sheet-full', size === 'full');
      this.root.style.removeProperty('--sheet-h');
    } else if (state.compact) document.body.classList.add('side-open');
    this._emit();
  }

  close() {
    document.body.classList.remove('sheet-open', 'sheet-full', 'side-open');
    this.root.style.removeProperty('--sheet-h');
    this._emit();
  }

  toggle(tab) {
    if (this.isOpen && (!tab || tab === this.tab)) this.close();
    else this.open(tab || this.tab);
  }

  _emit() {
    this.app.bus.emit('sheet:changed', { open: this.isOpen });
  }

  /** Перетаскивание шторки за шапку (телефон). */
  _bindDrag() {
    const head = this.head;
    let drag = null;
    head.addEventListener('pointerdown', (e) => {
      if (!this.app.state.isPhone || e.target.closest('button')) return;
      const rect = this.root.getBoundingClientRect();
      drag = { y: e.clientY, h: rect.height, moved: false, id: e.pointerId };
      head.setPointerCapture(e.pointerId);
      this.root.classList.add('dragging');
    });
    head.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dy = e.clientY - drag.y;
      if (Math.abs(dy) > 4) drag.moved = true;
      const max = window.innerHeight;
      const hgt = Math.max(60, Math.min(max, drag.h - dy));
      this.root.style.setProperty('--sheet-h', `${hgt}px`);
      document.body.classList.remove('sheet-full');
    });
    const end = () => {
      if (!drag) return;
      const rect = this.root.getBoundingClientRect();
      const avail = window.innerHeight;
      this.root.classList.remove('dragging');
      const wasMoved = drag.moved;
      drag = null;
      if (!wasMoved) {
        // касание ручки: половина ↔ весь экран
        const full = document.body.classList.contains('sheet-full');
        this.open(this.tab, full ? 'half' : 'full');
        return;
      }
      const ratio = rect.height / avail;
      if (ratio < 0.28) this.close();
      else this.open(this.tab, ratio > 0.68 ? 'full' : 'half');
    };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
  }
}
