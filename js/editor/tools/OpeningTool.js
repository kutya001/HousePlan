/**
 * Двери, окна и проёмы. Наведите на стену — появится превью с расстояниями
 * до углов; клик — установить. Проём прилипает к центру стены.
 */
import { Tool } from './Tool.js';
import { THEME } from '../render/theme.js';
import { createOpening } from '../../model/factories.js';
import { DEFAULTS, OPENING_STYLES, OPENING_KINDS } from '../../model/defaults.js';
import { findWallForOpening } from '../placement.js';
import { drawOpening, openingFrame } from '../render/drawOpenings.js';
import { dimLine } from '../render/drawDimensions.js';
import { add, mul, dot, sub } from '../../core/geometry.js';

const HINTS = {
  door: 'Наведите на стену и кликните — дверь встанет туда. Сторона открывания — по положению курсора относительно стены. X — сменить сторону петель.',
  window: 'Наведите на стену и кликните. Высоту подоконника и размеры задайте сверху или потом в свойствах.',
  arch: 'Проём без двери: наведите на стену и кликните.',
};

export class OpeningTool extends Tool {
  constructor(editor, kind) {
    super(editor);
    this.kind = kind;
    this.id = kind;
    this.name = OPENING_KINDS[kind];
    this.cursor = 'crosshair';
    this.hint = HINTS[kind];
    const d = DEFAULTS[kind];
    const styles = OPENING_STYLES[kind];
    this.settings = { style: Object.keys(styles)[kind === 'window' ? 1 : 0], width: d.width, height: d.height, sill: d.sill, flipHinge: false };
    this.options = [
      ...(Object.keys(styles).length > 1 ? [{ key: 'style', label: 'Вид', type: 'select', options: styles }] : []),
      { key: 'width', label: 'Ширина', type: 'number', min: 0.3, max: 8, step: 0.05, unit: 'м' },
      { key: 'height', label: 'Высота', type: 'number', min: 0.3, max: 5, step: 0.05, unit: 'м' },
      ...(kind === 'window' ? [{ key: 'sill', label: 'Подоконник', type: 'number', min: 0, max: 3, step: 0.05, unit: 'м' }] : []),
    ];
    this.preview = null;
  }

  onOptionChange(key, value) {
    this.settings[key] = value;
    if (key === 'style' && this.kind === 'door') {
      const preset = { single: [0.9, 2.1], double: [1.4, 2.1], sliding: [1.6, 2.1], garage: [2.8, 2.3] }[value];
      if (preset) [this.settings.width, this.settings.height] = preset;
      this.app.bus.emit('tool:options-refresh');
    }
    if (key === 'style' && this.kind === 'window' && value === 'panoramic') {
      Object.assign(this.settings, { width: 2.4, height: 2.2, sill: 0.1 });
      this.app.bus.emit('tool:options-refresh');
    }
    this.render();
  }

  cancel() {
    this.preview = null;
    this.render();
  }

  pointerLeave() {
    this.preview = null;
    this.render();
  }

  pointerMove(e) {
    const s = this.settings;
    const found = findWallForOpening(this.editor, e.world, s.width);
    if (!found) {
      this.preview = null;
      this.render();
      return;
    }
    const side = dot(sub(e.world, found.g.a), found.g.n) >= 0;
    const o = createOpening(found.g.wall.id, this.kind, {
      style: s.style,
      width: s.width,
      height: s.height,
      sill: this.kind === 'window' ? s.sill : 0,
      t: found.t,
      flipSide: !side,
      flipHinge: s.flipHinge,
    });
    this.preview = { g: found.g, o, ok: found.ok && s.width < found.g.len - 0.1 };
    this.render();
  }

  get shortHint() {
    return 'Ведите пальцем по стене и отпустите там, где нужен проём';
  }

  pointerDown(e) {
    this.pointerMove(e);
    if (e.touch) {
      this.touchDown = true;
      return;
    }
    this._place();
  }

  pointerUp(e) {
    if (!this.touchDown) return;
    this.touchDown = false;
    this.pointerMove(e);
    this._place();
  }

  pointerCancel() {
    this.touchDown = false;
    this.preview = null;
    this.render();
  }

  _place() {
    const pv = this.preview;
    if (!pv) {
      this.toast('Наведите курсор на стену', 'warn');
      return;
    }
    if (!pv.ok) {
      this.toast('Здесь не помещается: мешает другой проём или конец стены', 'warn');
      return;
    }
    this.store.commit((p) => p.openings.push({ ...pv.o }));
    this.preview = null;
  }

  keyDown(ev) {
    if (ev.code === 'KeyX' && !ev.ctrlKey && !ev.metaKey) {
      this.settings.flipHinge = !this.settings.flipHinge;
      if (this.preview) this.preview.o.flipHinge = this.settings.flipHinge;
      this.render();
      return true;
    }
    return false;
  }

  drawOverlay(ctx, r) {
    const pv = this.preview;
    if (!pv) return;
    const { g, o } = pv;
    const f = openingFrame(g, o);
    ctx.save();
    r.path(ctx, f.poly);
    ctx.fillStyle = pv.ok ? 'rgba(36, 86, 214, 0.25)' : 'rgba(201, 55, 44, 0.3)';
    ctx.fill();
    ctx.restore();
    if (pv.ok) drawOpening(ctx, r, g, o, { ghost: true });
    const nn = mul(g.n, g.half);
    dimLine(ctx, r, add(g.a, nn), add(f.A0, nn), g.n, 18, true);
    dimLine(ctx, r, add(f.A1, nn), add(g.b, nn), g.n, 18, true);
    if (!pv.ok) r.label(ctx, f.center, 'не помещается', { size: 11, color: THEME.danger, weight: 600 });
  }
}
