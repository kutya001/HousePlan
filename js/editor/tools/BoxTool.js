/**
 * «Коробка»: протяните прямоугольник (или два клика) — получите 4 стены и пол.
 * Можно сразу на 2–3 этажа и с крышей. Размеры можно набрать: 8x10 и Enter.
 */
import { Tool } from './Tool.js';
import { THEME } from '../render/theme.js';
import { drawSnapIndicator } from '../Snapper.js';
import { addStackedBox } from '../../model/operations.js';
import { DEFAULTS, ROOF_TYPES } from '../../model/defaults.js';
import { dist } from '../../core/geometry.js';
import { fmtLen } from '../../core/format.js';
import { levelIndex } from '../../model/project.js';

export class BoxTool extends Tool {
  constructor(editor) {
    super(editor);
    this.id = 'box';
    this.name = 'Коробка';
    this.cursor = 'crosshair';
    this.hint =
      'Протяните прямоугольник или кликните в двух углах. Размеры можно набрать с клавиатуры: 8x10 и Enter. Этажность и крышу выберите сверху.';
    this.settings = { floors: '1', roof: 'none', thickness: DEFAULTS.wall.exterior.thickness };
    this.options = [
      { key: 'floors', label: 'Этажей', type: 'segmented', options: { 1: '1', 2: '2', 3: '3' } },
      { key: 'roof', label: 'Крыша', type: 'select', options: { none: 'Без крыши', ...ROOF_TYPES } },
      { key: 'thickness', label: 'Стены', type: 'number', min: 0.05, max: 1.5, step: 0.01, unit: 'м' },
    ];
    this.start = null;
    this.end = null;
    this.input = '';
  }

  cancel() {
    this.start = null;
    this.end = null;
    this.dragging = false;
    this.input = '';
    this.render();
  }

  _snap(e) {
    return this.editor.snapper.snap(e.world, { disabled: e.alt, roomPoints: true });
  }

  pointerMove(e) {
    this.snap = this._snap(e);
    if (this.start) this.end = this.snap.point;
    this.render();
  }

  pointerDown(e) {
    const p = this._snap(e).point;
    if (!this.start) {
      this.start = p;
      this.end = p;
      this.dragging = true;
    } else {
      this.end = p;
      this._commit();
    }
  }

  pointerUp(e) {
    if (!this.dragging) return;
    this.dragging = false;
    const p = this._snap(e).point;
    if (dist(this.start, p) > 0.5) {
      this.end = p;
      this._commit();
    }
  }

  _commit(dims = null) {
    let x;
    let y;
    let w;
    let d;
    if (dims) {
      x = this.start.x;
      y = this.start.y;
      [w, d] = dims;
    } else {
      x = Math.min(this.start.x, this.end.x);
      y = Math.min(this.start.y, this.end.y);
      w = Math.abs(this.end.x - this.start.x);
      d = Math.abs(this.end.y - this.start.y);
    }
    if (w < 0.5 || d < 0.5) {
      this.toast('Коробка слишком маленькая: нужно хотя бы 0,5 × 0,5 м', 'warn');
      this.cancel();
      return;
    }
    const floors = Number(this.settings.floors) || 1;
    const startIdx = levelIndex(this.project, this.levelId);
    this.store.commit((p) =>
      addStackedBox(p, this.levelId, x, y, w, d, {
        floors,
        roof: this.settings.roof,
        thickness: this.settings.thickness,
      }),
    );
    const extra = floors > 1 ? `, этажи ${startIdx + 1}–${startIdx + floors}` : '';
    this.toast(`Коробка ${fmtLen(w)} × ${fmtLen(d)}${extra}`);
    this.cancel();
  }

  keyDown(ev) {
    if (!this.start) return false;
    if (/^[0-9.,xх*×]$/i.test(ev.key)) {
      this.input += ev.key.replace(',', '.');
      this.render();
      return true;
    }
    if (ev.key === 'Backspace' && this.input) {
      this.input = this.input.slice(0, -1);
      this.render();
      return true;
    }
    if (ev.key === 'Enter' && this.input) {
      const [w, d] = this.input.split(/[xх*×]/i).map(parseFloat);
      if (w > 0 && d > 0) this._commit([w, d]);
      return true;
    }
    if (ev.key === 'Escape') {
      this.cancel();
      return true;
    }
    return false;
  }

  drawOverlay(ctx, r) {
    if (this.snap) drawSnapIndicator(ctx, r, this.snap, THEME);
    if (!this.start || !this.end) return;
    let x0 = Math.min(this.start.x, this.end.x);
    let y0 = Math.min(this.start.y, this.end.y);
    let w = Math.abs(this.end.x - this.start.x);
    let d = Math.abs(this.end.y - this.start.y);
    const [iw, id] = this.input.split(/[xх*×]/i).map(parseFloat);
    if (iw > 0 && id > 0) {
      x0 = this.start.x;
      y0 = this.start.y;
      w = iw;
      d = id;
    }
    if (w < 0.01 && d < 0.01) return;
    const t = this.settings.thickness;
    ctx.save();
    // наружный и внутренний контуры будущих стен
    ctx.fillStyle = 'rgba(43, 48, 54, 0.5)';
    ctx.beginPath();
    ctx.rect(x0 - t / 2, y0 - t / 2, w + t, d + t);
    if (w > t && d > t) ctx.rect(x0 + w - t / 2, y0 + t / 2, -(w - t), d - t);
    ctx.fill('evenodd');
    ctx.strokeStyle = THEME.accent;
    ctx.lineWidth = r.px(1.5);
    ctx.setLineDash([r.px(5), r.px(4)]);
    ctx.strokeRect(x0, y0, w, d);
    ctx.restore();
    r.label(ctx, { x: x0 + w / 2, y: y0 - t / 2 - r.px(14) }, fmtLen(w), { size: 12, weight: 600, color: THEME.accent });
    r.label(ctx, { x: x0 - t / 2 - r.px(14), y: y0 + d / 2 }, fmtLen(d), { size: 12, weight: 600, color: THEME.accent, angle: -Math.PI / 2 });
    if (this.settings.floors !== '1') {
      r.label(ctx, { x: x0 + w / 2, y: y0 + d / 2 }, `${this.settings.floors} этажа`, { size: 12, color: THEME.muted });
    }
    if (this.input) {
      r.label(ctx, { x: this.end.x + r.px(16), y: this.end.y + r.px(18) }, `Размер: ${this.input} м ⏎`, {
        size: 12,
        weight: 600,
        color: '#fff',
        bg: THEME.ink,
        halo: false,
        align: 'left',
      });
    }
  }
}
