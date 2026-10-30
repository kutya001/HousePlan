/** Правая панель: этажи сверху, ниже вкладки «Свойства» и «Каталог». */
import { h } from './dom.js';
import { LevelsPanel } from './LevelsPanel.js';
import { PropertiesPanel } from './PropertiesPanel.js';
import { CatalogPanel } from './CatalogPanel.js';

export class SidePanel {
  constructor(app, root) {
    this.app = app;
    const levels = h('section', { class: 'side-levels' });
    const tabs = h('div', { class: 'side-tabs', role: 'tablist' });
    const props = h('section', { class: 'side-body', role: 'tabpanel', id: 'tab-properties' });
    const catalog = h('section', { class: 'side-body', role: 'tabpanel', id: 'tab-catalog', hidden: true });
    this.panels = { properties: props, catalog };
    this.tabBtns = {};
    for (const [id, label] of [
      ['properties', 'Свойства'],
      ['catalog', 'Каталог'],
    ]) {
      const b = h('button', { class: 'side-tab', role: 'tab', 'aria-controls': `tab-${id}`, onclick: () => this.showTab(id) }, label);
      this.tabBtns[id] = b;
      tabs.append(b);
    }
    root.append(levels, tabs, props, catalog);
    this.levels = new LevelsPanel(app, levels);
    this.properties = new PropertiesPanel(app, props);
    this.catalog = new CatalogPanel(app, catalog);
    this.showTab('properties');
    app.bus.on('selection:changed', ({ selection }) => {
      if (selection.length && app.state.toolId !== 'item') this.showTab('properties');
    });
  }

  showTab(id) {
    for (const [k, el] of Object.entries(this.panels)) el.hidden = k !== id;
    for (const [k, b] of Object.entries(this.tabBtns)) {
      b.classList.toggle('active', k === id);
      b.setAttribute('aria-selected', String(k === id));
    }
  }
}
