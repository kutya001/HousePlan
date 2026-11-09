/**
 * «Солнце» над 3D-видом: солнце по дате и времени для широты участка
 * (по умолчанию Бишкек), прокрутка дня, север на плане.
 */
import { h, icon } from './dom.js';
import { MONTHS, fmtHour, compassPoint, siteGeo } from '../geometry/sun.js';

export class SunPanel {
  constructor(app, host) {
    this.app = app;
    this.el = h('div', { class: 'sun-panel', hidden: true, role: 'dialog', 'aria-label': 'Солнце и тени' });
    host.append(this.el);
    this._onDoc = (e) => {
      if (!this.el.contains(e.target) && !e.target.closest?.('[data-sun-toggle]')) this.close();
    };
    app.bus.on('sun:changed', () => this._syncInfo());
    app.bus.on('settings:changed', ({ key }) => key.startsWith('sun') && !this.el.hidden && this._syncInputs());
    this._render();
  }

  get open() {
    return !this.el.hidden;
  }

  toggle() {
    if (this.open) this.close();
    else {
      this.el.hidden = false;
      this._syncInputs();
      this._syncInfo();
      setTimeout(() => document.addEventListener('pointerdown', this._onDoc), 0);
    }
  }

  close() {
    this.el.hidden = true;
    this._stopPlay();
    document.removeEventListener('pointerdown', this._onDoc);
  }

  _render() {
    const { app } = this;
    const set = (k, v) => app.state.setSetting(k, v);
    this.real = h('input', { type: 'checkbox', onchange: (e) => set('sunReal', e.target.checked) });
    this.day = h('select', { 'aria-label': 'День', onchange: (e) => set('sunDay', +e.target.value) }, Array.from({ length: 31 }, (_, i) => h('option', { value: i + 1 }, String(i + 1))));
    this.month = h('select', { 'aria-label': 'Месяц', onchange: (e) => set('sunMonth', +e.target.value) }, MONTHS.map((m, i) => h('option', { value: i + 1 }, m)));
    this.hour = h('input', {
      type: 'range',
      min: 4,
      max: 22,
      step: 0.25,
      'aria-label': 'Время',
      oninput: (e) => {
        if (!app.state.settings.sunReal) set('sunReal', true);
        set('sunHour', +e.target.value);
      },
    });
    this.hourOut = h('output', { class: 'sun-hour' });
    this.playBtn = h('button', { class: 'btn btn-small', onclick: () => (this._timer ? this._stopPlay() : this._play()) }, icon('sun', 16), 'Прокрутить день');
    this.info = h('p', { class: 'sun-info' });
    this.north = h('input', {
      type: 'range',
      min: -180,
      max: 180,
      step: 5,
      'aria-label': 'Север на плане',
      oninput: (e) => (this.northOut.textContent = `${e.target.value}°`),
      onchange: (e) => app.store.commit((p) => (p.site.north = +e.target.value)),
    });
    this.northOut = h('output', {});
    const presets = [
      ['Лето', 6, 21],
      ['Весна', 3, 20],
      ['Зима', 12, 21],
    ].map(([label, m, d]) =>
      h(
        'button',
        {
          class: 'chip',
          onclick: () => {
            set('sunReal', true);
            set('sunMonth', m);
            set('sunDay', d);
          },
        },
        label,
      ),
    );
    this.el.append(
      h('div', { class: 'sun-head' }, icon('sun', 18), h('strong', {}, 'Солнце и тени'), h('button', { class: 'icon-btn', 'aria-label': 'Закрыть', onclick: () => this.close() }, icon('close', 16))),
      h('label', { class: 'sun-row check' }, this.real, h('span', {}, 'По дате и времени')),
      h('div', { class: 'sun-row' }, this.day, this.month),
      h('div', { class: 'sun-chips' }, presets),
      h('div', { class: 'sun-row' }, this.hour, this.hourOut),
      h('div', { class: 'sun-row' }, this.playBtn),
      this.info,
      h('div', { class: 'sun-row sun-north' }, h('span', {}, 'Север на плане'), this.north, this.northOut),
      h('p', { class: 'muted sun-note' }, 'Широта, долгота и часовой пояс — в свойствах участка (по умолчанию Бишкек).'),
    );
  }

  _syncInputs() {
    const s = this.app.state.settings;
    this.real.checked = !!s.sunReal;
    this.day.value = String(s.sunDay || 21);
    this.month.value = String(s.sunMonth || 6);
    this.hour.value = String(s.sunHour ?? 14);
    this.hourOut.textContent = fmtHour(s.sunHour ?? 14);
    const n = siteGeo(this.app.project.site).north;
    this.north.value = String(n);
    this.northOut.textContent = `${n}°`;
  }

  _syncInfo() {
    if (this.el.hidden) return;
    this._syncInputs();
    const v = this.app.view3d;
    const p = v?.sunInfo;
    if (!this.app.state.settings.sunReal || !p) {
      this.info.textContent = 'Сейчас — постоянный дневной свет. Включите «По дате и времени», чтобы увидеть настоящие тени.';
      return;
    }
    const g = siteGeo(this.app.project.site);
    const where = `${g.lat.toFixed(2).replace('.', ',')}° с. ш.`;
    this.info.textContent =
      p.elevation < 0
        ? `Солнце за горизонтом — ${p.elevation < -5 ? 'ночь' : 'сумерки'} (${where}).`
        : `Высота солнца ${Math.round(p.elevation)}°, со стороны: ${compassPoint(p.azimuth, true)} (${Math.round(p.azimuth)}°) · ${where}`;
  }

  _play() {
    const { app } = this;
    if (!app.state.settings.sunReal) app.state.setSetting('sunReal', true);
    let h0 = 5;
    this.playBtn.classList.add('active');
    this._timer = setInterval(() => {
      h0 += 0.125;
      if (h0 > 21.5) return this._stopPlay();
      app.state.setSetting('sunHour', h0);
    }, 60);
  }

  _stopPlay() {
    clearInterval(this._timer);
    this._timer = null;
    this.playBtn?.classList.remove('active');
  }
}
