/**
 * Хранилище проекта с историей изменений (undo / redo).
 *
 * Данные проекта — обычный изменяемый объект. Перед каждым изменением
 * в стек отмены кладётся снимок (JSON), поэтому любая операция отменяема.
 *
 * Два способа менять данные:
 *  1. store.commit(fn)            — одно действие = один шаг истории;
 *  2. beginGesture / gesture / endGesture — для перетаскиваний:
 *     пока пользователь тянет объект, изменений много, а шаг истории один.
 */
export class Store {
  constructor(bus, project, { limit = 120 } = {}) {
    this.bus = bus;
    this._project = project;
    this._undo = [];
    this._redo = [];
    this._limit = limit;
    this._gesture = null; // { snapshot, dirty }
  }

  get project() {
    return this._project;
  }

  get canUndo() {
    return this._undo.length > 0;
  }

  get canRedo() {
    return this._redo.length > 0;
  }

  /** Выполнить изменение как один шаг истории. */
  commit(mutator, reason = 'edit') {
    this._pushUndo(this._serialize());
    mutator(this._project);
    this._emit(reason);
  }

  /** Начать жест (перетаскивание). Снимок делается сразу, в историю попадает при первом изменении. */
  beginGesture() {
    this._gesture = { snapshot: this._serialize(), dirty: false };
  }

  /** Изменение внутри жеста. */
  gesture(mutator) {
    if (!this._gesture) this.beginGesture();
    if (!this._gesture.dirty) {
      this._pushUndo(this._gesture.snapshot);
      this._gesture.dirty = true;
    }
    mutator(this._project);
    this._emit('gesture');
  }

  endGesture() {
    const wasDirty = this._gesture?.dirty;
    this._gesture = null;
    if (wasDirty) this._emit('gesture-end');
    return !!wasDirty;
  }

  /** Отменить текущий жест и вернуть данные как было до него. */
  cancelGesture() {
    if (this._gesture?.dirty) {
      this._project = JSON.parse(this._gesture.snapshot);
      this._undo.pop();
      this._emit('cancel');
    }
    this._gesture = null;
  }

  undo() {
    if (!this.canUndo) return false;
    this._redo.push(this._serialize());
    this._project = JSON.parse(this._undo.pop());
    this._emit('undo');
    return true;
  }

  redo() {
    if (!this.canRedo) return false;
    this._undo.push(this._serialize());
    this._project = JSON.parse(this._redo.pop());
    this._emit('redo');
    return true;
  }

  /** Заменить проект целиком (загрузка файла, пресет). */
  load(project, { keepHistory = false } = {}) {
    if (keepHistory) this._pushUndo(this._serialize());
    else {
      this._undo = [];
      this._redo = [];
    }
    this._project = project;
    this._emit('load');
  }

  /** Сообщить об изменении без записи в историю (например, переименование во время ввода). */
  touch(reason = 'touch') {
    this._emit(reason);
  }

  _serialize() {
    return JSON.stringify(this._project);
  }

  _pushUndo(snapshot) {
    this._undo.push(snapshot);
    if (this._undo.length > this._limit) this._undo.shift();
    this._redo = [];
  }

  _emit(reason) {
    this.bus.emit('project:changed', { reason });
    this.bus.emit('history:changed', { canUndo: this.canUndo, canRedo: this.canRedo });
  }
}
