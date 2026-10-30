/** Рулетка: две точки — расстояние. Точки прилипают к стенам и углам. */
import { Tool } from './Tool.js';
import { THEME } from '../render/theme.js';
import { drawSnapIndicator } from '../Snapper.js';
import { dist, sub, perp, norm } from '../../core/geometry.js';
import { dimLine } from '../render/drawDimensions.js';
import { fmtLen } from '../../core/format.js';

export class MeasureTool extends Tool {
  constructor(editor) {
    super(editor);
    this.id = 'measure';
    this.name = 'Рулетка';
    this.cursor = 'crosshair';
    this.hint = 'Кликните в двух точках — покажу расстояние. Shift — по горизонтали, вертикали или 45°.';
    this.a = null;
    this.b = null;
  }

  cancel() {
    this.a = null;
    this.b = null;
    this.done = false;
    this.render();
  }

  _snap(e) {
    return this.editor.snapper.snap(e.world, {
      from: this.a && !this.done ? this.a : null,
      force45: e.shift,
      disabled: e.alt,
      roomPoints: true,
      sitePoints: true,
      itemPoints: true,
    });
  }

  pointerMove(e) {
    this.snap = this._snap(e);
    if (this.a && !this.done) this.b = this.snap.point;
    this.render();
  }

  pointerDown(e) {
    const p = this._snap(e).point;
    if (!this.a || this.done) {
      this.a = p;
      this.b = p;
      this.done = false;
    } else {
      this.b = p;
      this.done = true;
      this.setHint(`Расстояние: ${fmtLen(dist(this.a, this.b))}. Кликните, чтобы начать новый замер.`);
    }
    this.render();
  }

  drawOverlay(ctx, r) {
    if (this.snap && !this.done) drawSnapIndicator(ctx, r, this.snap, THEME);
    if (!this.a || !this.b || dist(this.a, this.b) < 1e-3) return;
    const n = perp(norm(sub(this.b, this.a)));
    ctx.save();
    ctx.strokeStyle = THEME.guide;
    ctx.lineWidth = r.px(1.5);
    ctx.beginPath();
    ctx.moveTo(this.a.x, this.a.y);
    ctx.lineTo(this.b.x, this.b.y);
    ctx.stroke();
    ctx.restore();
    r.dot(ctx, this.a, 4, THEME.guide, '#fff');
    r.dot(ctx, this.b, 4, THEME.guide, '#fff');
    dimLine(ctx, r, this.a, this.b, n, 0, true, fmtLen(dist(this.a, this.b)));
  }
}
