/** Кнопки поверх 3D-вида: камера, прогулка, разрез по этажу, слои. */
import { h, icon } from './dom.js';
import { openMenu } from './ContextMenu.js';
import { SPAWN_MODES } from '../model/defaults.js';

const TOGGLES = [
  ['cutaway', 'cut', 'Разрез', 'Скрыть этажи выше активного и его крышу'],
  ['roofs3d', 'roof', 'Крыши', 'Показывать крыши'],
  ['furniture3d', 'sofa', 'Мебель', 'Показывать мебель и объекты участка'],
  ['edges', 'edges', 'Контуры', 'Тонкие линии по рёбрам — вид макета'],
  ['shadows', 'sun', 'Тени', 'Тени от солнца'],
];

export class View3DBar {
  constructor(app, root) {
    this.app = app;
    const btn = (ic, label, fn, tip) => h('button', { class: 'v3-btn', 'data-tip': tip || label, 'aria-label': label, onclick: fn }, icon(ic, 18), h('span', {}, label));
    this.walkBtn = btn('person', 'Прогулка', () => this._walk(), 'Пройтись манекеном 170 см: появится у входа на участке, можно войти в дом, подняться по лестнице, сесть, открыть двери');
    this.spawnBtn = h(
      'button',
      { class: 'v3-btn v3-more', 'aria-label': 'Где появиться манекену', 'data-tip': 'Где появиться манекену', onclick: () => this._spawnMenu() },
      icon('chevronDown', 16),
    );
    this.toggles = TOGGLES.map(([key, ic, label, tip]) => {
      const b = btn(ic, label, () => app.state.setSetting(key, !app.state.settings[key]), tip);
      b.classList.add('toggle');
      b.dataset.key = key;
      return b;
    });
    root.append(
      h(
        'div',
        { class: 'v3-group' },
        btn('fit', 'Весь дом', () => app.view3d?.frame(), 'Показать весь дом (двойной клик — к выделенному)'),
        btn('top', 'Сверху', () => app.view3d?.topView()),
        h('div', { class: 'v3-split' }, this.walkBtn, this.spawnBtn),
      ),
      h('div', { class: 'v3-group' }, this.toggles),
      h('div', { class: 'v3-group' }, btn('image', 'Снимок', () => app.file.export3DPNG(), 'Сохранить картинку 3D-вида')),
    );
    this.walkHint = h('div', { class: 'walk-hint', hidden: true });
    root.parentElement.append(this.walkHint);
    app.bus.on('settings:changed', () => this.sync());
    app.bus.on('walk:changed', ({ walking }) => {
      this.walkHint.textContent = app.state.coarse
        ? 'Джойстик — идти (до края — бегом), палец по экрану — оглядеться, касание — выбрать объект'
        : 'Тяните мышью — осмотреться, клик — выбрать объект и править его. Двери открываются сами, если в них упереться';
      this.walkHint.hidden = !walking;
      document.body.classList.toggle('walking', walking);
      this.walkBtn.classList.toggle('active', walking);
      clearTimeout(this._hintTimer);
      if (walking) this._hintTimer = setTimeout(() => (this.walkHint.hidden = true), 7000);
    });
    this.sync();
  }

  _walk() {
    this.app.walk();
  }

  /** Выбор точки появления манекена. */
  _spawnMenu() {
    const { app } = this;
    const cur = app.state.settings.walkSpawn || 'entrance';
    const hasPoint = !!app.project.site?.spawn;
    const icons = { entrance: 'home', inside: 'room', point: 'pin' };
    openMenu(app, {
      anchor: this.spawnBtn,
      title: 'Где появиться манекену',
      sheet: app.state.isPhone,
      items: [
        ...SPAWN_MODES.map(([id, label]) => ({
          label: id === 'point' && !hasPoint ? `${label} — не отмечена` : label,
          icon: icons[id],
          active: cur === id,
          onClick: () => {
            if (id === 'point' && !hasPoint) {
              app.toast('На плане нажмите правой кнопкой (на телефоне — долгим нажатием) и выберите «Появляться здесь»', 'info');
              return;
            }
            app.state.setSetting('walkSpawn', id);
            if (app.view3d?.walking) app.view3d.character.respawn();
          },
        })),
        { separator: true },
        { label: 'Начать прогулку', icon: 'person', onClick: () => this._walk() },
      ],
    });
  }

  sync() {
    for (const b of this.toggles) b.setAttribute('aria-pressed', String(!!this.app.state.settings[b.dataset.key]));
  }
}
