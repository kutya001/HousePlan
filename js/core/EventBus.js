/**
 * Простая шина событий. Модули общаются через неё, не зная друг о друге.
 *
 * События приложения:
 *  project:changed   — изменились данные проекта (payload: { reason })
 *  history:changed   — изменились стеки undo/redo
 *  selection:changed — изменилось выделение
 *  level:changed     — сменился активный этаж
 *  tool:changed      — сменился инструмент
 *  view:changed      — сменился режим отображения (2D / 2D+3D / 3D)
 *  settings:changed  — изменились настройки (привязка, размеры и т.п.)
 *  hint:changed      — подсказка в строке состояния
 *  cursor:moved      — координаты курсора на плане
 */
export class EventBus {
  constructor() {
    this._handlers = new Map();
  }

  on(event, handler) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    this._handlers.get(event)?.delete(handler);
  }

  emit(event, payload) {
    const set = this._handlers.get(event);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] ошибка в обработчике "${event}"`, err);
      }
    }
  }
}
