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
import { drawItemSymbol } from '../render/symbols2d.js';
import { stairLayout } from '../../geometry/stairGeometry.js';
import { stairRise } from '../render/drawStairs.js';
import { snapValue, normalizeDeg } from '../../core/geometry.js';
import { DEFAULTS } from '../../model/defaults.js';
import { levelAbove } from '../../model/project.js';

export class PlaceTool extends Tool {
  constructor(editor, what) {
    super(editor);
    this.what = what;
    this.id = what;
    this.cursor = 'crosshair';
    if (what === 'stair') {
      this.name = 'Лестница';
      this.hint = 'Кликните, чтобы поставить лестницу. R — повернуть на 90°. Подъём идёт по стрелке на следующий этаж.';
      this.settings = { shape: 'straight', rotation: 0 };
      this.options = [{ key: 'shape', label: 'Форма', type: 'segmented', options: STAIR_SHAPES }];
    } else {
      this.name = 'Мебель';
      this.hint = 'Выберите предмет в каталоге справа и кликните на плане. Мебель прижимается к стенам. R — повернуть, Alt — без прилипания.';
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
      const ground = this.project.levels[0]?.id;
      if (c?.outdoor && ground && this.levelId !== ground) {
        this.state.setLevel(ground);
        this.toast('Объекты участка ставятся на землю — переключено на 1 этаж');
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
    if (this.what === 'stair') {
      const s = createStair(this.levelId, snapValue(p.x, this.editor.gridStep), snapValue(p.y, this.editor.gridStep), {
        shape: this.settings.shape,
        rotation: this.settings.rotation,
      });
      return s;
    }
    const it = createItem(this.levelId, this.settings.type, snapValue(p.x, this.editor.gridStep), snapValue(p.y, this.editor.gridStep), {
      rotation: this.settings.rotation,
    });
    if (catalogItem(it.type)?.wallSnap && !e.alt) {
      const sn = snapToWall(this.editor, p, it.d, it.w);
      if (sn) {
        it.x = sn.x;
        it.y = sn.y;
        it.rotation = sn.rotation;
        it._snapped = true;
      }
    }
    return it;
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
      return;
    }
    drawItemSymbol(ctx, g, r.px(1.1), { alpha: 0.7 });
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
