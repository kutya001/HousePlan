/** Плавающая панель параметров активного инструмента над планом. */
import { h, icon, clear } from './dom.js';

export class ToolOptionsBar {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    app.bus.on('tool:changed', () => this.render());
    app.bus.on('tool:options-refresh', () => this.render());
    app.bus.on('layout:changed', () => this.render());
    this.render();
  }

  render() {
    const tool = this.app.editor.tool;
    clear(this.root);
    const stage = document.getElementById('stage');
    if (!tool || tool.id === 'select') {
      this.root.hidden = true;
      stage?.classList.remove('has-options');
      return;
    }
    stage?.classList.add('has-options');
    this.root.hidden = false;
    const title = h('div', { class: 'opt-title' }, tool.name);
    const fields = (tool.options || []).map((o) => this._field(tool, o));
    const actions = (tool.actions?.() || []).map((a) => this._action(a));
    const done = h(
      'button',
      { class: 'icon-btn opt-close', 'data-tip': 'Выйти из инструмента · Esc', 'aria-label': 'Выйти из инструмента', onclick: () => this.app.editor.setTool('select') },
      icon('close', 18),
    );
    const actionsEl = actions.length ? h('div', { class: 'opt-actions' }, actions) : null;
    // на телефоне действия («Готово», «Убрать отрезок») — первыми, чтобы не прятались за краем
    const parts = this.app.state.isPhone ? [title, actionsEl, ...fields, done] : [title, ...fields, actionsEl, done];
    this.root.append(...parts.filter(Boolean));
    if (this.app.state.isPhone) this.root.scrollLeft = 0;
    const keep = this.root.querySelector('[data-autofocus]');
    if (keep && !this.app.state.coarse) keep.focus();
  }

  /** Кнопки действий инструмента и быстрые поля ввода (длина стены). */
  _action(a) {
    if (a.type === 'length') {
      const input = h('input', {
        type: 'number',
        inputmode: 'decimal',
        step: 0.01,
        min: 0.05,
        placeholder: 'м',
        'aria-label': 'Длина следующей стены, м',
        onkeydown: (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            apply();
          }
        },
      });
      const apply = () => {
        const v = parseFloat(String(input.value).replace(',', '.'));
        if (v > 0) a.apply(v);
      };
      return h('span', { class: 'opt-length' }, h('span', { class: 'opt-label' }, a.label), input, h('button', { class: 'btn btn-small', onclick: apply }, 'OK'));
    }
    if (a.type === 'dims') {
      const mk = (label) =>
        h('input', { type: 'number', inputmode: 'decimal', step: 0.1, min: 0.5, placeholder: label, 'aria-label': label, class: 'dims-input' });
      const w = mk('ширина');
      const d = mk('глубина');
      const apply = () => {
        const W = parseFloat(String(w.value).replace(',', '.'));
        const D = parseFloat(String(d.value).replace(',', '.'));
        if (W > 0 && D > 0) a.apply(W, D);
        else this.app.toast('Укажите ширину и глубину в метрах', 'warn');
      };
      d.addEventListener('keydown', (e) => e.key === 'Enter' && apply());
      return h(
        'span',
        { class: 'opt-length' },
        h('span', { class: 'opt-label' }, a.label),
        w,
        h('span', { class: 'muted' }, '×'),
        d,
        h('button', { class: 'btn btn-small btn-primary', onclick: apply }, 'Создать'),
      );
    }
    return h(
      'button',
      { class: `btn btn-small ${a.primary ? 'btn-primary' : ''}`, disabled: a.disabled, onclick: () => a.onClick() },
      a.icon ? icon(a.icon, 16) : null,
      a.label,
    );
  }

  _field(tool, o) {
    const s = tool.settings;
    if (o.type === 'button') {
      return h('button', { class: 'btn btn-small', onclick: () => o.action() }, o.label);
    }
    const label = h('span', { class: 'opt-label' }, o.label);
    if (o.type === 'segmented') {
      const entries = Object.entries(o.options);
      const btns = entries.map(([k, v]) =>
        h(
          'button',
          {
            class: `seg-btn ${String(s[o.key]) === String(k) ? 'active' : ''}`,
            onclick: () => {
              tool.onOptionChange(o.key, k);
              this.render();
            },
          },
          v,
        ),
      );
      return h('div', { class: 'opt-field' }, label, h('div', { class: `seg seg-small ${entries.length > 4 ? 'seg-wrap' : ''}` }, btns));
    }
    if (o.type === 'select') {
      const sel = h(
        'select',
        { onchange: (e) => tool.onOptionChange(o.key, e.target.value), 'aria-label': o.label },
        Object.entries(o.options).map(([k, v]) => h('option', { value: k, selected: String(s[o.key]) === String(k) }, v)),
      );
      return h('label', { class: 'opt-field' }, label, sel);
    }
    if (o.type === 'number') {
      const input = h('input', {
        type: 'number',
        step: o.step,
        min: o.min,
        max: o.max,
        value: s[o.key] ?? '',
        placeholder: o.placeholder || '',
        'aria-label': o.label,
        onchange: (e) => {
          const raw = e.target.value;
          if (raw === '' && o.allowEmpty) return tool.onOptionChange(o.key, null);
          const v = parseFloat(raw);
          if (Number.isFinite(v)) tool.onOptionChange(o.key, Math.min(o.max ?? v, Math.max(o.min ?? v, v)));
        },
      });
      return h('label', { class: 'opt-field' }, label, h('span', { class: 'input-unit input-unit-small' }, input, o.unit ? h('span', { class: 'unit' }, o.unit) : null));
    }
    return h('span');
  }
}
