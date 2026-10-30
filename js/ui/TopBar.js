/** Верхняя панель: название проекта, отмена/повтор, режим вида, пресеты, файл, справка. */
import { h, icon } from './dom.js';

export class TopBar {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this._render();
    app.bus.on('history:changed', () => this._syncHistory());
    app.bus.on('view:changed', () => this._syncView());
    app.bus.on('project:changed', ({ reason }) => {
      if (document.activeElement !== this.nameInput && reason !== 'gesture') this.nameInput.value = app.project.name;
    });
  }

  _render() {
    const app = this.app;
    this.nameInput = h('input', {
      class: 'project-name',
      value: app.project.name,
      'aria-label': 'Название проекта',
      spellcheck: 'false',
      onchange: (e) => app.store.commit((p) => (p.name = e.target.value.trim() || 'Без названия')),
      onkeydown: (e) => e.key === 'Enter' && e.target.blur(),
    });
    this.undoBtn = h('button', { class: 'icon-btn', 'data-tip': 'Отменить · Ctrl+Z', 'aria-label': 'Отменить', onclick: () => app.commands.undo() }, icon('undo'));
    this.redoBtn = h('button', { class: 'icon-btn', 'data-tip': 'Повторить · Ctrl+Shift+Z', 'aria-label': 'Повторить', onclick: () => app.commands.redo() }, icon('redo'));

    const views = [
      ['plan', 'plan', 'План', '1'],
      ['split', 'split', 'План и 3D', '2'],
      ['3d', 'cube', '3D', '3'],
    ];
    this.viewBtns = views.map(([mode, ic, label, key]) =>
      h('button', { class: 'seg-btn', dataset: { mode }, 'data-tip': `${label} · ${key}`, onclick: () => app.setViewMode(mode) }, icon(ic, 18), h('span', { class: 'seg-label' }, label)),
    );

    const fileMenu = this._menu('Файл', 'file', [
      ['Новый проект', () => app.commands.newProject()],
      ['Открыть файл…', () => app.file.open(), 'Ctrl+O'],
      ['Сохранить в файл', () => app.file.save(), 'Ctrl+S'],
      null,
      ['Картинка плана (PNG)', () => app.file.exportPlanPNG()],
      ['Картинка 3D-вида (PNG)', () => app.file.export3DPNG()],
    ]);

    this.root.append(
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), h('span', { class: 'brand-name' }, 'HousePlan')),
      h('div', { class: 'topbar-project' }, this.nameInput),
      h('div', { class: 'topbar-history' }, this.undoBtn, this.redoBtn),
      h('div', { class: 'seg view-switch', role: 'group', 'aria-label': 'Режим просмотра' }, this.viewBtns),
      h(
        'div',
        { class: 'topbar-actions' },
        h('button', { class: 'btn btn-accent', onclick: () => app.ui.presets.open() }, icon('presets', 18), h('span', {}, 'Пресеты')),
        fileMenu,
        h('button', { class: 'icon-btn', 'data-tip': 'Справка · F1', 'aria-label': 'Справка', onclick: () => app.ui.help.open() }, icon('help')),
        h('button', { class: 'icon-btn side-toggle', 'aria-label': 'Панель свойств', onclick: () => document.body.classList.toggle('side-open') }, icon('panel')),
      ),
    );
    this._syncHistory();
    this._syncView();
  }

  _menu(label, ic, items) {
    const list = h(
      'div',
      { class: 'menu', role: 'menu', hidden: true },
      items.map((it) =>
        it
          ? h(
              'button',
              {
                class: 'menu-item',
                role: 'menuitem',
                onclick: () => {
                  list.hidden = true;
                  it[1]();
                },
              },
              h('span', {}, it[0]),
              it[2] ? h('kbd', {}, it[2]) : null,
            )
          : h('div', { class: 'menu-sep' }),
      ),
    );
    const btn = h(
      'button',
      {
        class: 'btn btn-ghost',
        'aria-haspopup': 'menu',
        onclick: (e) => {
          e.stopPropagation();
          list.hidden = !list.hidden;
        },
      },
      icon(ic, 18),
      h('span', {}, label),
    );
    document.addEventListener('click', () => (list.hidden = true));
    return h('div', { class: 'menu-wrap' }, btn, list);
  }

  _syncHistory() {
    this.undoBtn.disabled = !this.app.store.canUndo;
    this.redoBtn.disabled = !this.app.store.canRedo;
  }

  _syncView() {
    for (const b of this.viewBtns) b.classList.toggle('active', b.dataset.mode === this.app.state.viewMode);
  }
}
