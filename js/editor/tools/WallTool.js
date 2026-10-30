/**
 * Стены цепочкой. Клик — точка, концы прилипают к существующим стенам
 * (к концам и к середине — Т-примыкание). Цепочка завершается сама,
 * когда новая стена упирается в существующую; замкнутый контур создаёт комнату.
 */
import { Tool } from './Tool.js';
import { THEME } from '../render/theme.js';
import { drawSnapIndicator } from '../Snapper.js';
import { createWall, createRoom } from '../../model/factories.js';
import { syncRoomsWithWalls } from '../../model/operations.js';
import { DEFAULTS, WALL_KINDS } from '../../model/defaults.js';
import { add, sub, mul, dist, norm, perp, mid, DEG, pointInPolygon, polygonCentroid, polygonArea } from '../../core/geometry.js';
import { fmtLen, fmtAngle } from '../../core/format.js';
import { uprightAngle } from '../render/drawDimensions.js';

export class WallTool extends Tool {
  constructor(editor) {
    super(editor);
    this.id = 'wall';
    this.name = 'Стена';
    this.cursor = 'crosshair';
    this.hint =
      'Клик — начало стены, клик — следующая точка. Цепочка закончится сама, когда упрётесь в стену; иначе — двойной клик, Enter или правая кнопка. Наберите число и Enter — точная длина в метрах. Shift — углы по 45°, Alt — без привязок.';
    this.settings = { kind: 'exterior', thickness: DEFAULTS.wall.exterior.thickness, height: null };
    this.options = [
      { key: 'kind', label: 'Тип', type: 'segmented', options: WALL_KINDS },
      { key: 'thickness', label: 'Толщина', type: 'number', min: 0.05, max: 1.5, step: 0.01, unit: 'м' },
      { key: 'height', label: 'Высота', type: 'number', min: 0.3, max: 12, step: 0.05, unit: 'м', placeholder: 'этаж', allowEmpty: true },
    ];
    this.chain = [];
    this.cursorPt = null;
    this.snap = null;
    this.input = '';
  }

  onOptionChange(key, value) {
    this.settings[key] = value;
    if (key === 'kind') this.settings.thickness = DEFAULTS.wall[value]?.thickness ?? this.settings.thickness;
    this.app.bus.emit('tool:options-refresh');
    this.render();
  }

  activate() {
    this.chain = [];
    this.input = '';
  }

  cancel() {
    this.chain = [];
    this.input = '';
    this.snap = null;
    this.touchDown = false;
    this.refreshOptions();
    this.render();
  }

  /** Второй палец или системный жест: точку не ставим, цепочка остаётся. */
  pointerCancel() {
    this.touchDown = false;
    this.cursorPt = null;
    this.snap = null;
    this.render();
  }

  get shortHint() {
    return this.chain.length ? 'Ведите пальцем к следующей точке и отпустите. «Готово» — закончить.' : 'Коснитесь там, где начинается стена';
  }

  actions() {
    if (!this.chain.length) return [];
    return [
      { label: 'Готово', icon: 'check', primary: true, onClick: () => this.finish() },
      {
        label: this.chain.length > 1 ? 'Убрать отрезок' : 'Сбросить',
        icon: 'undo',
        onClick: () => this.undoPoint(),
      },
      { type: 'length', label: 'Длина', apply: (L) => this.applyLength(L) },
    ];
  }

  /** Отменить последний отрезок цепочки. */
  undoPoint() {
    if (this.chain.length > 1) {
      this.store.undo();
      this.chain.pop();
    } else this.chain = [];
    this.refreshOptions();
    this.render();
  }

  /** Отрезок заданной длины в направлении курсора (или вправо). */
  applyLength(L) {
    if (!(L > 0) || !this.chain.length) return;
    const last = this.chain[this.chain.length - 1];
    let dir = this.cursorPt ? norm(sub(this.cursorPt, last)) : { x: 1, y: 0 };
    if (!dir.x && !dir.y) dir = { x: 1, y: 0 };
    this._addPoint(add(last, mul(dir, L)));
  }

  _snap(e) {
    const from = this.chain[this.chain.length - 1] || null;
    return this.editor.snapper.snap(e.world, {
      from,
      force45: e.shift,
      disabled: e.alt,
      extraPoints: this.chain,
    });
  }

  pointerMove(e) {
    if (e.touch && !this.touchDown) return;
    this.snap = this._snap(e);
    this.cursorPt = this.snap.point;
    this.render();
  }

  pointerDown(e) {
    const sn = this._snap(e);
    this.snap = sn;
    this.cursorPt = sn.point;
    if (e.touch) {
      // на сенсорном экране точка ставится, когда палец отпущен
      this.touchDown = true;
      this.render();
      return;
    }
    this._addPoint(sn.point, sn);
  }

  pointerUp(e) {
    if (!this.touchDown) return;
    this.touchDown = false;
    const sn = this._snap(e);
    this._addPoint(sn.point, sn);
  }

  _addPoint(p, sn = null) {
    if (!this.chain.length) {
      this.chain = [p];
      this.startSnapType = sn?.type;
      this.refreshOptions();
      this.app.bus.emit('hint:show', { text: this.shortHint, touchOnly: true });
      this.render();
      return;
    }
    const last = this.chain[this.chain.length - 1];
    if (dist(last, p) < 0.05) return;
    const closing = this.chain.length >= 3 && dist(p, this.chain[0]) < 0.01;
    const s = this.settings;
    let split = 0;
    this.store.commit((proj) => {
      proj.walls.push(createWall(this.levelId, last, p, { kind: s.kind, thickness: s.thickness, height: s.height || null }));
      if (closing) this._autoRoom(proj, this.chain);
      else split = syncRoomsWithWalls(proj, this.levelId);
    });
    if (split) this.toast(split > 1 ? `Стены разделили комнату на ${split + 1} части` : 'Стена разделила комнату на две');
    this.chain.push(p);
    this.input = '';
    const hitExisting = sn && (sn.type === 'wall' || (sn.type === 'endpoint' && sn.target?.src === 'wall'));
    if (closing || (hitExisting && this.chain.length >= 2)) this.finish();
    else this.refreshOptions();
    this.render();
  }

  _autoRoom(proj, pts) {
    const poly = pts.map((q) => ({ x: q.x, y: q.y }));
    if (polygonArea(poly) < 1) return;
    const c = polygonCentroid(poly);
    const exists = proj.rooms.some((r) => r.levelId === this.levelId && pointInPolygon(c, r.points));
    if (!exists) proj.rooms.push(createRoom(this.levelId, poly, { name: 'Комната' }));
  }

  finish() {
    this.chain = [];
    this.input = '';
    this.refreshOptions();
    this.render();
  }

  doubleClick() {
    this.finish();
  }

  contextClick() {
    if (this.chain.length) this.finish();
    else this.editor.setTool('select');
  }

  keyDown(ev) {
    if (!this.chain.length) return false;
    if (/^[0-9]$/.test(ev.key) || ev.key === '.' || ev.key === ',') {
      this.input += ev.key === ',' ? '.' : ev.key;
      this.render();
      return true;
    }
    if (ev.key === 'Backspace' && this.input) {
      this.input = this.input.slice(0, -1);
      this.render();
      return true;
    }
    if (ev.key === 'Enter') {
      const L = parseFloat(this.input);
      if (L > 0) this.applyLength(L);
      else this.finish();
      return true;
    }
    if (ev.key === 'Escape') {
      if (this.input) this.input = '';
      else this.finish();
      this.render();
      return true;
    }
    return false;
  }

  drawOverlay(ctx, r) {
    const last = this.chain[this.chain.length - 1];
    const cur = this.cursorPt;
    for (const p of this.chain) r.dot(ctx, p, 3, THEME.accent, THEME.handleFill, 1);
    if (last && cur) {
      let end = cur;
      const L0 = parseFloat(this.input);
      if (L0 > 0) {
        const d = norm(sub(cur, last));
        end = add(last, mul(d.x || d.y ? d : { x: 1, y: 0 }, L0));
      }
      const L = dist(last, end);
      if (L > 1e-3) {
        const d = norm(sub(end, last));
        const n = mul(perp(d), this.settings.thickness / 2);
        const poly = [add(last, n), add(end, n), sub(end, n), sub(last, n)];
        r.path(ctx, poly);
        ctx.fillStyle = this.settings.kind === 'exterior' ? 'rgba(43, 48, 54, 0.55)' : 'rgba(104, 113, 122, 0.55)';
        ctx.fill();
        ctx.strokeStyle = THEME.accent;
        ctx.lineWidth = r.px(1.5);
        ctx.stroke();
        const ang = (Math.atan2(-d.y, d.x) / DEG + 360) % 360;
        const lp = add(mid(last, end), mul(perp(d), -(this.settings.thickness / 2 + r.px(14))));
        r.label(ctx, lp, fmtLen(L), { size: 12, weight: 600, angle: uprightAngle(d), color: THEME.accent });
        if (Math.round(ang) % 90 !== 0) r.label(ctx, add(last, { x: r.px(18), y: r.px(-14) }), fmtAngle(ang), { size: 11, color: THEME.muted });
      }
    }
    if (this.snap) drawSnapIndicator(ctx, r, this.snap, THEME);
    if (this.input && cur) {
      r.label(ctx, add(cur, { x: r.px(16), y: r.px(18) }), `Длина: ${this.input} м ⏎`, {
        size: 12,
        weight: 600,
        color: THEME.labelInk,
        bg: THEME.ink,
        halo: false,
        align: 'left',
      });
    }
  }
}
