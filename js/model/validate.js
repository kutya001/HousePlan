/**
 * Проверка проекта на ошибки, которых не бывает в настоящем доме:
 *  - предметы стоят друг в друге или заходят в стены, на лестницу, в проём лестницы;
 *  - дверь загорожена мебелью;
 *  - постройки на одном этаже накладываются друг на друга, стены дублируются;
 *  - объекты участка стоят в доме или на крыльце, за забором;
 *  - мебель вне перекрытия этажа («висит в воздухе»), этаж без пола;
 *  - проёмы накладываются или выходят за стену.
 *
 * Чистые функции без DOM: работают в редакторе, при импорте и в тестах.
 * Каждая проблема: { id, level: 'error' | 'warn', title, text, levelId, refs, at, area, fix }.
 */
import { computeWallGeometry, wallPieces3D, clipWallRange, pointOnWall } from '../geometry/wallGeometry.js';
import { stairLayout } from '../geometry/stairGeometry.js';
import { levelFootprints } from '../geometry/roomDetect.js';
import { porchSteps, outsideSide } from '../geometry/porch.js';
import { cellarEntries } from '../geometry/cellarEntry.js';
import { rectCorners, circlePolygon, pointInPolygon, polygonArea, polygonSignedArea, clipPolygonHalfPlane, bboxOf, dist, add, mul, segmentIntersect, projectOnSegment, polygonLabelPoint } from '../core/geometry.js';
import { catalogItem } from './catalog.js';
import { stairStyle, TREAD } from './defaults.js';
import { SITE_LEVEL, groundLevel, getLevel, levelElevation, levelWallHeight, levelBelow, levelAbove, wallHeight, isBasement, isAttic } from './project.js';
import { roomWindowDirections } from '../geometry/orientation.js';
import { roofSurfaceAt } from '../geometry/roofSurface.js';
import { isGate } from './openings.js';

const OPENING_LABEL = { door: 'Дверь', window: 'Окно', arch: 'Проём', opening: 'Проём' };

const TOL = 0.03; // допуск: на 3 см можно «касаться» — так ставят мебель вплотную
const TRUNK = new Set(['tree', 'conifer', 'fruit_tree']);
const POSTS = new Set(['gazebo', 'greenhouse', 'playground', 'carport']);
const isAttached = (it) => !!catalogItem(it.type)?.attached; // балкон, козырёк — снаружи у стены
const SOFT = new Set(['bush', 'rug']); // крона куста и ковёр никому не мешают
const SEATS = new Set(['chair', 'office_chair', 'bench', 'armchair']);
const TABLES = new Set(['dining_table', 'round_table', 'desk', 'kitchen_island', 'coffee_table']);
const LOW = 1.0; // предмет выше этой отметки (котёл на стене) проходу в дверь не мешает

const itemName = (it) => catalogItem(it.type)?.name || 'Предмет';
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// ── Геометрия ────────────────────────────────────────────────────────────

/** Выпуклая оболочка (монотонная цепь), против часовой стрелки. */
function hull(points) {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [];
  for (const p of pts) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 1e-12) lo.pop();
    lo.push(p);
  }
  const up = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 1e-12) up.pop();
    up.push(p);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

const ccw = (poly) => (polygonSignedArea(poly) < 0 ? [...poly].reverse() : poly);

function centroidOf(poly) {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / poly.length, y: y / poly.length };
}

/**
 * Разделяющие оси для выпуклых A и B. null — не пересекаются;
 * иначе { depth, axis } — на сколько и куда сдвинуть A, чтобы разойтись с B.
 */
function sat(A, B) {
  let best = Infinity;
  let axis = null;
  for (const P of [A, B]) {
    for (let i = 0; i < P.length; i++) {
      const a = P[i];
      const b = P[(i + 1) % P.length];
      let nx = b.y - a.y;
      let ny = a.x - b.x;
      const L = Math.hypot(nx, ny);
      if (L < 1e-9) continue;
      nx /= L;
      ny /= L;
      let a0 = Infinity;
      let a1 = -Infinity;
      for (const p of A) {
        const v = p.x * nx + p.y * ny;
        if (v < a0) a0 = v;
        if (v > a1) a1 = v;
      }
      let b0 = Infinity;
      let b1 = -Infinity;
      for (const p of B) {
        const v = p.x * nx + p.y * ny;
        if (v < b0) b0 = v;
        if (v > b1) b1 = v;
      }
      const o = Math.min(a1, b1) - Math.max(a0, b0);
      if (o <= 0) return null;
      if (o < best) {
        best = o;
        axis = { x: nx, y: ny };
      }
    }
  }
  const ca = centroidOf(A);
  const cb = centroidOf(B);
  if ((ca.x - cb.x) * axis.x + (ca.y - cb.y) * axis.y < 0) axis = { x: -axis.x, y: -axis.y };
  return { depth: best, axis };
}

/** Пересечение многоугольника с выпуклым (Сазерленд — Ходжмен). */
function clipByConvex(subject, convex) {
  const c = ccw(convex);
  let out = subject;
  for (let i = 0; i < c.length && out.length; i++) {
    const a = c[i];
    const b = c[(i + 1) % c.length];
    out = clipPolygonHalfPlane(out, a, { x: -(b.y - a.y), y: b.x - a.x });
  }
  return out;
}

const boxOf = (poly) => bboxOf(poly);
const boxesMeet = (a, b, pad = 0) => a.minX - pad < b.maxX && b.minX - pad < a.maxX && a.minY - pad < b.maxY && b.minY - pad < a.maxY;

/** Форма предмета в плане для проверки столкновений. */
function itemShape(it) {
  const y0 = it.elevation || 0;
  const y1 = y0 + (it.h || 0);
  if (TRUNK.has(it.type)) {
    const poly = circlePolygon(it.x, it.y, Math.max(0.12, Math.min(it.w, it.d) * 0.06), 8);
    return { parts: [poly], outline: poly, y0, y1 };
  }
  const rect = rectCorners(it.x, it.y, it.w, it.d, it.rotation || 0);
  if (POSTS.has(it.type)) {
    const parts = rectCorners(it.x, it.y, it.w - 0.2, it.d - 0.2, it.rotation || 0).map((c) => circlePolygon(c.x, c.y, 0.08, 6));
    return { parts, outline: rect, y0, y1, container: true };
  }
  if (it.type === 'plant') {
    const poly = circlePolygon(it.x, it.y, Math.min(it.w, it.d) * 0.32, 10);
    return { parts: [poly], outline: poly, y0, y1 };
  }
  return { parts: [rect], outline: rect, y0, y1 };
}

/** Самое глубокое пересечение частей двух форм (или null). */
function deepest(partsA, partsB) {
  let best = null;
  for (const a of partsA) {
    const ba = boxOf(a);
    for (const b of partsB) {
      if (!boxesMeet(ba, boxOf(b))) continue;
      const r = sat(a, b);
      if (r && (!best || r.depth > best.depth)) best = { ...r, a, b };
    }
  }
  return best;
}

/** Площадь пересечения произвольных многоугольников (сеткой — для контуров построек). */
function overlapArea(A, B, step = 0.1) {
  const ba = boxOf(A);
  const bb = boxOf(B);
  const x0 = Math.max(ba.minX, bb.minX);
  const x1 = Math.min(ba.maxX, bb.maxX);
  const y0 = Math.max(ba.minY, bb.minY);
  const y1 = Math.min(ba.maxY, bb.maxY);
  if (x1 <= x0 || y1 <= y0) return { area: 0 };
  let n = 0;
  let sx = 0;
  let sy = 0;
  const pts = [];
  for (let x = x0 + step / 2; x < x1; x += step) {
    for (let y = y0 + step / 2; y < y1; y += step) {
      const p = { x, y };
      if (pointInPolygon(p, A) && pointInPolygon(p, B)) {
        n++;
        sx += x;
        sy += y;
        pts.push(p);
      }
    }
  }
  if (!n) return { area: 0 };
  return { area: n * step * step, at: { x: sx / n, y: sy / n }, area_poly: hull(pts) };
}

// ── Проверка ─────────────────────────────────────────────────────────────

/**
 * @returns {Array<Issue>} сначала ошибки, затем предупреждения
 */
export function checkProject(project) {
  const issues = [];
  const seen = new Set();
  const push = (iss) => {
    if (seen.has(iss.id)) return;
    seen.add(iss.id);
    issues.push(iss);
  };
  const ground = groundLevel(project);
  const geomsByLevel = new Map();
  const geomsOf = (levelId) => {
    if (!geomsByLevel.has(levelId)) geomsByLevel.set(levelId, computeWallGeometry(project.walls.filter((w) => w.levelId === levelId)));
    return geomsByLevel.get(levelId);
  };
  const openingsByWall = new Map();
  for (const o of project.openings) {
    if (!openingsByWall.has(o.wallId)) openingsByWall.set(o.wallId, []);
    openingsByWall.get(o.wallId).push(o);
  }
  const stairsOf = (levelId) =>
    project.stairs
      .filter((s) => s.levelId === levelId)
      .map((s) => {
        const lvl = getLevel(project, s.levelId);
        const lay = stairLayout(s, lvl ? levelWallHeight(lvl) : 3);
        const style = stairStyle(s);
        // высоты низа и верха каждой ступени: у открытой лестницы под маршем пусто
        const spans = lay.steps.map((st) => {
          const th = style === 'solid' ? st.top : st.thin ? 0.05 : st.landing ? TREAD.landing : TREAD[style];
          return { poly: ccw(st.poly), y0: st.top - th, y1: st.top };
        });
        return { s, steps: spans.map((x) => x.poly), spans, outline: lay.outline };
      });

  for (const level of project.levels) {
    const lid = level.id;
    const geoms = geomsOf(lid);
    // инженерия (розетки, светильники, выводы, радиаторы) живёт на стенах и потолке — в столкновениях не участвует
    const items = project.items.filter((it) => it.levelId === lid && catalogItem(it.type)?.category !== 'mep' && !catalogItem(it.type)?.roofMount);
    checkRoofWindows(project, lid, push);
    const rooms = project.rooms.filter((r) => r.levelId === lid);
    const stairs = stairsOf(lid);
    const below = levelBelow(project, lid);
    const holes = below ? stairsOf(below.id) : [];
    const shapes = new Map(items.map((it) => [it.id, itemShape(it)]));

    checkItemPairs(items, shapes, lid, push);
    checkAttached(items, geoms, lid, push);
    checkItemsWalls(project, items, shapes, geoms, openingsByWall, lid, push);
    checkItemsStairs(items, shapes, stairs, holes, lid, push);
    checkStairs(stairs, geoms, openingsByWall, project, lid, push);
    checkDoors(project, level, geoms, rooms, items, shapes, stairs, lid, push, ground);
    checkOpenings(project, geoms, openingsByWall, lid, push);
    checkAtticOpenings(project, level, geoms, openingsByWall, lid, push);
    checkWallsDuplicate(geoms, lid, push);
    checkWallCrossings(geoms, lid, push);
    checkBuildings(project, lid, push);
    checkComfort(project, level, geoms, rooms, stairs, lid, push);

    // мебель вне перекрытия этажа и этаж без пола
    const walls = [...geoms.values()];
    if (walls.length && !rooms.length) {
      push({
        id: `nofloor:${lid}`,
        level: 'warn',
        title: `${level.name}: нет пола`,
        text: 'Стены есть, а комнат нет — в 3D не будет перекрытия, мебель и манекен провалятся. Нажмите «Найти комнаты».',
        levelId: lid,
        refs: [],
        at: centroidOf(walls.map((g) => g.a)),
        fix: { label: 'Найти комнаты', kind: 'autoRooms', levelId: lid },
      });
    } else if (rooms.length) {
      for (const it of items) {
        const sh = shapes.get(it.id);
        const c = { x: it.x, y: it.y };
        if (rooms.some((r) => pointInPolygon(c, r.points))) continue;
        if (isAttached(it)) continue; // балкон и козырёк и должны быть снаружи
        if (stairs.some((st) => pointInPolygon(c, st.outline))) continue;
        const outdoor = !!catalogItem(it.type)?.outdoor;
        if (level === ground) {
          push({
            id: `outside:${it.id}`,
            level: 'warn',
            title: `${itemName(it)} стоит вне дома на высоте пола`,
            text: 'Предмет первого этажа снаружи — в 3D он висит над землёй на высоте цоколя. Перенесите его на участок.',
            levelId: lid,
            refs: [{ kind: 'item', id: it.id }],
            at: c,
            area: sh.outline,
            fix: { label: outdoor ? 'На участок' : 'Перенести на участок', kind: 'toSite', itemId: it.id },
          });
        } else {
          push({
            id: `float:${it.id}`,
            level: 'error',
            title: `${itemName(it)} висит в воздухе`,
            text: isBasement(level) ? 'Предмет подвала вне его помещений — он оказался в грунте.' : 'Под предметом нет перекрытия этажа — он за пределами комнат.',
            levelId: lid,
            refs: [{ kind: 'item', id: it.id }],
            at: c,
            area: sh.outline,
          });
        }
      }
    }
  }

  checkSite(project, ground, geomsOf, push);
  checkCellarEntries(project, ground, push);
  checkSetback(project, ground, push);

  const rank = { error: 0, warn: 1 };
  return issues.sort((a, b) => rank[a.level] - rank[b.level]);
}

/** Балкон и козырёк должны примыкать задней стороной к стене. */
function checkAttached(items, geoms, lid, push) {
  const polys = [...geoms.values()].map((g) => g.poly);
  for (const it of items) {
    if (!isAttached(it)) continue;
    const a = ((it.rotation || 0) * Math.PI) / 180;
    // точка в 12 см за «спинкой» (локальная −y)
    const back = (dx) => ({
      x: it.x + dx * Math.cos(a) - (-it.d / 2 - 0.12) * Math.sin(a),
      y: it.y + dx * Math.sin(a) + (-it.d / 2 - 0.12) * Math.cos(a),
    });
    const touches = [-it.w / 4, 0, it.w / 4].filter((dx) => polys.some((p) => pointInPolygon(back(dx), p))).length >= 2;
    if (!touches) {
      push({
        id: `att:${it.id}`,
        level: 'warn',
        title: `${itemName(it)} не примыкает к стене`,
        text: 'Задней стороной он должен опираться на наружную стену — поверните его спинкой к стене или придвиньте.',
        levelId: lid,
        refs: [{ kind: 'item', id: it.id }],
        at: { x: it.x, y: it.y },
        area: rectCorners(it.x, it.y, it.w, it.d, it.rotation || 0),
      });
    }
  }
}

/** Предметы друг в друге. */
function checkItemPairs(items, shapes, lid, push) {
  const list = items.filter((it) => !SOFT.has(it.type) && (it.h || 0) > 0.02);
  const boxes = list.map((it) => boxOf(shapes.get(it.id).outline));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (!boxesMeet(boxes[i], boxes[j])) continue;
      const a = list[i];
      const b = list[j];
      const sa = shapes.get(a.id);
      const sb = shapes.get(b.id);
      if (Math.min(sa.y1, sb.y1) - Math.max(sa.y0, sb.y0) <= 0.01) continue; // один над другим
      const hit = deepest(sa.parts, sb.parts);
      if (!hit || hit.depth <= TOL) continue;
      // стул, задвинутый под стол, — норма
      const seat = SEATS.has(a.type) ? a : SEATS.has(b.type) ? b : null;
      const table = TABLES.has(a.type) ? a : TABLES.has(b.type) ? b : null;
      if (seat && table && seat !== table && hit.depth <= Math.min(seat.w, seat.d) * 0.8) continue;
      // сдвигаем меньший предмет
      const small = a.w * a.d <= b.w * b.d ? a : b;
      const dir = small === a ? hit.axis : { x: -hit.axis.x, y: -hit.axis.y };
      const k = hit.depth + 0.01;
      const area = clipByConvex(hit.a, hit.b);
      push({
        id: `ii:${[a.id, b.id].sort().join(':')}`,
        level: 'error',
        title: `${itemName(a)} и ${lower(itemName(b))} стоят друг в друге`,
        text: `Заходят друг в друга на ${cm(hit.depth)}.`,
        levelId: lid,
        refs: [
          { kind: 'item', id: a.id },
          { kind: 'item', id: b.id },
        ],
        at: area.length >= 3 ? centroidOf(area) : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        area: area.length >= 3 ? area : sa.outline,
        fix: { label: 'Раздвинуть', kind: 'move', itemId: small.id, dx: dir.x * k, dy: dir.y * k },
      });
    }
  }
}

/** Предметы в стенах и в дверных проёмах. */
function checkItemsWalls(project, items, shapes, geoms, openingsByWall, lid, push) {
  for (const g of geoms.values()) {
    const ops = openingsByWall.get(g.wall.id) || [];
    const h = wallHeight(project, g.wall);
    const pieces = wallPieces3D(g, ops, h).map((p) => ({ ...p, poly: ccw(hull(p.poly)) }));
    const wb = boxOf(g.poly);
    for (const it of items) {
      if (SOFT.has(it.type)) continue;
      const sh = shapes.get(it.id);
      if (!boxesMeet(wb, boxOf(sh.outline))) continue;
      let worst = null;
      for (const pc of pieces) {
        if (Math.min(sh.y1, pc.y1) - Math.max(sh.y0, pc.y0) <= 0.01) continue;
        const r = deepest(sh.parts, [pc.poly]);
        if (r && r.depth > TOL && (!worst || r.depth > worst.depth)) worst = r;
      }
      if (worst) {
        const k = worst.depth + 0.01;
        const area = clipByConvex(worst.a, worst.b);
        push({
          id: `iw:${it.id}:${g.wall.id}`,
          level: 'error',
          title: `${itemName(it)} заходит в стену`,
          text: `На ${cm(worst.depth)} в толщу стены — отодвиньте от стены.`,
          levelId: lid,
          refs: [
            { kind: 'item', id: it.id },
            { kind: 'wall', id: g.wall.id },
          ],
          at: area.length >= 3 ? centroidOf(area) : { x: it.x, y: it.y },
          area: area.length >= 3 ? area : sh.outline,
          fix: { label: 'Отодвинуть', kind: 'move', itemId: it.id, dx: worst.axis.x * k, dy: worst.axis.y * k },
        });
        continue;
      }
      // в дверном проёме: проход загорожен
      if (sh.y0 > LOW) continue;
      for (const o of ops) {
        if (o.kind === 'window' || o.sill > 0.05) continue;
        const poly = ccw(hull(clipWallRange(g, o.t - o.width / 2, o.t + o.width / 2)));
        if (poly.length < 3) continue;
        const r = deepest(sh.parts, [poly]);
        if (r && r.depth > TOL) {
          push({
            id: `idoor:${it.id}:${o.id}`,
            level: 'error',
            title: `${itemName(it)} стоит в дверном проёме`,
            text: 'Через этот проём не пройти.',
            levelId: lid,
            refs: [
              { kind: 'item', id: it.id },
              { kind: 'opening', id: o.id },
            ],
            at: centroidOf(poly),
            area: sh.outline,
          });
        }
      }
    }
  }
}

/** Предметы на лестнице и над лестничным проёмом с этажа ниже. */
function checkItemsStairs(items, shapes, stairs, holes, lid, push) {
  for (const it of items) {
    if (SOFT.has(it.type)) continue;
    const sh = shapes.get(it.id);
    for (const st of stairs) {
      // под открытым маршем можно поставить шкаф или кладовку — если он ниже ступеней
      const r = deepest(sh.parts, stepsBetween(st, sh.y0, sh.y1 + 0.02));
      if (r && r.depth > TOL) {
        push({
          id: `is:${it.id}:${st.s.id}`,
          level: 'error',
          title: `${itemName(it)} стоит на лестнице`,
          text: 'Лестница загорожена — по ней не пройти.',
          levelId: lid,
          refs: [
            { kind: 'item', id: it.id },
            { kind: 'stair', id: st.s.id },
          ],
          at: { x: it.x, y: it.y },
          area: sh.outline,
        });
      }
    }
    for (const st of holes) {
      const r = deepest(sh.parts, st.steps);
      if (r && r.depth > TOL) {
        push({
          id: `ih:${it.id}:${st.s.id}`,
          level: 'error',
          title: `${itemName(it)} над лестничным проёмом`,
          text: 'В этом месте в перекрытии вырез под лестницу с этажа ниже — предмет упадёт вниз.',
          levelId: lid,
          refs: [{ kind: 'item', id: it.id }],
          at: { x: it.x, y: it.y },
          area: sh.outline,
        });
      }
    }
  }
}

/** Ступени лестницы, занимающие высоты [y0, y1] над полом этажа. */
function stepsBetween(st, y0, y1) {
  return st.spans.filter((x) => x.y0 < y1 && x.y1 > y0).map((x) => x.poly);
}

/** Лестницы в стенах и друг в друге. */
function checkStairs(stairs, geoms, openingsByWall, project, lid, push) {
  for (const st of stairs) {
    for (const g of geoms.values()) {
      const pieces = wallPieces3D(g, openingsByWall.get(g.wall.id) || [], wallHeight(project, g.wall)).map((p) => ({ ...p, poly: ccw(hull(p.poly)) }));
      let r = null;
      for (const sp of st.spans) {
        const hit = deepest(
          [sp.poly],
          pieces.filter((p) => p.y0 < sp.y1 - 0.02 && p.y1 > sp.y0 + 0.02).map((p) => p.poly),
        );
        if (hit && (!r || hit.depth > r.depth)) r = hit;
      }
      if (r && r.depth > TOL) {
        push({
          id: `sw:${st.s.id}:${g.wall.id}`,
          level: 'error',
          title: 'Лестница заходит в стену',
          text: `На ${cm(r.depth)} — подвиньте лестницу или стену.`,
          levelId: lid,
          refs: [
            { kind: 'stair', id: st.s.id },
            { kind: 'wall', id: g.wall.id },
          ],
          at: centroidOf(r.a),
          area: st.outline,
        });
      }
    }
  }
  for (let i = 0; i < stairs.length; i++) {
    for (let j = i + 1; j < stairs.length; j++) {
      const r = deepest(stairs[i].steps, stairs[j].steps);
      if (r && r.depth > TOL) {
        push({
          id: `ss:${stairs[i].s.id}:${stairs[j].s.id}`,
          level: 'error',
          title: 'Лестницы накладываются',
          text: 'Две лестницы занимают одно место.',
          levelId: lid,
          refs: [
            { kind: 'stair', id: stairs[i].s.id },
            { kind: 'stair', id: stairs[j].s.id },
          ],
          at: centroidOf(r.a),
          area: stairs[i].outline,
        });
      }
    }
  }
}

/** Двери, перед которыми стоит мебель или лестница. */
function checkDoors(project, level, geoms, rooms, items, shapes, stairs, lid, push, ground) {
  const siteItems = level === ground ? project.items.filter((it) => it.levelId === SITE_LEVEL) : [];
  const siteShapes = new Map(siteItems.map((it) => [it.id, itemShape(it)]));
  const porch = level === ground && levelElevation(project, lid) >= 0.12;
  for (const g of geoms.values()) {
    for (const o of project.openings) {
      if (o.wallId !== g.wall.id || o.kind === 'window' || o.sill > 0.05 || isGate(o)) continue; // за воротами гаража стоит машина — так и задумано
      const out = g.wall.kind === 'exterior' ? outsideSide(g, o, rooms, geoms) : 0;
      for (const side of [1, -1]) {
        const outside = out !== 0 && side === out;
        if (outside && porch) continue; // снаружи — крыльцо, его строим сами
        const pool = outside ? siteItems : items;
        const shapesOf = outside ? siteShapes : shapes;
        const s0 = o.t - o.width / 2 + 0.06;
        const s1 = o.t + o.width / 2 - 0.06;
        if (s1 <= s0) continue;
        const nn = mul(g.n, side);
        const zone = ccw([add(pointOnWall(g, s0), mul(nn, g.half)), add(pointOnWall(g, s1), mul(nn, g.half)), add(pointOnWall(g, s1), mul(nn, g.half + 0.6)), add(pointOnWall(g, s0), mul(nn, g.half + 0.6))]);
        for (const it of pool) {
          if (SOFT.has(it.type) || it.type === 'plant' || isAttached(it)) continue;
          const sh = shapesOf.get(it.id);
          if (sh.y0 > LOW) continue;
          const r = deepest(sh.parts, [zone]);
          if (r && r.depth > 0.08) {
            push({
              id: `door:${o.id}:${it.id}`,
              level: 'warn',
              title: `${itemName(it)} загораживает дверь`,
              text: `Перед дверью меньше 60 см свободного места${outside ? ' снаружи' : ''}.`,
              levelId: outside ? SITE_LEVEL : lid,
              refs: [
                { kind: 'item', id: it.id },
                { kind: 'opening', id: o.id },
              ],
              at: centroidOf(zone),
              area: zone,
            });
          }
        }
        if (!outside) {
          for (const st of stairs) {
            const r = deepest(stepsBetween(st, 0, 2.0), [zone]);
            if (r && r.depth > 0.08) {
              push({
                id: `doorst:${o.id}:${st.s.id}`,
                level: 'warn',
                title: 'Лестница загораживает дверь',
                text: 'Ступени начинаются прямо у двери — открыть её и пройти будет неудобно.',
                levelId: lid,
                refs: [
                  { kind: 'stair', id: st.s.id },
                  { kind: 'opening', id: o.id },
                ],
                at: centroidOf(zone),
                area: zone,
              });
            }
          }
        }
      }
    }
  }
}

/** Проёмы: накладываются, выходят за стену, выше стены. */
/** Мансарда: дверь или окно у «колена» упирается в скат (верх проёма выше низа кровли). */
function checkAtticOpenings(project, level, geoms, openingsByWall, lid, push) {
  if (!isAttic(level) || !project.roofs.some((r) => r.levelId === lid)) return;
  const base = levelElevation(project, lid);
  for (const g of geoms.values()) {
    for (const o of openingsByWall.get(g.wall.id) || []) {
      const top = base + (o.kind === 'door' || o.kind === 'arch' ? 0 : o.sill || 0) + o.height;
      for (const t of [o.t - o.width / 2, o.t + o.width / 2]) {
        const p = pointOnWall(g, Math.max(0, Math.min(g.len, t)));
        const s = roofSurfaceAt(project, lid, p);
        // стена мансарды обрезана чуть ниже ската; над проёмом нужна перемычка ~0.2 м
        if (!s || s.h - 0.2 >= top) continue;
        const label = OPENING_LABEL[o.kind] || 'Проём';
        push({
          id: `oroof:${o.id}`,
          level: 'warn',
          title: `${label} упирается в скат крыши`,
          text: `Над краем проёма не остаётся места под скатом (не хватает ${Math.max(1, Math.round((top - s.h + 0.2) * 100))} см). Сдвиньте проём ближе к коньку или сделайте ниже.`,
          levelId: lid,
          refs: [{ kind: 'opening', id: o.id }],
          at: p,
        });
        break;
      }
    }
  }
}

function checkOpenings(project, geoms, openingsByWall, lid, push) {
  for (const g of geoms.values()) {
    const ops = (openingsByWall.get(g.wall.id) || []).slice().sort((a, b) => a.t - b.t);
    const h = wallHeight(project, g.wall);
    for (let i = 0; i < ops.length; i++) {
      const o = ops[i];
      const label = OPENING_LABEL[o.kind] || 'Проём';
      if (o.t - o.width / 2 < -0.01 || o.t + o.width / 2 > g.len + 0.01) {
        push({
          id: `oe:${o.id}`,
          level: 'error',
          title: `${label} выходит за край стены`,
          text: 'Проём длиннее стены или сдвинут за её конец.',
          levelId: lid,
          refs: [{ kind: 'opening', id: o.id }],
          at: pointOnWall(g, Math.max(0, Math.min(g.len, o.t))),
          area: g.poly,
        });
      }
      if (o.sill + o.height > h + 0.01 && h > 0.5) {
        push({
          id: `oh:${o.id}`,
          level: 'warn',
          title: `${label} выше стены`,
          text: `Верх проёма на ${cm(o.sill + o.height - h)} выше стены.`,
          levelId: lid,
          refs: [{ kind: 'opening', id: o.id }],
          at: pointOnWall(g, o.t),
          area: clipWallRange(g, o.t - o.width / 2, o.t + o.width / 2),
        });
      }
      const n = ops[i + 1];
      if (n && n.t - n.width / 2 < o.t + o.width / 2 - 0.01) {
        push({
          id: `oo:${o.id}:${n.id}`,
          level: 'error',
          title: 'Проёмы накладываются',
          text: 'Два проёма на одной стене заходят друг на друга.',
          levelId: lid,
          refs: [
            { kind: 'opening', id: o.id },
            { kind: 'opening', id: n.id },
          ],
          at: pointOnWall(g, (o.t + n.t) / 2),
          area: clipWallRange(g, n.t - n.width / 2, o.t + o.width / 2),
        });
      }
    }
  }
}

/** Стены, лежащие одна на другой. */
function checkWallsDuplicate(geoms, lid, push) {
  const list = [...geoms.values()];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const A = list[i];
      const B = list[j];
      if (Math.abs(A.d.x * B.d.y - A.d.y * B.d.x) > 0.02) continue; // не параллельны
      const off = Math.abs((B.a.x - A.a.x) * A.n.x + (B.a.y - A.a.y) * A.n.y);
      if (off > Math.max(0.03, Math.min(A.half, B.half))) continue;
      const t0 = (B.a.x - A.a.x) * A.d.x + (B.a.y - A.a.y) * A.d.y;
      const t1 = (B.b.x - A.a.x) * A.d.x + (B.b.y - A.a.y) * A.d.y;
      const lo = Math.max(0, Math.min(t0, t1));
      const hi = Math.min(A.len, Math.max(t0, t1));
      if (hi - lo < 0.1) continue;
      const shorter = A.len <= B.len ? A : B;
      push({
        id: `ww:${[A.wall.id, B.wall.id].sort().join(':')}`,
        level: 'error',
        title: 'Стены лежат одна на другой',
        text: `Две стены совпадают на ${cm(hi - lo)} — лишнюю лучше удалить.`,
        levelId: lid,
        refs: [
          { kind: 'wall', id: A.wall.id },
          { kind: 'wall', id: B.wall.id },
        ],
        at: pointOnWall(A, (lo + hi) / 2),
        area: clipWallRange(A, lo, hi),
        fix: shorter.len <= hi - lo + 0.05 ? { label: 'Удалить лишнюю', kind: 'deleteWall', wallId: shorter.wall.id } : null,
      });
    }
  }
}

/**
 * Стена, проходящая насквозь через наружную стену, — признак того, что
 * постройка заходит в другую (или стена «торчит» на улицу).
 */
function checkWallCrossings(geoms, lid, push) {
  const list = [...geoms.values()];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const A = list[i];
      const B = list[j];
      if (A.wall.kind !== 'exterior' && B.wall.kind !== 'exterior') continue;
      const r = segmentIntersect(A.a, A.b, B.a, B.b);
      if (!r) continue;
      // пересечение не у концов: стык и примыкание — норма
      const ea = Math.min(r.t * A.len, (1 - r.t) * A.len);
      const eb = Math.min(r.u * B.len, (1 - r.u) * B.len);
      if (ea < Math.max(0.05, B.half + 0.02) || eb < Math.max(0.05, A.half + 0.02)) continue;
      const at = pointOnWall(A, r.t * A.len);
      push({
        id: `wx:${[A.wall.id, B.wall.id].sort().join(':')}`,
        level: 'error',
        title: 'Стена проходит сквозь наружную',
        text: 'Стены пересекаются крест-накрест через наружную стену — похоже, одна постройка заходит в другую.',
        levelId: lid,
        refs: [
          { kind: 'wall', id: A.wall.id },
          { kind: 'wall', id: B.wall.id },
        ],
        at,
        area: circlePolygon(at.x, at.y, Math.max(A.half, B.half) + 0.15, 12),
      });
    }
  }
}

/** Отдельные постройки на одном этаже, которые заходят друг в друга. */
function checkBuildings(project, lid, push) {
  const walls = project.walls.filter((w) => w.levelId === lid);
  if (walls.length < 6) return;
  const groups = wallGroups(walls);
  if (groups.length < 2) return;
  const fps = groups.map((g) => ({ walls: g, fps: levelFootprints(g) })).filter((g) => g.fps.length);
  for (let i = 0; i < fps.length; i++) {
    for (let j = i + 1; j < fps.length; j++) {
      for (const A of fps[i].fps) {
        for (const B of fps[j].fps) {
          if (!boxesMeet(boxOf(A), boxOf(B))) continue;
          const ov = overlapArea(A, B);
          if (ov.area < 0.05) continue;
          push({
            id: `bb:${fps[i].walls[0].id}:${fps[j].walls[0].id}`,
            level: 'error',
            title: 'Постройки накладываются друг на друга',
            text: `Контуры двух построек пересекаются на ${ov.area.toFixed(1).replace('.', ',')} м² — раздвиньте их.`,
            levelId: lid,
            refs: [
              { kind: 'wall', id: fps[i].walls[0].id },
              { kind: 'wall', id: fps[j].walls[0].id },
            ],
            at: ov.at,
            area: ov.area_poly,
          });
        }
      }
    }
  }
}

/** Связные группы стен (общие концы или примыкания) — отдельные постройки. */
function wallGroups(walls) {
  const parent = walls.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const ends = (w) => [
    { x: w.x1, y: w.y1 },
    { x: w.x2, y: w.y2 },
  ];
  const onSeg = (p, w) => {
    const dx = w.x2 - w.x1;
    const dy = w.y2 - w.y1;
    const L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - w.x1) * dx + (p.y - w.y1) * dy) / L2));
    return dist(p, { x: w.x1 + dx * t, y: w.y1 + dy * t }) < Math.max(0.05, (w.thickness || 0.2) / 2 + 0.02);
  };
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      if (ends(walls[i]).some((p) => onSeg(p, walls[j])) || ends(walls[j]).some((p) => onSeg(p, walls[i]))) parent[find(i)] = find(j);
    }
  }
  const map = new Map();
  walls.forEach((w, i) => {
    const r = find(i);
    if (!map.has(r)) map.set(r, []);
    map.get(r).push(w);
  });
  return [...map.values()];
}

/** Объекты участка: в доме, на крыльце, за участком, друг в друге. */
function checkSite(project, ground, geomsOf, push) {
  const items = project.items.filter((it) => it.levelId === SITE_LEVEL);
  if (!items.length) return;
  const shapes = new Map(items.map((it) => [it.id, itemShape(it)]));
  checkItemPairs(items, shapes, SITE_LEVEL, push);
  if (!ground) return;
  const groundWalls = project.walls.filter((w) => w.levelId === ground.id);
  const fps = groundWalls.length ? levelFootprints(groundWalls) : [];
  // подвал шире дома тоже считается
  for (const l of project.levels) if (isBasement(l)) fps.push(...levelFootprints(project.walls.filter((w) => w.levelId === l.id)));
  const geoms = geomsOf(ground.id);
  const base = levelElevation(project, ground.id);
  // крыльцо у каждой двери — один выпуклый блок ступеней
  const byDoor = new Map();
  for (const st of porchSteps(project, ground.id, geoms, base)) {
    if (!byDoor.has(st.openingId)) {
      const [a0, , , b0] = st.poly;
      const L = dist(a0, b0) || 1;
      byDoor.set(st.openingId, { pts: [], n: { x: (b0.x - a0.x) / L, y: (b0.y - a0.y) / L } });
    }
    byDoor.get(st.openingId).pts.push(...st.poly);
  }
  const porches = [...byDoor.values()].map((d) => ({ poly: ccw(hull(d.pts)), n: d.n }));
  const boundary = project.site?.boundary;
  for (const it of items) {
    if (SOFT.has(it.type)) continue;
    const sh = shapes.get(it.id);
    const probe = sh.container ? [ccw(sh.outline)] : sh.parts.map(ccw);
    let inHouse = null;
    for (const fp of fps) {
      for (const part of probe) {
        const cut = clipByConvex(fp, part);
        const a = cut.length >= 3 ? polygonArea(cut) : 0;
        if (a > 0.02 && (!inHouse || a > inHouse.a)) inHouse = { a, cut };
      }
    }
    if (inHouse) {
      const fully = inHouse.a > polygonArea(probe[0]) * 0.95;
      push({
        id: `sh:${it.id}`,
        level: 'error',
        title: fully ? `${itemName(it)} стоит внутри дома` : `${itemName(it)} заходит в дом`,
        text: fully ? 'Объект участка оказался под домом — перенесите его наружу.' : `Пересекает стены дома (${inHouse.a.toFixed(1).replace('.', ',')} м²).`,
        levelId: SITE_LEVEL,
        refs: [{ kind: 'item', id: it.id }],
        at: centroidOf(inHouse.cut),
        area: inHouse.cut,
      });
      continue;
    }
    for (const po of porches) {
      const pr = deepest(sh.parts, [po.poly]);
      if (!pr || pr.depth <= TOL) continue;
      // отодвигаем от дома — по направлению крыльца
      const proj = (poly) => poly.map((q) => q.x * po.n.x + q.y * po.n.y);
      const k = Math.max(...proj(po.poly)) - Math.min(...proj(sh.outline)) + 0.1;
      push({
        id: `sp:${it.id}`,
        level: 'error',
        title: `${itemName(it)} стоит на крыльце`,
        text: 'Ступени у входа загорожены.',
        levelId: SITE_LEVEL,
        refs: [{ kind: 'item', id: it.id }],
        at: { x: it.x, y: it.y },
        area: sh.outline,
        fix: { label: 'Отодвинуть', kind: 'move', itemId: it.id, dx: po.n.x * k, dy: po.n.y * k },
      });
    }
    if (boundary?.length >= 3 && !pointInPolygon({ x: it.x, y: it.y }, boundary)) {
      push({
        id: `so:${it.id}`,
        level: 'warn',
        title: `${itemName(it)} за пределами участка`,
        text: 'Объект стоит за границей участка (за забором).',
        levelId: SITE_LEVEL,
        refs: [{ kind: 'item', id: it.id }],
        at: { x: it.x, y: it.y },
        area: sh.outline,
      });
    }
  }
}

/** Приямки входов в подвал: не под домом, не под крыльцом, без вещей внутри. */
function checkCellarEntries(project, ground, push) {
  const entries = cellarEntries(project);
  if (!entries.length) return;
  const groundWalls = ground ? project.walls.filter((w) => w.levelId === ground.id) : [];
  const fps = groundWalls.length && ground && !isBasement(ground) ? levelFootprints(groundWalls) : [];
  const gGeoms = ground ? computeWallGeometry(groundWalls) : new Map();
  const base = ground ? levelElevation(project, ground.id) : 0;
  const porch = ground ? porchSteps(project, ground.id, gGeoms, base).map((st) => ccw(st.poly)) : [];
  const items = project.items.filter((it) => it.levelId === SITE_LEVEL && !SOFT.has(it.type));
  const geomsByLevel = new Map();
  for (const e of entries) {
    const pit = ccw(e.pit);
    const zone = ccw(hull([...e.pit, ...e.walls.flatMap((w) => w.poly)]));
    // приямок не должен выходить за угол дома: стенка приямка повисает в воздухе
    if (!geomsByLevel.has(e.levelId)) geomsByLevel.set(e.levelId, computeWallGeometry(project.walls.filter((w) => w.levelId === e.levelId)));
    const op = project.openings.find((o) => o.id === e.openingId);
    const g = op && geomsByLevel.get(e.levelId).get(op.wallId);
    if (g) {
      const ss = [...e.pit, ...e.walls.flatMap((w) => w.poly)].map((p) => (p.x - g.a.x) * g.d.x + (p.y - g.a.y) * g.d.y);
      const over = Math.max(-g.half - Math.min(...ss), Math.max(...ss) - (g.len + g.half));
      if (over > 0.03) {
        push({
          id: `pc:${e.openingId}`,
          level: 'warn',
          title: 'Приямок подвала выходит за угол дома',
          text: `Спуск длиннее стены на ${Math.round(over * 100)} см. Сдвиньте дверь подвала от угла или поверните спуск в другую сторону (свойство «Спуск»).`,
          levelId: SITE_LEVEL,
          refs: [{ kind: 'opening', id: e.openingId }],
          at: centroidOf(pit),
          area: pit,
        });
      }
    }
    for (const fp of fps) {
      const cut = clipByConvex(fp, pit);
      if (cut.length >= 3 && polygonArea(cut) > 0.05) {
        push({
          id: `ph:${e.openingId}`,
          level: 'error',
          title: 'Приямок входа в подвал — под домом',
          text: 'Первый этаж нависает над спуском в подвал. Перенесите дверь подвала или выберите спуск вдоль стены.',
          levelId: SITE_LEVEL,
          refs: [{ kind: 'opening', id: e.openingId }],
          at: centroidOf(cut),
          area: cut,
        });
        break;
      }
    }
    const pr = deepest([zone], porch);
    if (pr && pr.depth > TOL) {
      push({
        id: `pp:${e.openingId}`,
        level: 'error',
        title: 'Крыльцо и спуск в подвал накладываются',
        text: 'Ступени крыльца входной двери попадают в приямок подвала — разнесите двери.',
        levelId: SITE_LEVEL,
        refs: [{ kind: 'opening', id: e.openingId }],
        at: centroidOf(pit),
        area: pit,
      });
    }
    for (const it of items) {
      const sh = itemShape(it);
      const r = deepest(sh.parts.map(ccw), [zone]);
      if (r && r.depth > TOL) {
        push({
          id: `pi:${e.openingId}:${it.id}`,
          level: 'error',
          title: `${itemName(it)} стоит в приямке подвала`,
          text: 'Спуск к двери подвала загорожен.',
          levelId: SITE_LEVEL,
          refs: [{ kind: 'item', id: it.id }],
          at: { x: it.x, y: it.y },
          area: sh.outline,
          fix: { label: 'Отодвинуть', kind: 'move', itemId: it.id, dx: r.axis.x * (r.depth + 0.1), dy: r.axis.y * (r.depth + 0.1) },
        });
      }
    }
    for (const other of entries) {
      if (other === e || other.openingId < e.openingId) continue;
      const r = deepest([pit], [ccw(other.pit)]);
      if (r && r.depth > TOL) {
        push({
          id: `pq:${e.openingId}:${other.openingId}`,
          level: 'error',
          title: 'Два спуска в подвал накладываются',
          text: 'Приямки соседних дверей заходят друг в друга.',
          levelId: SITE_LEVEL,
          refs: [
            { kind: 'opening', id: e.openingId },
            { kind: 'opening', id: other.openingId },
          ],
          at: centroidOf(pit),
          area: pit,
        });
      }
    }
  }
}

// ── Удобство планировки ──────────────────────────────────────────────────

/** Мансардное окно должно лежать в скате крыши своего этажа. */
function checkRoofWindows(project, lid, push) {
  for (const it of project.items) {
    if (it.levelId !== lid || !catalogItem(it.type)?.roofMount) continue;
    if (roofSurfaceAt(project, lid, it)) continue;
    push({
      id: `roofwin:${it.id}`,
      level: 'warn',
      title: 'Мансардное окно не на крыше',
      text: 'Над этим местом нет ската крыши этого этажа. Передвиньте окно на скат или поставьте крышу.',
      levelId: lid,
      refs: [{ kind: 'item', id: it.id }],
      at: { x: it.x, y: it.y },
    });
  }
}

/** Мансардные окна над комнатой (в скате над её полом). */
function roofWindowsOver(project, room) {
  return project.items.filter((it) => it.levelId === room.levelId && catalogItem(it.type)?.roofMount && pointInPolygon(it, room.points));
}

const LIVING = /гостин|спальн|детск|кабинет|зал\b|^зал|кухн|столов/i;
const BEDROOM = /спальн|детск/i;
const CORRIDOR = /коридор|холл|прихож/i;
const SERVICE = /санузел|ванн|туалет|душ|гардероб|кладов|постир|прачеч/i;

function checkComfort(project, level, geoms, rooms, stairs, lid, push) {
  const lvl = level;
  // лестницы: высота и глубина ступени, ширина марша
  for (const st of stairs) {
    const s = st.s;
    const lay = stairLayout(s, levelWallHeight(lvl));
    const h = lay.riser;
    if (s.shape === 'spiral') {
      if (s.width < 1.4) {
        push({ id: `cs:${s.id}:w`, level: 'warn', title: 'Тесная винтовая лестница', text: `Диаметр ${cm(s.width)} — удобнее от 1,4–1,6 м, иначе мебель не поднять.`, levelId: lid, refs: [{ kind: 'stair', id: s.id }], at: { x: s.x, y: s.y }, area: st.outline });
      }
      continue;
    }
    const run = lay.steps.filter((x) => !x.landing);
    const depth = treadDepth(run);
    const rule = 2 * h + depth;
    const flight = s.shape === 'straight' ? s.width : Math.min(s.flight || 1, s.width);
    const probs = [];
    if (h > 0.19) probs.push(`ступени высокие — ${cm(h)} (удобно 15–18 см)`);
    if (depth < 0.25) probs.push(`проступь узкая — ${cm(depth)} (удобно от 25–28 см)`);
    if (rule < 0.58 || rule > 0.67) probs.push(`шаг 2h+b = ${cm(rule)} (удобно 60–64 см)`);
    if (flight < 0.8) probs.push(`марш узкий — ${cm(flight)} (удобно от 90 см)`);
    if (probs.length) {
      push({
        id: `cs:${s.id}`,
        level: 'warn',
        title: 'Неудобная лестница',
        text: `${probs.join('; ')}. Удлините марш или поменяйте форму лестницы.`.replace(/^./, (c) => c.toUpperCase()),
        levelId: lid,
        refs: [{ kind: 'stair', id: s.id }],
        at: { x: s.x, y: s.y },
        area: st.outline,
      });
    }
    // проём в перекрытии вырезается, только если лестница целиком внутри одной комнаты этажа выше
    const above = levelAbove(project, lid);
    if (above) {
      const upRooms = project.rooms.filter((r) => r.levelId === above.id);
      const over = upRooms.filter((r) => st.outline.some((p) => pointInPolygon(p, r.points)) || r.points.some((p) => pointInPolygon(p, st.outline)));
      const cut = upRooms.some((r) => st.outline.every((p) => pointInPolygon(p, r.points)));
      if (over.length && !cut) {
        push({
          id: `ch:${s.id}`,
          level: 'warn',
          title: 'Над лестницей нет проёма',
          text: `Лестница попадает под стену или на стык комнат этажа «${above.name}» — проём в перекрытии не вырезается, головой упрётесь в потолок. Подвиньте лестницу целиком в одну комнату.`,
          levelId: lid,
          refs: [{ kind: 'stair', id: s.id }],
          at: { x: s.x, y: s.y },
          area: st.outline,
        });
      }
    }
  }

  // комнаты: окна в жилых, ширина коридоров, проходные спальни
  const allGeoms = [...geoms.values()];
  const doorsOf = (room) => {
    const out = [];
    for (const g of allGeoms) {
      for (const o of project.openings) {
        if (o.wallId !== g.wall.id || o.kind === 'window' || o.sill > 0.05) continue;
        const c = pointOnWall(g, o.t);
        const sides = [1, -1].map((sd) => {
          const q = { x: c.x + g.n.x * sd * (g.half + 0.3), y: c.y + g.n.y * sd * (g.half + 0.3) };
          return rooms.find((r) => pointInPolygon(q, r.points)) || null;
        });
        const i = sides.indexOf(room);
        if (i >= 0) out.push({ o, other: sides[1 - i] });
      }
    }
    return out;
  };
  for (const r of rooms) {
    const name = r.name || '';
    if (LIVING.test(name) && !isBasementLevel(lvl) && !roomWindowDirections(project, r).length && !roofWindowsOver(project, r).length) {
      push({ id: `cw:${r.id}`, level: 'warn', title: `${name}: нет окна`, text: 'В жилой комнате нужно окно — для света и проветривания.', levelId: lid, refs: [{ kind: 'room', id: r.id }], at: polygonLabelPoint(r.points), area: r.points });
    }
    if (CORRIDOR.test(name)) {
      const w = narrowest(r.points) - 0.15;
      if (w < 0.9) {
        push({ id: `cc:${r.id}`, level: 'warn', title: `${name}: узко`, text: `Самое узкое место ≈ ${cm(w)} — удобно от 0,9–1,2 м, чтобы разойтись и пронести мебель.`, levelId: lid, refs: [{ kind: 'room', id: r.id }], at: polygonLabelPoint(r.points), area: r.points });
      }
    }
    if (BEDROOM.test(name)) {
      const passes = doorsOf(r).filter((d) => d.other && !SERVICE.test(d.other.name || ''));
      if (passes.length >= 2) {
        push({
          id: `cp:${r.id}`,
          level: 'warn',
          title: `${name}: проходная`,
          text: `В неё ведут двери из «${passes.map((d) => d.other.name).join('», «')}» — через спальню будут ходить. Оставьте один вход.`,
          levelId: lid,
          refs: [{ kind: 'room', id: r.id }],
          at: polygonLabelPoint(r.points),
          area: r.points,
        });
      }
    }
  }
}

const isBasementLevel = (l) => isBasement(l);

function treadDepth(run) {
  if (run.length < 2) return 0.3;
  const c = (p) => p.reduce((a, q) => ({ x: a.x + q.x / p.length, y: a.y + q.y / p.length }), { x: 0, y: 0 });
  let sum = 0;
  let n = 0;
  for (let i = 1; i < run.length; i++) {
    const d = dist(c(run[i - 1].poly), c(run[i].poly));
    if (d < 0.6) {
      sum += d;
      n++;
    }
  }
  return n ? sum / n : 0.3;
}

/** Самое узкое место многоугольника: от середины каждого ребра — луч внутрь до границы. */
function narrowest(poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const L = dist(a, b);
    if (L < 0.3) continue;
    let n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (!pointInPolygon({ x: m.x + n.x * 0.02, y: m.y + n.y * 0.02 }, poly)) n = { x: -n.x, y: -n.y };
    let t = Infinity;
    for (let j = 0; j < poly.length; j++) {
      if (j === i) continue;
      const r = segmentIntersect(m, { x: m.x + n.x * 100, y: m.y + n.y * 100 }, poly[j], poly[(j + 1) % poly.length]);
      if (r && r.t * 100 > 0.01) t = Math.min(t, r.t * 100);
    }
    best = Math.min(best, t);
  }
  return best;
}

/** Отступ дома от границ участка (site.setback, по умолчанию 3 м). */
function checkSetback(project, ground, push) {
  const b = project.site?.boundary;
  if (!ground || !b || b.length < 3) return;
  const need = Number.isFinite(project.site.setback) ? project.site.setback : 3;
  const fps = levelFootprints(project.walls.filter((w) => w.levelId === ground.id));
  let worst = null;
  for (const fp of fps) {
    for (const p of fp) {
      const inside = pointInPolygon(p, b);
      let d = Infinity;
      let q = null;
      for (let i = 0; i < b.length; i++) {
        const pr = projectOnSegment(p, b[i], b[(i + 1) % b.length]);
        if (pr.dist < d) {
          d = pr.dist;
          q = pr.point;
        }
      }
      if (!inside) d = -d;
      if (!worst || d < worst.d) worst = { d, p, q };
    }
  }
  if (!worst) return;
  if (worst.d < 0) {
    push({ id: 'sb:out', level: 'error', title: 'Дом выходит за границу участка', text: 'Угол дома за забором — подвиньте дом или границу участка.', levelId: SITE_LEVEL, refs: [], at: worst.p, area: circlePolygon(worst.p.x, worst.p.y, 0.6, 12) });
  } else if (need > 0 && worst.d < need - 0.05) {
    push({
      id: 'sb:near',
      level: 'warn',
      title: `Дом ближе ${String(need).replace('.', ',')} м к границе участка`,
      text: `Сейчас ${worst.d.toFixed(2).replace('.', ',')} м. Нужный отступ задаётся в свойствах участка — уточните требования для своего участка.`,
      levelId: SITE_LEVEL,
      refs: [],
      at: worst.p,
      area: [worst.p, worst.q, { x: worst.q.x + 0.05, y: worst.q.y + 0.05 }, { x: worst.p.x + 0.05, y: worst.p.y + 0.05 }],
    });
  }
}

const cm = (m) => `${Math.max(1, Math.round(m * 100))} см`;

// ── Исправления ──────────────────────────────────────────────────────────

/** Можно ли исправить автоматически (без участия человека). */
export const canAutoFix = (iss) => !!iss.fix && ['move', 'toSite', 'deleteWall'].includes(iss.fix.kind);

/**
 * Применить исправление к проекту (внутри store.commit).
 * @returns {boolean} что-то поменялось
 */
export function applyFix(project, fix) {
  if (!fix) return false;
  if (fix.kind === 'move') {
    const it = project.items.find((x) => x.id === fix.itemId);
    if (!it) return false;
    it.x = round(it.x + fix.dx);
    it.y = round(it.y + fix.dy);
    return true;
  }
  if (fix.kind === 'toSite') {
    const it = project.items.find((x) => x.id === fix.itemId);
    if (!it) return false;
    it.levelId = SITE_LEVEL;
    it.elevation = 0;
    return true;
  }
  if (fix.kind === 'deleteWall') {
    const before = project.walls.length;
    project.walls = project.walls.filter((w) => w.id !== fix.wallId);
    project.openings = project.openings.filter((o) => o.wallId !== fix.wallId);
    return project.walls.length !== before;
  }
  return false;
}

const round = (v) => Math.round(v * 1000) / 1000;

/** Короткая сводка: «2 ошибки, 1 предупреждение». */
export function summarizeIssues(issues) {
  const e = issues.filter((i) => i.level === 'error').length;
  const w = issues.length - e;
  if (!issues.length) return 'ошибок нет';
  const parts = [];
  if (e) parts.push(`${e} ${plural(e, 'ошибка', 'ошибки', 'ошибок')}`);
  if (w) parts.push(`${w} ${plural(w, 'предупреждение', 'предупреждения', 'предупреждений')}`);
  return parts.join(', ');
}

export function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
