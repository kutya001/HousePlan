/**
 * Основа для инструментов-многоугольников (комната, участок, зона ландшафта).
 * Клики ставят вершины, клик в первую — замыкает. Протянуть мышью — прямоугольник.
 * Backspace — убрать последнюю вершину, Enter / двойной клик — завершить.
 */
import { Tool } from './Tool.js';
import { THEME } from '../render/theme.js';
import { drawSnapIndicator } from '../Snapper.js';
import { dist, polygonArea } from '../../core/geometry.js';
import { fmtArea } from '../../core/format.js';

export class PolygonTool extends Tool {
  constructor(editor) {
    super(editor);
    this.cursor = 'crosshair';
    this.points = [];
    this.snapOpts = {};
    this.fill = 'rgba(36, 86, 214, 0.12)';
  }

  cancel() {
    this.points = [];
    this.dragStart = null;
    this.touchDown = false;
    this.refreshOptions();
    this.render();
  }

  pointerCancel() {
    this.touchDown = false;
    this.dragStart = null;
    this.cursorPt = null;
    this.render();
  }

  get shortHint() {
    return this.points.length
      ? 'Ставьте точки, отпуская палец. Коснитесь первой точки или нажмите «Замкнуть».'
      : 'Коснитесь первой точки или протяните прямоугольник';
  }

  actions() {
    if (!this.points.length) return [];
    return [
      { label: 'Убрать точку', icon: 'undo', onClick: () => this._popPoint() },
      { label: 'Замкнуть', icon: 'check', primary: true, disabled: this.points.length < 3, onClick: () => this._complete() },
    ];
  }

  _popPoint() {
    this.points.pop();
    this.refreshOptions();
    this.render();
  }

  _snap(e) {
    return this.editor.snapper.snap(e.world, {
      from: this.points[this.points.length - 1] || null,
      force45: e.shift,
      disabled: e.alt,
      extraPoints: this.points,
      ...this.snapOpts,
    });
  }

  pointerMove(e) {
    if (e.touch && !this.touchDown) return;
    this.snap = this._snap(e);
    this.cursorPt = this.snap.point;
    this.render();
  }

  pointerDown(e) {
    const p = this._snap(e).point;
    this.cursorPt = p;
    if (e.touch) {
      // палец: точка ставится при отпускании, первое касание можно протянуть в прямоугольник
      this.touchDown = true;
      if (!this.points.length) this.dragStart = p;
      this.render();
      return;
    }
    if (!this.points.length) {
      this.dragStart = p;
      this.points = [p];
      this.refreshOptions();
      this.render();
      return;
    }
    this._addPoint(p, 10);
  }

  _addPoint(p, closePx) {
    if (this.points.length >= 3 && dist(p, this.points[0]) < this.px(closePx)) {
      this._complete();
      return;
    }
    if (!this.points.length || dist(p, this.points[this.points.length - 1]) > 0.02) this.points.push(p);
    if (this.points.length === 1) this.app.bus.emit('hint:show', { text: this.shortHint, touchOnly: true });
    this.refreshOptions();
    this.render();
  }

  pointerUp(e) {
    const p = this._snap(e).point;
    if (e.touch) {
      if (!this.touchDown) return;
      this.touchDown = false;
      const start = this.dragStart;
      this.dragStart = null;
      if (!this.points.length && start && Math.abs(p.x - start.x) > 0.3 && Math.abs(p.y - start.y) > 0.3) {
        this._rect(start, p);
        return;
      }
      this._addPoint(p, 18);
      return;
    }
    if (!this.dragStart) return;
    const start = this.dragStart;
    this.dragStart = null;
    if (this.points.length === 1 && Math.abs(p.x - start.x) > 0.3 && Math.abs(p.y - start.y) > 0.3) this._rect(start, p);
  }

  _rect(a, b) {
    this.points = [
      { x: a.x, y: a.y },
      { x: b.x, y: a.y },
      { x: b.x, y: b.y },
      { x: a.x, y: b.y },
    ];
    this._complete();
  }

  doubleClick() {
    if (this.points.length >= 3) this._complete();
  }

  contextClick() {
    if (this.points.length >= 3) this._complete();
    else if (this.points.length) this.cancel();
    else this.editor.setTool('select');
  }

  keyDown(ev) {
    if (!this.points.length) return false;
    if (ev.key === 'Backspace') {
      this._popPoint();
      return true;
    }
    if (ev.key === 'Enter') {
      if (this.points.length >= 3) this._complete();
      return true;
    }
    if (ev.key === 'Escape') {
      this.cancel();
      return true;
    }
    return false;
  }

  _complete() {
    const pts = this.points.map((p) => ({ x: p.x, y: p.y }));
    this.points = [];
    this.dragStart = null;
    if (pts.length >= 3 && polygonArea(pts) > 0.05) this.complete(pts);
    this.refreshOptions();
    this.render();
  }

  /** Переопределяется наследниками. */
  complete() {}

  drawOverlay(ctx, r) {
    if (this.dragStart && !this.points.length && this.cursorPt) {
      const a = this.dragStart;
      const b = this.cursorPt;
      ctx.save();
      ctx.fillStyle = this.fill;
      ctx.strokeStyle = THEME.accent;
      ctx.lineWidth = r.px(1.5);
      ctx.setLineDash([r.px(6), r.px(4)]);
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.restore();
    }
    const pts = [...this.points];
    if (this.cursorPt && pts.length) pts.push(this.cursorPt);
    if (pts.length >= 2) {
      r.path(ctx, pts, pts.length >= 3);
      if (pts.length >= 3) {
        ctx.fillStyle = this.fill;
        ctx.fill();
      }
      ctx.strokeStyle = THEME.accent;
      ctx.lineWidth = r.px(1.5);
      ctx.setLineDash([r.px(6), r.px(4)]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (pts.length >= 3) {
        const a = polygonArea(pts);
        r.label(ctx, this.cursorPt || pts[pts.length - 1], fmtArea(a), {
          size: 11,
          color: THEME.labelInk,
          bg: THEME.accent,
          halo: false,
          align: 'left',
          weight: 600,
        });
      }
    }
    this.points.forEach((p, i) => r.dot(ctx, p, i === 0 && this.points.length >= 3 ? 6 : 3.5, THEME.handleFill, THEME.accent, 1.5));
    if (this.snap) drawSnapIndicator(ctx, r, this.snap, THEME);
  }
}
