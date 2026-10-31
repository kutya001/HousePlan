/**
 * Живая проверка проекта: после каждой правки (с задержкой, чтобы не мешать
 * перетаскиванию) ищет предметы друг в друге, в стенах, загороженные двери,
 * накладывающиеся постройки. Результат — app.checks.issues и событие checks:changed;
 * его показывают план (красные пятна), вкладка «Проверка» и строка состояния.
 */
import { checkProject, applyFix, canAutoFix, summarizeIssues, plural } from '../model/validate.js';
import { groundLevel, SITE_LEVEL, getLevel } from '../model/project.js';

export class ProjectChecks {
  constructor(app) {
    this.app = app;
    this.issues = [];
    this.focusId = null; // проблема, выбранная в списке, — на плане обведена ярче
    this._timer = null;
    app.bus.on('project:changed', ({ reason }) => {
      // во время перетаскивания проверяем реже; после загрузки — сразу и с уведомлением
      const delay = reason === 'gesture' ? 600 : reason === 'load' ? 0 : 250;
      this.schedule(delay, reason === 'load');
    });
  }

  get errors() {
    return this.issues.filter((i) => i.level === 'error');
  }

  get summary() {
    return summarizeIssues(this.issues);
  }

  schedule(delay = 250, announce = false) {
    clearTimeout(this._timer);
    this._announce = this._announce || announce;
    this._timer = setTimeout(() => this.run(), delay);
  }

  run() {
    clearTimeout(this._timer);
    let issues = [];
    try {
      issues = checkProject(this.app.project);
    } catch (err) {
      console.error('Проверка проекта', err);
    }
    this.issues = issues;
    if (this.focusId && !issues.some((i) => i.id === this.focusId)) this.focusId = null;
    this.app.bus.emit('checks:changed', { issues });
    if (this._announce) {
      this._announce = false;
      const e = this.errors.length;
      if (e) {
        const first = this.errors[0].title;
        this.app.toast(e > 1 ? `В проекте ${e} ${plural(e, 'ошибка', 'ошибки', 'ошибок')} — например, «${first.toLowerCase()}»` : `Ошибка в проекте: ${first.toLowerCase()}`, 'warn', {
          action: { label: 'Показать', onClick: () => this.open() },
        });
      }
    }
    return issues;
  }

  /** Открыть вкладку «Проверка». */
  open() {
    this.app.ui.side?.open('checks', 'half');
  }

  /** Этаж, на котором видна проблема (участок — на первом этаже). */
  levelOf(issue) {
    if (!issue.levelId || issue.levelId === SITE_LEVEL) return groundLevel(this.app.project)?.id;
    return getLevel(this.app.project, issue.levelId) ? issue.levelId : null;
  }

  /** Показать проблему: этаж, выделение, план по центру. */
  focus(issue) {
    const { state, editor } = this.app;
    this.focusId = issue.id;
    const lvl = this.levelOf(issue);
    if (lvl && lvl !== state.activeLevelId && !this.app.view3d?.walking) state.setLevel(lvl);
    const refs = issue.refs.filter((r) => r.kind !== 'opening' || issue.refs.length === 1);
    state.setSelection(refs.length ? refs.slice(0, 2) : []);
    if (state.isPhone && state.viewMode !== 'plan') this.app.setViewMode('plan');
    if (issue.at) editor.centerOn(issue.at);
    // на телефоне и планшете панель закрывает план — убираем её и коротко напоминаем, что не так
    if (state.isPhone || state.compact) {
      this.app.ui.side?.close();
      this.app.toast(`${issue.title}. ${issue.text}`, issue.level === 'error' ? 'warn' : 'info', issue.fix ? { action: { label: issue.fix.label, onClick: () => this.fix(issue) } } : {});
    }
    this.app.bus.emit('checks:changed', { issues: this.issues });
  }

  /** Исправить одну проблему. */
  fix(issue) {
    const f = issue.fix;
    if (!f) return;
    if (f.kind === 'autoRooms') {
      this.app.commands.autoRooms(f.levelId);
      return;
    }
    this.app.store.commit((p) => applyFix(p, f));
    this.app.toast(`Исправлено: ${issue.title.toLowerCase()}`, 'info', { action: { label: 'Отменить', onClick: () => this.app.commands.undo() } });
    this.run();
  }

  /** Исправить всё, что можно без участия человека (несколько проходов — сдвиг может задеть соседа). */
  fixAll() {
    const before = this.issues.filter(canAutoFix).length;
    if (!before) return;
    this.app.store.commit((p) => {
      for (let round = 0; round < 4; round++) {
        const list = checkProject(p).filter(canAutoFix);
        if (!list.length) break;
        const moved = new Set();
        for (const i of list) {
          // один предмет за проход двигаем один раз — иначе сдвиги складываются
          const key = i.fix.itemId || i.fix.wallId;
          if (moved.has(key)) continue;
          moved.add(key);
          applyFix(p, i.fix);
        }
      }
    });
    const left = this.run();
    const fixed = Math.max(0, before - left.filter(canAutoFix).length);
    this.app.toast(left.length ? `Исправлено автоматически: ${fixed}. Осталось: ${summarizeIssues(left)}` : 'Всё исправлено — ошибок нет', 'info', {
      action: { label: 'Отменить', onClick: () => this.app.commands.undo() },
    });
  }
}
