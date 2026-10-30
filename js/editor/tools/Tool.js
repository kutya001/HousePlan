/**
 * Базовый инструмент. Все обработчики необязательны.
 *
 * options — описание полей панели параметров инструмента (над холстом):
 *   [{ key, label, type: 'segmented'|'number'|'select'|'checkbox'|'button', options, min, max, step, unit, action }]
 * Значения хранятся в this.settings, панель вызывает onOptionChange(key, value).
 */
export class Tool {
  constructor(editor) {
    this.editor = editor;
    this.app = editor.app;
    this.id = 'tool';
    this.name = 'Инструмент';
    this.hint = '';
    this.cursor = 'default';
    this.settings = {};
    this.options = [];
  }

  get project() {
    return this.app.store.project;
  }

  get store() {
    return this.app.store;
  }

  get state() {
    return this.app.state;
  }

  get levelId() {
    return this.app.state.activeLevelId;
  }

  /** Пиксели экрана в метры. */
  px(n) {
    return this.editor.viewport.px(n);
  }

  render() {
    this.editor.requestRender();
  }

  setHint(text) {
    this.editor.setHint(text);
  }

  toast(text, kind) {
    this.app.toast?.(text, kind);
  }

  onOptionChange(key, value) {
    this.settings[key] = value;
    this.render();
  }

  activate() {}
  deactivate() {
    this.cancel();
  }
  cancel() {}
  pointerDown() {}
  pointerMove() {}
  pointerUp() {}
  doubleClick() {}
  contextClick() {
    this.cancel();
  }
  /** Долгое нажатие пальцем; по умолчанию — как правый клик. */
  longPress(e) {
    this.contextClick(e);
  }
  /** Текущее касание прервано (второй палец, системный жест) — без потери начатого. */
  pointerCancel() {
    this.cancel();
  }
  /** Кнопки действий для панели параметров (например, «Готово», «Убрать точку»). */
  actions() {
    return [];
  }
  /** Сообщить панели, что действия/параметры поменялись. */
  refreshOptions() {
    this.app.bus.emit('tool:options-refresh');
  }
  keyDown() {
    return false;
  }
  drawOverlay() {}
}
