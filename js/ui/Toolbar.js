/**
 * Инструменты: вертикальная панель слева (ПК, планшет)
 * и нижняя панель с группами (телефон).
 */
import { h, icon, clear } from './dom.js';

/** Описание инструментов — общее для панелей, палитры команд и справки. */
export const TOOL_META = {
  select: { icon: 'select', label: 'Выбор', key: 'V', desc: 'Выбрать и двигать' },
  wall: { icon: 'wall', label: 'Стена', key: 'W', desc: 'Цепочкой по точкам' },
  box: { icon: 'box', label: 'Коробка', key: 'B', desc: '4 стены и пол, 1–3 этажа' },
  room: { icon: 'room', label: 'Комната', key: 'P', desc: 'Пол и площадь' },
  door: { icon: 'door', label: 'Дверь', key: 'D', desc: 'В любую стену' },
  window: { icon: 'window', label: 'Окно', key: 'O', desc: 'С подоконником' },
  arch: { icon: 'arch', label: 'Проём', key: 'A', desc: 'Без двери' },
  item: { icon: 'item', label: 'Мебель', key: 'F', desc: 'Каталог предметов' },
  stair: { icon: 'stair', label: 'Лестница', key: 'L', desc: 'На этаж выше' },
  roof: { icon: 'roof', label: 'Крыша', key: 'K', desc: '4 типа' },
  site: { icon: 'site', label: 'Участок', key: 'U', desc: 'Граница и размер' },
  zone: { icon: 'zone', label: 'Ландшафт', key: 'G', desc: 'Газон, дорожки, вода' },
  measure: { icon: 'measure', label: 'Рулетка', key: 'M', desc: 'Измерить расстояние' },
};

const RAIL_GROUPS = [['select'], ['wall', 'box', 'room'], ['door', 'window', 'arch'], ['stair', 'roof', 'item'], ['site', 'zone'], ['measure']];

function activateTool(app, id) {
  if (id === 'item') app.ui.side.open('catalog');
  app.editor.setTool(id);
  if (app.state.viewMode === '3d') app.setViewMode(app.state.isPhone ? 'plan' : 'split');
}

export class Toolbar {
  constructor(app, root) {
    this.app = app;
    this.buttons = new Map();
    for (const group of RAIL_GROUPS) {
      const g = h('div', { class: 'rail-group' });
      for (const id of group) {
        const m = TOOL_META[id];
        const b = h(
          'button',
          {
            class: 'rail-btn',
            'data-tip': `${m.label} · ${m.key}`,
            'data-tip-side': 'right',
            'aria-label': m.label,
            'aria-pressed': 'false',
            onclick: () => activateTool(app, id),
          },
          icon(m.icon, 22),
          h('span', { class: 'rail-label' }, m.label),
        );
        this.buttons.set(id, b);
        g.append(b);
      }
      root.append(g);
    }
    app.bus.on('tool:changed', () => this.sync());
    this.sync();
  }

  sync() {
    for (const [id, b] of this.buttons) {
      const active = id === this.app.state.toolId;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    }
  }
}

/** Нижняя панель телефона: группы инструментов с лотком выбора. */
const BOTTOM_GROUPS = [
  { id: 'select', label: 'Выбор', tools: ['select'] },
  { id: 'walls', label: 'Стены', tools: ['wall', 'box', 'room'] },
  { id: 'openings', label: 'Проёмы', tools: ['door', 'window', 'arch'] },
  { id: 'objects', label: 'Объекты', tools: ['item', 'stair', 'roof'] },
  { id: 'site', label: 'Участок', tools: ['site', 'zone', 'measure'] },
];

export class BottomBar {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.last = Object.fromEntries(BOTTOM_GROUPS.map((g) => [g.id, g.tools[0]]));
    this.buttons = new Map();
    for (const g of BOTTOM_GROUPS) {
      const b = h(
        'button',
        {
          class: `bb-btn ${g.tools.length > 1 ? 'has-group' : ''}`,
          'aria-label': g.label,
          'aria-haspopup': g.tools.length > 1 ? 'menu' : null,
          onclick: () => this._tap(g),
        },
        h('span', { class: 'bb-icon' }),
        h('span', { class: 'bb-label' }, g.label),
      );
      this.buttons.set(g.id, b);
      root.append(b);
    }
    this.panelBtn = h(
      'button',
      { class: 'bb-btn', 'aria-label': 'Панель: свойства, каталог, этажи', onclick: () => app.ui.side.toggle() },
      icon('panel', 22),
      h('span', { class: 'bb-label' }, 'Панель'),
    );
    root.append(this.panelBtn);
    app.bus.on('tool:changed', () => this.sync());
    app.bus.on('sheet:changed', () => this.sync());
    this.sync();
  }

  _tap(g) {
    if (g.tools.length === 1) {
      this._closeTray();
      activateTool(this.app, g.tools[0]);
      return;
    }
    if (this.tray?.group === g.id) return this._closeTray();
    this._openTray(g);
  }

  _openTray(g) {
    this._closeTray();
    const app = this.app;
    const overlay = h('div', { class: 'tray-overlay', onpointerdown: () => this._closeTray() });
    const tray = h(
      'div',
      { class: 'tool-tray', role: 'menu', 'aria-label': g.label },
      h('p', { class: 'tray-title' }, g.label),
      h(
        'div',
        { class: 'tray-grid' },
        g.tools.map((id) => {
          const m = TOOL_META[id];
          return h(
            'button',
            {
              class: `tray-btn ${app.state.toolId === id ? 'active' : ''}`,
              role: 'menuitem',
              onclick: () => {
                this.last[g.id] = id;
                this._closeTray();
                activateTool(app, id);
              },
            },
            icon(m.icon, 26),
            h('span', {}, m.label),
            h('span', { class: 'tray-desc' }, m.desc),
          );
        }),
      ),
    );
    const root = document.getElementById('popover-root');
    root.append(overlay, tray);
    this.tray = { group: g.id, close: () => (overlay.remove(), tray.remove()) };
    tray.querySelector('button')?.focus({ preventScroll: true });
  }

  _closeTray() {
    this.tray?.close();
    this.tray = null;
  }

  sync() {
    const toolId = this.app.state.toolId;
    for (const g of BOTTOM_GROUPS) {
      const b = this.buttons.get(g.id);
      const inGroup = g.tools.includes(toolId);
      if (inGroup) this.last[g.id] = toolId;
      const shown = inGroup ? toolId : g.id === 'select' ? 'select' : null;
      const holder = b.querySelector('.bb-icon');
      clear(holder);
      holder.append(icon(TOOL_META[shown || this.last[g.id]].icon, 22));
      b.classList.toggle('active', inGroup);
      b.querySelector('.bb-label').textContent = inGroup && g.tools.length > 1 ? TOOL_META[toolId].label : g.label;
    }
    this.panelBtn.classList.toggle('active', document.body.classList.contains('sheet-open'));
  }
}
