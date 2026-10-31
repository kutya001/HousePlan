/** Этажи: переключение, добавление (этаж, мансарда, цокольный, подвал), удаление. */
import { h, icon, clear } from './dom.js';
import { levelElevation, kneeWall } from '../model/project.js';
import { fmtLenShort, fmtElev } from '../core/format.js';

/** Пункты меню «+ Этаж»: [подпись, пояснение, действие] */
export function levelAddItems(app) {
  const c = app.commands;
  return [
    ['Этаж сверху', 'наружные стены копируются', () => c.addLevel('exterior')],
    ['Этаж с планировкой', 'копия всех стен и комнат', () => c.addLevel('all')],
    ['Пустой этаж', '', () => c.addLevel('empty')],
    null,
    ['Мансарда', 'стены до скатов крыши', () => c.addAttic()],
    ['Цокольный этаж', 'наполовину в земле, с окнами', () => c.addBasement(true)],
    ['Подвал', 'целиком под землёй', () => c.addBasement(false)],
  ];
}

const KIND_BADGE = { basement: 'под землёй', attic: 'мансарда' };

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
      levelAddItems(app).map((it) =>
        it
          ? h(
              'button',
              {
                class: 'menu-item menu-item-2',
                role: 'menuitem',
                onclick: () => {
                  menu.hidden = true;
                  it[2]();
                },
              },
              h('span', {}, it[0]),
              it[1] ? h('small', { class: 'muted' }, it[1]) : null,
            )
          : h('div', { class: 'menu-sep', role: 'separator' }),
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
          h('span', { class: 'level-name' }, l.name, KIND_BADGE[l.kind] ? h('span', { class: `level-badge level-badge-${l.kind}` }, KIND_BADGE[l.kind]) : null),
          h(
            'span',
            { class: 'level-meta' },
            `отм. ${fmtElev(levelElevation(project, l.id))} · ${l.kind === 'attic' ? `колено ${fmtLenShort(kneeWall(l))}` : `h ${fmtLenShort(l.height)}`}${walls ? '' : ' · пусто'}`,
          ),
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
