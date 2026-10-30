/** Этажи: переключение, добавление (с копированием стен), удаление. */
import { h, icon, clear } from './dom.js';
import { levelElevation } from '../model/project.js';
import { fmtLenShort } from '../core/format.js';

export class LevelsPanel {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    document.addEventListener('click', () => {
      if (this.menu) this.menu.hidden = true;
    });
    for (const e of ['project:changed', 'level:changed']) app.bus.on(e, ({ reason } = {}) => reason !== 'gesture' && this.render());
    this.render();
  }

  render() {
    const { app } = this;
    const project = app.project;
    clear(this.root);
    const menu = h(
      'div',
      { class: 'menu menu-right', role: 'menu', hidden: true },
      [
        ['Копировать наружные стены', 'exterior'],
        ['Копировать всю планировку', 'all'],
        ['Пустой этаж', 'empty'],
      ].map(([label, mode]) =>
        h(
          'button',
          {
            class: 'menu-item',
            role: 'menuitem',
            onclick: () => {
              menu.hidden = true;
              app.commands.addLevel(mode);
            },
          },
          label,
        ),
      ),
    );
    const addBtn = h(
      'button',
      {
        class: 'btn btn-small btn-ghost',
        'aria-haspopup': 'menu',
        onclick: (e) => {
          e.stopPropagation();
          menu.hidden = !menu.hidden;
        },
      },
      icon('plus', 16),
      'Этаж',
    );
    this.menu = menu;

    const head = h('div', { class: 'panel-head' }, h('h3', {}, 'Этажи'), h('div', { class: 'menu-wrap' }, addBtn, menu));
    const list = h('ol', { class: 'levels-list', reversed: true });
    [...project.levels].reverse().forEach((l) => {
      const active = l.id === app.state.activeLevelId;
      const walls = project.walls.filter((w) => w.levelId === l.id).length;
      const item = h(
        'li',
        { class: `level-row ${active ? 'active' : ''}` },
        h(
          'button',
          { class: 'level-pick', onclick: () => app.state.setLevel(l.id), 'aria-current': active ? 'true' : null },
          h('span', { class: 'level-name' }, l.name),
          h('span', { class: 'level-meta' }, `отм. +${fmtLenShort(levelElevation(project, l.id))} · h ${fmtLenShort(l.height)}${walls ? '' : ' · пусто'}`),
        ),
        project.levels.length > 1
          ? h('button', { class: 'icon-btn icon-btn-small', 'data-tip': 'Удалить этаж', 'aria-label': `Удалить ${l.name}`, onclick: () => app.commands.removeLevel(l.id) }, icon('trash', 16))
          : null,
      );
      list.append(item);
    });
    this.root.append(head, list);
  }
}
