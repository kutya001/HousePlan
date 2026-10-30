/**
 * Пункты контекстного меню для объекта под курсором (ПКМ или долгое нажатие).
 */
import { getEntity, KIND_LABEL, openingsOfWall } from '../model/project.js';
import { catalogItem } from '../model/catalog.js';
import { OPENING_KINDS } from '../model/defaults.js';
import { addOpeningAt, splitWall } from '../model/operations.js';
import { canPlaceOpening } from '../geometry/wallGeometry.js';
import { clearSegmentAt } from '../geometry/alignment.js';
import { projectOnSegment, dot, sub } from '../core/geometry.js';
import { snapOpening } from '../editor/smartSnap.js';
import { DEFAULTS } from '../model/defaults.js';

export function contextTitle(app, ref) {
  if (!ref) return 'План';
  const e = getEntity(app.project, ref.kind, ref.id);
  if (!e) return '';
  if (ref.kind === 'item') return catalogItem(e.type)?.name || 'Объект';
  if (ref.kind === 'room') return e.name || 'Комната';
  if (ref.kind === 'opening') return OPENING_KINDS[e.kind] || 'Проём';
  return KIND_LABEL[ref.kind] || 'Объект';
}

export function buildContextItems(app, { hit, world }) {
  const c = app.commands;
  const props = { label: 'Свойства', icon: 'panel', onClick: () => app.bus.emit('properties:focus', hit) };
  const del = { label: 'Удалить', icon: 'trash', kbd: 'Del', danger: true, onClick: () => c.deleteSelection() };
  const dup = { label: 'Дублировать', icon: 'copy', kbd: 'Ctrl+D', onClick: () => c.duplicate() };
  const rot = { label: 'Повернуть на 90°', icon: 'rotate', kbd: 'R', onClick: () => c.rotateSelection(90) };
  const sep = { separator: true };
  const walkHere = { label: 'Пройтись отсюда манекеном', icon: 'person', onClick: () => app.walk(world) };

  if (!hit) {
    const sel = app.editor.tools.select;
    return [
      { label: 'Вставить', icon: 'copy', kbd: 'Ctrl+V', disabled: !c.clipboard?.length, onClick: () => c.paste() },
      { label: 'Выделить всё на этаже', icon: 'select', kbd: 'Ctrl+A', onClick: () => c.selectAll() },
      app.state.coarse ? { label: 'Выделить рамкой', icon: 'room', onClick: () => sel.armMarquee() } : null,
      sep,
      { label: 'Показать весь дом', icon: 'fit', kbd: 'Home', onClick: () => app.editor.fitToContent() },
      { label: 'Новая стена отсюда', icon: 'wall', onClick: () => app.editor.setTool('wall') },
      walkHere,
    ];
  }

  switch (hit.kind) {
    case 'wall': {
      const w = getEntity(app.project, 'wall', hit.id);
      const geomOf = () => app.editor.geomsFor(w.levelId).get(w.id);
      const side = () => {
        const g = geomOf();
        return dot(sub(world, g.a), g.n) >= 0 ? 1 : -1;
      };
      const place = (kind, center = false) => () => {
        const g = geomOf();
        if (!g) return;
        const width = DEFAULTS[kind]?.width ?? 1;
        const along = projectOnSegment(world, g.a, g.b).along;
        let t = center ? clearSegmentAt(app.editor.geomsFor(w.levelId), g, along, side()).c : snapOpening(app.editor, g, along, width, { kind, side: side() }).t;
        t = Math.max(width / 2 + 0.06, Math.min(g.len - width / 2 - 0.06, t));
        if (!canPlaceOpening(g, openingsOfWall(app.project, w.id), t, width)) {
          app.toast('Здесь не помещается: мешает другой проём или конец стены', 'warn');
          return;
        }
        let id;
        app.store.commit((p) => {
          const pt = { x: g.a.x + g.d.x * t, y: g.a.y + g.d.y * t };
          id = addOpeningAt(p, getEntity(p, 'wall', w.id), pt, kind).id;
        });
        app.state.select({ kind: 'opening', id });
      };
      return [
        props,
        sep,
        { label: 'Дверь здесь', icon: 'door', onClick: place('door') },
        { label: 'Окно здесь', icon: 'window', onClick: place('window') },
        { label: 'Окно по центру комнаты', icon: 'window', onClick: place('window', true) },
        {
          label: 'Разделить стену здесь',
          icon: 'cut',
          onClick: () => {
            let ids = null;
            app.store.commit((p) => (ids = splitWall(p, w.id, world)));
            if (ids) {
              app.state.select({ kind: 'wall', id: ids[1] });
              app.toast('Стена разделена на две');
            } else app.toast('Слишком близко к концу стены', 'warn');
          },
        },
        sep,
        dup,
        del,
      ];
    }
    case 'opening':
      return [
        props,
        sep,
        { label: 'Открывание на другую сторону', icon: 'flip', kbd: 'X', onClick: () => c.flipOpening(false) },
        { label: 'Петли с другой стороны', icon: 'flip', kbd: 'Shift+X', onClick: () => c.flipOpening(true) },
        sep,
        del,
      ];
    case 'item':
    case 'stair':
    case 'roof':
      return [props, sep, dup, rot, { label: 'Повернуть на 15°', icon: 'rotate', kbd: 'E', onClick: () => c.rotateSelection(15) }, sep, del];
    case 'room':
      return [
        { ...props, label: 'Переименовать и пол' },
        { ...walkHere, label: 'Пройтись здесь манекеном' },
        sep,
        { label: 'Разделить пополам', icon: 'wall', onClick: () => c.splitRoom(hit.id, 'auto') },
        { label: 'Пополам вертикальной стеной', icon: 'wall', onClick: () => c.splitRoom(hit.id, 'vertical') },
        { label: 'Пополам горизонтальной стеной', icon: 'wall', onClick: () => c.splitRoom(hit.id, 'horizontal') },
        sep,
        { ...del, label: 'Удалить пол комнаты' },
      ];
    case 'zone':
      return [props, walkHere, sep, dup, del];
    case 'site':
      return [{ ...props, label: 'Участок и забор' }, { label: 'Размер участка…', icon: 'site', onClick: () => app.ui.presets.open('site') }, walkHere];
    default:
      return [props, del];
  }
}
