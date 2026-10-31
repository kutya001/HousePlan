/**
 * Свойства выделенного объекта. Без выделения — параметры этажа и проекта.
 */
import { h, icon, clear } from './dom.js';
import { renderForm } from './Form.js';
import { SCHEMAS, LEVEL_SCHEMA, PROJECT_SCHEMA } from '../model/schemas.js';
import { getEntity, getLevel, KIND_LABEL } from '../model/project.js';
import { catalogItem } from '../model/catalog.js';
import { OPENING_KINDS } from '../model/defaults.js';

export class PropertiesPanel {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.forms = [];
    this.key = '';
    app.bus.on('selection:changed', () => this.render());
    app.bus.on('level:changed', () => this.render());
    app.bus.on('project:changed', ({ reason }) => {
      if (reason === 'undo' || reason === 'redo' || reason === 'load') this.render();
      else this.refresh();
    });
    app.bus.on('properties:focus', () => {
      this.app.ui.side.open('properties');
      // на телефоне не вызываем клавиатуру сразу — она закроет полшторки
      if (!this.app.state.coarse) requestAnimationFrame(() => this.root.querySelector('input[type=text], input')?.focus());
    });
    this.render();
  }

  refresh() {
    const sel = this.app.state.selection;
    const key = this._key(sel);
    if (key !== this.key) return this.render();
    for (const f of this.forms) f.refresh();
    this._refreshTitle?.();
  }

  _key(sel) {
    // поля формы зависят от вида объекта (форма лестницы, тип этажа) — при смене перестраиваем
    const p = this.app.project;
    const lvl = getLevel(p, this.app.state.activeLevelId);
    const one = sel.length === 1 ? getEntity(p, sel[0].kind, sel[0].id) : null;
    const shape = one ? `${one.shape ?? ''}${one.type ?? ''}${one.kind ?? ''}${one.style ?? ''}` : '';
    return `${this.app.state.activeLevelId}:${lvl?.kind}|${sel.map((s) => `${s.kind}:${s.id}`).join(',')}|${shape}`;
  }

  render() {
    const { app } = this;
    const sel = app.state.selection;
    this.key = this._key(sel);
    this.forms = [];
    this._refreshTitle = null;
    clear(this.root);

    if (sel.length === 0) return this._renderLevel();
    if (sel.length > 1) return this._renderMulti(sel);

    const ref = sel[0];
    const getTarget = () => getEntity(app.project, ref.kind, ref.id);
    const target = getTarget();
    if (!target) return this._renderLevel();
    const titleEl = h('h3', {}, this._title(ref, target));
    this._refreshTitle = () => {
      const t = getTarget();
      if (t) titleEl.textContent = this._title(ref, t);
    };
    const schema = SCHEMAS[ref.kind] || [];
    const form = renderForm(schema, getTarget, () => app.project, (field, value) => {
      app.store.commit((p) => field.set(getEntity(p, ref.kind, ref.id), value, p));
      if (field.rebuild) this.render();
    });
    this.forms.push(form);
    this.root.append(h('div', { class: 'panel-head' }, titleEl), form.el, this._actions(ref));
  }

  _title(ref, e) {
    if (ref.kind === 'item') return catalogItem(e.type)?.name || 'Объект';
    if (ref.kind === 'room') return e.name || 'Комната';
    if (ref.kind === 'opening') return OPENING_KINDS[e.kind] || 'Проём';
    return KIND_LABEL[ref.kind] || 'Объект';
  }

  _actions(ref) {
    const c = this.app.commands;
    const btn = (ic, label, fn, cls = '') => h('button', { class: `btn btn-small ${cls}`, onclick: fn }, icon(ic, 16), label);
    const list = [];
    if (ref.kind === 'opening') {
      list.push(btn('flip', 'Сторона', () => c.flipOpening(false)));
      list.push(btn('flip', 'Петли', () => c.flipOpening(true)));
    } else if (ref.kind === 'room') {
      list.push(btn('wall', 'Разделить пополам', () => c.splitRoom(ref.id)));
    } else if (ref.kind !== 'site') {
      list.push(btn('copy', 'Копия', () => c.duplicate()));
      if (['item', 'stair', 'roof', 'wall', 'room', 'zone'].includes(ref.kind)) list.push(btn('rotate', '90°', () => c.rotateSelection(90)));
    }
    if (ref.kind !== 'site') list.push(btn('trash', 'Удалить', () => c.deleteSelection(), 'btn-danger-ghost'));
    return h('div', { class: 'panel-actions' }, list);
  }

  _renderMulti(sel) {
    const c = this.app.commands;
    const counts = {};
    for (const s of sel) counts[s.kind] = (counts[s.kind] || 0) + 1;
    const summary = Object.entries(counts)
      .map(([k, n]) => `${KIND_LABEL[k] || k}: ${n}`)
      .join(', ');
    this.root.append(
      h('div', { class: 'panel-head' }, h('h3', {}, `Выделено: ${sel.length}`)),
      h('p', { class: 'muted' }, summary),
      h(
        'div',
        { class: 'panel-actions' },
        h('button', { class: 'btn btn-small', onclick: () => c.duplicate() }, icon('copy', 16), 'Копия'),
        h('button', { class: 'btn btn-small', onclick: () => c.rotateSelection(90) }, icon('rotate', 16), '90°'),
        h('button', { class: 'btn btn-small btn-danger-ghost', onclick: () => c.deleteSelection() }, icon('trash', 16), 'Удалить'),
      ),
    );
  }

  _renderLevel() {
    const { app } = this;
    const levelId = app.state.activeLevelId;
    const getLevelT = () => getLevel(app.project, levelId);
    const lf = renderForm(LEVEL_SCHEMA, getLevelT, () => app.project, (field, value) => {
      app.store.commit((p) => field.set(getLevel(p, levelId), value, p));
    });
    const pf = renderForm(PROJECT_SCHEMA, () => app.project, () => app.project, (field, value) => {
      app.store.commit((p) => field.set(p, value, p));
    });
    pf.el.classList.add('form-project');
    this.forms.push(lf, pf);
    this.root.append(
      h('div', { class: 'panel-head' }, h('h3', {}, getLevelT()?.name || 'Этаж')),
      lf.el,
      h(
        'div',
        { class: 'panel-actions' },
        h('button', { class: 'btn btn-small', onclick: () => app.commands.autoRooms() }, icon('room', 16), 'Найти комнаты'),
        h('button', { class: 'btn btn-small', onclick: () => app.editor.setTool('roof') }, icon('roof', 16), 'Крыша'),
      ),
      h('div', { class: 'panel-head panel-head-sub' }, h('h3', {}, 'Проект')),
      pf.el,
      h(
        'div',
        { class: 'panel-actions' },
        h('button', { class: 'btn btn-small', onclick: () => app.state.select({ kind: 'site', id: 'site' }) }, icon('site', 16), 'Участок и забор'),
      ),
      h('p', { class: 'muted small' }, 'Кликните по объекту на плане или в 3D, чтобы изменить его размеры, тип и цвет.'),
    );
  }
}
