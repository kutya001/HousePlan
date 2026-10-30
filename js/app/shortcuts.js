/**
 * Горячие клавиши. Используются коды клавиш (ev.code), поэтому всё работает
 * и в русской раскладке: W — это и «W», и «Ц».
 */

export const TOOL_KEYS = {
  KeyV: 'select',
  KeyW: 'wall',
  KeyB: 'box',
  KeyP: 'room',
  KeyD: 'door',
  KeyO: 'window',
  KeyA: 'arch',
  KeyL: 'stair',
  KeyF: 'item',
  KeyK: 'roof',
  KeyU: 'site',
  KeyG: 'zone',
  KeyM: 'measure',
};

/** Для подсказок и справки. */
export const SHORTCUT_HELP = [
  ['Инструменты', [
    ['V', 'Выбор'],
    ['W', 'Стена'],
    ['B', 'Коробка'],
    ['P', 'Комната (пол)'],
    ['D / O / A', 'Дверь / окно / проём'],
    ['L', 'Лестница'],
    ['F', 'Мебель'],
    ['K', 'Крыша'],
    ['U / G', 'Участок / ландшафт'],
    ['M', 'Рулетка'],
  ]],
  ['Правка', [
    ['Ctrl+Z / Ctrl+Shift+Z', 'Отменить / повторить'],
    ['Delete', 'Удалить выделенное'],
    ['Ctrl+D', 'Дублировать'],
    ['Ctrl+C / Ctrl+V', 'Копировать / вставить'],
    ['Ctrl+A', 'Выделить всё на этаже'],
    ['R / Shift+R', 'Повернуть на 90°'],
    ['Q / E', 'Повернуть на 15°'],
    ['X / Shift+X', 'Дверь: сторона открывания / петли'],
    ['Стрелки', 'Сдвинуть на 5 см (с Shift — на 50 см)'],
    ['Esc', 'Отмена, затем инструмент «Выбор»'],
    ['Правая кнопка', 'Меню действий для объекта'],
  ]],
  ['Телефон и планшет', [
    ['Касание', 'Выбрать объект; по пустому месту — снять выделение'],
    ['Палец по пустому месту', 'Сдвинуть план'],
    ['Два пальца', 'Масштаб и сдвиг'],
    ['Долгое нажатие', 'Меню действий'],
    ['Рисование', 'Точка ставится, когда отпускаете палец'],
  ]],
  ['Во время рисования', [
    ['Число + Enter', 'Точная длина стены, м (для коробки: 8x10)'],
    ['Shift', 'Углы кратно 45°'],
    ['Alt', 'Без привязок (середина, центр комнаты, вплотную, в угол)'],
    ['Enter / двойной клик', 'Закончить'],
    ['Backspace', 'Убрать последнюю точку'],
  ]],
  ['Вид', [
    ['1 / 2 / 3', 'План / план + 3D / 3D'],
    ['PageUp / PageDown', 'Этаж выше / ниже'],
    ['Колесо, + / −', 'Масштаб'],
    ['Home', 'Показать весь дом'],
    ['Пробел + мышь, правая кнопка', 'Сдвинуть план'],
  ]],
  ['Прогулка манекеном (3D)', [
    ['W A S D, Shift', 'Идти, бежать (камера — мышью или пальцем)'],
    ['Пробел', 'Прыжок; у стола, кровати, уступа — залезть'],
    ['E', 'Открыть / закрыть дверь, сесть, лечь, встать'],
    ['C / Z', 'Сесть / лечь (на пол, если рядом ничего нет)'],
    ['V, колесо', 'Вид из глаз / со спины, ближе / дальше'],
    ['Клик по объекту', 'Выбрать и править: Delete, R, свойства'],
    ['Esc', 'Закончить прогулку'],
  ]],
  ['Файл', [
    ['Ctrl+S', 'Сохранить проект в файл'],
    ['Ctrl+O', 'Открыть файл проекта'],
    ['Ctrl+K', 'Поиск команд'],
    ['Ctrl+,', 'Настройки'],
    ['F1 или ?', 'Эта справка'],
  ]],
];

function isTyping(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function setupShortcuts(app) {
  window.addEventListener('keydown', (ev) => {
    if (app.modalOpen) return;
    if (isTyping(ev.target)) {
      if (ev.key === 'Escape') ev.target.blur();
      return;
    }
    if (app.view3d?.keyDown(ev)) {
      ev.preventDefault();
      return;
    }
    const ctrl = ev.ctrlKey || ev.metaKey;
    if (!ctrl && app.editor.keyDown(ev)) {
      ev.preventDefault();
      return;
    }
    const cmd = app.commands;
    const code = ev.code;
    let handled = true;

    if (ctrl) {
      if (code === 'KeyZ') ev.shiftKey ? cmd.redo() : cmd.undo();
      else if (code === 'KeyY') cmd.redo();
      else if (code === 'KeyD') cmd.duplicate();
      else if (code === 'KeyC') cmd.copy();
      else if (code === 'KeyV') cmd.paste();
      else if (code === 'KeyA') cmd.selectAll();
      else if (code === 'KeyS') app.file.save();
      else if (code === 'KeyO') app.file.open();
      else if (code === 'KeyK') app.ui.palette.open();
      else if (code === 'Comma') app.ui.settings.open();
      else handled = false;
    } else if (code === 'Delete' || code === 'Backspace') cmd.deleteSelection();
    else if (code === 'Escape') {
      if (app.state.toolId !== 'select') app.editor.setTool('select');
      else if (app.ui.side.isOpen && app.state.compact) app.ui.side.close();
      else app.state.clearSelection();
    } else if (code.startsWith('Arrow') && app.state.selection.length) {
      const s = ev.shiftKey ? 0.5 : 0.05;
      const d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[code];
      cmd.nudge(d[0], d[1]);
    } else if (code === 'KeyR' && app.state.selection.length) cmd.rotateSelection(ev.shiftKey ? -90 : 90);
    else if (code === 'KeyQ' && app.state.selection.length) cmd.rotateSelection(-15);
    else if (code === 'KeyE' && app.state.selection.length) cmd.rotateSelection(15);
    else if (code === 'KeyX' && cmd.flipOpening(ev.shiftKey)) {
      /* перевёрнуто */
    } else if (TOOL_KEYS[code]) app.editor.setTool(TOOL_KEYS[code]);
    else if (code === 'Digit1') app.setViewMode('plan');
    else if (code === 'Digit2') app.setViewMode('split');
    else if (code === 'Digit3') app.setViewMode('3d');
    else if (code === 'PageUp' || code === 'PageDown') {
      const levels = app.project.levels;
      const i = levels.findIndex((l) => l.id === app.state.activeLevelId);
      const j = Math.max(0, Math.min(levels.length - 1, i + (code === 'PageUp' ? 1 : -1)));
      app.state.setLevel(levels[j].id);
    } else if (code === 'Equal' || code === 'NumpadAdd') app.editor.zoomBy(1.25);
    else if (code === 'Minus' || code === 'NumpadSubtract') app.editor.zoomBy(0.8);
    else if (code === 'Home') {
      app.editor.fitToContent();
      app.view3d?.frame();
    } else if (code === 'F1' || ev.key === '?') app.ui.help.open();
    else handled = false;

    if (handled) ev.preventDefault();
  });

  window.addEventListener('keyup', (ev) => {
    app.editor.keyUp(ev);
    app.view3d?.keyUp(ev);
  });
}
