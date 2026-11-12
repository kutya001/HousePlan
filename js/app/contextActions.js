/**
 * Пункты контекстного меню для объекта под курсором (ПКМ или долгое нажатие).
 */
import { getEntity, KIND_LABEL, openingsOfWall, SITE_LEVEL } from '../model/project.js';
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

const AI_WHAT = { room: 'по этой комнате', wall: 'по этой стене', opening: 'по этому проёму', item: 'по этому предмету', stair: 'по этой лестнице', roof: 'по этой крыше', zone: 'по этой зоне', site: 'по участку' };

/**
 * «Запрос ИИ…»: открыть помощника с областью задания — он изменит только её.
 * Область — всё выделенное (объект под курсором входит в него), на пустом месте — активный этаж.
 */
export function aiItem(app, hit) {
  const ask = (target) => () => app.ui.side.ai.ask(target);
  if (!app.project.walls.length) return { label: 'Запрос ИИ: построить дом…', icon: 'spark', onClick: ask(null) };
  if (!hit) return { label: `Запрос ИИ по этажу «${app.state.level.name}»…`, icon: 'spark', onClick: ask({ levelId: app.state.activeLevelId }) };
  if (hit.kind === 'site') return { label: 'Запрос ИИ по участку…', icon: 'spark', onClick: ask({ levelId: SITE_LEVEL }) };
  const sel = app.state.selection.filter((s) => s.kind !== 'site');
  const many = sel.length > 1 && sel.some((s) => s.kind === hit.kind && s.id === hit.id);
  const target = { selection: (many ? sel : [hit]).map((s) => ({ kind: s.kind, id: s.id })) };
  return { label: many ? `Запрос ИИ по выделенному (${sel.length})…` : `Запрос ИИ ${AI_WHAT[hit.kind] || 'по этому объекту'}…`, icon: 'spark', onClick: ask(target) };
}

export function buildContextItems(app, { hit, world }) {
  const c = app.commands;
  const ai = aiItem(app, hit);
  const props = { label: 'Свойства', icon: 'panel', onClick: () => app.bus.emit('properties:focus', hit) };
  const del = { label: 'Удалить', icon: 'trash', kbd: 'Del', danger: true, onClick: () => c.deleteSelection() };
  const dup = { label: 'Дублировать', icon: 'copy', kbd: 'Ctrl+D', onClick: () => c.duplicate() };
  const rot = { label: 'Повернуть на 90°', icon: 'rotate', kbd: 'R', onClick: () => c.rotateSelection(90) };
  const sep = { separator: true };
  const walkHere = { label: 'Пройтись отсюда манекеном', icon: 'person', onClick: () => app.walk(world) };
  const spawnHere = { label: 'Появляться здесь при прогулке', icon: 'pin', onClick: () => c.setSpawn(world) };

  if (!hit) {
    const sel = app.editor.tools.select;
    return [
      { label: 'Вставить', icon: 'copy', kbd: 'Ctrl+V', disabled: !c.clipboard?.length, onClick: () => c.paste() },
      { label: 'Выделить всё на этаже', icon: 'select', kbd: 'Ctrl+A', onClick: () => c.selectAll() },
      app.state.coarse ? { label: 'Выделить рамкой', icon: 'room', onClick: () => sel.armMarquee() } : null,
      sep,
      ai,
      { label: 'Показать весь дом', icon: 'fit', kbd: 'Home', onClick: () => app.editor.fitToContent() },
      { label: 'Новая стена отсюда', icon: 'wall', onClick: () => app.editor.setTool('wall') },
      walkHere,
      spawnHere,
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
        ai,
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
        ai,
        sep,
        { label: 'Открывание на другую сторону', icon: 'flip', kbd: 'X', onClick: () => c.flipOpening(false) },
        { label: 'Петли с другой стороны', icon: 'flip', kbd: 'Shift+X', onClick: () => c.flipOpening(true) },
        sep,
        del,
      ];
    case 'item':
    case 'stair':
    case 'roof':
      return [props, ai, sep, dup, rot, { label: 'Повернуть на 15°', icon: 'rotate', kbd: 'E', onClick: () => c.rotateSelection(15) }, sep, del];
    case 'room':
      return [
        { ...props, label: 'Переименовать и пол' },
        ai,
        { ...walkHere, label: 'Пройтись здесь манекеном' },
        spawnHere,
        sep,
        { label: 'Разделить пополам', icon: 'wall', onClick: () => c.splitRoom(hit.id, 'auto') },
        { label: 'Пополам вертикальной стеной', icon: 'wall', onClick: () => c.splitRoom(hit.id, 'vertical') },
        { label: 'Пополам горизонтальной стеной', icon: 'wall', onClick: () => c.splitRoom(hit.id, 'horizontal') },
        sep,
        { ...del, label: 'Удалить пол комнаты' },
      ];
    case 'zone':
      return [props, ai, walkHere, spawnHere, sep, dup, del];
    case 'site':
      return [{ ...props, label: 'Участок и забор' }, { label: 'Размер участка…', icon: 'site', onClick: () => app.ui.presets.open('site') }, ai, walkHere, spawnHere];
    default:
      return [props, ai, del];
  }
}
