/**
 * Простой физический мир для манекена, собранный прямо из проекта (а не из 3D-сетки):
 * вертикальные призмы «многоугольник в плане × диапазон высот».
 *
 *  - стены (куски между проёмами), цоколь, стекло окон, закрытые двери;
 *  - полы этажей с вырезами под лестницы, ступени лестниц и крыльца;
 *  - мебель, стволы деревьев, стойки беседок, забор.
 *
 * Координаты: x, z — план (z = y плана), y — высота над землёй.
 */
import { computeWallGeometry, wallPieces3D, clipWallRange } from '../../geometry/wallGeometry.js';
import { stairLayout } from '../../geometry/stairGeometry.js';
import { porchSteps } from '../../geometry/porch.js';
import { pointInPolygon, projectOnSegment, rectCorners, circlePolygon, bboxOf } from '../../core/geometry.js';
import { levelElevation, wallHeight, levelBelow, levelTop, groundLevel, isBasement, SITE_LEVEL } from '../../model/project.js';
import { excavationOutlines, inExcavation } from '../../geometry/excavation.js';
import { levelFootprints } from '../../geometry/roomDetect.js';
import { roofPlanes, roofHeightAt } from '../../geometry/roofGeometry.js';
import { stairRise3D } from '../builders/buildStructure.js';

/** Предметы, сквозь которые можно пройти, — только опора (ковёр) или вовсе ничего. */
const FLAT = new Set(['rug']);
const POSTS = new Set(['gazebo', 'greenhouse', 'playground']);
const TRUNK = new Set(['tree', 'conifer', 'fruit_tree']);

export class CollisionWorld {
  constructor(project, { doorPassable = () => false } = {}) {
    this.solids = [];
    this.doorPassable = doorPassable;
    this.build(project);
  }

  _add(poly, y0, y1, info = {}) {
    if (!poly || poly.length < 3 || y1 - y0 < 1e-4) return;
    const bb = bboxOf(poly);
    this.solids.push({ poly, holes: info.holes || null, y0, y1, bb, kind: info.kind || 'solid', ref: info.ref || null, doorId: info.doorId || null, noSide: !!info.noSide, levelId: info.levelId ?? this._lvl, site: !!this._site });
  }

  build(project) {
    this.solids = [];
    this._site = false;
    this.levels = project.levels.map((l) => ({ id: l.id, base: levelElevation(project, l.id) }));
    // котлованы под подвалами: там нет грунта на отметке 0
    this.pits = excavationOutlines(project);
    // скаты крыш — «потолок» мансарды: под низким скатом не пройти во весь рост
    this.roofs = project.roofs.map((r) => roofPlanes(r, levelTop(project, r.levelId)));
    const ground = groundLevel(project);
    this.groundId = ground?.id ?? project.levels[0]?.id ?? null;
    project.levels.forEach((level, i) => {
      const base = levelElevation(project, level.id);
      this._lvl = level.id; // все тела этажа помнят свой этаж — по опоре под ногами видно, где манекен
      const walls = project.walls.filter((w) => w.levelId === level.id);
      const geoms = computeWallGeometry(walls);
      const ops = new Map();
      for (const o of project.openings) {
        if (!ops.has(o.wallId)) ops.set(o.wallId, []);
        ops.get(o.wallId).push(o);
      }

      // стены и проёмы
      for (const g of geoms.values()) {
        const h = wallHeight(project, g.wall);
        const list = ops.get(g.wall.id) || [];
        for (const p of wallPieces3D(g, list, h)) this._add(p.poly, base + p.y0, base + p.y1, { kind: 'wall', ref: { kind: 'wall', id: g.wall.id } });
        if (i === 0 && g.wall.kind === 'exterior' && base > 0.01) this._add(g.poly, 0, base, { kind: 'wall' });
        for (const o of list) {
          const poly = clipWallRange(g, o.t - o.width / 2, o.t + o.width / 2);
          const top = Math.min(o.sill + o.height, h);
          if (o.kind === 'window') this._add(poly, base + o.sill, base + top, { kind: 'glass', ref: { kind: 'opening', id: o.id } });
          else if (o.kind === 'door') this._add(poly, base + o.sill, base + top, { kind: 'door', doorId: o.id, ref: { kind: 'opening', id: o.id } });
          // порог под дверью: пол между комнатами не обрывается в толще стены
          if (o.kind !== 'window' && o.sill < 0.05) {
            if (i === 0 && g.wall.kind === 'exterior' && base > 0.01) this._add(poly, 0, base, { kind: 'floor', noSide: true });
            else this._add(poly, base - 0.06, base, { kind: 'floor', noSide: true });
          }
        }
      }
      if (level === ground) for (const st of porchSteps(project, level.id, geoms, base)) this._add(st.poly, 0, st.top, { kind: 'porch' });
      // дно котлована подвала
      if (isBasement(level)) for (const fp of levelFootprints(walls)) this._add(fp, base - 0.35, base - 0.015, { kind: 'floor', noSide: true });

      // полы с вырезами под лестницы с этажа ниже
      const below = levelBelow(project, level.id);
      const holes = [];
      if (below) for (const s of project.stairs.filter((x) => x.levelId === below.id)) holes.push(stairLayout(s, stairRise3D(project, s)).outline);
      const y0 = i === 0 ? (base > 0.01 ? 0 : base - 0.1) : base - (below?.slab ?? 0.25);
      for (const room of project.rooms.filter((r) => r.levelId === level.id)) {
        const inner = holes.filter((hl) => hl.every((p) => pointInPolygon(p, room.points)));
        this._add(room.points, y0, base, { kind: 'floor', holes: inner, noSide: true, ref: { kind: 'room', id: room.id } });
      }

      // лестницы
      for (const s of project.stairs.filter((x) => x.levelId === level.id)) {
        const lay = stairLayout(s, stairRise3D(project, s));
        for (const st of lay.steps) {
          this._add(st.poly, st.thin ? base + st.top - 0.05 : base, base + st.top, { kind: 'stair', ref: { kind: 'stair', id: s.id } });
        }
      }

      // мебель этажа
      for (const it of project.items.filter((x) => x.levelId === level.id)) this._addItem(it, base);
    });

    // зоны участка (терраса чуть выше газона) и объекты участка, забор — это земля первого этажа
    this._lvl = this.groundId;
    this._site = true;
    for (const z of project.zones) {
      const top = z.material === 'water' ? 0.015 : z.material === 'deck' ? 0.12 : 0.03;
      this._add(z.points, 0, top, { kind: 'floor', noSide: true, ref: { kind: 'zone', id: z.id } });
    }
    for (const it of project.items.filter((x) => x.levelId === SITE_LEVEL)) this._addItem(it, 0);
    const fence = project.site.fence;
    const b = project.site.boundary;
    if (fence?.enabled && b.length > 1) {
      for (let i = 0; i < b.length; i++) {
        const a = b[i];
        const c = b[(i + 1) % b.length];
        const L = Math.hypot(c.x - a.x, c.y - a.y);
        if (L < 0.05) continue;
        const nx = (-(c.y - a.y) / L) * 0.05;
        const ny = ((c.x - a.x) / L) * 0.05;
        this._add(
          [
            { x: a.x + nx, y: a.y + ny },
            { x: c.x + nx, y: c.y + ny },
            { x: c.x - nx, y: c.y - ny },
            { x: a.x - nx, y: a.y - ny },
          ],
          0,
          fence.height || 1.8,
          { kind: 'fence' },
        );
      }
    }
  }

  _addItem(it, base) {
    const y0 = base + (it.elevation || 0);
    const ref = { kind: 'item', id: it.id };
    if (TRUNK.has(it.type)) {
      this._add(circlePolygon(it.x, it.y, Math.max(0.12, Math.min(it.w, it.d) * 0.06), 8), y0, y0 + it.h, { kind: 'item', ref });
      return;
    }
    if (POSTS.has(it.type)) {
      const corners = rectCorners(it.x, it.y, it.w - 0.2, it.d - 0.2, it.rotation || 0);
      for (const c of corners) this._add(circlePolygon(c.x, c.y, 0.08, 6), y0, y0 + it.h, { kind: 'item', ref });
      return;
    }
    const poly = rectCorners(it.x, it.y, it.w, it.d, it.rotation || 0);
    const h = FLAT.has(it.type) ? 0.01 : it.h;
    this._add(poly, y0, y0 + h, { kind: FLAT.has(it.type) ? 'floor' : 'item', ref, noSide: FLAT.has(it.type) });
  }

  _contains(s, x, z) {
    if (x < s.bb.minX || x > s.bb.maxX || z < s.bb.minY || z > s.bb.maxY) return false;
    const p = { x, y: z };
    if (!pointInPolygon(p, s.poly)) return false;
    if (s.holes) for (const h of s.holes) if (pointInPolygon(p, h)) return false;
    return true;
  }

  _active(s) {
    return !(s.kind === 'door' && this.doorPassable(s.doorId));
  }

  /**
   * Опора под точкой: самая высокая поверхность не выше maxY.
   * @returns {{ y, solid }}
   */
  supportAt(x, z, maxY) {
    // земля — везде, кроме котлована подвала; ниже — «бездна», чтобы не падать вечно
    let best = maxY >= -1e-4 && !inExcavation(this.pits, { x, y: z }) ? { y: 0, solid: null } : { y: -50, solid: null };
    for (const s of this.solids) {
      if (s.y1 > maxY + 1e-4 || s.y1 <= best.y || !this._active(s)) continue;
      if (this._contains(s, x, z)) best = { y: s.y1, solid: s };
    }
    return best;
  }

  /** Самый низкий «потолок» над точкой выше fromY (для прыжка). */
  ceilingAt(x, z, fromY) {
    let best = Infinity;
    for (const s of this.solids) {
      if (s.y0 < fromY || s.y0 >= best || !this._active(s)) continue;
      if (this._contains(s, x, z)) best = s.y0;
    }
    const r = this._roofAbove(x, z, fromY);
    return Math.min(best, r);
  }

  /** Низ ската крыши над точкой, если он выше fromY. */
  _roofAbove(x, z, fromY) {
    let best = Infinity;
    for (const rp of this.roofs) {
      const h = roofHeightAt(rp, { x, y: z }) - 0.25;
      if (h >= fromY && h < best) best = h;
    }
    return best;
  }

  /** Высота от ступней до ската крыши (Infinity — над головой нет крыши). */
  headroom(x, z, feetY) {
    return this._roofAbove(x, z, feetY + 0.3) - feetY;
  }

  /**
   * Выталкивание круга (капсулы в плане) из препятствий, перекрывающих диапазон высот [yLo, yHi].
   * @returns {{ x, z, contacts: Array<solid> }}
   */
  resolve(x, z, r, yLo, yHi, iterations = 3) {
    const contacts = [];
    for (let it = 0; it < iterations; it++) {
      let moved = false;
      for (const s of this.solids) {
        if (s.noSide || s.y1 <= yLo || s.y0 >= yHi) continue;
        if (x + r < s.bb.minX || x - r > s.bb.maxX || z + r < s.bb.minY || z - r > s.bb.maxY) continue;
        const isDoor = s.kind === 'door';
        if (isDoor && !this._active(s)) continue;
        const out = pushOut(x, z, r, s.poly);
        if (!out) continue;
        x = out.x;
        z = out.z;
        moved = true;
        if (!contacts.includes(s)) contacts.push(s);
      }
      if (!moved) break;
    }
    return { x, z, contacts };
  }

  /** Есть ли свободное место для тела в точке (для залезания наверх). */
  freeAt(x, z, r, yLo, yHi) {
    for (const s of this.solids) {
      if (s.noSide || s.y1 <= yLo || s.y0 >= yHi || !this._active(s)) continue;
      if (x + r < s.bb.minX || x - r > s.bb.maxX || z + r < s.bb.minY || z - r > s.bb.maxY) continue;
      if (pushOut(x, z, r, s.poly)) return false;
    }
    return true;
  }

  /**
   * Этаж, на котором стоит манекен. Сначала — по опоре под ногами (пол комнаты,
   * мебель, порог), на земле участка и крыльце — первый этаж; на лестнице и в прыжке —
   * по высоте ступней.
   */
  /** Стоит ли манекен снаружи: на земле, дорожке, крыльце или объекте участка. */
  outsideAt(x, z, y) {
    const sup = this.supportAt(x, z, y + 0.06);
    if (Math.abs(sup.y - y) > 0.25) return false;
    const s = sup.solid;
    return (!s && y > -0.6) || !!s?.site || s?.kind === 'porch';
  }

  levelAt(y, x = null, z = null) {
    if (x != null && z != null) {
      const sup = this.supportAt(x, z, y + 0.06);
      const s = sup.solid;
      if (s && s.kind !== 'stair' && Math.abs(sup.y - y) < 0.25 && s.levelId) return s.levelId;
      if (!s && Math.abs(sup.y - y) < 0.25 && y > -0.6) return this.groundId;
    }
    let id = this.levels[0]?.id;
    for (const l of this.levels) {
      const from = l.id === this.groundId ? Math.min(l.base - 0.6, -0.45) : l.base - 0.6;
      if (y >= from) id = l.id;
    }
    return id;
  }
}

/** Выталкивает круг из многоугольника; null — если не пересекаются. */
function pushOut(x, z, r, poly) {
  const p = { x, y: z };
  let best = Infinity;
  let bp = null;
  let edge = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const pr = projectOnSegment(p, a, b);
    if (pr.dist < best) {
      best = pr.dist;
      bp = pr.point;
      edge = [a, b];
    }
  }
  const inside = pointInPolygon(p, poly);
  if (!inside && best >= r) return null;
  let nx;
  let nz;
  if (best > 1e-6) {
    nx = (x - bp.x) / best;
    nz = (z - bp.y) / best;
    if (inside) {
      nx = -nx;
      nz = -nz;
    }
  } else {
    // точно на ребре — нормаль ребра наружу
    const ex = edge[1].x - edge[0].x;
    const ez = edge[1].y - edge[0].y;
    const L = Math.hypot(ex, ez) || 1;
    nx = ez / L;
    nz = -ex / L;
    if (pointInPolygon({ x: bp.x + nx * 0.01, y: bp.y + nz * 0.01 }, poly)) {
      nx = -nx;
      nz = -nz;
    }
  }
  const push = inside ? best + r : r - best;
  return { x: x + nx * (push + 1e-4), z: z + nz * (push + 1e-4) };
}

