/** Левая панель инструментов, сгруппированная по смыслу. */
import { h, icon } from './dom.js';

const GROUPS = [
  [['select', 'select', 'Выбор', 'V']],
  [
    ['wall', 'wall', 'Стена', 'W'],
    ['box', 'box', 'Коробка', 'B'],
    ['room', 'room', 'Комната', 'P'],
  ],
  [
    ['door', 'door', 'Дверь', 'D'],
    ['window', 'window', 'Окно', 'O'],
    ['arch', 'arch', 'Проём', 'A'],
  ],
  [
    ['stair', 'stair', 'Лестница', 'L'],
    ['roof', 'roof', 'Крыша', 'K'],
    ['item', 'item', 'Мебель', 'F'],
  ],
  [
    ['site', 'site', 'Участок', 'U'],
    ['zone', 'zone', 'Ландшафт', 'G'],
  ],
  [['measure', 'measure', 'Рулетка', 'M']],
];

export class Toolbar {
  constructor(app, root) {
    this.app = app;
    this.buttons = new Map();
    for (const group of GROUPS) {
      const g = h('div', { class: 'rail-group' });
      for (const [id, ic, label, key] of group) {
        const b = h(
          'button',
          {
            class: 'rail-btn',
            'data-tip': `${label} · ${key}`,
            'data-tip-side': 'right',
            'aria-label': label,
            'aria-pressed': 'false',
            onclick: () => this._activate(id),
          },
          icon(ic, 22),
          h('span', { class: 'rail-label' }, label),
        );
        this.buttons.set(id, b);
        g.append(b);
      }
      root.append(g);
    }
    app.bus.on('tool:changed', () => this.sync());
    this.sync();
  }

  _activate(id) {
    if (id === 'item') {
      this.app.ui.side.showTab('catalog');
      document.body.classList.add('side-open');
    }
    this.app.editor.setTool(id);
    if (this.app.state.viewMode === '3d') this.app.setViewMode('split');
  }

  sync() {
    for (const [id, b] of this.buttons) {
      const active = id === this.app.state.toolId;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    }
  }
}
