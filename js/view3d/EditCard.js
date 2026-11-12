/**
 * Правка прямо в 3D — в обзоре и в прогулке: карточка выделенного объекта
 * (свойства, перемещение, поворот, копия, запрос ИИ, удаление) и перемещение
 * объекта по полу за указателем.
 *
 * Перемещение не пересобирает сцену на каждое движение: сдвигаются уже построенные
 * модели, а проект меняется один раз — когда объект поставлен (один шаг истории).
 */
import * as THREE from 'three';
import { h, icon, clear } from '../ui/dom.js';
import { renderForm } from '../ui/Form.js';
import { SCHEMAS } from '../model/schemas.js';
import { contextTitle } from '../app/contextActions.js';
import { getEntity, levelElevation, levelTop, SITE_LEVEL, groundLevel, isRoofTerrace } from '../model/project.js';
import { catalogItem } from '../model/catalog.js';
import { createItem } from '../model/factories.js';
import { pointInPolygon } from '../core/geometry.js';
import { snapToFence } from '../geometry/fence.js';

const MOVABLE = new Set(['item', 'stair', 'roof']);
const GRID = 0.05;
/** К сетке 5 см, без «хвостов» двоичной дроби. */
const snap = (v) => Math.round(Math.round(v / GRID) * GRID * 1000) / 1000;

export class EditCard {
  constructor(app, view) {
    this.app = app;
    this.view = view;
    this.open = false; // форма свойств раскрыта
    this.move = null; // { ref, roots, orig, y, dx, dz }
    this.form = null;
    this.el = h('div', { class: 'edit3d', hidden: true });
    view.container.append(this.el);
    this._pointer = null; // последняя точка указателя над 3D (клиентские координаты)
    const canvas = view.renderer.domElement;
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch') this._pointer = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerleave', () => (this._pointer = null));
    const bus = app.bus;
    for (const ev of ['selection:changed', 'walk:changed', 'view:changed', 'layout:changed']) bus.on(ev, () => this.render());
    bus.on('project:changed', ({ reason }) => {
      if (reason === 'gesture') return;
      if (this.move && !getEntity(app.project, this.move.ref.kind, this.move.ref.id)) this.move = null;
      if (reason === 'undo' || reason === 'redo' || reason === 'load') this.render();
      else if (this._key() !== this.key) this.render();
      else this.form?.refresh();
    });
  }

  /** Карточка нужна там, где панели свойств нет под рукой: в 3D на весь экран и в прогулке. */
  get shown() {
    const s = this.app.state;
    return this.view.visible && s.selection.length > 0 && s.selection[0].kind !== 'site' && (this.view.walking || s.viewMode === '3d');
  }

  _key() {
    const sel = this.app.state.selection;
    const one = sel.length === 1 ? getEntity(this.app.project, sel[0].kind, sel[0].id) : null;
    return `${sel.map((s) => `${s.kind}:${s.id}`).join(',')}|${one ? `${one.type ?? ''}${one.kind ?? ''}${one.style ?? ''}${one.shape ?? ''}` : ''}|${this.open}|${!!this.move}`;
  }

  render() {
    const { app } = this;
    this.key = this._key();
    this.form = null;
    this.el.hidden = !this.shown;
    if (!this.shown) {
      if (this.move) this.cancelMove();
      return;
    }
    clear(this.el);
    const sel = app.state.selection;
    const one = sel.length === 1 ? sel[0] : null;
    const c = app.commands;
    const btn = (ic, label, fn, cls = '') => h('button', { class: `edit3d-btn ${cls}`, 'aria-label': label, 'data-tip': label, onclick: fn }, icon(ic, 18), h('span', {}, label));

    if (this.move) {
      this.el.append(
        h('div', { class: 'edit3d-head' }, h('strong', {}, 'Перемещение'), h('span', { class: 'muted small' }, app.state.coarse ? 'поверните вид — объект встанет в центр' : 'ведите мышью, клик — поставить')),
        h('div', { class: 'edit3d-row' }, btn('check', 'Поставить', () => this.confirmMove(), 'primary'), btn('close', 'Отмена', () => this.cancelMove())),
      );
      return;
    }

    const title = one ? contextTitle(app, one) : `Выделено: ${sel.length}`;
    const actions = [];
    if (one) actions.push(btn('panel', this.open ? 'Свернуть' : 'Свойства', () => this.toggle(), this.open ? 'active' : 'primary'));
    if (one && MOVABLE.has(one.kind)) actions.push(btn('hand', 'Двигать', () => this.startMove(one)));
    if (!one || ['item', 'stair', 'roof', 'wall', 'zone'].includes(one.kind)) actions.push(btn('rotate', '90°', () => c.rotateSelection(90)));
    if (!one || one.kind !== 'opening') actions.push(btn('copy', 'Копия', () => c.duplicate()));
    actions.push(btn('spark', 'ИИ', () => app.ui.side.ai.ask({ selection: sel.map((s) => ({ kind: s.kind, id: s.id })) })));
    actions.push(btn('trash', 'Удалить', () => c.deleteSelection(), 'danger'));
    this.el.append(
      h('div', { class: 'edit3d-head' }, h('strong', {}, title), h('button', { class: 'edit3d-x', 'aria-label': 'Снять выделение', onclick: () => app.state.clearSelection() }, icon('close', 16))),
      h('div', { class: 'edit3d-row' }, actions),
    );
    if (one && this.open) {
      const getTarget = () => getEntity(app.project, one.kind, one.id);
      if (!getTarget()) return;
      this.form = renderForm(SCHEMAS[one.kind] || [], getTarget, () => app.project, (field, value) => {
        app.store.commit((p) => field.set(getEntity(p, one.kind, one.id), value, p));
        if (field.rebuild) this.render();
      });
      this.el.append(h('div', { class: 'edit3d-form' }, this.form.el));
    }
  }

  toggle() {
    this.open = !this.open;
    this.render();
  }

  // ── Перемещение ──

  /** Высота пола, по которому едет объект. */
  _floorY(ref, e) {
    const p = this.app.project;
    if (ref.kind === 'roof') return levelTop(p, e.levelId);
    if (e.levelId === SITE_LEVEL) return 0;
    return levelElevation(p, e.levelId);
  }

  startMove(ref) {
    const e = getEntity(this.app.project, ref.kind, ref.id);
    if (!e || !MOVABLE.has(ref.kind)) return;
    // двигаем верхние узлы модели объекта: группу предмета или отдельные сетки лестницы / крыши
    const roots = new Set();
    for (const m of this.view.refMeshes.get(`${ref.kind}:${ref.id}`) || []) {
      let top = m;
      for (let o = m.parent; o; o = o.parent) if (o.userData.ref?.kind === ref.kind && o.userData.ref.id === ref.id) top = o;
      roots.add(top);
    }
    this.move = { ref, orig: { x: e.x, y: e.y }, y: this._floorY(ref, e), dx: 0, dz: 0, roots: [...roots].map((obj) => ({ obj, x: obj.position.x, z: obj.position.z })) };
    this.render();
  }

  /** Точка пола под указателем (в прогулке на сенсорном экране — в центре вида). */
  _floorPoint() {
    const rect = this.view.renderer.domElement.getBoundingClientRect();
    const p = this._pointer && !this.app.state.coarse ? this._pointer : { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.56 };
    const ndc = new THREE.Vector2(((p.x - rect.left) / rect.width) * 2 - 1, -((p.y - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.view.camera);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.move.y), new THREE.Vector3());
    if (!hit) return null;
    // не дальше 25 м от камеры: у горизонта объект «улетал» бы
    const cam = this.view.camera.position;
    const d = Math.hypot(hit.x - cam.x, hit.z - cam.z);
    if (d > 25) hit.lerp(new THREE.Vector3(cam.x, hit.y, cam.z), 1 - 25 / d);
    return { x: snap(hit.x), y: snap(hit.z) };
  }

  /** Каждый кадр: объект следует за указателем. @returns {boolean} что-то сдвинулось */
  tick() {
    const mv = this.move;
    if (!mv) return false;
    const p = this._floorPoint();
    if (!p) return false;
    const dx = p.x - mv.orig.x;
    const dz = p.y - mv.orig.y;
    if (dx === mv.dx && dz === mv.dz) return false;
    mv.dx = dx;
    mv.dz = dz;
    for (const r of mv.roots) {
      r.obj.position.x = r.x + dx;
      r.obj.position.z = r.z + dz;
    }
    return true;
  }

  confirmMove() {
    const mv = this.move;
    if (!mv) return;
    this.move = null;
    const { app } = this;
    if (mv.dx || mv.dz) {
      app.store.commit((p) => {
        const e = getEntity(p, mv.ref.kind, mv.ref.id);
        if (!e) return;
        e.x = snap(mv.orig.x + mv.dx);
        e.y = snap(mv.orig.y + mv.dz);
        // ворота и калитка — в линию забора
        if (mv.ref.kind === 'item' && catalogItem(e.type)?.fenceGate) {
          const sn = snapToFence(p, e, e.w);
          if (sn) Object.assign(e, { x: sn.x, y: sn.y, rotation: sn.rotation });
        }
      });
    }
    this.render();
  }

  cancelMove() {
    const mv = this.move;
    if (!mv) return;
    this.move = null;
    for (const r of mv.roots) {
      r.obj.position.x = r.x;
      r.obj.position.z = r.z;
    }
    this.render();
  }

  // ── Поставить из каталога ──

  /**
   * Новый предмет в 3D: в прогулке — перед манекеном на его этаже, в обзоре — в центре
   * вида на активном этаже. Сразу выделяется и едет за указателем, пока не кликнуть.
   */
  place(type) {
    const { app, view } = this;
    const c = catalogItem(type);
    if (!c) return;
    const project = app.project;
    let levelId = app.state.activeLevelId;
    let at;
    let rotation = 0;
    if (view.walking) {
      const ch = view.character;
      const f = ch.ctrl.forward;
      levelId = ch.levelId || levelId;
      at = { x: ch.ctrl.pos.x + f.x * 1.8, y: ch.ctrl.pos.z + f.z * 1.8 };
      // лицом к манекену
      rotation = Math.round((Math.atan2(f.x, -f.z) * 180) / Math.PI / 15) * 15;
    } else {
      at = { x: view.controls.target.x, y: view.controls.target.z };
    }
    at = { x: snap(at.x), y: snap(at.y) };
    const inRoom = project.rooms.some((r) => r.levelId === levelId && pointInPolygon(at, r.points));
    // объект участка вне комнат — на земле (как на плане)
    if (c.outdoor && !inRoom && !isRoofTerrace(project, levelId)) levelId = groundLevel(project).id;
    const item = createItem(levelId, type, at.x, at.y, { rotation, onLevel: inRoom || isRoofTerrace(project, levelId) });
    app.store.commit((p) => p.items.push(item));
    app.state.select({ kind: 'item', id: item.id });
    app.toast(`${c.name}: ведите указателем и кликните, чтобы поставить`);
    // сцена пересоберётся — после этого берём модель в руку
    this._grab = item.id;
  }

  /** После пересборки сцены: взять только что поставленный предмет. */
  onRebuilt() {
    if (this.move) {
      // сцена пересобрана посреди перемещения (чужая правка) — начинаем заново с того же места
      const ref = this.move.ref;
      this.move = null;
      if (getEntity(this.app.project, ref.kind, ref.id)) this.startMove(ref);
    }
    if (this._grab) {
      const id = this._grab;
      this._grab = null;
      if (getEntity(this.app.project, 'item', id)) this.startMove({ kind: 'item', id });
    }
  }
}
