/**
 * Выбор и редактирование: клик — выделить, Shift — добавить, рамка — несколько,
 * перетаскивание — переместить, ручки — концы стен, поворот, размер, вершины.
 */
import { Tool } from './Tool.js';
import { THEME } from '../render/theme.js';
import { computeHandles, hitHandle } from '../handles.js';
import { entitiesInRect } from '../hitTest.js';
import { drawSnapIndicator } from '../Snapper.js';
import { collectMoveRefs, collectPointRefs } from '../../model/operations.js';
import { getEntity } from '../../model/project.js';
import { snapToWall, itemSnapsToWall, findWallForOpening } from '../placement.js';
import { DEFAULTS } from '../../model/defaults.js';
import { add, sub, mul, dot, dist, snapValue, toWorld, toLocal, DEG, normalizeDeg, mid } from '../../core/geometry.js';
import { fmtLen, fmtAngle } from '../../core/format.js';
import { drawOpening } from '../render/drawOpenings.js';

const DRAG_START_PX = 4;

export class SelectTool extends Tool {
  constructor(editor) {
    super(editor);
    this.id = 'select';
    this.name = 'Выбор';
    this.hint = 'Клик — выделить, Shift — добавить к выделению, рамка — выделить несколько. Тяните объект, чтобы переместить. Колесо — масштаб, правая кнопка — сдвиг плана.';
    this.mode = null;
  }

  cancel() {
    if (this.mode && this.mode !== 'marquee' && this.mode !== 'pending') this.store.cancelGesture();
    this.mode = null;
    this.snap = null;
    this.render();
  }

  pointerDown(e) {
    const handles = computeHandles(this.editor);
    const h = hitHandle(handles, e.world, this.px(10));
    this.start = e.world;
    this.startScreen = e.screen;
    if (h) {
      this._beginHandle(h, e);
      return;
    }
    const hit = this.editor.hitTest(e.world);
    if (hit) {
      if (e.shift) {
        this.state.select(hit, true);
        this.mode = null;
        return;
      }
      if (!this.state.isSelected(hit.kind, hit.id)) this.state.select(hit);
      this.pendingHit = hit;
      this.mode = 'pending';
      return;
    }
    if (!e.shift) this.state.clearSelection();
    this.mode = 'marquee';
    this.marqueeAdd = e.shift;
    this.marquee = { a: e.world, b: e.world };
  }

  pointerMove(e) {
    if (!this.mode) {
      this._hover(e);
      return;
    }
    if (this.mode === 'pending') {
      if (dist(e.screen, this.startScreen) < DRAG_START_PX) return;
      this._beginMove(e);
    }
    if (this.mode === 'move') this._move(e);
    else if (this.mode === 'opening') this._moveOpening(e);
    else if (this.mode === 'handle') this._dragHandle(e);
    else if (this.mode === 'marquee') {
      this.marquee.b = e.world;
      this.render();
    }
  }

  pointerUp(e) {
    if (this.mode === 'pending') {
      // простой клик по уже выделенному среди нескольких — оставить только его
      if (this.state.selection.length > 1 && this.pendingHit) this.state.select(this.pendingHit);
    } else if (this.mode === 'marquee') {
      const { a, b } = this.marquee;
      if (dist(a, b) > this.px(3)) {
        const rect = { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
        const found = entitiesInRect(this.editor, rect);
        if (this.marqueeAdd) {
          const keys = new Set(this.state.selection.map((s) => `${s.kind}:${s.id}`));
          this.state.setSelection([...this.state.selection, ...found.filter((f) => !keys.has(`${f.kind}:${f.id}`))]);
        } else this.state.setSelection(found);
      }
      this.marquee = null;
    } else if (this.mode) {
      this.store.endGesture();
    }
    this.mode = null;
    this.snap = null;
    this.info = null;
    this._hover(e);
    this.render();
  }

  doubleClick(e) {
    const hit = this.editor.hitTest(e.world);
    if (!hit) return;
    if (hit.kind === 'opening') {
      this.store.commit((p) => {
        const o = getEntity(p, 'opening', hit.id);
        if (o) o.flipSide = !o.flipSide;
      });
    } else {
      this.state.select(hit);
      this.app.bus.emit('properties:focus', hit);
    }
  }

  keyDown(ev) {
    if (ev.code === 'Escape' && this.mode) {
      this.cancel();
      return true;
    }
    return false;
  }

  // ── Подсветка ──────────────────────────────────────────────────────────

  _hover(e) {
    const handles = computeHandles(this.editor);
    const h = hitHandle(handles, e.world, this.px(10));
    let cursor = 'default';
    let hover = null;
    if (h) cursor = h.type === 'rotate' ? 'grab' : h.type === 'resize' ? 'nwse-resize' : 'crosshair';
    else {
      hover = this.editor.hitTest(e.world);
      if (hover) cursor = this.state.isSelected(hover.kind, hover.id) ? 'move' : 'pointer';
    }
    this.editor.canvas.style.cursor = this.editor.spaceDown ? 'grab' : cursor;
    if (this.state.setHover(hover)) this.render();
  }

  // ── Перемещение ────────────────────────────────────────────────────────

  _beginMove() {
    const sel = this.state.selection;
    this.store.beginGesture();
    if (sel.length === 1 && sel[0].kind === 'opening') {
      this.mode = 'opening';
      this.opening = sel[0];
      return;
    }
    this.mode = 'move';
    this.refs = collectMoveRefs(this.project, sel.filter((s) => s.kind !== 'opening'));
    const single = sel.length === 1 ? getEntity(this.project, sel[0].kind, sel[0].id) : null;
    this.single = single ? { ref: sel[0], e: single, rot: single.rotation } : null;
  }

  _move(e) {
    let delta = sub(e.world, this.start);
    const s = this.single;
    this.info = null;
    this.snap = null;
    let rotation = null;

    if (s?.ref.kind === 'wall' && !e.shift) {
      // стена двигается перпендикулярно себе — так удобнее менять размер комнаты
      const w = s.e;
      const ref1 = this.refs.find((r) => r.key === `w:${w.id}:1`);
      const ref2 = this.refs.find((r) => r.key === `w:${w.id}:2`);
      const a = ref1.orig;
      const b = ref2.orig;
      const L = dist(a, b) || 1;
      const n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
      const k = snapValue(dot(delta, n), e.alt ? 0.001 : DEFAULTS.grid);
      delta = mul(n, k);
      this.info = { p: mid(add(a, delta), add(b, delta)), text: `сдвиг ${fmtLen(Math.abs(k))}` };
    } else if (s && (s.ref.kind === 'item' || s.ref.kind === 'stair' || s.ref.kind === 'roof')) {
      const orig = this.refs[0].orig;
      let c = add(orig, delta);
      let snapped = null;
      if (s.ref.kind === 'item' && itemSnapsToWall(s.e) && !e.alt) {
        snapped = snapToWall(this.editor, c, s.e.d, s.e.w);
      }
      if (snapped) {
        c = snapped;
        rotation = snapped.rotation;
      } else if (!e.alt) {
        const sn = this.editor.snapper.snap(c, { walls: false, itemPoints: false, radiusPx: 8 });
        c = { x: snapValue(c.x, DEFAULTS.grid), y: snapValue(c.y, DEFAULTS.grid) };
        if (sn.guides.length) c = sn.point;
        this.snap = sn.guides.length ? sn : null;
      }
      delta = sub(c, orig);
    } else if (!e.alt) {
      delta = { x: snapValue(delta.x, DEFAULTS.grid), y: snapValue(delta.y, DEFAULTS.grid) };
    }

    this.store.gesture(() => {
      for (const r of this.refs) r.set(add(r.orig, delta));
      if (s && rotation != null && s.e.rotation !== undefined) s.e.rotation = rotation;
      else if (s && s.rot !== undefined) s.e.rotation = s.rot;
    });
  }

  _moveOpening(e) {
    const o = getEntity(this.project, 'opening', this.opening.id);
    if (!o) return;
    const found = findWallForOpening(this.editor, e.world, o.width, o.id);
    this.openingOk = !!found?.ok;
    if (!found || !found.ok) {
      this.render();
      return;
    }
    this.store.gesture(() => {
      o.wallId = found.g.wall.id;
      o.t = found.t;
    });
  }

  // ── Ручки ──────────────────────────────────────────────────────────────

  _beginHandle(h) {
    this.mode = 'handle';
    this.handle = h;
    this.store.beginGesture();
    const e = getEntity(this.project, h.ref.kind, h.ref.id);
    this.handleEntity = e;
    if (h.type === 'wall-end') {
      const p = h.end === 1 ? { x: e.x1, y: e.y1 } : { x: e.x2, y: e.y2 };
      this.pointRefs = collectPointRefs(this.project, e.levelId, p);
      this.excludeWalls = new Set(this.pointRefs.filter((r) => r.wall).map((r) => r.wall.id));
      this.otherEnd = h.end === 1 ? { x: e.x2, y: e.y2 } : { x: e.x1, y: e.y1 };
    } else if (h.type === 'resize') {
      const dims = this._dims(h.ref.kind, e);
      this.resizeOrigin = toWorld({ x: -dims.w / 2, y: -dims.d / 2 }, e.x, e.y, e.rotation || 0);
    }
  }

  _dims(kind, e) {
    if (kind === 'stair') return { w: e.width, d: e.length };
    return { w: e.w, d: e.d };
  }

  _dragHandle(ev) {
    const h = this.handle;
    const e = this.handleEntity;
    if (!e) return;
    this.info = null;
    if (h.type === 'wall-end') {
      const sn = this.editor.snapper.snap(ev.world, {
        from: this.otherEnd,
        excludeWalls: this.excludeWalls,
        force45: ev.shift,
        disabled: ev.alt,
        roomPoints: false,
      });
      this.snap = sn;
      this.store.gesture(() => {
        for (const r of this.pointRefs) r.set(sn.point);
      });
      this.info = { p: sn.point, text: fmtLen(dist(this.otherEnd, sn.point)), offset: true };
    } else if (h.type === 'rotate') {
      const v = sub(ev.world, e);
      let ang = (Math.atan2(v.y, v.x) / DEG) + 90;
      const step = ev.shift ? 45 : ev.alt ? 1 : 15;
      ang = normalizeDeg(Math.round(ang / step) * step);
      this.store.gesture(() => {
        e.rotation = ang;
      });
      this.info = { p: ev.world, text: fmtAngle(ang), offset: true };
    } else if (h.type === 'resize') {
      const o = this.resizeOrigin;
      const local = toLocal(ev.world, o.x, o.y, e.rotation || 0);
      const step = ev.alt ? 0.001 : DEFAULTS.grid;
      const w = Math.max(0.1, snapValue(local.x, step));
      const d = Math.max(0.1, snapValue(local.y, step));
      const c = toWorld({ x: w / 2, y: d / 2 }, o.x, o.y, e.rotation || 0);
      this.store.gesture(() => {
        if (h.ref.kind === 'stair') {
          e.width = w;
          e.length = d;
        } else {
          e.w = w;
          e.d = d;
        }
        e.x = c.x;
        e.y = c.y;
      });
      this.info = { p: ev.world, text: `${fmtLen(w)} × ${fmtLen(d)}`, offset: true };
    } else if (h.type === 'vertex' || h.type === 'edge-mid') {
      const pts = h.ref.kind === 'site' ? this.project.site.boundary : e.points;
      if (h.type === 'edge-mid') {
        // первая попытка тянуть середину ребра — добавляем вершину
        this.store.gesture(() => pts.splice(h.index + 1, 0, { ...h.pos }));
        this.handle = { ...h, type: 'vertex', index: h.index + 1 };
      }
      const idx = this.handle.index;
      const prev = pts[(idx - 1 + pts.length) % pts.length];
      const sn = this.editor.snapper.snap(ev.world, {
        from: prev,
        force45: ev.shift,
        disabled: ev.alt,
        roomPoints: h.ref.kind === 'room',
        sitePoints: h.ref.kind !== 'room',
        walls: h.ref.kind === 'room',
      });
      this.snap = sn;
      this.store.gesture(() => {
        pts[idx].x = sn.point.x;
        pts[idx].y = sn.point.y;
      });
    }
  }

  drawOverlay(ctx, r) {
    if (this.marquee) {
      const { a, b } = this.marquee;
      ctx.save();
      ctx.fillStyle = 'rgba(36, 86, 214, 0.08)';
      ctx.strokeStyle = THEME.accent;
      ctx.lineWidth = r.px(1);
      ctx.setLineDash([r.px(4), r.px(3)]);
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.restore();
    }
    if (this.mode === 'opening' && this.openingOk === false) {
      const o = getEntity(this.project, 'opening', this.opening?.id);
      const g = o && r.geoms.get(o.wallId);
      if (g) drawOpening(ctx, r, g, o, { ghost: true });
    }
    if (this.snap) drawSnapIndicator(ctx, r, this.snap, THEME);
    if (this.info) {
      const p = this.info.offset ? add(this.info.p, { x: r.px(14), y: r.px(-14) }) : this.info.p;
      r.label(ctx, p, this.info.text, { size: 12, weight: 600, color: '#fff', bg: THEME.accent, halo: false, align: this.info.offset ? 'left' : 'center' });
    }
  }
}
