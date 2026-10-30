/**
 * Панель действий с выделенным для телефона и планшета:
 * когда панель свойств скрыта, основные действия — под пальцем.
 */
import { h, icon, clear } from './dom.js';
import { contextTitle } from '../app/contextActions.js';

export class SelectionBar {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    for (const e of ['selection:changed', 'layout:changed', 'sheet:changed', 'tool:changed', 'view:changed']) app.bus.on(e, () => this.render());
    app.bus.on('project:changed', ({ reason }) => reason !== 'gesture' && this.render());
    this.render();
  }

  render() {
    const { app } = this;
    const sel = app.state.selection;
    const show = app.state.compact && sel.length > 0 && !app.ui.side?.isOpen && app.state.toolId === 'select';
    document.body.classList.toggle('has-selection', show);
    this.root.hidden = !show;
    if (!show) return;
    clear(this.root);
    const c = app.commands;
    const btn = (ic, label, fn, cls = '') => h('button', { class: `sel-btn ${cls}`, onclick: fn }, icon(ic, 20), h('span', {}, label));
    const one = sel.length === 1 ? sel[0] : null;
    const name = one ? contextTitle(app, one) : `Выделено: ${sel.length}`;
    const items = [h('span', { class: 'sel-name' }, name), btn('panel', 'Свойства', () => app.ui.side.open('properties'), 'primary')];
    if (one?.kind === 'opening') {
      items.push(btn('flip', 'Сторона', () => c.flipOpening(false)), btn('flip', 'Петли', () => c.flipOpening(true)));
    } else if (!one || one.kind !== 'site') {
      items.push(btn('copy', 'Копия', () => c.duplicate()));
      if (!one || ['item', 'stair', 'roof', 'wall', 'zone', 'room'].includes(one.kind)) items.push(btn('rotate', '90°', () => c.rotateSelection(90)));
    }
    if (!one || one.kind !== 'site') items.push(btn('trash', 'Удалить', () => c.deleteSelection(), 'danger'));
    items.push(btn('close', 'Снять', () => app.state.clearSelection()));
    this.root.append(...items);
  }
}
