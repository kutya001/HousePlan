/**
 * Форма по описанию полей (см. model/schemas.js).
 * renderForm возвращает { el, refresh } — refresh обновляет значения,
 * не трогая поле, в котором сейчас стоит курсор.
 */
import { h } from './dom.js';

let uidCounter = 0;

/**
 * @param fields — описание полей
 * @param getTarget — () => объект, который редактируем (актуальный)
 * @param getProject — () => проект
 * @param onChange — (field, value) => void
 */
export function renderForm(fields, getTarget, getProject, onChange) {
  const el = h('div', { class: 'form' });
  const bindings = [];
  for (const f of fields) {
    const target = getTarget();
    if (!target) break;
    if (f.visible && !f.visible(target)) continue;
    const id = `f${++uidCounter}`;
    const row = h('div', { class: `form-row form-${f.type}` });
    const label = h('label', { for: id, class: 'form-label' }, f.label);
    if (f.hint) label.title = f.hint;
    let control;
    let read;
    let write;

    if (f.type === 'readonly') {
      control = h('output', { id, class: 'form-readonly' });
      write = (v) => (control.textContent = v);
      bindings.push({ control, write: () => write(f.get(getTarget(), getProject())) });
      write(f.get(target, getProject()));
      row.append(label, control);
      el.append(row);
      continue;
    }

    if (f.type === 'number') {
      const input = h('input', {
        id,
        type: 'number',
        inputmode: 'decimal',
        step: f.step ?? 0.01,
        min: f.min,
        max: f.max,
        placeholder: f.placeholder || '',
      });
      read = () => {
        if (input.value === '' && f.allowEmpty) return null;
        let v = parseFloat(String(input.value).replace(',', '.'));
        if (!Number.isFinite(v)) return undefined;
        if (f.min != null) v = Math.max(f.min, v);
        if (f.max != null) v = Math.min(f.max, v);
        return v;
      };
      write = (v) => {
        input.value = v == null || v === '' ? '' : String(Math.round(v * 1000) / 1000);
      };
      input.addEventListener('change', () => {
        const v = read();
        if (v !== undefined) onChange(f, v);
      });
      control = h('div', { class: 'input-unit' }, input, f.unit ? h('span', { class: 'unit' }, f.unit) : null);
      bindings.push({ control: input, write: () => write(f.get(getTarget(), getProject())) });
    } else if (f.type === 'select') {
      const opts = typeof f.options === 'function' ? f.options(target) : f.options;
      const select = h(
        'select',
        { id },
        Object.entries(opts).map(([k, v]) => h('option', { value: k }, v)),
      );
      write = (v) => (select.value = v);
      select.addEventListener('change', () => onChange(f, select.value));
      control = select;
      bindings.push({ control: select, write: () => write(f.get(getTarget(), getProject())) });
    } else if (f.type === 'text') {
      const listId = f.list ? `${id}-list` : null;
      const input = h('input', { id, type: 'text', list: listId, autocomplete: 'off' });
      write = (v) => (input.value = v ?? '');
      input.addEventListener('change', () => onChange(f, input.value.trim()));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
      });
      control = h('div', {}, input, f.list ? h('datalist', { id: listId }, f.list.map((n) => h('option', { value: n }))) : null);
      bindings.push({ control: input, write: () => write(f.get(getTarget(), getProject())) });
    } else if (f.type === 'color') {
      const input = h('input', { id, type: 'color' });
      write = (v) => (input.value = /^#[0-9a-f]{6}$/i.test(v || '') ? v : '#ffffff');
      input.addEventListener('change', () => onChange(f, input.value));
      const reset = f.allowReset ? h('button', { class: 'link-btn', type: 'button', onclick: () => onChange(f, null) }, 'по умолчанию') : null;
      control = h('div', { class: 'color-row' }, input, reset);
      bindings.push({ control: input, write: () => write(f.get(getTarget(), getProject())) });
    } else if (f.type === 'checkbox') {
      const input = h('input', { id, type: 'checkbox' });
      write = (v) => (input.checked = !!v);
      input.addEventListener('change', () => onChange(f, input.checked));
      row.classList.add('form-check');
      control = input;
      bindings.push({ control: input, write: () => write(f.get(getTarget(), getProject())) });
    }

    write(f.get(target, getProject()));
    if (f.type === 'checkbox') row.append(control, label);
    else row.append(label, control);
    el.append(row);
  }

  return {
    el,
    refresh() {
      if (!getTarget()) return;
      for (const b of bindings) if (b.control !== document.activeElement) b.write();
    },
  };
}
