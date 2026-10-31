/**
 * Интерфейс прогулки поверх 3D: подсказка действия рядом (дверь, диван, кровать),
 * переключатель камеры, «потолок», выход; на сенсорных экранах — джойстик и кнопки.
 */
import { h, icon } from '../../ui/dom.js';

export class WalkHUD {
  /**
   * @param host — контейнер панели 3D
   * @param handlers { exit, toggleCamera, toggleCeiling, action, jump, sit, lie, run(on), move(x, y), respawn }
   */
  constructor(host, { touch, handlers }) {
    this.touch = touch;
    this.handlers = handlers;
    const hd = handlers;
    this.camBtn = h('button', { class: 'btn walk-btn', onclick: () => hd.toggleCamera(), 'aria-label': 'Камера', 'data-tip': 'Вид из глаз / со спины (V)' }, icon('eye', 16), h('span', {}, 'Из глаз'));
    this.ceilBtn = h('button', { class: 'btn walk-btn', onclick: () => hd.toggleCeiling(), 'aria-label': 'Этажи выше', 'data-tip': 'Показать или скрыть этажи выше манекена' }, icon('cut', 16), h('span', {}, 'Этажи выше'));
    const exit = h('button', { class: 'btn walk-btn walk-exit', onclick: () => hd.exit(), 'aria-label': 'Выйти из прогулки', 'data-tip': 'Выйти из прогулки (Esc)' }, icon('close', 16), h('span', {}, 'Выйти'));
    const home = h('button', { class: 'btn walk-btn walk-home', onclick: () => hd.respawn(), 'aria-label': 'В точку появления', 'data-tip': 'Вернуться в точку появления (R)' }, icon('pin', 16), h('span', {}, 'В начало'));
    this.prompt = h('button', { class: 'walk-prompt', hidden: true, onclick: () => hd.action() });
    this.status = h('div', { class: 'walk-status' });
    const children = [h('div', { class: 'walk-top' }, this.status, h('div', { class: 'walk-top-btns' }, home, this.ceilBtn, this.camBtn, exit)), this.prompt];
    if (touch) {
      children.push(this._joystick());
      const ab = (name, ic, label, fn, cls = '') => h('button', { class: `walk-act ${cls}`, 'data-act': name, 'aria-label': label, onpointerdown: (e) => (e.stopPropagation(), fn()) }, icon(ic, 22), h('span', {}, label));
      this.runBtn = ab('run', 'run', 'Бег', () => {
        this.running = !this.running;
        this.runBtn.classList.toggle('active', this.running);
        hd.run(this.running);
      });
      this.useBtn = ab('use', 'hand', 'Действие', () => hd.action(), 'primary');
      children.push(
        h(
          'div',
          { class: 'walk-actions' },
          ab('sit', 'chair', 'Сесть', () => hd.sit()),
          ab('lie', 'bed', 'Лечь', () => hd.lie()),
          this.runBtn,
          this.useBtn,
          ab('jump', 'jump', 'Прыжок', () => hd.jump(), 'big'),
        ),
      );
    } else {
      // подсказка по клавишам: через 12 секунд сворачивается в значок, наведение — раскрывает
      const keys = [
        ['W A S D', 'идти'],
        ['Shift', 'бег'],
        ['Пробел', 'прыжок / залезть'],
        ['E', 'дверь, сесть, лечь'],
        ['C', 'сесть'],
        ['Z', 'лечь'],
        ['V', 'вид из глаз'],
        ['R', 'в точку появления'],
        ['мышь', 'тянуть — осмотреться, клик — выбрать'],
        ['колесо', 'ближе / дальше'],
        ['Esc', 'выйти'],
      ];
      this.keysEl = h('div', { class: 'walk-keys', title: 'Управление' }, ...keys.map(([k, t]) => h('span', { class: 'walk-key' }, h('kbd', {}, k), t)));
      children.push(this.keysEl);
      this._keysTimer = setTimeout(() => this.keysEl.classList.add('collapsed'), 12000);
    }
    this.el = h('div', { class: `walk-overlay ${touch ? 'touch' : ''}` }, children);
    host.append(this.el);
  }

  _joystick() {
    const pad = h('div', { class: 'joystick', 'aria-label': 'Джойстик: идти' });
    const knob = h('div', { class: 'joystick-knob' });
    pad.append(knob);
    let active = null;
    const R = 50;
    const update = (e) => {
      const r = pad.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > R) {
        dx = (dx / len) * R;
        dy = (dy / len) * R;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.handlers.move(dx / R, -dy / R);
    };
    pad.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      active = e.pointerId;
      pad.setPointerCapture(e.pointerId);
      update(e);
    });
    pad.addEventListener('pointermove', (e) => e.pointerId === active && update(e));
    const end = (e) => {
      if (e.pointerId !== active) return;
      active = null;
      knob.style.transform = '';
      this.handlers.move(0, 0);
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    return pad;
  }

  /** Подсказка действия рядом: { key, text } или null. */
  setPrompt(p) {
    const key = p ? `${p.key}|${p.text}` : '';
    if (key === this._promptKey) return;
    this._promptKey = key;
    this.prompt.hidden = !p;
    if (p) {
      this.prompt.replaceChildren(...(this.touch ? [] : [h('kbd', {}, p.key)]), h('span', {}, p.text));
      if (this.useBtn) this.useBtn.querySelector('span:not(.icon)').textContent = p.short || p.text;
    } else if (this.useBtn) this.useBtn.querySelector('span:not(.icon)').textContent = 'Действие';
    this.useBtn?.classList.toggle('ready', !!p);
  }

  setStatus(text) {
    if (text !== this._status) this.status.textContent = this._status = text;
  }

  setCamera(firstPerson) {
    this.camBtn.querySelector('span:not(.icon)').textContent = firstPerson ? 'Со спины' : 'Из глаз';
  }

  setCeiling(hidden, enabled) {
    this.ceilBtn.classList.toggle('active', hidden);
    this.ceilBtn.disabled = !enabled;
    this.ceilBtn.setAttribute('aria-pressed', String(hidden));
  }

  destroy() {
    clearTimeout(this._keysTimer);
    this.el.remove();
  }
}
