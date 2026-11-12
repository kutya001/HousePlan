/**
 * Область задания для ИИ: «работай только с этим этажом / комнатой / выделенным».
 *
 * Область — это списки id элементов JSON «houseplan-ai», которые разрешено менять.
 * Помощнику она сообщается в запросе, а программа проверяет результат: правка,
 * затронувшая что-то вне области, не применяется и возвращается Claude на исправление.
 *
 * Правила:
 *  — этаж целиком: внутри него можно всё, остальные этажи и участок — без изменений;
 *  — комната: она сама, её стены и проёмы в них, мебель и лестницы внутри;
 *    новое — только внутри комнаты;
 *  — выделенные объекты: только они (у стены — и её проёмы; новый проём — только в неё).
 * Модуль без DOM.
 */
import { pointInPolygon, distToPolygonEdges } from '../core/geometry.js';
import { SITE_LEVEL, getEntity, getLevel, levelIndex } from '../model/project.js';
import { catalogItem } from '../model/catalog.js';

const LISTS = ['walls', 'openings', 'rooms', 'stairs', 'furniture', 'roofs'];
const SITE_LISTS = ['outdoor', 'zones'];
const NAMES = { walls: 'стены', openings: 'проёмы', rooms: 'комнаты', stairs: 'лестницы', furniture: 'мебель', roofs: 'крыши', outdoor: 'объекты участка', zones: 'зоны' };
const KIND_WORD = { wall: ['стена', 'стены', 'стен'], opening: ['проём', 'проёма', 'проёмов'], room: ['комната', 'комнаты', 'комнат'], item: ['предмет', 'предмета', 'предметов'], stair: ['лестница', 'лестницы', 'лестниц'], roof: ['крыша', 'крыши', 'крыш'], zone: ['зона участка', 'зоны участка', 'зон участка'] };
const OPENING_WORD = { door: 'дверь', window: 'окно', arch: 'проём' };

const plural = (n, [one, few, many]) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);
const emptyPart = () => ({ walls: new Set(), openings: new Set(), rooms: new Set(), stairs: new Set(), furniture: new Set(), roofs: new Set(), outdoor: new Set(), zones: new Set(), polys: [] });

/** Выделенное, которое ещё есть в проекте (участок целиком — отдельный случай). */
const liveSelection = (project, target) => (target?.selection || []).filter((s) => s.kind !== 'site' && getEntity(project, s.kind, s.id));
const wholeSite = (target) => target?.levelId === SITE_LEVEL || (target?.selection || []).some((s) => s.kind === 'site');

/**
 * Название области для человека: «этаж «2 этаж»», «комната «Кухня»», «выделенное: 3 стены, 2 предмета».
 * @returns {string|null} null — такой области в проекте нет (этаж удалён, объекты стёрты)
 */
export function describeTarget(project, target) {
  const sel = liveSelection(project, target);
  if (!sel.length) {
    if (wholeSite(target)) return 'участок';
    const lvl = target?.levelId ? getLevel(project, target.levelId) : null;
    return lvl ? `этаж «${lvl.name}»` : null;
  }
  const counts = {};
  for (const s of sel) counts[s.kind] = (counts[s.kind] || 0) + 1;
  const kinds = Object.keys(counts);
  if (kinds.length === 1 && kinds[0] === 'room') {
    const names = sel.map((s) => `«${getEntity(project, 'room', s.id).name}»`);
    return names.length === 1 ? `комната ${names[0]}` : `комнаты ${names.join(', ')}`;
  }
  if (sel.length === 1) {
    const e = getEntity(project, sel[0].kind, sel[0].id);
    if (sel[0].kind === 'item') return `предмет «${catalogItem(e.type)?.name || e.name || e.type}»`;
    if (sel[0].kind === 'opening') return OPENING_WORD[e.kind] || 'проём';
    return KIND_WORD[sel[0].kind]?.[0] || 'объект';
  }
  return `выделенное: ${kinds.map((k) => `${counts[k]} ${plural(counts[k], KIND_WORD[k] || [k, k, k])}`).join(', ')}`;
}

/**
 * @param target { levelId } — этаж целиком (SITE_LEVEL — участок), или { selection: [{ kind, id }] } — выделенное
 * @param idMap — из toExchange(project, { ids: true, idMap }): id объекта → { id, level }
 * @returns {{ label, parts: { [этаж | 'site']: null | part }, source } | null} null — области нет.
 *          parts[этаж] = null — этаж целиком; source — с чего область началась (для retarget).
 */
export function buildScope(project, target, idMap) {
  const label = describeTarget(project, target);
  if (!label) return null;
  const parts = {};
  const part = (key) => (parts[key] === null ? null : (parts[key] ||= emptyPart()));
  const ex = (id) => idMap.get(id);
  const sel = liveSelection(project, target);

  if (!sel.length) {
    const key = wholeSite(target) ? 'site' : levelIndex(project, target.levelId);
    parts[key] = null;
    return { label, parts, source: { level: key } };
  }

  const refs = [];
  for (const s of sel) {
    const e = getEntity(project, s.kind, s.id);
    const ref = ex(s.id);
    if (!ref) continue;
    const p = part(ref.level);
    if (!p) continue;
    refs.push({ kind: s.kind, id: ref.id, level: ref.level });
    if (s.kind === 'room') {
      p.rooms.add(ref.id);
      p.polys.push(e.points);
      for (const w of project.walls.filter((x) => x.levelId === e.levelId)) {
        const near = (q) => distToPolygonEdges(q, e.points) < w.thickness / 2 + 0.15;
        const at = (t) => ({ x: w.x1 + (w.x2 - w.x1) * t, y: w.y1 + (w.y2 - w.y1) * t });
        // стена ограничивает комнату, если идёт вдоль её края хотя бы на части длины
        const along = [0.1, 0.3, 0.5, 0.7, 0.9].filter((t) => near(at(t))).length;
        if (along < 2 || !ex(w.id)) continue;
        p.walls.add(ex(w.id).id);
        const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
        for (const o of project.openings.filter((x) => x.wallId === w.id)) if (near(at(o.t / L)) && ex(o.id)) p.openings.add(ex(o.id).id);
      }
      for (const it of project.items) if (it.levelId === e.levelId && pointInPolygon(it, e.points) && ex(it.id)) p.furniture.add(ex(it.id).id);
      for (const st of project.stairs) if (st.levelId === e.levelId && pointInPolygon(st, e.points) && ex(st.id)) p.stairs.add(ex(st.id).id);
    } else if (s.kind === 'wall') {
      p.walls.add(ref.id);
      for (const o of project.openings.filter((x) => x.wallId === e.id)) if (ex(o.id)) p.openings.add(ex(o.id).id);
    } else if (s.kind === 'opening') p.openings.add(ref.id);
    else if (s.kind === 'item') (e.levelId === SITE_LEVEL ? p.outdoor : p.furniture).add(ref.id);
    else if (s.kind === 'stair') p.stairs.add(ref.id);
    else if (s.kind === 'roof') p.roofs.add(ref.id);
    else if (s.kind === 'zone') p.zones.add(ref.id);
  }
  if (!refs.length) return null;
  return { label, parts, source: { refs } };
}

/**
 * Та же область в новом проекте (после применения шага id объектов другие) — чтобы
 * следующий запрос пользователя шёл по ней же, а выделение на плане не терялось.
 * @param idMap — из toExchange(project, { ids: true, keep, idMap }) нового проекта
 * @returns {{ levelId } | { selection } | null}
 */
export function retarget(scope, project, idMap) {
  const src = scope.source;
  if (src.level !== undefined) {
    if (src.level === 'site') return { levelId: SITE_LEVEL };
    const lvl = project.levels[src.level];
    return lvl ? { levelId: lvl.id } : null;
  }
  const inv = new Map();
  for (const [modelId, ref] of idMap) {
    const key = `${ref.level}|${ref.id}`;
    if (!inv.has(key)) inv.set(key, []);
    inv.get(key).push(modelId);
  }
  const selection = [];
  for (const r of src.refs) {
    const id = (inv.get(`${r.level}|${r.id}`) || []).find((m) => getEntity(project, r.kind, m));
    if (id) selection.push({ kind: r.kind, id });
  }
  return selection.length ? { selection } : null;
}

/** Описание области для запроса к Claude. */
export function scopeText(scope, exchange) {
  const lines = [];
  for (const [key, p] of Object.entries(scope.parts)) {
    const where = key === 'site' ? 'участок' : `levels/${key} «${exchange.levels[key]?.name ?? ''}»`;
    if (p === null) {
      lines.push(key === 'site' ? '- участок целиком: границу (site), забор, объекты участка (outdoor) и покрытия (zones) можно менять, добавлять и удалять' : `- ${where}: этаж целиком — внутри него можно менять, добавлять и удалять что угодно (кроме вида этажа kind)`);
      continue;
    }
    const bits = [...LISTS, ...SITE_LISTS].filter((c) => p[c].size).map((c) => `${NAMES[c]} ${[...p[c]].join(', ')}`);
    lines.push(`- ${where}: ${bits.join('; ')}${p.polys.length ? ' — новые стены, мебель и лестницы добавляй только внутри этих комнат' : ' — новое добавлять нельзя, кроме проёмов в перечисленных стенах'}`);
  }
  return `ОБЛАСТЬ ЗАДАНИЯ: ${scope.label}. Пользователь просит работать ТОЛЬКО с ней.
${lines.join('\n')}
Всё остальное в проекте должно остаться без изменений: правки вне области программа отклонит. Инструмент build_project в этом режиме недоступен — только edit_project. Если задачу нельзя выполнить, не выходя за область, — объясни это текстом и предложи, какую область выбрать.`;
}

/**
 * JSON для запроса: от этажей вне области остаются стены и лестницы (чтобы было видно,
 * что над и под областью), остальное скрыто — экономия токенов; менять их всё равно нельзя.
 * Номера этажей в списке сохраняются — пути правок остаются верными.
 */
export function trimToScope(exchange, scope) {
  return {
    ...exchange,
    levels: exchange.levels.map((l, i) => {
      if (i in scope.parts) return l;
      const { openings, rooms, furniture, roofs, ...rest } = l;
      const hidden = [['проёмов', openings], ['комнат', rooms], ['мебели', furniture], ['крыш', roofs]].filter(([, list]) => list?.length).map(([n, list]) => `${n} ${list.length}`);
      return { ...rest, hidden: `этаж вне области задания — показаны только стены и лестницы${hidden.length ? ` (скрыто: ${hidden.join(', ')})` : ''}` };
    }),
  };
}

/**
 * После применённого шага: новые элементы, появившиеся в области, тоже входят в неё,
 * а границы комнат берутся из нового JSON (комнату могли подвинуть). Меняет scope.
 */
export function growScope(scope, before, after) {
  for (const [key, p] of Object.entries(scope.parts)) {
    if (p === null || key === 'site') continue;
    const was = before.levels?.[key];
    const now = after.levels?.[key];
    if (!was || !now) continue;
    for (const c of LISTS) {
      const old = new Set((was[c] || []).map((e) => String(e.id)));
      for (const e of now[c] || []) if (e.id != null && !old.has(String(e.id))) p[c].add(String(e.id));
    }
    if (p.polys.length) {
      const polys = (now.rooms || []).filter((r) => p.rooms.has(String(r.id)) && Array.isArray(r.points)).map((r) => r.points.map(pt));
      if (polys.length) p.polys = polys;
    }
  }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const byId = (list) => new Map((list || []).filter((e) => e && e.id != null).map((e) => [String(e.id), e]));
const pt = (v) => (Array.isArray(v) ? { x: Number(v[0]), y: Number(v[1]) } : v);

function inPolys(p, polys, pad = 0.35) {
  return polys.some((poly) => pointInPolygon(p, poly) || distToPolygonEdges(p, poly) < pad);
}

/** Проверка одного списка внутри частичной области. */
function checkList(c, before, after, p, where, bad) {
  const was = byId(before);
  const now = byId(after);
  const allowed = (id, e) => p[c].has(id) || (c === 'openings' && p.walls.has(String(e.wall)));
  for (const [id, e] of was) {
    if (allowed(id, e)) continue;
    const n = now.get(id);
    if (!n) bad.push(`${where}: удалён ${id} (${NAMES[c]}) — он вне области`);
    else if (c === 'rooms') {
      // контур соседней комнаты может сдвинуться вместе со стеной из области; остальное — нет
      const { points: _a, ...ra } = e;
      const { points: _b, ...rb } = n;
      if (!same(ra, rb)) bad.push(`${where}: изменена комната ${id} — она вне области`);
    } else if (!same(e, n)) bad.push(`${where}: изменён ${id} (${NAMES[c]}) — он вне области`);
  }
  // новое: без id, с id, которого не было, или копия с уже занятым id
  const seen = new Set();
  for (const e of after || []) {
    if (!e) continue;
    const known = e.id != null && was.has(String(e.id)) && !seen.has(String(e.id));
    if (e.id != null) seen.add(String(e.id));
    if (known) continue;
    const tag = e.id != null ? ` ${e.id}` : '';
    if (c === 'openings') {
      if (!p.walls.has(String(e.wall))) bad.push(`${where}: новый проём${tag} в стене ${e.wall} — стена вне области`);
    } else if (c === 'furniture' || c === 'stairs') {
      if (!p.polys.length || !inPolys({ x: Number(e.x), y: Number(e.y) }, p.polys)) bad.push(`${where}: новый объект${tag} (${NAMES[c]}) стоит вне области`);
    } else if (c === 'walls') {
      const a = pt(e.from);
      const b = pt(e.to);
      if (!p.polys.length || !a || !b || !inPolys({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, p.polys)) bad.push(`${where}: новая стена${tag} — вне области`);
    } else if (c === 'rooms') {
      if (!p.polys.length) bad.push(`${where}: новая комната${tag} — вне области`);
    } else bad.push(`${where}: новый элемент${tag} (${NAMES[c]}) — вне области`);
  }
}

/**
 * Не вышла ли правка за область.
 * @param before, after — JSON «houseplan-ai» до и после правок
 * @throws Error — с перечнем нарушений (до пяти)
 */
export function checkScope(before, after, scope) {
  const bad = [];
  const { levels: lb, site: sb, outdoor: ob, zones: zb, ...topB } = before;
  const { levels: la, site: sa, outdoor: oa, zones: za, ...topA } = after;
  if (!same(topB, topA)) bad.push('изменены общие свойства проекта (название, цоколь, фасад) — они вне области');
  if ((la || []).length !== (lb || []).length) bad.push('нельзя добавлять и удалять этажи, работая в области');
  (lb || []).forEach((l, i) => {
    const n = la?.[i];
    if (!n) return;
    const where = `levels/${i} «${l.name}»`;
    const p = scope.parts[i];
    if (p === null) {
      // вид этажа (подвал, мансарда) меняет порядок этажей — в области нельзя
      if ((l.kind || 'floor') !== (n.kind || 'floor')) bad.push(`${where}: нельзя менять вид этажа (kind), работая в области`);
      return;
    }
    if (p === undefined) {
      if (!same(l, n)) bad.push(`${where}: этаж вне области, а его изменили`);
      return;
    }
    const { walls: _1, openings: _2, rooms: _3, stairs: _4, furniture: _5, roofs: _6, ...restB } = l;
    const { walls: _7, openings: _8, rooms: _9, stairs: _10, furniture: _11, roofs: _12, ...restA } = n;
    if (!same(restB, restA)) bad.push(`${where}: изменены свойства этажа (высота, название) — они вне области`);
    for (const c of LISTS) checkList(c, l[c], n[c], p, where, bad);
  });
  const sp = scope.parts.site;
  if (sp !== null) {
    if (!same(sb, sa)) bad.push('изменены границы участка или забор — они вне области');
    const site = sp || emptyPart();
    for (const c of SITE_LISTS) {
      const was = byId(c === 'outdoor' ? ob : zb);
      const now = byId(c === 'outdoor' ? oa : za);
      for (const [id, e] of was) if (!site[c].has(id) && !same(e, now.get(id))) bad.push(`участок: изменён или удалён ${id} (${NAMES[c]}) — он вне области`);
      for (const e of (c === 'outdoor' ? oa : za) || []) if (e && (e.id == null || !was.has(String(e.id)))) bad.push(`участок: новый элемент (${NAMES[c]}) — ${sp ? 'в области только выбранные объекты участка' : 'участок вне области'}`);
    }
  }
  if (bad.length) {
    const more = bad.length > 5 ? ` …и ещё ${bad.length - 5}` : '';
    throw new Error(`правка выходит за область задания (${scope.label}): ${bad.slice(0, 5).join('; ')}${more}`);
  }
}
