/**
 * 2D-редактор плана: холст, камера, ввод мыши/тача и инструменты.
 *
 * Управление камерой:
 *  колесо — масштаб к курсору; средняя кнопка, правая кнопка с перетаскиванием,
 *  пробел + левая кнопка, два пальца — перемещение; щипок — масштаб.
 */
import { Viewport } from './Viewport.js';
import { Renderer2D } from './render/Renderer2D.js';
import { Snapper } from './Snapper.js';
import { hitTest } from './hitTest.js';
import { createTools } from './tools/index.js';
import { computeWallGeometry } from '../geometry/wallGeometry.js';
import { bboxOf } from '../core/geometry.js';
import { SITE_LEVEL } from '../model/project.js';
import { haptic } from '../app/responsive.js';

export class Editor2D {
  constructor(app, container) {
    this.app = app;
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'plan-canvas';
    this.canvas.setAttribute('aria-label', 'План дома');
    this.canvas.tabIndex = 0;
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.viewport = new Viewport();
    this.renderer = new Renderer2D(this);
    this.snapper = new Snapper(this);
    this._geomCache = new Map();
    this._frame = 0;
    this._pan = null;
    this._touches = new Map();
    this._pinch = null;
    this.spaceDown = false;
    this.lastPointer = null;

    this.tools = createTools(this);
    this.tool = this.tools.select;

    this._bindEvents();
    const bus = app.bus;
    bus.on('project:changed', () => {
      this._geomCache.clear();
      this.requestRender();
    });
    for (const evt of ['selection:changed', 'level:changed', 'settings:changed']) bus.on(evt, () => this.requestRender());
    // манекен на плане во время прогулки
    this.character = null;
    bus.on('character:moved', (ch) => {
      this.character = ch.active ? ch : null;
      this.requestRender();
    });

    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(container);
    this.resize();
  }

  get project() {
    return this.app.store.project;
  }

  get levelId() {
    return this.app.state.activeLevelId;
  }

  /** Шаг привязки к сетке из настроек, м. */
  get gridStep() {
    return this.app.state.settings.gridStep || 0.05;
  }

  /** Геометрия стен этажа (кэш сбрасывается при любом изменении проекта). */
  geomsFor(levelId) {
    if (!this._geomCache.has(levelId)) {
      this._geomCache.set(levelId, computeWallGeometry(this.project.walls.filter((w) => w.levelId === levelId)));
    }
    return this._geomCache.get(levelId);
  }

  setTool(id, options) {
    const next = this.tools[id];
    if (!next) return;
    if (this.tool !== next) {
      this.tool?.deactivate?.();
      this.tool = next;
    }
    next.activate?.(options);
    this.canvas.style.cursor = next.cursor || 'default';
    this.app.state.setTool(id);
    this.setHint(next.hint);
    this.requestRender();
  }

  setHint(text) {
    this.app.bus.emit('hint:changed', { text: text || '' });
  }

  /** Сначала точное попадание, затем — с допуском (палец «толще» курсора). */
  hitTest(p, opts = {}) {
    return hitTest(this, p, { ...opts, tolPx: 0 }) || hitTest(this, p, opts);
  }

  requestRender() {
    if (this._frame) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = 0;
      this.render();
    });
  }

  render() {
    if (!this.container.offsetParent && this.container.offsetWidth === 0) return;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.render(this.ctx, { dpr });
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const first = this.viewport.width <= 1;
    this.viewport.resize(w, h);
    if (first && w > 10) this.fitToContent();
    this.render();
  }

  /** Вписать в экран дом (или участок, если дома нет). */
  fitToContent({ includeSite = false } = {}) {
    const pts = [];
    const p = this.project;
    for (const w of p.walls) pts.push({ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
    if (includeSite || pts.length === 0) {
      pts.push(...p.site.boundary);
      for (const it of p.items) if (it.levelId === SITE_LEVEL) pts.push(it);
    }
    if (!pts.length) return;
    const bb = bboxOf(pts);
    const pad = 2;
    this.viewport.fit({ minX: bb.minX - pad, minY: bb.minY - pad, maxX: bb.maxX + pad, maxY: bb.maxY + pad }, 48);
    this.requestRender();
  }

  zoomBy(factor) {
    this.viewport.zoomAt({ x: this.viewport.width / 2, y: this.viewport.height / 2 }, factor);
    this.requestRender();
    this.app.bus.emit('zoom:changed', { scale: this.viewport.scale });
  }

  // ── Ввод ───────────────────────────────────────────────────────────────

  _event(ev) {
    const rect = this.canvas.getBoundingClientRect();
    const screen = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    return {
      screen,
      world: this.viewport.toWorld(screen),
      client: { x: ev.clientX, y: ev.clientY },
      button: ev.button,
      shift: ev.shiftKey,
      alt: ev.altKey,
      ctrl: ev.ctrlKey || ev.metaKey,
      touch: ev.pointerType === 'touch' || ev.pointerType === 'pen',
      original: ev,
    };
  }

  _bindEvents() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (ev) => this._onDown(ev));
    c.addEventListener('pointermove', (ev) => this._onMove(ev));
    c.addEventListener('pointerup', (ev) => this._onUp(ev));
    c.addEventListener('pointercancel', (ev) => this._onUp(ev, true));
    c.addEventListener('pointerleave', (ev) => {
      if (ev.pointerType !== 'mouse') return;
      if (!this._pan && this.app.state.setHover(null)) this.requestRender();
      this.tool?.pointerLeave?.();
    });
    c.addEventListener('dblclick', (ev) => this.tool?.doubleClick?.(this._event(ev)));
    c.addEventListener('contextmenu', (ev) => ev.preventDefault());
    c.addEventListener('wheel', (ev) => this._onWheel(ev), { passive: false });
    // Safari: свои жесты масштабирования страницы не нужны
    for (const g of ['gesturestart', 'gesturechange']) c.addEventListener(g, (ev) => ev.preventDefault());

    // Перетаскивание из каталога
    c.addEventListener('dragover', (ev) => {
      if (ev.dataTransfer?.types?.includes('text/x-houseplan-item')) {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'copy';
      }
    });
    c.addEventListener('drop', (ev) => {
      const type = ev.dataTransfer?.getData('text/x-houseplan-item');
      if (!type) return;
      ev.preventDefault();
      this.setTool('item', { type });
      this.tools.item.placeAt(this._event(ev));
    });
  }

  _onDown(ev) {
    this.canvas.focus({ preventScroll: true });
    if (ev.pointerType === 'touch') {
      this._touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (this._touches.size >= 2) {
        // второй палец — масштаб и сдвиг; начатое действие отменяем, но цепочку стен не теряем
        this._clearLongPress();
        if (!this._suppressTouch) this.tool?.pointerCancel?.();
        this._suppressTouch = true;
        if (this._touches.size === 2) this._startPinch();
        return;
      }
    }
    const e = this._event(ev);
    this.lastPointer = e;
    if (ev.button === 1 || (ev.button === 0 && this.spaceDown)) {
      this._startPan(ev, true);
      return;
    }
    if (ev.button === 2) {
      this._startPan(ev, false);
      return;
    }
    if (ev.button !== 0) return;
    this.canvas.setPointerCapture(ev.pointerId);
    if (e.touch) this._armLongPress(ev, e);
    this.tool?.pointerDown?.(e);
  }

  /** Долгое нажатие пальцем — контекстное меню (или действие инструмента). */
  _armLongPress(ev, e) {
    this._clearLongPress();
    this._longPress = {
      id: ev.pointerId,
      x: ev.clientX,
      y: ev.clientY,
      timer: setTimeout(() => {
        this._longPress = null;
        this._longPressFired = true;
        this.tool?.pointerCancel?.();
        haptic(15);
        this.tool?.longPress?.(e);
        this.requestRender();
      }, 480),
    };
  }

  _clearLongPress() {
    if (this._longPress) clearTimeout(this._longPress.timer);
    this._longPress = null;
  }

  _onMove(ev) {
    if (ev.pointerType === 'touch' && this._touches.has(ev.pointerId)) {
      this._touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (this._pinch) {
        this._updatePinch();
        return;
      }
      if (this._suppressTouch || this._longPressFired) return;
    }
    if (this._longPress && Math.hypot(ev.clientX - this._longPress.x, ev.clientY - this._longPress.y) > 9) this._clearLongPress();
    const e = this._event(ev);
    this.lastPointer = e;
    this.app.bus.emit('cursor:moved', e.world);
    if (this._pan) {
      const dx = ev.clientX - this._pan.x;
      const dy = ev.clientY - this._pan.y;
      if (!this._pan.active && Math.hypot(dx, dy) > 4) this._pan.active = true;
      if (this._pan.active) {
        this.viewport.pan(dx, dy);
        this._pan.x = ev.clientX;
        this._pan.y = ev.clientY;
        this.canvas.style.cursor = 'grabbing';
        this.requestRender();
      }
      return;
    }
    this.tool?.pointerMove?.(e);
  }

  _onUp(ev, cancelled = false) {
    this._clearLongPress();
    if (ev.pointerType === 'touch') {
      this._touches.delete(ev.pointerId);
      if (this._pinch && this._touches.size < 2) {
        this._pinch = null;
        this.app.bus.emit('zoom:changed', { scale: this.viewport.scale });
      }
      if (this._suppressTouch || this._longPressFired) {
        if (this._touches.size === 0) {
          this._suppressTouch = false;
          this._longPressFired = false;
        }
        return;
      }
    }
    if (this._pan) {
      const wasActive = this._pan.active;
      const button = this._pan.button;
      this._pan = null;
      this.canvas.style.cursor = this.spaceDown ? 'grab' : this.tool?.cursor || 'default';
      if (!wasActive && button === 2 && !cancelled) this.tool?.contextClick?.(this._event(ev));
      return;
    }
    if (this.canvas.hasPointerCapture?.(ev.pointerId)) this.canvas.releasePointerCapture(ev.pointerId);
    if (cancelled) {
      this.tool?.pointerCancel?.();
      return;
    }
    if (ev.button === 0) this.tool?.pointerUp?.(this._event(ev));
  }

  _startPan(ev, immediate) {
    this._pan = { x: ev.clientX, y: ev.clientY, active: immediate, button: ev.button };
    this.canvas.setPointerCapture(ev.pointerId);
    if (immediate) this.canvas.style.cursor = 'grabbing';
  }

  /** Сдвиг плана из инструмента (палец по пустому месту). */
  panBy(dxPx, dyPx) {
    this.viewport.pan(dxPx, dyPx);
    this.requestRender();
  }

  _startPinch() {
    const [a, b] = [...this._touches.values()];
    this._pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  _updatePinch() {
    const [a, b] = [...this._touches.values()];
    if (!a || !b) return;
    const rect = this.canvas.getBoundingClientRect();
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    this.viewport.pan(cx - this._pinch.cx, cy - this._pinch.cy);
    if (this._pinch.dist > 0) this.viewport.zoomAt({ x: cx - rect.left, y: cy - rect.top }, d / this._pinch.dist);
    this._pinch = { dist: d, cx, cy };
    this.requestRender();
  }

  _onWheel(ev) {
    ev.preventDefault();
    const e = this._event(ev);
    if (!ev.ctrlKey && Math.abs(ev.deltaX) > Math.abs(ev.deltaY) * 0.8 && Math.abs(ev.deltaX) > 0) {
      this.viewport.pan(-ev.deltaX, -ev.deltaY);
    } else {
      const k = ev.deltaMode === 1 ? 0.05 : 0.0018;
      const factor = Math.exp(-ev.deltaY * k * (ev.ctrlKey ? 2.5 : 1));
      this.viewport.zoomAt(e.screen, factor);
      this.app.bus.emit('zoom:changed', { scale: this.viewport.scale });
    }
    this.requestRender();
    if (this.lastPointer) this.tool?.pointerMove?.(e);
  }

  /** Клавиатура: сначала инструмент, потом общие сочетания. */
  keyDown(ev) {
    if (ev.code === 'Space' && !this.spaceDown) {
      this.spaceDown = true;
      this.canvas.style.cursor = 'grab';
      return true;
    }
    return !!this.tool?.keyDown?.(ev);
  }

  keyUp(ev) {
    if (ev.code === 'Space') {
      this.spaceDown = false;
      this.canvas.style.cursor = this.tool?.cursor || 'default';
    }
    this.tool?.keyUp?.(ev);
  }

  /** PNG плана активного этажа без служебных элементов. */
  exportPNG(scale = 2) {
    const vp = this.viewport;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width * scale);
    canvas.height = Math.round(vp.height * scale);
    const ctx = canvas.getContext('2d');
    this.renderer.render(ctx, { dpr: scale, overlay: false, exportMode: true });
    return canvas.toDataURL('image/png');
  }
}
