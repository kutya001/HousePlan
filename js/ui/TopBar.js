/**
 * Верхняя панель.
 *  ПК: марка, название проекта, отмена/повтор, режим вида, пресеты, файл, поиск команд, настройки, справка.
 *  Планшет: плюс выбор этажа и кнопка панели свойств.
 *  Телефон: меню ☰, отмена/повтор, выбор этажа, План/3D — остальное внутри меню.
 */
import { h, icon } from './dom.js';
import { openMenu } from './ContextMenu.js';
import { levelElevation } from '../model/project.js';
import { fmtElev } from '../core/format.js';

export class TopBar {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this._render();
    app.bus.on('history:changed', () => this._syncHistory());
    app.bus.on('view:changed', () => this._syncView());
    app.bus.on('level:changed', () => this._syncLevel());
    app.bus.on('project:changed', ({ reason }) => {
      if (reason === 'gesture') return;
      if (document.activeElement !== this.nameInput) this.nameInput.value = app.project.name;
      this._syncLevel();
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
      h(
        'button',
        { class: 'seg-btn', dataset: { mode }, 'data-tip': `${label} · ${key}`, 'aria-label': label, onclick: () => app.setViewMode(mode) },
        icon(ic, 18),
        h('span', { class: 'seg-label' }, label),
      ),
    );

    this.levelChip = h(
      'button',
      { class: 'level-chip', 'aria-haspopup': 'menu', 'aria-label': 'Этаж', onclick: (e) => this._levelMenu(e.currentTarget) },
      h('span', { class: 'level-chip-name' }),
      icon('chevronDown', 16),
    );

    const fileBtn = h(
      'button',
      { class: 'btn btn-ghost', 'aria-haspopup': 'menu', onclick: (e) => openMenu(app, { anchor: e.currentTarget, align: 'right', items: this._fileItems() }) },
      icon('file', 18),
      h('span', {}, 'Файл'),
    );

    this.root.append(
      h('button', { class: 'icon-btn only-phone', 'aria-label': 'Меню', 'aria-haspopup': 'menu', onclick: () => this._phoneMenu() }, icon('menu')),
      h('div', { class: 'brand only-desktop' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), h('span', { class: 'brand-name' }, 'HousePlan')),
      h('div', { class: 'topbar-project only-desktop' }, this.nameInput),
      h('div', { class: 'topbar-history' }, this.undoBtn, this.redoBtn),
      h('div', { class: 'topbar-spacer only-phone' }),
      this.levelChip,
      h('div', { class: 'seg view-switch', role: 'group', 'aria-label': 'Режим просмотра' }, this.viewBtns),
      h(
        'div',
        { class: 'topbar-actions only-desktop' },
        h('button', { class: 'btn btn-accent', onclick: () => app.ui.presets.open() }, icon('presets', 18), h('span', {}, 'Пресеты')),
        fileBtn,
        h('button', { class: 'icon-btn', 'data-tip': 'Поиск команд · Ctrl+K', 'aria-label': 'Поиск команд', onclick: () => app.ui.palette.open() }, icon('search')),
        h('button', { class: 'icon-btn', 'data-tip': 'Настройки', 'aria-label': 'Настройки', onclick: () => app.ui.settings.open() }, icon('settings')),
        h('button', { class: 'icon-btn', 'data-tip': 'Справка · F1', 'aria-label': 'Справка', onclick: () => app.ui.help.open() }, icon('help')),
        h('button', { class: 'icon-btn side-toggle', 'aria-label': 'Панель свойств', 'data-tip': 'Свойства и каталог', onclick: () => app.ui.side.toggle() }, icon('panel')),
      ),
    );
    this._syncHistory();
    this._syncView();
    this._syncLevel();
  }

  _fileItems() {
    const app = this.app;
    return [
      { label: 'Новый проект', icon: 'plus', onClick: () => app.commands.newProject() },
      { label: 'Открыть файл…', icon: 'open', kbd: 'Ctrl+O', onClick: () => app.file.open() },
      { label: 'Сохранить в файл', icon: 'save', kbd: 'Ctrl+S', onClick: () => app.file.save() },
      { label: 'Импорт и экспорт…', icon: 'swap', onClick: () => app.ui.exchange.open('import') },
      { label: 'Построить дом с ИИ…', icon: 'spark', onClick: () => app.ui.exchange.open('ai') },
      { separator: true },
      { label: 'Картинка плана (PNG)', icon: 'image', onClick: () => app.file.exportPlanPNG() },
      { label: 'Картинка 3D-вида (PNG)', icon: 'image', onClick: () => app.file.export3DPNG() },
    ];
  }

  _phoneMenu() {
    const app = this.app;
    openMenu(app, {
      sheet: true,
      title: app.project.name,
      items: [
        { label: 'Пресеты: дома и участки', icon: 'presets', onClick: () => app.ui.presets.open() },
        { label: 'Переименовать проект', icon: 'file', onClick: () => this._rename() },
        ...this._fileItems(),
        { separator: true },
        app.pwa?.canInstall ? { label: 'Установить на телефон', icon: 'download', onClick: () => app.pwa.install() } : null,
        { label: 'Настройки', icon: 'settings', onClick: () => app.ui.settings.open() },
        { label: 'Как пользоваться', icon: 'help', onClick: () => app.ui.help.open() },
      ],
    });
  }

  _rename() {
    this.app.state.clearSelection();
    this.app.ui.side.open('properties');
    setTimeout(() => document.querySelector('#tab-properties .form-project input')?.focus(), 320);
  }

  _levelMenu(anchor) {
    const app = this.app;
    const project = app.project;
    const items = [...project.levels].reverse().map((l) => ({
      label: `${l.name}  ·  ${fmtElev(levelElevation(project, l.id))} м`,
      icon: 'layers',
      active: l.id === app.state.activeLevelId,
      onClick: () => app.state.setLevel(l.id),
    }));
    openMenu(app, {
      anchor,
      align: 'right',
      sheet: app.state.isPhone,
      title: 'Этажи',
      items: [
        ...items,
        { separator: true },
        { label: 'Добавить этаж (наружные стены)', icon: 'plus', onClick: () => app.commands.addLevel('exterior') },
        { label: 'Добавить этаж (вся планировка)', icon: 'copy', onClick: () => app.commands.addLevel('all') },
        { label: 'Добавить мансарду', icon: 'roof', onClick: () => app.commands.addAttic() },
        { label: 'Добавить цокольный этаж', icon: 'layers', onClick: () => app.commands.addBasement(true) },
        { label: 'Добавить подвал', icon: 'layers', onClick: () => app.commands.addBasement(false) },
        { label: 'Настроить этажи…', icon: 'settings', onClick: () => app.ui.side.open('levels') },
      ],
    });
  }

  _syncHistory() {
    this.undoBtn.disabled = !this.app.store.canUndo;
    this.redoBtn.disabled = !this.app.store.canRedo;
  }

  _syncView() {
    for (const b of this.viewBtns) {
      const on = b.dataset.mode === this.app.state.viewMode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }

  _syncLevel() {
    const l = this.app.state.level;
    this.levelChip.querySelector('.level-chip-name').textContent = l?.name || 'Этаж';
  }
}
