/**
 * Вкладка «Проверка»: список ошибок проекта по этажам. Клик — показать на плане
 * (этаж, выделение, по центру), кнопка — исправить; «Исправить всё» — раздвинуть
 * предметы, отодвинуть от стен, удалить стены-дубли.
 */
import { h, icon, clear } from './dom.js';
import { canAutoFix } from '../model/validate.js';
import { SITE_LEVEL } from '../model/project.js';

export class ChecksPanel {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    app.bus.on('checks:changed', () => this.render());
    app.bus.on('level:changed', () => this.render());
    this.render();
  }

  render() {
    const { app } = this;
    const issues = app.checks.issues;
    const root = clear(this.root);
    const errors = issues.filter((i) => i.level === 'error').length;
    const warns = issues.length - errors;
    const fixable = issues.filter(canAutoFix).length;

    root.append(
      h(
        'div',
        { class: `checks-head ${errors ? 'bad' : warns ? 'meh' : 'ok'}` },
        icon(errors || warns ? 'warn' : 'shield', 22),
        h(
          'div',
          {},
          h('strong', {}, issues.length ? app.checks.summary.replace(/^./, (c) => c.toUpperCase()) : 'Ошибок нет'),
          h(
            'small',
            {},
            issues.length
              ? 'Красное — то, чего не бывает в настоящем доме: предметы друг в друге, в стенах, постройки внахлёст. Жёлтое — неудобно, но возможно.'
              : 'Предметы не стоят друг в друге и в стенах, двери свободны, постройки не накладываются.',
          ),
        ),
      ),
    );
    if (fixable > 1) {
      root.append(h('button', { class: 'btn btn-accent btn-block checks-fixall', onclick: () => app.checks.fixAll() }, icon('wand', 18), `Исправить автоматически (${fixable})`));
    }
    if (!issues.length) {
      root.append(h('p', { class: 'checks-note muted' }, 'Проверка идёт сама после каждой правки. На плане ошибки видны красными пятнами со значком «!».'));
      return;
    }

    // по этажам: сверху вниз, участок — отдельно
    const levels = [...app.project.levels].reverse();
    const groups = [...levels.map((l) => [l.id, l.name]), [SITE_LEVEL, 'Участок']];
    for (const [id, name] of groups) {
      const list = issues.filter((i) => (i.levelId || SITE_LEVEL) === id);
      if (!list.length) continue;
      const active = id === app.state.activeLevelId;
      root.append(h('h4', { class: `checks-level ${active ? 'active' : ''}` }, name, h('span', { class: 'checks-count' }, String(list.length))));
      const ul = h('ul', { class: 'checks-list' });
      for (const iss of list) {
        const focus = app.checks.focusId === iss.id;
        ul.append(
          h(
            'li',
            { class: `check-item ${iss.level} ${focus ? 'focus' : ''}` },
            h(
              'button',
              { class: 'check-main', onclick: () => app.checks.focus(iss), 'aria-label': `${iss.title}. Показать на плане` },
              h('span', { class: 'check-dot', 'aria-hidden': 'true' }, '!'),
              h('span', { class: 'check-text' }, h('b', {}, iss.title), h('small', {}, iss.text)),
            ),
            iss.fix ? h('button', { class: 'btn btn-small check-fix', onclick: () => app.checks.fix(iss) }, iss.fix.label) : null,
          ),
        );
      }
      root.append(ul);
    }
    if (!app.state.settings.checks) {
      root.append(
        h(
          'p',
          { class: 'checks-note muted' },
          'Подсветка ошибок на плане выключена. ',
          h('button', { class: 'linklike', onclick: () => app.state.setSetting('checks', true) }, 'Включить'),
        ),
      );
    }
  }
}
