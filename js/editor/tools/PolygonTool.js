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
    this.snap = this._snap(e);
    this.cursorPt = this.snap.point;
    this.render();
  }

  pointerDown(e) {
    const p = this._snap(e).point;
    if (!this.points.length) {
      this.dragStart = p;
      this.points = [p];
      this.render();
      return;
    }
    if (this.points.length >= 3 && dist(p, this.points[0]) < this.px(10)) {
      this._complete();
      return;
    }
    if (dist(p, this.points[this.points.length - 1]) > 0.02) this.points.push(p);
    this.render();
  }

  pointerUp(e) {
    if (!this.dragStart) return;
    const p = this._snap(e).point;
    const start = this.dragStart;
    this.dragStart = null;
    if (this.points.length === 1 && Math.abs(p.x - start.x) > 0.3 && Math.abs(p.y - start.y) > 0.3) {
      this.points = [
        { x: start.x, y: start.y },
        { x: p.x, y: start.y },
        { x: p.x, y: p.y },
        { x: start.x, y: p.y },
      ];
      this._complete();
    }
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
      this.points.pop();
      this.render();
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
    this.render();
  }

  /** Переопределяется наследниками. */
  complete() {}

  drawOverlay(ctx, r) {
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
          color: '#fff',
          bg: THEME.accent,
          halo: false,
          align: 'left',
          weight: 600,
        });
      }
    }
    this.points.forEach((p, i) => r.dot(ctx, p, i === 0 && this.points.length >= 3 ? 6 : 3.5, '#fff', THEME.accent, 1.5));
    if (this.snap) drawSnapIndicator(ctx, r, this.snap, THEME);
  }
}
