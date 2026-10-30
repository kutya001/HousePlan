/**
 * Крыша: протяните прямоугольник над домом или нажмите «По контуру этажа».
 * Конёк идёт вдоль длинной стороны.
 */
import { Tool } from './Tool.js';
import { THEME } from '../render/theme.js';
import { drawSnapIndicator } from '../Snapper.js';
import { createRoof } from '../../model/factories.js';
import { ROOF_TYPES, DEFAULTS } from '../../model/defaults.js';
import { autoRoofRect } from '../../model/operations.js';
import { fmtLen } from '../../core/format.js';

export class RoofTool extends Tool {
  constructor(editor) {
    super(editor);
    this.id = 'roof';
    this.name = 'Крыша';
    this.cursor = 'crosshair';
    this.hint = 'Протяните прямоугольник по наружным углам дома или нажмите «По контуру этажа». Крыша ложится на стены активного этажа.';
    this.settings = { type: 'gable', pitch: DEFAULTS.roof.pitch, overhang: DEFAULTS.roof.overhang };
    this.options = [
      { key: 'type', label: 'Тип', type: 'segmented', options: ROOF_TYPES },
      { key: 'pitch', label: 'Уклон', type: 'number', min: 0, max: 60, step: 1, unit: '°' },
      { key: 'overhang', label: 'Свес', type: 'number', min: 0, max: 2, step: 0.05, unit: 'м' },
      { key: 'auto', label: 'По контуру этажа', type: 'button', action: () => this.auto() },
    ];
  }

  get shortHint() {
    return 'Протяните прямоугольник над домом или нажмите «По контуру этажа»';
  }

  cancel() {
    this.secondTouch = false;
    this.start = null;
    this.end = null;
    this.render();
  }

  auto() {
    const rect = autoRoofRect(this.project, this.levelId);
    if (!rect) {
      this.toast('На этом этаже нет стен — крыше не на что опереться', 'warn');
      return;
    }
    let id;
    this.store.commit((p) => {
      const roof = createRoof(this.levelId, rect.x, rect.y, rect.w, rect.d, { ...this.settings, rotation: rect.rotation });
      id = roof.id;
      p.roofs.push(roof);
    });
    this.state.select({ kind: 'roof', id });
    this.toast(`Крыша ${fmtLen(rect.w)} × ${fmtLen(rect.d)}`);
  }

  _snap(e) {
    return this.editor.snapper.snap(e.world, { disabled: e.alt });
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
    } else if (e.touch) {
      // второе касание: можно поводить пальцем, угол зафиксируется при отпускании
      this.end = p;
      this.secondTouch = true;
      this.render();
    } else {
      this.end = p;
      this._commit();
    }
  }

  pointerUp(e) {
    if (this.secondTouch) {
      this.secondTouch = false;
      this.end = this._snap(e).point;
      this._commit();
      return;
    }
    if (!this.dragging) return;
    this.dragging = false;
    const p = this._snap(e).point;
    if (Math.abs(p.x - this.start.x) > 0.5 && Math.abs(p.y - this.start.y) > 0.5) {
      this.end = p;
      this._commit();
    }
  }

  _commit() {
    const w = Math.abs(this.end.x - this.start.x);
    const d = Math.abs(this.end.y - this.start.y);
    if (w < 0.5 || d < 0.5) return this.cancel();
    const cx = (this.start.x + this.end.x) / 2;
    const cy = (this.start.y + this.end.y) / 2;
    const longX = w >= d;
    let id;
    this.store.commit((p) => {
      const roof = createRoof(this.levelId, cx, cy, longX ? w : d, longX ? d : w, { ...this.settings, rotation: longX ? 0 : 90 });
      id = roof.id;
      p.roofs.push(roof);
    });
    this.state.select({ kind: 'roof', id });
    this.cancel();
  }

  drawOverlay(ctx, r) {
    if (this.snap) drawSnapIndicator(ctx, r, this.snap, THEME);
    if (!this.start || !this.end) return;
    const x = Math.min(this.start.x, this.end.x);
    const y = Math.min(this.start.y, this.end.y);
    const w = Math.abs(this.end.x - this.start.x);
    const d = Math.abs(this.end.y - this.start.y);
    const o = this.settings.overhang;
    ctx.save();
    ctx.strokeStyle = '#8a4a3a';
    ctx.lineWidth = r.px(1.5);
    ctx.setLineDash([r.px(8), r.px(5)]);
    ctx.strokeRect(x - o, y - o, w + 2 * o, d + 2 * o);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(138, 74, 58, 0.12)';
    ctx.fillRect(x, y, w, d);
    ctx.strokeRect(x, y, w, d);
    ctx.restore();
    r.label(ctx, { x: x + w / 2, y: y - o - r.px(12) }, `${fmtLen(w)} × ${fmtLen(d)}`, { size: 12, weight: 600, color: '#8a4a3a' });
  }
}
