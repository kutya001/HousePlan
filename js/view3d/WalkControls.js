/**
 * Прогулка от первого лица.
 *  ПК: мышь (с захватом указателя) — оглядеться, WASD/стрелки — идти, Shift — быстрее.
 *  Телефон: джойстик слева — идти, палец по экрану — оглядеться.
 */
import * as THREE from 'three';

export class WalkControls {
  constructor(camera, dom, overlayHost) {
    this.camera = camera;
    this.dom = dom;
    this.host = overlayHost;
    this.enabled = false;
    this.keys = new Set();
    this.move = { x: 0, y: 0 }; // джойстик: x — вбок, y — вперёд
    this.yaw = 0;
    this.pitch = 0;
    this.eye = 1.65;
    this.onExit = null;
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._look = null;

    this._onMouse = (e) => {
      if (!this.enabled || document.pointerLockElement !== this.dom) return;
      this._rotate(e.movementX, e.movementY, 0.0022);
    };
    this._onLockChange = () => {
      if (this.enabled && !this.touch && document.pointerLockElement !== this.dom && this._wasLocked) this.stop();
      this._wasLocked = document.pointerLockElement === this.dom;
    };
    this._onPointerDown = (e) => this._lookStart(e);
    this._onPointerMove = (e) => this._lookMove(e);
    this._onPointerUp = (e) => this._lookEnd(e);
  }

  start({ position, touch }) {
    this.enabled = true;
    this.touch = touch;
    this.camera.position.copy(position);
    this.eye = position.y;
    this._euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = this._euler.y;
    this.pitch = 0;
    this._apply();
    document.addEventListener('mousemove', this._onMouse);
    document.addEventListener('pointerlockchange', this._onLockChange);
    this.dom.addEventListener('pointerdown', this._onPointerDown);
    this.dom.addEventListener('pointermove', this._onPointerMove);
    this.dom.addEventListener('pointerup', this._onPointerUp);
    this.dom.addEventListener('pointercancel', this._onPointerUp);
    this._buildOverlay();
    if (!touch) {
      try {
        const p = this.dom.requestPointerLock?.();
        p?.catch?.(() => {});
      } catch {
        /* без захвата указателя — оглядываемся перетаскиванием */
      }
    }
  }

  stop() {
    if (!this.enabled) return;
    this.enabled = false;
    this.keys.clear();
    this.move = { x: 0, y: 0 };
    document.removeEventListener('mousemove', this._onMouse);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    this.dom.removeEventListener('pointerdown', this._onPointerDown);
    this.dom.removeEventListener('pointermove', this._onPointerMove);
    this.dom.removeEventListener('pointerup', this._onPointerUp);
    this.dom.removeEventListener('pointercancel', this._onPointerUp);
    if (document.pointerLockElement === this.dom) document.exitPointerLock?.();
    this.overlay?.remove();
    this.overlay = null;
    this.onExit?.();
  }

  _rotate(dx, dy, k) {
    this.yaw -= dx * k;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch - dy * k));
    this._apply();
  }

  _apply() {
    this._euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this._euler);
  }

  // «Оглядеться» перетаскиванием (палец или мышь без захвата)
  _lookStart(e) {
    if (document.pointerLockElement === this.dom) return;
    this._look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    this.dom.setPointerCapture?.(e.pointerId);
  }

  _lookMove(e) {
    if (!this._look || this._look.id !== e.pointerId) return;
    this._rotate(e.clientX - this._look.x, e.clientY - this._look.y, 0.005);
    this._look.x = e.clientX;
    this._look.y = e.clientY;
  }

  _lookEnd(e) {
    if (this._look?.id === e.pointerId) this._look = null;
  }

  _buildOverlay() {
    const host = this.host;
    const wrap = document.createElement('div');
    wrap.className = 'walk-overlay';
    const exit = document.createElement('button');
    exit.className = 'btn walk-exit';
    exit.textContent = 'Выйти из прогулки';
    exit.addEventListener('click', () => this.stop());
    wrap.append(exit);
    if (this.touch) {
      const pad = document.createElement('div');
      pad.className = 'joystick';
      pad.setAttribute('aria-label', 'Джойстик: идти');
      const knob = document.createElement('div');
      knob.className = 'joystick-knob';
      pad.append(knob);
      let active = null;
      const R = 50;
      const update = (e) => {
        const r = pad.getBoundingClientRect();
        let dx = e.clientX - (r.left + r.width / 2);
        let dy = e.clientY - (r.top + r.height / 2);
        const len = Math.hypot(dx, dy);
        if (len > R) {
          dx = (dx / len) * R;
          dy = (dy / len) * R;
        }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        this.move = { x: dx / R, y: -dy / R };
      };
      pad.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        active = e.pointerId;
        pad.setPointerCapture(e.pointerId);
        update(e);
      });
      pad.addEventListener('pointermove', (e) => e.pointerId === active && update(e));
      const end = (e) => {
        if (e.pointerId !== active) return;
        active = null;
        knob.style.transform = '';
        this.move = { x: 0, y: 0 };
      };
      pad.addEventListener('pointerup', end);
      pad.addEventListener('pointercancel', end);
      wrap.append(pad);
    }
    host.append(wrap);
    this.overlay = wrap;
  }

  keyDown(ev) {
    if (!this.enabled) return false;
    if (ev.code === 'Escape') {
      this.stop();
      return true;
    }
    this.keys.add(ev.code);
    return true;
  }

  keyUp(ev) {
    this.keys.delete(ev.code);
  }

  update(dt) {
    if (!this.enabled) return;
    const fast = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = (fast ? 4.5 : 2.2) * dt;
    let f = this.move.y;
    let s = this.move.x;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) f += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) f -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) s += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) s -= 1;
    if (f || s) {
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      this.camera.position.x += (fx * f + -fz * s) * speed;
      this.camera.position.z += (fz * f + fx * s) * speed;
    }
    this.camera.position.y = this.eye;
  }
}
