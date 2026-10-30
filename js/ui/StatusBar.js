/** Строка состояния: подсказка инструмента, координаты, переключатели, автосохранение. Плюс кнопки масштаба на плане. */
import { h, icon } from './dom.js';
import { fmtLenShort } from '../core/format.js';

const TOGGLES = [
  ['snap', 'magnet', 'Привязки', 'Прилипание к стенам, углам, сетке. Alt — временно выключить'],
  ['dims', 'ruler', 'Размеры', 'Размерные линии на плане'],
  ['lowerLevel', 'ghost', 'Этаж ниже', 'Показывать стены этажа ниже пунктиром'],
];

export class StatusBar {
  constructor(app, root, zoomRoot) {
    this.app = app;
    this.hint = h('div', { class: 'status-hint', 'aria-live': 'polite' });
    this.coords = h('div', { class: 'status-coords' }, 'x —  y —');
    this.saved = h('div', { class: 'status-saved' });
    this.toggles = TOGGLES.map(([key, ic, label, tip]) =>
      h(
        'button',
        {
          class: 'toggle',
          'data-tip': tip,
          'aria-pressed': String(!!app.state.settings[key]),
          dataset: { key },
          onclick: () => app.state.setSetting(key, !app.state.settings[key]),
        },
        icon(ic, 16),
        h('span', {}, label),
      ),
    );
    root.append(this.hint, h('div', { class: 'status-right' }, this.coords, ...this.toggles, this.saved));

    this.zoomLabel = h('button', { class: 'zoom-label', 'data-tip': 'Показать весь дом · Home', onclick: () => app.editor.fitToContent() }, '100%');
    zoomRoot.append(
      h('button', { class: 'icon-btn', 'aria-label': 'Уменьшить', onclick: () => app.editor.zoomBy(0.8) }, icon('minus', 18)),
      this.zoomLabel,
      h('button', { class: 'icon-btn', 'aria-label': 'Увеличить', onclick: () => app.editor.zoomBy(1.25) }, icon('plus', 18)),
      h('button', { class: 'icon-btn', 'data-tip': 'Весь участок', 'aria-label': 'Весь участок', onclick: () => app.editor.fitToContent({ includeSite: true }) }, icon('fit', 18)),
    );

    app.bus.on('hint:changed', ({ text }) => (this.hint.textContent = text));
    app.bus.on('cursor:moved', (p) => (this.coords.textContent = `x ${fmtLenShort(p.x)}  y ${fmtLenShort(p.y)}`));
    app.bus.on('settings:changed', () => this._syncToggles());
    app.bus.on('zoom:changed', () => this._syncZoom());
    app.bus.on('autosave', ({ ok }) => {
      this.saved.textContent = ok ? 'Сохранено в браузере' : 'Не удалось сохранить';
      this.saved.classList.toggle('error', !ok);
      this.saved.classList.add('flash');
      setTimeout(() => this.saved.classList.remove('flash'), 900);
    });
    this._syncZoom();
  }

  _syncToggles() {
    for (const b of this.toggles) b.setAttribute('aria-pressed', String(!!this.app.state.settings[b.dataset.key]));
  }

  _syncZoom() {
    // 100% ≈ 50 пикселей на метр
    this.zoomLabel.textContent = `${Math.round((this.app.editor.viewport.scale / 50) * 100)}%`;
  }
}
