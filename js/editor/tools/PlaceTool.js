/**
 * Размещение мебели, объектов участка и лестниц. Превью следует за курсором,
 * мебель «спинкой» прилипает к ближайшей стене. R — повернуть на 90°, клик — поставить.
 */
import { Tool } from './Tool.js';
import { THEME } from '../render/theme.js';
import { createItem, createStair } from '../../model/factories.js';
import { catalogItem } from '../../model/catalog.js';
import { STAIR_SHAPES } from '../../model/defaults.js';
import { snapToWall } from '../placement.js';
import { alignRect, drawAlign } from '../smartSnap.js';
import { drawItemSymbol } from '../render/symbols2d.js';
import { stairLayout } from '../../geometry/stairGeometry.js';
import { stairRise } from '../render/drawStairs.js';
import { normalizeDeg } from '../../core/geometry.js';
import { levelAbove, groundLevel, isRoofTerrace } from '../../model/project.js';

export class PlaceTool extends Tool {
  constructor(editor, what) {
    super(editor);
    this.what = what;
    this.id = what;
    this.cursor = 'crosshair';
    if (what === 'stair') {
      this.name = 'Лестница';
      this.hint = 'Кликните, чтобы поставить лестницу. Она прилипает к стенам, к центру комнаты и к краям соседних объектов. R — повернуть на 90°, Alt — без привязок.';
      this.settings = { shape: 'straight', rotation: 0 };
      this.options = [{ key: 'shape', label: 'Форма', type: 'segmented', options: STAIR_SHAPES }];
    } else {
      this.name = 'Мебель';
      this.hint = 'Выберите предмет в каталоге и кликните на плане. Мебель прижимается к стене, встаёт по её центру, в угол, под окно или вплотную к соседу. R — повернуть, Alt — без привязок.';
      this.settings = { type: 'sofa', rotation: 0 };
      this.options = [];
    }
    this.ghost = null;
  }

  activate(opts) {
    if (opts?.type) this.settings.type = opts.type;
    if (opts?.shape) this.settings.shape = opts.shape;
    if (this.what === 'item') {
      const c = catalogItem(this.settings.type);
      this.name = c ? c.name : 'Мебель';
      const ground = groundLevel(this.project)?.id;
      if (c?.outdoor && ground && this.levelId !== ground && !isRoofTerrace(this.project, this.levelId)) {
        this.state.setLevel(ground);
        this.toast('Объекты участка ставятся на землю — переключено на первый этаж');
      }
      this.app.bus.emit('tool:options-refresh');
    }
    if (this.what === 'stair' && !levelAbove(this.project, this.levelId)) {
      this.toast('Лестница ведёт на этаж выше — добавьте его в панели «Этажи»');
    }
  }

  cancel() {
    this.ghost = null;
    this.render();
  }

  pointerLeave() {
    this.ghost = null;
    this.render();
  }

  _build(e) {
    const p = e.world;
    this.align = null;
    let obj;
    if (this.what === 'stair') {
      obj = createStair(this.levelId, p.x, p.y, { shape: this.settings.shape, rotation: this.settings.rotation });
    } else {
      obj = createItem(this.levelId, this.settings.type, p.x, p.y, { rotation: this.settings.rotation, onLevel: isRoofTerrace(this.project, this.levelId) });
      if (catalogItem(obj.type)?.wallSnap && !e.alt) {
        const sn = snapToWall(this.editor, p, obj.d, obj.w);
        if (sn) {
          obj.x = sn.x;
          obj.y = sn.y;
          obj.rotation = sn.rotation;
          obj._snapped = true;
          this.align = { labels: sn.label ? [sn.label] : [], guides: [], dims: [] };
          return obj;
        }
      }
    }
    const dims = this.what === 'stair' ? { w: obj.width, d: obj.length } : { w: obj.w, d: obj.d };
    const al = alignRect(this.editor, { kind: this.what, id: obj.id, x: p.x, y: p.y, ...dims, rotation: obj.rotation, levelId: obj.levelId }, { disabled: e.alt });
    obj.x = al.x;
    obj.y = al.y;
    this.align = al;
    return obj;
  }

  get shortHint() {
    return this.what === 'stair' ? 'Коснитесь и отпустите там, где будет лестница' : 'Ведите пальцем по плану и отпустите — предмет встанет туда';
  }

  pointerMove(e) {
    if (e.touch && !this.touchDown) return;
    this.ghost = this._build(e);
    this.render();
  }

  pointerDown(e) {
    if (e.touch) {
      this.touchDown = true;
      this.ghost = this._build(e);
      this.render();
      return;
    }
    this.placeAt(e);
  }

  pointerUp(e) {
    if (!this.touchDown) return;
    this.touchDown = false;
    this.placeAt(e);
  }

  pointerCancel() {
    this.touchDown = false;
    this.ghost = null;
    this.render();
  }

  actions() {
    return [{ label: 'Повернуть', icon: 'rotate', onClick: () => this.rotate(90) }];
  }

  rotate(deg) {
    this.settings.rotation = normalizeDeg((this.settings.rotation || 0) + deg);
    if (this.ghost && this.editor.lastPointer) this.ghost = this._build(this.editor.lastPointer);
    this.render();
  }

  placeAt(e) {
    const obj = this._build(e);
    delete obj._snapped;
    this.align = null;
    const isStair = this.what === 'stair';
    this.store.commit((p) => (isStair ? p.stairs : p.items).push(obj));
    this.state.select({ kind: isStair ? 'stair' : 'item', id: obj.id });
    this.ghost = null;
    this.render();
  }

  keyDown(ev) {
    if (ev.code === 'KeyR' && !ev.ctrlKey && !ev.metaKey) {
      this.settings.rotation = normalizeDeg((this.settings.rotation || 0) + (ev.shiftKey ? -90 : 90));
      if (this.ghost && this.editor.lastPointer) this.ghost = this._build(this.editor.lastPointer);
      this.render();
      return true;
    }
    return false;
  }

  drawOverlay(ctx, r) {
    const g = this.ghost;
    if (!g) return;
    if (this.what === 'stair') {
      const lay = stairLayout(g, stairRise(this.project, g));
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = THEME.accent;
      ctx.lineWidth = r.px(1);
      for (const st of lay.steps) {
        r.path(ctx, st.poly);
        ctx.stroke();
      }
      r.path(ctx, lay.outline);
      ctx.fillStyle = 'rgba(36, 86, 214, 0.1)';
      ctx.fill();
      ctx.lineWidth = r.px(1.6);
      ctx.stroke();
      ctx.restore();
      drawAlign(ctx, r, this.align, g);
      return;
    }
    drawItemSymbol(ctx, g, r.px(1.1), { alpha: 0.7 });
    drawAlign(ctx, r, this.align, g);
    if (g._snapped) {
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate((g.rotation * Math.PI) / 180);
      ctx.strokeStyle = THEME.snap;
      ctx.lineWidth = r.px(2.5);
      ctx.beginPath();
      ctx.moveTo(-g.w / 2, -g.d / 2);
      ctx.lineTo(g.w / 2, -g.d / 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}
