/** Кнопки поверх 3D-вида: камера, прогулка, разрез по этажу, слои. */
import { h, icon } from './dom.js';

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
    this.walkBtn = btn('walk', 'Прогулка', () => this._walk(), 'Ходить по дому: WASD, мышь — смотреть, Esc — выйти');
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
        this.walkBtn,
      ),
      h('div', { class: 'v3-group' }, this.toggles),
      h('div', { class: 'v3-group' }, btn('image', 'Снимок', () => app.file.export3DPNG(), 'Сохранить картинку 3D-вида')),
    );
    this.walkHint = h('div', { class: 'walk-hint', hidden: true }, 'W A S D — идти, Shift — быстрее, мышь — оглядеться, Esc — выйти');
    root.parentElement.append(this.walkHint);
    app.bus.on('settings:changed', () => this.sync());
    app.bus.on('walk:changed', ({ walking }) => {
      this.walkHint.hidden = !walking;
      this.walkBtn.classList.toggle('active', walking);
    });
    this.sync();
  }

  _walk() {
    this.app.view3d?.startWalk();
  }

  sync() {
    for (const b of this.toggles) b.setAttribute('aria-pressed', String(!!this.app.state.settings[b.dataset.key]));
  }
}
