/**
 * Привязки курсора. Приоритет:
 *  1. концы стен и другие опорные точки (примыкание стен);
 *  2. ось существующей стены (Т-примыкание), а на ней — середина стены
 *     и середины участков между примыканиями («умное центрирование»);
 *  3. фиксированный угол от предыдущей точки (0/45/90°, Shift — принудительно);
 *  4. направляющие по X/Y от опорных точек, центров комнат и середин стен;
 *  5. сетка.
 * Alt временно отключает привязки.
 */
import { DEG, sub, add, mul, dot, len, dist, projectOnSegment, lineIntersect, snapValue } from '../core/geometry.js';
import { SITE_LEVEL } from '../model/project.js';
import { wallMidpoints, clearCenterAt, roomAt } from './smartSnap.js';

export class Snapper {
  constructor(editor) {
    this.editor = editor;
    this._mids = new WeakMap();
  }

  /** Середины стен этажа (кэш на геометрию этажа). */
  midpoints(levelId) {
    const geoms = this.editor.geomsFor(levelId);
    if (!this._mids.has(geoms)) {
      const byWall = new Map();
      for (const m of wallMidpoints(geoms)) {
        if (!byWall.has(m.g.wall.id)) byWall.set(m.g.wall.id, []);
        byWall.get(m.g.wall.id).push(m);
      }
      this._mids.set(geoms, byWall);
    }
    return this._mids.get(geoms);
  }

  /**
   * @param raw — точка курсора в метрах
   * @param opts — { from, excludeWalls:Set, extraPoints:[], walls:true, roomPoints, sitePoints, force45, disabled, grid }
   * @returns {{ point, type, guides:Array<{a,b}>, target, ray }}
   */
  snap(raw, opts = {}) {
    const editor = this.editor;
    const state = editor.app.state;
    const project = editor.project;
    const levelId = state.activeLevelId;
    const R = editor.viewport.px(opts.radiusPx || 12);
    const grid = opts.grid ?? editor.gridStep;
    const snapOn = state.settings.snap && !opts.disabled;
    const from = opts.from || null;
    const exclude = opts.excludeWalls || new Set();
    const res = { point: { x: raw.x, y: raw.y }, type: 'free', guides: [], target: null, ray: null };

    // Луч с фиксированным углом от предыдущей точки
    let ray = null;
    if (from) {
      const v = sub(raw, from);
      if (len(v) > 1e-6) {
        const ang = Math.atan2(v.y, v.x) / DEG;
        let lock = null;
        if (opts.force45) lock = Math.round(ang / 45) * 45;
        else if (snapOn) {
          const k = Math.round(ang / 45) * 45;
          const tol = k % 90 === 0 ? 7 : 4;
          if (Math.abs(ang - k) < tol) lock = k;
        }
        if (lock !== null) ray = { o: from, d: { x: Math.cos(lock * DEG), y: Math.sin(lock * DEG) }, ang: lock };
      }
    }
    res.ray = ray;

    if (!snapOn) {
      if (ray) {
        res.point = add(from, mul(ray.d, dot(sub(raw, from), ray.d)));
        res.type = 'angle';
      }
      return res;
    }

    // Опорные точки
    const walls = opts.walls === false ? [] : project.walls.filter((w) => w.levelId === levelId && !exclude.has(w.id));
    const anchors = [];
    for (const w of walls) anchors.push({ x: w.x1, y: w.y1, src: 'wall' }, { x: w.x2, y: w.y2, src: 'wall' });
    for (const p of opts.extraPoints || []) anchors.push({ ...p, src: 'extra' });
    if (opts.roomPoints) for (const r of project.rooms) if (r.levelId === levelId) for (const p of r.points) anchors.push({ ...p, src: 'room' });
    if (opts.sitePoints) {
      for (const p of project.site.boundary) anchors.push({ ...p, src: 'site' });
      for (const z of project.zones) for (const p of z.points) anchors.push({ ...p, src: 'zone' });
    }
    if (opts.itemPoints) {
      for (const it of project.items) if (it.levelId === levelId || it.levelId === SITE_LEVEL) anchors.push({ x: it.x, y: it.y, src: 'item' });
    }

    // 1. Концы
    let best = null;
    let bestD = R;
    for (const a of anchors) {
      const d = dist(a, raw);
      if (d < bestD) {
        best = a;
        bestD = d;
      }
    }
    if (best) {
      res.point = { x: best.x, y: best.y };
      res.type = 'endpoint';
      res.target = best;
      return res;
    }

    // 2. Ось стены (и её середины)
    const mids = walls.length ? this.midpoints(levelId) : new Map();
    let wallHit = null;
    let wallD = R;
    for (const w of walls) {
      const a = { x: w.x1, y: w.y1 };
      const b = { x: w.x2, y: w.y2 };
      const pr = projectOnSegment(raw, a, b);
      if (pr.dist > Math.max(R, w.thickness / 2 + R * 0.3)) continue;
      let p;
      if (ray) {
        const hit = lineIntersect(ray.o, ray.d, a, sub(b, a));
        if (!hit || hit.u < 0 || hit.u > 1 || hit.t < 0) continue;
        p = { x: hit.x, y: hit.y };
        if (dist(p, raw) > R * 1.6) continue;
      } else {
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        let along = Math.max(0, Math.min(L, snapValue(pr.along, grid)));
        // середина стены или участка между примыканиями
        let mid = null;
        for (const m of mids.get(w.id) || []) {
          const dm = Math.abs(m.s - pr.along);
          if (dm < Math.max(R, 0.12) && (!mid || dm < mid.d)) mid = { d: dm, m };
        }
        if (mid) along = mid.m.s;
        p = L > 0 ? add(a, mul(sub(b, a), along / L)) : a;
        if (mid) {
          const dd = dist(p, raw);
          if (dd < wallD + R * 0.5) {
            wallHit = { p, wall: w, mid: mid.m };
            wallD = dd;
          }
          continue;
        }
      }
      const d = dist(p, raw);
      if (d < wallD + R * 0.5 && !(wallHit?.mid && d > wallD - R * 0.2)) {
        wallHit = { p, wall: w };
        wallD = d;
      }
    }
    if (wallHit) {
      res.point = wallHit.p;
      res.type = wallHit.mid ? 'mid' : 'wall';
      res.target = wallHit.wall;
      if (wallHit.mid) res.label = wallHit.mid.whole ? 'середина стены' : 'середина';
      return res;
    }

    // 3-5. Угол, направляющие, сетка
    let p = { x: raw.x, y: raw.y };
    if (ray) p = add(from, mul(ray.d, snapValue(dot(sub(raw, from), ray.d), grid)));

    const guideAnchors = from ? [...anchors, { ...from, src: 'from' }] : [...anchors];
    if (opts.smartGuides !== false && walls.length) {
      for (const list of mids.values()) for (const m of list) if (!exclude.has(m.g.wall.id)) guideAnchors.push({ ...m.p, src: 'mid', label: 'середина стены' });
      const room = roomAt(project, levelId, raw);
      if (room) {
        const cc = clearCenterAt(this.editor.geomsFor(levelId), raw);
        // линии через центр комнаты — от грани стены до курсора
        if (cc.x) guideAnchors.push({ x: cc.x.v, y: cc.y ? cc.y.a.y : raw.y, src: 'center', label: 'центр комнаты', onlyX: true });
        if (cc.y) guideAnchors.push({ x: cc.x ? cc.x.a.x : raw.x, y: cc.y.v, src: 'center', label: 'центр комнаты', onlyY: true });
      }
    }
    let gx = null;
    let gy = null;
    // при равном расстоянии важнее центр комнаты, затем середина стены, затем просто точка
    const rank = (a) => (a.src === 'center' ? 2 : a.label ? 1 : 0);
    for (const a of guideAnchors) {
      const dx = Math.abs(a.x - p.x);
      const dy = Math.abs(a.y - p.y);
      if (dx < R && !a.onlyY && (!gx || dx < gx.d - 1e-6 || (dx <= gx.d + 1e-6 && rank(a) > rank(gx.a))) && dist(a, p) > R) gx = { a, d: dx };
      if (dy < R && !a.onlyX && (!gy || dy < gy.d - 1e-6 || (dy <= gy.d + 1e-6 && rank(a) > rank(gy.a))) && dist(a, p) > R) gy = { a, d: dy };
    }
    if (ray) {
      const horizontal = Math.abs(ray.d.y) < 1e-6;
      const vertical = Math.abs(ray.d.x) < 1e-6;
      if (gx && !vertical) {
        const hit = lineIntersect(ray.o, ray.d, { x: gx.a.x, y: 0 }, { x: 0, y: 1 });
        if (hit && hit.t > 0) p = { x: hit.x, y: hit.y };
        else gx = null;
      } else gx = null;
      if (gy && !horizontal && !gx) {
        const hit = lineIntersect(ray.o, ray.d, { x: 0, y: gy.a.y }, { x: 1, y: 0 });
        if (hit && hit.t > 0) p = { x: hit.x, y: hit.y };
        else gy = null;
      } else gy = null;
    } else {
      p = {
        x: gx ? gx.a.x : snapValue(p.x, grid),
        y: gy ? gy.a.y : snapValue(p.y, grid),
      };
    }
    if (gx) res.guides.push({ a: { x: gx.a.x, y: gx.a.y }, b: p, label: gx.a.label });
    if (gy) res.guides.push({ a: { x: gy.a.x, y: gy.a.y }, b: p, label: gy.a.label });
    const lab = res.guides.find((g) => g.label);
    if (lab) res.label = lab.label;
    res.point = p;
    res.type = res.guides.length ? 'guide' : ray ? 'angle' : 'grid';
    return res;
  }
}

/** Отрисовка индикаторов привязки (для инструментов). */
export function drawSnapIndicator(ctx, r, snap, THEME) {
  if (!snap) return;
  for (const g of snap.guides || []) {
    ctx.save();
    ctx.setLineDash([r.px(5), r.px(4)]);
    ctx.strokeStyle = THEME.guide;
    ctx.lineWidth = r.px(1);
    ctx.beginPath();
    ctx.moveTo(g.a.x, g.a.y);
    ctx.lineTo(g.b.x, g.b.y);
    ctx.stroke();
    ctx.restore();
    r.dot(ctx, g.a, 3, THEME.guide, null);
  }
  const p = snap.point;
  if (snap.type === 'endpoint') {
    r.dot(ctx, p, 7, 'rgba(14, 159, 110, 0.18)', THEME.snap, 2);
    r.dot(ctx, p, 2.5, THEME.snap, null);
  } else if (snap.type === 'mid') {
    const s = r.px(7);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = THEME.snap;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s, s * 0.8);
    ctx.lineTo(-s, s * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else if (snap.type === 'wall') {
    const s = r.px(10);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = THEME.snap;
    ctx.lineWidth = r.px(2);
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  } else {
    r.dot(ctx, p, 3, THEME.accent, THEME.handleFill, 1.2);
  }
  if (snap.label) {
    r.label(ctx, { x: p.x, y: p.y - r.px(20) }, snap.label, { size: 11, weight: 600, color: '#fff', bg: THEME.snap, halo: false });
  }
}
