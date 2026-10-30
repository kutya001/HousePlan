/**
 * Палитра команд (Ctrl+K): быстрый поиск инструментов, действий, мебели и пресетов.
 */
import { h, icon, clear } from './dom.js';
import { openModal } from './feedback.js';
import { TOOL_META } from './Toolbar.js';
import { CATALOG } from '../model/catalog.js';
import { HOUSE_PRESETS } from '../model/presets.js';

export class CommandPalette {
  constructor(app) {
    this.app = app;
  }

  _commands() {
    const app = this.app;
    const c = app.commands;
    const list = [];
    for (const [id, m] of Object.entries(TOOL_META)) {
      list.push({ label: m.label, hint: m.desc, icon: m.icon, group: `Инструмент · ${m.key}`, run: () => app.editor.setTool(id) });
    }
    const cmd = (label, ic, run, group = 'Действие') => list.push({ label, icon: ic, group, run });
    cmd('Отменить', 'undo', () => c.undo(), 'Ctrl+Z');
    cmd('Повторить', 'redo', () => c.redo(), 'Ctrl+Shift+Z');
    cmd('Добавить этаж (копировать наружные стены)', 'layers', () => c.addLevel('exterior'));
    cmd('Добавить пустой этаж', 'layers', () => c.addLevel('empty'));
    cmd('Найти все комнаты на этаже', 'room', () => c.autoRooms());
    cmd('Крыша по контуру верхнего этажа', 'roof', () => c.autoRoof());
    cmd('Выделить всё на этаже', 'select', () => c.selectAll(), 'Ctrl+A');
    cmd('Показать весь дом', 'fit', () => app.editor.fitToContent(), 'Home');
    cmd('Показать весь участок', 'fit', () => app.editor.fitToContent({ includeSite: true }));
    cmd('Вид: план', 'plan', () => app.setViewMode('plan'), 'Вид · 1');
    cmd('Вид: план и 3D', 'split', () => app.setViewMode('split'), 'Вид · 2');
    cmd('Вид: 3D', 'cube', () => app.setViewMode('3d'), 'Вид · 3');
    cmd('Прогулка по дому', 'walk', async () => {
      if (app.state.viewMode === 'plan') await app.setViewMode('split');
      (await app.ensure3D())?.startWalk();
    });
    cmd('Тёмная тема', 'moon', () => app.state.setSetting('theme', 'dark'), 'Оформление');
    cmd('Светлая тема', 'sun', () => app.state.setSetting('theme', 'light'), 'Оформление');
    cmd('Настройки', 'settings', () => app.ui.settings.open(), 'Приложение');
    cmd('Сохранить проект в файл', 'save', () => app.file.save(), 'Ctrl+S');
    cmd('Открыть файл проекта', 'open', () => app.file.open(), 'Ctrl+O');
    cmd('Новый проект', 'plus', () => c.newProject(), 'Файл');
    cmd('Картинка плана (PNG)', 'image', () => app.file.exportPlanPNG(), 'Файл');
    cmd('Картинка 3D (PNG)', 'image', () => app.file.export3DPNG(), 'Файл');
    cmd('Справка и горячие клавиши', 'help', () => app.ui.help.open(), 'F1');
    for (const l of app.project.levels) cmd(`Перейти: ${l.name}`, 'layers', () => app.state.setLevel(l.id), 'Этаж');
    for (const p of HOUSE_PRESETS) cmd(`Пресет: ${p.name}`, 'presets', () => c.applyHousePreset(p.id, {}), 'Пресет');
    for (const it of CATALOG) {
      list.push({
        label: `Поставить: ${it.name}`,
        icon: it.outdoor ? 'tree' : 'sofa',
        group: 'Каталог',
        run: () => app.editor.setTool('item', { type: it.type }),
      });
    }
    return list;
  }

  open() {
    const all = this._commands();
    let filtered = all;
    let active = 0;
    let modal;
    const input = h('input', { type: 'search', class: 'palette-input', placeholder: 'Что сделать? Например: окно, этаж, диван…', 'aria-label': 'Поиск команды', autofocus: true });
    const list = h('ul', { class: 'palette-list', role: 'listbox' });

    const run = (item) => {
      modal.close();
      setTimeout(() => item.run(), 0);
    };
    const render = () => {
      clear(list);
      if (!filtered.length) {
        list.append(h('li', { class: 'palette-empty' }, 'Ничего не найдено'));
        return;
      }
      filtered.slice(0, 60).forEach((it, i) => {
        const li = h(
          'li',
          {
            class: `palette-item ${i === active ? 'active' : ''}`,
            role: 'option',
            'aria-selected': String(i === active),
            onclick: () => run(it),
            onmousemove: () => {
              if (active !== i) {
                active = i;
                render();
              }
            },
          },
          icon(it.icon || 'dots', 18),
          h('span', {}, it.label),
          h('span', { class: 'palette-group' }, it.group || ''),
        );
        list.append(li);
      });
      list.children[active]?.scrollIntoView({ block: 'nearest' });
    };
    input.addEventListener('input', () => {
      const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      filtered = words.length ? all.filter((it) => words.every((w) => `${it.label} ${it.group || ''} ${it.hint || ''}`.toLowerCase().includes(w))) : all;
      active = 0;
      render();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        active = Math.min(filtered.length - 1, active + 1);
        render();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        active = Math.max(0, active - 1);
        render();
      } else if (e.key === 'Enter' && filtered[active]) {
        e.preventDefault();
        run(filtered[active]);
      }
    });
    render();
    modal = openModal(this.app, { title: 'Поиск команд', content: h('div', { class: 'palette' }, input, list) });
    setTimeout(() => input.focus(), 30);
  }
}
