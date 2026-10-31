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
import { rectCorners, circlePolygon, pointInPolygon, polygonArea, polygonSignedArea, clipPolygonHalfPlane, bboxOf, dist, add, mul, segmentIntersect } from '../core/geometry.js';
import { catalogItem } from './catalog.js';
import { SITE_LEVEL, groundLevel, getLevel, levelElevation, levelWallHeight, levelBelow, wallHeight, isBasement } from './project.js';

const OPENING_LABEL = { door: 'Дверь', window: 'Окно', arch: 'Проём', opening: 'Проём' };

const TOL = 0.03; // допуск: на 3 см можно «касаться» — так ставят мебель вплотную
const TRUNK = new Set(['tree', 'conifer', 'fruit_tree']);
const POSTS = new Set(['gazebo', 'greenhouse', 'playground']);
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
        return { s, steps: lay.steps.map((st) => ccw(st.poly)), outline: lay.outline };
      });

  for (const level of project.levels) {
    const lid = level.id;
    const geoms = geomsOf(lid);
    const items = project.items.filter((it) => it.levelId === lid);
    const rooms = project.rooms.filter((r) => r.levelId === lid);
    const stairs = stairsOf(lid);
    const below = levelBelow(project, lid);
    const holes = below ? stairsOf(below.id) : [];
    const shapes = new Map(items.map((it) => [it.id, itemShape(it)]));

    checkItemPairs(items, shapes, lid, push);
    checkItemsWalls(project, items, shapes, geoms, openingsByWall, lid, push);
    checkItemsStairs(items, shapes, stairs, holes, lid, push);
    checkStairs(stairs, geoms, openingsByWall, project, lid, push);
    checkDoors(project, level, geoms, rooms, items, shapes, stairs, lid, push, ground);
    checkOpenings(project, geoms, openingsByWall, lid, push);
    checkWallsDuplicate(geoms, lid, push);
    checkWallCrossings(geoms, lid, push);
    checkBuildings(project, lid, push);

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

  const rank = { error: 0, warn: 1 };
  return issues.sort((a, b) => rank[a.level] - rank[b.level]);
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
      const r = deepest(sh.parts, st.steps);
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

/** Лестницы в стенах и друг в друге. */
function checkStairs(stairs, geoms, openingsByWall, project, lid, push) {
  for (const st of stairs) {
    for (const g of geoms.values()) {
      const pieces = wallPieces3D(g, openingsByWall.get(g.wall.id) || [], wallHeight(project, g.wall)).filter((p) => p.y0 < 0.3);
      const r = deepest(
        st.steps,
        pieces.map((p) => ccw(hull(p.poly))),
      );
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
      if (o.wallId !== g.wall.id || o.kind === 'window' || o.sill > 0.05 || o.style === 'garage') continue; // за воротами гаража стоит машина — так и задумано
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
          if (SOFT.has(it.type) || it.type === 'plant') continue;
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
            const r = deepest(st.steps, [zone]);
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
