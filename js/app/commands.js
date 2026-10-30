/**
 * Команды уровня приложения: их вызывают кнопки, меню и горячие клавиши.
 * Каждая команда — один шаг истории.
 */
import { getEntity, removeEntity, removeLevel, createLevel, levelIndex, createEmptyProject, normalizeProject, SITE_LEVEL } from '../model/project.js';
import { copyLevelLayout, duplicateEntities, autoRoofRect } from '../model/operations.js';
import { createRoom, createRoof } from '../model/factories.js';
import { findFaces } from '../geometry/roomDetect.js';
import { pointInPolygon, polygonLabelPoint, normalizeDeg, rotate, DEG, bboxOf } from '../core/geometry.js';
import { buildHousePreset, HOUSE_PRESETS } from '../model/presets.js';
import { DEFAULTS } from '../model/defaults.js';

export class Commands {
  constructor(app) {
    this.app = app;
    this.clipboard = null;
  }

  get store() {
    return this.app.store;
  }
  get state() {
    return this.app.state;
  }
  get project() {
    return this.app.store.project;
  }

  undo() {
    this.app.editor.tool?.cancel?.();
    if (!this.store.undo()) this.app.toast('Отменять нечего');
  }

  redo() {
    this.app.editor.tool?.cancel?.();
    if (!this.store.redo()) this.app.toast('Повторять нечего');
  }

  deleteSelection() {
    const sel = this.state.selection.filter((s) => s.kind !== 'site');
    if (!sel.length) return;
    this.store.commit((p) => {
      for (const s of sel) removeEntity(p, s.kind, s.id);
    });
    this.state.clearSelection();
    this.app.toast(sel.length > 1 ? `Удалено объектов: ${sel.length}` : 'Удалено');
  }

  _snapshotSelection() {
    const out = [];
    for (const s of this.state.selection) {
      const e = getEntity(this.project, s.kind, s.id);
      if (!e || s.kind === 'site') continue;
      out.push({ kind: s.kind, data: JSON.parse(JSON.stringify(e)) });
      if (s.kind === 'wall') {
        for (const o of this.project.openings.filter((x) => x.wallId === e.id)) out.push({ kind: 'opening', data: { ...o } });
      }
    }
    return out;
  }

  copy() {
    const snap = this._snapshotSelection();
    if (!snap.length) return;
    this.clipboard = snap;
    this.app.toast(`Скопировано: ${snap.filter((s) => s.kind !== 'opening').length}`);
  }

  paste() {
    if (!this.clipboard?.length) return this.app.toast('Буфер пуст — сначала скопируйте объекты (Ctrl+C)');
    let refs = [];
    this.store.commit((p) => {
      refs = duplicateEntities(p, this.clipboard, { x: 0.5, y: 0.5 }, this.state.activeLevelId);
    });
    this.state.setSelection(refs.filter((r) => r.kind !== 'opening'));
  }

  duplicate() {
    const snap = this._snapshotSelection();
    if (!snap.length) return;
    let refs = [];
    this.store.commit((p) => {
      refs = duplicateEntities(p, snap, { x: 0.5, y: 0.5 }, this.state.activeLevelId);
    });
    this.state.setSelection(refs.filter((r) => r.kind !== 'opening'));
  }

  selectAll() {
    const { project } = this;
    const lvl = this.state.activeLevelId;
    const refs = [];
    for (const w of project.walls) if (w.levelId === lvl) refs.push({ kind: 'wall', id: w.id });
    for (const k of ['rooms', 'stairs', 'items', 'roofs']) {
      const kind = { rooms: 'room', stairs: 'stair', items: 'item', roofs: 'roof' }[k];
      for (const e of project[k]) if (e.levelId === lvl) refs.push({ kind, id: e.id });
    }
    this.state.setSelection(refs);
  }

  /** Повернуть выделенное: одиночный объект — вокруг своего центра, группу — вокруг общего центра. */
  rotateSelection(deg) {
    const sel = this.state.selection;
    if (!sel.length) return;
    const pts = [];
    for (const s of sel) {
      const e = getEntity(this.project, s.kind, s.id);
      if (!e) continue;
      if ('x' in e && 'y' in e) pts.push({ x: e.x, y: e.y });
      if (s.kind === 'wall') pts.push({ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 });
      if (e.points) pts.push(...e.points);
    }
    if (!pts.length) return;
    const bb = bboxOf(pts);
    const c = { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 };
    const rad = deg * DEG;
    this.store.commit((p) => {
      for (const s of sel) {
        const e = getEntity(p, s.kind, s.id);
        if (!e) continue;
        if (s.kind === 'wall') {
          const a = rotate({ x: e.x1, y: e.y1 }, rad, c);
          const b = rotate({ x: e.x2, y: e.y2 }, rad, c);
          Object.assign(e, { x1: a.x, y1: a.y, x2: b.x, y2: b.y });
        } else if (e.points) {
          e.points = e.points.map((q) => rotate(q, rad, c));
        } else if ('rotation' in e) {
          const q = rotate({ x: e.x, y: e.y }, rad, c);
          e.x = q.x;
          e.y = q.y;
          e.rotation = normalizeDeg((e.rotation || 0) + deg);
        }
      }
    });
  }

  nudge(dx, dy) {
    const sel = this.state.selection;
    if (!sel.length) return false;
    this.store.commit((p) => {
      for (const s of sel) {
        const e = getEntity(p, s.kind, s.id);
        if (!e) continue;
        if (s.kind === 'wall') {
          e.x1 += dx;
          e.x2 += dx;
          e.y1 += dy;
          e.y2 += dy;
        } else if (e.points) e.points.forEach((q) => ((q.x += dx), (q.y += dy)));
        else if (s.kind === 'site') p.site.boundary.forEach((q) => ((q.x += dx), (q.y += dy)));
        else if ('x' in e) {
          e.x += dx;
          e.y += dy;
        }
      }
    });
    return true;
  }

  flipOpening(hinge = false) {
    const sel = this.state.selection.filter((s) => s.kind === 'opening');
    if (!sel.length) return false;
    this.store.commit((p) => {
      for (const s of sel) {
        const o = getEntity(p, 'opening', s.id);
        if (!o) continue;
        if (hinge) o.flipHinge = !o.flipHinge;
        else o.flipSide = !o.flipSide;
      }
    });
    return true;
  }

  // ── Этажи ──────────────────────────────────────────────────────────────

  /** mode: 'exterior' — копировать наружные стены, 'all' — всю планировку, 'empty' — пустой. */
  addLevel(mode = 'exterior') {
    let id;
    const from = this.project.levels[this.project.levels.length - 1];
    this.store.commit((p) => {
      const lvl = createLevel(p.levels.length, { height: from.height, slab: from.slab });
      p.levels.push(lvl);
      id = lvl.id;
      if (mode !== 'empty') copyLevelLayout(p, from.id, lvl.id, { exteriorOnly: mode === 'exterior', rooms: mode === 'all' });
      if (mode === 'exterior') this._roomFromOutline(p, lvl.id);
      // крыша переезжает на новый верхний этаж
      for (const r of p.roofs) if (r.levelId === from.id) r.levelId = lvl.id;
    });
    this.state.setLevel(id);
    this.app.toast(mode === 'empty' ? 'Добавлен пустой этаж' : 'Этаж добавлен, наружные стены скопированы');
  }

  _roomFromOutline(p, levelId) {
    const faces = findFaces(p.walls.filter((w) => w.levelId === levelId));
    for (const f of faces) p.rooms.push(createRoom(levelId, f.poly, { name: 'Комната' }));
  }

  removeLevel(levelId) {
    if (this.project.levels.length <= 1) return this.app.toast('Нельзя удалить единственный этаж', 'warn');
    const lvl = this.project.levels.find((l) => l.id === levelId);
    this.app.confirm(`Удалить «${lvl?.name}» со всеми стенами и мебелью?`, 'Удалить этаж').then((ok) => {
      if (!ok) return;
      this.store.commit((p) => removeLevel(p, levelId));
    });
  }

  moveLevel(levelId, dir) {
    const i = levelIndex(this.project, levelId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= this.project.levels.length) return;
    this.store.commit((p) => {
      const [l] = p.levels.splice(i, 1);
      p.levels.splice(j, 0, l);
    });
  }

  // ── Комнаты и крыши ────────────────────────────────────────────────────

  /** Найти все замкнутые контуры и создать/обновить комнаты, сохраняя названия. */
  autoRooms(levelId = this.state.activeLevelId) {
    const faces = findFaces(this.project.walls.filter((w) => w.levelId === levelId));
    if (!faces.length) return this.app.toast('Замкнутых контуров стен не найдено', 'warn');
    let created = 0;
    let updated = 0;
    this.store.commit((p) => {
      const used = new Set();
      for (const f of faces) {
        const room = p.rooms.find((r) => r.levelId === levelId && !used.has(r.id) && pointInPolygon(polygonLabelPoint(r.points), f.poly));
        if (room) {
          room.points = f.poly.map((q) => ({ x: q.x, y: q.y }));
          used.add(room.id);
          updated++;
        } else {
          const r = createRoom(levelId, f.poly, { name: 'Комната' });
          used.add(r.id);
          p.rooms.push(r);
          created++;
        }
      }
    });
    this.app.toast(`Комнаты: новых ${created}, обновлено ${updated}`);
  }

  autoRoof(type = 'gable') {
    const levels = this.project.levels;
    const top = levels[levels.length - 1];
    const rect = autoRoofRect(this.project, top.id);
    if (!rect) return this.app.toast('Нет стен для крыши', 'warn');
    this.store.commit((p) => p.roofs.push(createRoof(top.id, rect.x, rect.y, rect.w, rect.d, { type, rotation: rect.rotation })));
  }

  // ── Проект ─────────────────────────────────────────────────────────────

  async newProject() {
    if (this._hasContent() && !(await this.app.confirm('Начать новый проект? Текущий можно сохранить в файл через меню «Файл».', 'Новый проект'))) return;
    this._load(createEmptyProject());
    this.app.toast('Новый проект');
  }

  async applyHousePreset(id, params) {
    if (this._hasContent() && !(await this.app.confirm('Заменить текущий проект пресетом? Действие можно отменить (Ctrl+Z).', 'Заменить'))) return false;
    const project = buildHousePreset(id, params);
    if (!project) return false;
    this._load(normalizeProject(project), true);
    const name = HOUSE_PRESETS.find((p) => p.id === id)?.name;
    this.app.toast(`Загружен пресет «${name}»`);
    return true;
  }

  loadProject(raw) {
    this._load(normalizeProject(raw), true);
  }

  _load(project, keepHistory = false) {
    this.app.editor.tool?.cancel?.();
    this.store.load(project, { keepHistory });
    this.state.selection = [];
    this.state.activeLevelId = project.levels[0].id;
    this.app.bus.emit('level:changed', { levelId: this.state.activeLevelId });
    this.app.bus.emit('selection:changed', { selection: [] });
    this.app.editor.fitToContent({ includeSite: !project.walls.length });
    this.app.view3d?.frame();
  }

  _hasContent() {
    const p = this.project;
    return p.walls.length + p.items.filter((i) => i.levelId !== SITE_LEVEL).length + p.rooms.length > 0;
  }
}

export { DEFAULTS };
