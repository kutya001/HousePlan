/**
 * Режим прогулки манекеном: связывает модель, анимацию, физику, камеру,
 * двери и интерфейс. Во время прогулки дом можно править как обычно:
 * клик по объекту выделяет его (свойства, удаление, поворот — те же),
 * план рядом показывает, где стоит манекен.
 */
import * as THREE from 'three';
import { Mannequin } from './Mannequin.js';
import { Animator } from './animation.js';
import { CharacterController } from './CharacterController.js';
import { CollisionWorld } from './CollisionWorld.js';
import { FollowCamera } from './FollowCamera.js';
import { WalkHUD } from './WalkHUD.js';
import { findSpot } from './seats.js';
import { entranceSpawn, insideSpawn, customSpawn } from './spawn.js';
import { computeWallGeometry, pointOnWall } from '../../geometry/wallGeometry.js';
import { levelElevation, SITE_LEVEL, getLevel, groundLevel } from '../../model/project.js';

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);

export class CharacterMode {
  constructor(view) {
    this.view = view;
    this.app = view.app;
    this.active = false;
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };
    this.runToggle = false;
    this.jumpQueued = false;
    this.ceilingHidden = true;
    this._head = new THREE.Vector3();
    this._eye = new THREE.Vector3();
    this._lastEmit = 0;
    this._bind();
  }

  get firstPerson() {
    return !!this.cam?.firstPerson;
  }

  /** Скрывать ли этажи выше манекена (только в виде со спины). */
  get cutaway() {
    return this.active && this.ceilingHidden && !this.firstPerson;
  }

  /**
   * @param at — точка плана на активном этаже («Пройтись отсюда»);
   *             без неё — точка появления из настроек (по умолчанию — у входа на участке)
   */
  start({ at = null } = {}) {
    if (this.active) this.stop(true);
    const { app } = this;
    this.world = this._buildWorld();
    this.ctrl = new CharacterController(this.world);
    this.model = new Mannequin();
    this.anim = new Animator();
    this.view.scene.add(this.model.root);
    this.cam = new FollowCamera(this.view.camera);
    // смотрим туда же, куда смотрела камера (точка у входа повернёт лицом к дому)
    const dir = new THREE.Vector3();
    this.view.camera.getWorldDirection(dir);
    this.cam.yaw = Math.atan2(dir.x, dir.z);
    this._placeAt(at ? { ...at, levelId: app.state.activeLevelId } : this.spawnPoint());

    const touch = app.state.coarse;
    this.hud = new WalkHUD(this.view.container.parentElement, {
      touch,
      handlers: {
        exit: () => this.stop(),
        toggleCamera: () => this.toggleCamera(),
        toggleCeiling: () => this.toggleCeiling(),
        action: () => this.action(),
        jump: () => (this.jumpQueued = true),
        sit: () => this.sit(),
        lie: () => this.lie(),
        respawn: () => this.respawn(),
        run: (on) => (this.runToggle = on),
        move: (x, y) => (this.joy = { x, y }),
      },
    });
    this.hud.setCamera(false);
    this.hud.setCeiling(this.ceilingHidden, true);
    const el = this.view.renderer.domElement;
    el.addEventListener('pointerdown', this._onDown);
    el.addEventListener('pointermove', this._onMove);
    el.addEventListener('pointerup', this._onUp);
    el.addEventListener('pointercancel', this._onUp);
    el.addEventListener('wheel', this._onWheel, { passive: false });
    el.addEventListener('dblclick', this._onDbl);
    el.classList.add('walking');
    // клавиши — у той панели, где последний раз кликнули: план рядом остаётся рабочим
    this.keyFocus = true;
    window.addEventListener('pointerdown', this._onFocus, true);
    this.active = true;
    this.view.applyCutaway();
    this._emitPosition(true);
  }

  stop(silent = false) {
    if (!this.active) return;
    this.active = false;
    const el = this.view.renderer.domElement;
    el.removeEventListener('pointerdown', this._onDown);
    el.removeEventListener('pointermove', this._onMove);
    el.removeEventListener('pointerup', this._onUp);
    el.removeEventListener('pointercancel', this._onUp);
    el.removeEventListener('wheel', this._onWheel);
    el.removeEventListener('dblclick', this._onDbl);
    el.classList.remove('walking');
    window.removeEventListener('pointerdown', this._onFocus, true);
    this.cam.resetFade();
    this.view.scene.remove(this.model.root);
    this.model.dispose();
    this.hud.destroy();
    this.keys.clear();
    this.joy = { x: 0, y: 0 };
    this.app.bus.emit('character:moved', { active: false });
    if (!silent) this.view.onWalkEnd();
  }

  /** Переставить манекена (например, из меню плана «Пройтись отсюда»). */
  teleport(at) {
    if (!this.active || !at) return;
    this._placeAt({ ...at, levelId: this.app.state.activeLevelId });
  }

  /** Вернуться в точку появления (кнопка «В начало»). */
  respawn() {
    if (!this.active) return;
    if (this.ctrl.mode !== 'move') this.ctrl.mode = 'move';
    this._placeAt(this.spawnPoint());
  }

  /** Где появиться: по настройке «Точка появления» — у входа, в доме или в своей точке. */
  spawnPoint() {
    const { project, state } = this.app;
    const mode = state.settings.walkSpawn || 'entrance';
    if (mode === 'point') {
      const s = customSpawn(project);
      if (s) return s.levelId === SITE_LEVEL ? { x: s.x, y: s.y, levelId: groundLevel(project).id, onSite: true } : { ...s };
    }
    if (mode !== 'inside') {
      const e = entranceSpawn(project, this.world);
      if (e) return { ...e, onSite: true };
    }
    const t = this.view.controls.target;
    return insideSpawn(project, state.activeLevelId, { x: t.x, y: t.z });
  }

  _placeAt(sp) {
    const { project, state } = this.app;
    const maxY = sp.onSite ? 0.4 : levelElevation(project, sp.levelId || state.activeLevelId) + 0.3;
    this.ctrl.place(sp.x, sp.y, maxY);
    if (sp.yaw != null) {
      this.cam.yaw = sp.yaw;
      this.cam.pitch = 0.32;
    }
    this.ctrl.yaw = this.cam.yaw;
    this.cam.pivot.set(0, 0, 0);
    this.cam.curDist = this.cam.dist;
    const c = this.ctrl.pos;
    this.levelId = this.world.levelAt(c.y, c.x, c.z);
    this._lvlHold = null;
    if (this.levelId && this.levelId !== state.activeLevelId) state.setLevel(this.levelId);
    if (this.active) this._emitPosition(true);
  }

  _buildWorld() {
    return new CollisionWorld(this.app.project, { doorPassable: (id) => this.view.doors.passable(id) });
  }

  /** План поменялся — пересобрать физический мир, манекен остаётся на месте. */
  onProjectChanged() {
    if (!this.active) return;
    this.cam.resetFade(false); // сцена новая — старые сетки уже не в ней
    this.world = this._buildWorld();
    this.ctrl.setWorld(this.world);
  }

  // ── Ввод ───────────────────────────────────────────────────────────────

  _bind() {
    this._onFocus = (e) => {
      const t = e.target;
      if (t.closest?.('#pane-plan')) {
        if (this.keyFocus) this.keys.clear();
        this.keyFocus = false;
      } else if (t.closest?.('#pane-3d')) this.keyFocus = true;
    };
    this._onDown = (e) => {
      if (this._drag && this._drag.id !== e.pointerId) return; // второй палец — не мешает
      this._drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, button: e.button };
      try {
        e.target.setPointerCapture(e.pointerId);
      } catch {
        /* нет захвата — не страшно */
      }
    };
    this._onMove = (e) => {
      const d = this._drag;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) d.moved = true;
      if (d.moved) {
        const k = e.pointerType === 'touch' ? 0.0065 : 0.0045;
        this.cam.rotate(dx * k, dy * k);
      }
    };
    this._onUp = (e) => {
      const d = this._drag;
      if (!d || d.id !== e.pointerId) return;
      this._drag = null;
      if (!d.moved && d.button === 0 && e.type === 'pointerup') this.view._pick(e);
    };
    this._onWheel = (e) => {
      e.preventDefault();
      this.cam.zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15);
      this._afterCamera();
    };
    this._onDbl = (e) => {
      const ref = this.view.pickRef(e);
      if (ref?.kind === 'opening' && this.view.doors.nodes.has(ref.id)) this.view.doors.toggle(ref.id);
    };
  }

  keyDown(ev) {
    if (!this.active || !this.keyFocus || ev.ctrlKey || ev.metaKey || ev.altKey) return false;
    const c = ev.code;
    if (MOVE_KEYS.has(c)) {
      this.keys.add(c);
      return true;
    }
    if (ev.repeat && ['Space', 'KeyE', 'KeyC', 'KeyZ', 'KeyV', 'KeyR'].includes(c)) return true;
    switch (c) {
      case 'Space':
        this.jumpQueued = true;
        return true;
      case 'KeyE':
        this.action();
        return true;
      case 'KeyC':
        this.sit();
        return true;
      case 'KeyZ':
        this.lie();
        return true;
      case 'KeyV':
        this.toggleCamera();
        return true;
      case 'KeyR':
        this.respawn();
        return true;
      case 'Escape':
        this.stop();
        return true;
      default:
        return false;
    }
  }

  keyUp(ev) {
    this.keys.delete(ev.code);
  }

  _input() {
    const k = this.keys;
    let f = this.joy.y;
    let s = this.joy.x;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) s += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) s -= 1;
    const fw = this.cam.forward;
    const rt = this.cam.right;
    let x = fw.x * f + rt.x * s;
    let z = fw.z * f + rt.z * s;
    const m = Math.hypot(x, z);
    if (m > 1) {
      x /= m;
      z /= m;
    }
    const joyRun = Math.hypot(this.joy.x, this.joy.y) > 0.96 && this.app.state.coarse;
    const run = k.has('ShiftLeft') || k.has('ShiftRight') || this.runToggle || joyRun;
    const jump = this.jumpQueued;
    this.jumpQueued = false;
    // от первого лица тело поворачивается вслед за взглядом
    return { x, z, run, jump, faceYaw: this.firstPerson ? this.cam.yaw : null };
  }

  // ── Действия ───────────────────────────────────────────────────────────

  toggleCamera() {
    this.cam.firstPerson = !this.cam.firstPerson;
    if (this.cam.firstPerson) this.cam.pitch = 0.05;
    else this.cam.pitch = Math.max(0.25, this.cam.pitch);
    this._afterCamera();
  }

  _afterCamera() {
    const fp = this.cam.firstPerson;
    if (fp !== this._fp) {
      this._fp = fp;
      this.model.setFirstPerson(fp);
      this.hud.setCamera(fp);
      this.hud.setCeiling(this.ceilingHidden, !fp);
      if (this.ceilingHidden) this.view.applyCutaway();
    }
  }

  toggleCeiling() {
    this.ceilingHidden = !this.ceilingHidden;
    this.hud.setCeiling(this.ceilingHidden, !this.firstPerson);
    this.view.applyCutaway();
  }

  /** Что можно сделать рядом: дверь, сиденье, кровать. */
  _nearby() {
    const c = this.ctrl;
    if (c.mode === 'sit' || c.mode === 'lie') return { type: 'stand', key: 'E', text: 'Встать', short: 'Встать' };
    if (c.mode !== 'move') return null;
    const door = this._nearestDoor();
    if (door) {
      const open = this.view.doors.isOpen(door.id);
      return { type: 'door', id: door.id, key: 'E', text: open ? 'Закрыть дверь' : 'Открыть дверь', short: open ? 'Закрыть' : 'Открыть' };
    }
    const items = this._itemsHere();
    const p = { x: c.pos.x, y: c.pos.z };
    const seat = findSpot(items, p, 'sit', 0.7);
    const bed = findSpot(items, p, 'lie', 0.7);
    if (bed && (!seat || bed.item.type.startsWith('bed'))) return { type: 'lie', spot: bed, key: 'E', text: `Лечь: ${bed.name}`, short: 'Лечь' };
    if (seat) return { type: 'sit', spot: seat, key: 'E', text: `Сесть: ${seat.name}`, short: 'Сесть' };
    return null;
  }

  _nearestDoor() {
    const { project } = this.app;
    const c = this.ctrl;
    const lvl = this.levelId;
    const walls = project.walls.filter((w) => w.levelId === lvl);
    if (!walls.length) return null;
    if (this._doorGeomsFor !== project) {
      this._doorGeomsFor = project;
      this._doorGeoms = new Map();
    }
    if (!this._doorGeoms.has(lvl)) this._doorGeoms.set(lvl, computeWallGeometry(walls));
    const geoms = this._doorGeoms.get(lvl);
    const f = c.forward;
    let best = null;
    for (const o of project.openings) {
      if (o.kind !== 'door') continue;
      const g = geoms.get(o.wallId);
      if (!g) continue;
      const q = pointOnWall(g, o.t);
      const dx = q.x - c.pos.x;
      const dz = q.y - c.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.5) continue;
      // впереди важнее, чем сзади
      const score = d - 0.4 * ((dx * f.x + dz * f.z) / (d || 1));
      if (!best || score < best.score) best = { id: o.id, score };
    }
    return best;
  }

  _itemsHere() {
    const { project } = this.app;
    const lvl = this.levelId;
    const ground = groundLevel(project)?.id === lvl;
    return project.items.filter((it) => it.levelId === lvl || (ground && it.levelId === SITE_LEVEL));
  }

  action() {
    if (!this.active) return;
    const n = this._nearby();
    if (!n) {
      this.app.toast('Рядом нет двери, сиденья или кровати');
      return;
    }
    if (n.type === 'stand') this.ctrl.standUp();
    else if (n.type === 'door') this.view.doors.toggle(n.id);
    else if (n.type === 'sit') this.ctrl.sitDown({ ...n.spot, floorY: this.ctrl.pos.y });
    else if (n.type === 'lie') this.ctrl.lieDown({ ...n.spot, floorY: this.ctrl.pos.y });
  }

  sit() {
    const c = this.ctrl;
    if (c.mode === 'sit' || c.mode === 'lie') return c.standUp();
    const spot = findSpot(this._itemsHere(), { x: c.pos.x, y: c.pos.z }, 'sit', 0.8);
    c.sitDown(spot ? { ...spot, floorY: c.pos.y } : null);
  }

  lie() {
    const c = this.ctrl;
    if (c.mode === 'sit' || c.mode === 'lie') return c.standUp();
    const spot = findSpot(this._itemsHere(), { x: c.pos.x, y: c.pos.z }, 'lie', 0.8);
    c.lieDown(spot ? { ...spot, floorY: c.pos.y } : null);
  }

  // ── Кадр ───────────────────────────────────────────────────────────────

  update(dt) {
    if (!this.active) return;
    const c = this.ctrl;
    const ev = c.update(dt, this._input());
    if (ev.doorBump) {
      // упёрся в закрытую дверь — открыть её
      this._bump = this._bump?.id === ev.doorBump ? { id: ev.doorBump, t: this._bump.t + dt } : { id: ev.doorBump, t: 0 };
      if (this._bump.t > 0.25 && !this.view.doors.isOpen(ev.doorBump)) {
        this.view.doors.set(ev.doorBump, true);
        this._bump = null;
      }
    } else this._bump = null;

    // модель
    const root = this.model.root;
    root.position.set(c.pos.x, c.visualY, c.pos.z);
    root.rotation.y = c.yaw;
    const st = c.animState();
    this.model.apply(this.anim.update(dt, st));

    // камера
    this.model.eyeWorld(this._eye);
    this._head.set(c.pos.x, c.visualY + (st.mode === 'sit' || st.mode === 'sitFloor' ? 1.15 : st.mode.startsWith('lie') ? 0.6 : 1.55), c.pos.z);
    if (st.mode === 'sitFloor') this._head.y = c.visualY + 0.75;
    const fwd = c.forward;
    this._eye.x += fwd.x * 0.06;
    this._eye.z += fwd.z * 0.06;
    this.cam.update(dt, this._head, this._eye, this.view.root);
    // камера вплотную — манекен полупрозрачный, чтобы не загораживал вид (с запасом, без мигания)
    const ghost = !this.firstPerson && (this._ghost ? this.cam.curDist < 1.05 : this.cam.curDist < 0.85);
    if (ghost !== this._ghost) this.model.setGhost((this._ghost = ghost));

    // этаж под ногами — активный на плане; смена — только если держится ~0,15 с,
    // чтобы на границе (порог, верх лестницы) этажи не переключались туда-сюда
    const lvl = this.world.levelAt(c.pos.y, c.pos.x, c.pos.z);
    if (lvl && lvl !== this.levelId && c.grounded) {
      this._lvlHold = this._lvlHold?.id === lvl ? { id: lvl, t: this._lvlHold.t + dt } : { id: lvl, t: 0 };
      if (this._lvlHold.t >= 0.15) {
        this.levelId = lvl;
        this._lvlHold = null;
        if (lvl !== this.app.state.activeLevelId) this.app.state.setLevel(lvl);
      }
    } else this._lvlHold = null;

    // подсказки
    const n = this._nearby();
    this.hud.setPrompt(n);
    const lv = getLevel(this.app.project, this.levelId);
    const place = c.grounded && this.world.outsideAt(c.pos.x, c.pos.z, c.pos.y) ? 'Участок' : lv?.name || 'Участок';
    const what = { stand: 'стоит', walk: 'идёт', run: 'бежит', climb: 'шагает по ступеням', air: 'в прыжке', mantle: 'залезает', sit: 'сидит', sitFloor: 'сидит на полу', lie: 'лежит', lieFloor: 'лежит на полу' }[st.mode] || '';
    this.hud.setStatus(this.keyFocus || this.app.state.coarse ? `${place} · ${what}` : 'Клавиши у плана · клик по 3D — идти');
    this._emitPosition();
  }

  _emitPosition(force = false) {
    const now = performance.now();
    if (!force && now - this._lastEmit < 90) return;
    this._lastEmit = now;
    const c = this.ctrl;
    this.app.bus.emit('character:moved', { active: true, x: c.pos.x, y: c.pos.z, yaw: c.yaw, levelId: this.levelId, viewYaw: this.cam.yaw, firstPerson: this.firstPerson });
  }
}
