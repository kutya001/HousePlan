/** Настройки: тема, шаг привязки, что показывать на плане и в 3D. */
import { h, icon } from './dom.js';
import { openModal } from './feedback.js';

const THEMES = [
  ['light', 'Светлая', 'sun'],
  ['dark', 'Тёмная', 'moon'],
  ['system', 'Как в системе', 'settings'],
];

const STEPS = [
  [0.01, '1 см'],
  [0.05, '5 см'],
  [0.1, '10 см'],
  [0.25, '25 см'],
];

const TOGGLES = [
  ['План', [
    ['snap', 'Привязки к стенам и углам'],
    ['dims', 'Размерные линии'],
    ['lowerLevel', 'Показывать этаж ниже'],
    ['roofs2d', 'Контуры крыш'],
  ]],
  ['3D', [
    ['shadows', 'Тени (нагружает слабые телефоны)'],
    ['edges', 'Контуры граней'],
    ['furniture3d', 'Мебель'],
    ['roofs3d', 'Крыши'],
  ]],
];

export class SettingsDialog {
  constructor(app) {
    this.app = app;
  }

  open() {
    const { app } = this;
    const st = app.state.settings;
    const seg = (items, current, onPick) => {
      const wrap = h('div', { class: 'seg', role: 'radiogroup' });
      for (const [value, label, ic] of items) {
        const b = h(
          'button',
          {
            class: `seg-btn ${String(current) === String(value) ? 'active' : ''}`,
            role: 'radio',
            'aria-checked': String(String(current) === String(value)),
            onclick: () => {
              for (const x of wrap.children) {
                x.classList.remove('active');
                x.setAttribute('aria-checked', 'false');
              }
              b.classList.add('active');
              b.setAttribute('aria-checked', 'true');
              onPick(value);
            },
          },
          ic ? icon(ic, 16) : null,
          label,
        );
        wrap.append(b);
      }
      return wrap;
    };
    const toggle = (key, label) => {
      const id = `set-${key}`;
      return h(
        'div',
        { class: 'settings-row' },
        h('label', { for: id }, label),
        h('input', {
          id,
          type: 'checkbox',
          class: 'switch',
          role: 'switch',
          checked: !!st[key],
          onchange: (e) => app.state.setSetting(key, e.target.checked),
        }),
      );
    };
    const content = h(
      'div',
      { class: 'settings' },
      h('section', {}, h('h3', {}, 'Оформление'), seg(THEMES, st.theme, (v) => app.state.setSetting('theme', v))),
      h(
        'section',
        {},
        h('h3', {}, 'Шаг привязки к сетке'),
        seg(STEPS, st.gridStep, (v) => app.state.setSetting('gridStep', Number(v))),
      ),
      ...TOGGLES.map(([title, rows]) => h('section', {}, h('h3', {}, title), ...rows.map(([k, l]) => toggle(k, l)))),
      h(
        'section',
        {},
        h('h3', {}, 'Подсказки'),
        h(
          'button',
          {
            class: 'btn btn-small',
            onclick: () => {
              try {
                Object.keys(localStorage)
                  .filter((k) => k.startsWith('houseplan.hint.'))
                  .forEach((k) => localStorage.removeItem(k));
              } catch {
                /* не критично */
              }
              app.toast('Подсказки снова будут появляться');
            },
          },
          'Показать подсказки заново',
        ),
      ),
    );
    openModal(app, { title: 'Настройки', content, actions: [{ label: 'Готово', primary: true }] });
  }
}
