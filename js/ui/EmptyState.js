/** Стартовый экран поверх пустого плана: быстрые способы начать. */
import { h, icon, clear } from './dom.js';

export class EmptyState {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.dismissed = false;
    this._build();
    app.bus.on('project:changed', () => this.sync());
    app.bus.on('tool:changed', () => this.sync());
    this.sync();
  }

  _build() {
    const app = this.app;
    const box = (floors, roof) => () => {
      const tool = app.editor.tools.box;
      tool.settings.floors = String(floors);
      tool.settings.roof = roof;
      app.editor.setTool('box');
      app.bus.emit('tool:options-refresh');
    };
    const actions = [
      ['box', 'Коробка, 1 этаж', 'Протяните прямоугольник на плане', box(1, 'none')],
      ['box2', 'Коробка, 2 этажа', 'Сразу два этажа и двускатная крыша', box(2, 'gable')],
      ['presets', 'Готовый дом', 'Пять планировок с мебелью и участком', () => app.ui.presets.open()],
      ['wall', 'Нарисовать стены', 'Точка за точкой, с привязками', () => app.editor.setTool('wall')],
    ];
    clear(this.root);
    this.root.append(
      h(
        'div',
        { class: 'empty-card' },
        h('h2', {}, 'С чего начнём?'),
        h('p', { class: 'muted' }, 'План пока пустой. Выберите заготовку или нарисуйте дом сами — всё можно поменять позже.'),
        h(
          'div',
          { class: 'empty-actions' },
          actions.map(([ic, title, desc, fn]) =>
            h(
              'button',
              {
                class: 'empty-action',
                onclick: () => {
                  this.dismissed = true;
                  fn();
                  this.sync();
                },
              },
              icon(ic, 26),
              h('span', { class: 'empty-title' }, title),
              h('span', { class: 'empty-desc' }, desc),
            ),
          ),
        ),
        h(
          'button',
          {
            class: 'link-btn',
            onclick: () => {
              this.dismissed = true;
              this.sync();
            },
          },
          'Закрыть и осмотреться',
        ),
      ),
    );
  }

  sync() {
    const empty = this.app.project.walls.length === 0;
    if (!empty) this.dismissed = false;
    this.root.hidden = !empty || this.dismissed || this.app.state.toolId !== 'select';
  }
}
