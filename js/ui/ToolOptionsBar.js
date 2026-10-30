/** Плавающая панель параметров активного инструмента над планом. */
import { h, icon, clear } from './dom.js';

export class ToolOptionsBar {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    app.bus.on('tool:changed', () => this.render());
    app.bus.on('tool:options-refresh', () => this.render());
    this.render();
  }

  render() {
    const tool = this.app.editor.tool;
    clear(this.root);
    if (!tool || tool.id === 'select') {
      this.root.hidden = true;
      return;
    }
    this.root.hidden = false;
    const title = h('div', { class: 'opt-title' }, tool.name);
    const fields = (tool.options || []).map((o) => this._field(tool, o));
    const done = h(
      'button',
      { class: 'icon-btn opt-close', 'data-tip': 'Готово · Esc', 'aria-label': 'Завершить инструмент', onclick: () => this.app.editor.setTool('select') },
      icon('check', 18),
    );
    this.root.append(title, ...fields, done);
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
