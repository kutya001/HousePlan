/**
 * Отрисовка плана. Порядок слоёв задан здесь, сами слои — в отдельных модулях.
 * Геометрия рисуется в мировых координатах (метры) через ctx.setTransform,
 * подписи — в экранных, чтобы текст не масштабировался.
 */
import { drawCharacter } from './drawCharacter.js';
import { drawAtticLow } from './drawAttic.js';
import { THEME, font } from './theme.js';
import { drawGrid } from './drawGrid.js';
import { drawSite, drawSiteItems } from './drawSite.js';
import { drawRooms, drawRoomLabels } from './drawRooms.js';
import { drawWalls, drawLowerLevel } from './drawWalls.js';
import { drawOpenings } from './drawOpenings.js';
import { drawStairs, drawStairwellsFromBelow } from './drawStairs.js';
import { drawItems } from './drawItems.js';
import { drawRoofs } from './drawRoofs.js';
import { drawDimensions } from './drawDimensions.js';
import { drawSelection } from './drawSelection.js';
import { isGroundLevel, levelBelow } from '../../model/project.js';

export class Renderer2D {
  constructor(editor) {
    this.editor = editor;
    this.dpr = 1;
  }

  get vp() {
    return this.editor.viewport;
  }
  get project() {
    return this.editor.project;
  }
  get state() {
    return this.editor.app.state;
  }
  get settings() {
    return this.editor.app.state.settings;
  }

  /** Множитель размера ручек: на сенсорных экранах крупнее. */
  get hs() {
    return this.state.coarse ? 1.5 : 1;
  }

  /** n экранных пикселей в метрах. */
  px(n) {
    return n / this.vp.scale;
  }

  render(ctx, { dpr, overlay = true, exportMode = false } = {}) {
    this.dpr = dpr;
    this.exportMode = exportMode;
    const vp = this.vp;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = THEME.paper;
    ctx.fillRect(0, 0, vp.width, vp.height);

    ctx.setTransform(...vp.transform(dpr));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const levelId = this.state.activeLevelId;
    this.levelId = levelId;
    this.ground = isGroundLevel(this.project, levelId);
    this.geoms = this.editor.geomsFor(levelId);

    if (!exportMode) drawGrid(ctx, this);
    drawSite(ctx, this);
    if (this.ground) drawSiteItems(ctx, this);
    drawRooms(ctx, this);
    drawAtticLow(ctx, this);
    const below = levelBelow(this.project, levelId);
    if (below && this.settings.lowerLevel) drawLowerLevel(ctx, this, below.id);
    if (below) drawStairwellsFromBelow(ctx, this, below.id);
    drawStairs(ctx, this);
    drawItems(ctx, this);
    drawWalls(ctx, this);
    drawOpenings(ctx, this);
    if (this.settings.roofs2d) drawRoofs(ctx, this);
    drawRoomLabels(ctx, this);
    if (this.settings.dims) drawDimensions(ctx, this);
    if (!exportMode) drawCharacter(ctx, this, this.editor.character);
    if (overlay) {
      drawSelection(ctx, this);
      this.editor.tool?.drawOverlay?.(ctx, this);
    }
  }

  // ── Помощники ──────────────────────────────────────────────────────────

  path(ctx, poly, close = true) {
    ctx.beginPath();
    poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    if (close) ctx.closePath();
  }

  /** Рисование в экранных координатах. */
  screen(ctx, fn) {
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    fn();
    ctx.restore();
  }

  /**
   * Подпись в мировой точке.
   * opts: size, weight, color, align, baseline, angle (рад), halo, bg
   */
  label(ctx, p, text, opts = {}) {
    const s = this.vp.toScreen(p);
    this.screen(ctx, () => {
      ctx.translate(s.x, s.y);
      if (opts.angle) ctx.rotate(opts.angle);
      ctx.font = font(opts.size || 12, opts.weight || 500);
      ctx.textAlign = opts.align || 'center';
      ctx.textBaseline = opts.baseline || 'middle';
      if (opts.bg) {
        const m = ctx.measureText(text);
        const w = m.width + 10;
        const h = (opts.size || 12) + 8;
        const x = opts.align === 'left' ? -4 : opts.align === 'right' ? -w + 4 : -w / 2;
        ctx.fillStyle = opts.bg;
        roundRect(ctx, x, -h / 2, w, h, 4);
        ctx.fill();
      }
      if (opts.halo !== false) {
        ctx.strokeStyle = opts.haloColor || THEME.halo;
        ctx.lineWidth = 3.5;
        ctx.lineJoin = 'round';
        ctx.strokeText(text, 0, 0);
      }
      ctx.fillStyle = opts.color || THEME.text;
      ctx.fillText(text, 0, 0);
    });
  }

  /** Маркер-кружок в экранных пикселях. */
  dot(ctx, p, radiusPx, fill, stroke = THEME.handleFill, strokePx = 1.5) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, this.px(radiusPx), 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.lineWidth = this.px(strokePx);
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
