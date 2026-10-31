/**
 * Обмен проектом с внешним миром и с ИИ.
 *
 * Два формата на входе:
 *  - «родной» проект HousePlan (как в файле *.houseplan.json);
 *  - упрощённый формат «houseplan-ai» — удобный для нейросетей: этажи содержат
 *    свои стены, проёмы привязаны к стене по id и расстоянию от её начала.
 * Текст может прийти прямо из чата: JSON ищется в блоке ```json, лишние
 * запятые и комментарии убираются, мелкие неточности геометрии чинятся.
 */
import { createEmptyProject, createLevel, normalizeProject, SITE_LEVEL, getLevel } from '../model/project.js';
import { createWall, createOpening, createRoom, createStair, createItem, createRoof, createZone } from '../model/factories.js';
import { CATALOG, catalogItem } from '../model/catalog.js';
import { DEFAULTS, FLOOR_MATERIALS, ZONE_MATERIALS, ROOF_TYPES, STAIR_SHAPES, OPENING_STYLES } from '../model/defaults.js';
import { findFaces } from '../geometry/roomDetect.js';
import { computeWallGeometry, canPlaceOpening } from '../geometry/wallGeometry.js';
import { projectOnSegment, dist } from '../core/geometry.js';

export const AI_FORMAT = 'houseplan-ai';

const r3 = (v) => Math.round(v * 1000) / 1000;
const pt = (p) => [r3(p.x), r3(p.y)];

// ── Экспорт ──────────────────────────────────────────────────────────────

/** Проект → формат «houseplan-ai» (его же понимает импорт). */
export function toExchange(project) {
  const out = {
    format: AI_FORMAT,
    version: 1,
    name: project.name,
    units: 'm',
    foundation: r3(project.foundation ?? DEFAULTS.foundation),
    site: {
      boundary: project.site.boundary.map(pt),
      fence: !!project.site.fence?.enabled,
      fenceHeight: r3(project.site.fence?.height ?? 1.8),
    },
    levels: [],
    outdoor: [],
    zones: project.zones.map((z) => ({ material: z.material, points: z.points.map(pt) })),
  };
  for (const level of project.levels) {
    const ids = new Map();
    const walls = project.walls.filter((w) => w.levelId === level.id);
    const lv = {
      name: level.name,
      kind: level.kind || 'floor',
      height: r3(level.height),
      slab: r3(level.slab),
      ...(level.kind === 'attic' ? { kneeWall: r3(level.kneeWall ?? 1.2) } : {}),
      walls: walls.map((w, i) => {
        const id = `w${i + 1}`;
        ids.set(w.id, id);
        return { id, from: [r3(w.x1), r3(w.y1)], to: [r3(w.x2), r3(w.y2)], type: w.kind, thickness: r3(w.thickness), ...(w.height ? { height: r3(w.height) } : {}) };
      }),
      openings: [],
      rooms: project.rooms.filter((r) => r.levelId === level.id).map((r) => ({ name: r.name, floor: r.floor, points: r.points.map(pt) })),
      stairs: project.stairs
        .filter((s) => s.levelId === level.id)
        .map((s) => ({ shape: s.shape, x: r3(s.x), y: r3(s.y), rotation: r3(s.rotation || 0), width: r3(s.width), length: r3(s.length), ...(s.shape === 'L' || s.shape === 'U' ? { flight: r3(s.flight) } : {}), ...(s.flip ? { flip: true } : {}) })),
      furniture: project.items.filter((it) => it.levelId === level.id).map(itemOut),
      roofs: project.roofs
        .filter((r) => r.levelId === level.id)
        .map((r) => ({ type: r.type, x: r3(r.x), y: r3(r.y), w: r3(r.w), d: r3(r.d), rotation: r3(r.rotation || 0), pitch: r3(r.pitch), overhang: r3(r.overhang) })),
    };
    for (const o of project.openings) {
      if (!ids.has(o.wallId)) continue;
      lv.openings.push({
        wall: ids.get(o.wallId),
        type: o.kind,
        style: o.style,
        offset: r3(o.t),
        width: r3(o.width),
        height: r3(o.height),
        ...(o.kind === 'window' ? { sill: r3(o.sill) } : {}),
        ...(o.flipSide ? { flipSide: true } : {}),
        ...(o.flipHinge ? { flipHinge: true } : {}),
      });
    }
    out.levels.push(lv);
  }
  out.outdoor = project.items.filter((it) => it.levelId === SITE_LEVEL).map(itemOut);
  return out;
}

function itemOut(it) {
  const c = catalogItem(it.type);
  const o = { type: it.type, x: r3(it.x), y: r3(it.y), rotation: r3(it.rotation || 0) };
  // размеры — только если отличаются от каталожных
  if (!c || Math.abs(c.w - it.w) > 1e-3) o.w = r3(it.w);
  if (!c || Math.abs(c.d - it.d) > 1e-3) o.d = r3(it.d);
  if (!c || Math.abs(c.h - it.h) > 1e-3) o.h = r3(it.h);
  if (it.elevation && Math.abs((c?.elevation ?? 0) - it.elevation) > 1e-3) o.elevation = r3(it.elevation);
  return o;
}

// ── Разбор текста ────────────────────────────────────────────────────────

/** Убрать комментарии, «умные» кавычки и висячие запятые — частые огрехи ответов ИИ. */
function cleanJson(src) {
  let s = src.replace(/[“”„«»]/g, '"').replace(/^﻿/, '');
  let out = '';
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      out += ch;
      if (ch === '\\') {
        out += s[++i] ?? '';
      } else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      out += ch;
    } else if (ch === '/' && s[i + 1] === '/') {
      while (i < s.length && s[i] !== '\n') i++;
      out += '\n';
    } else if (ch === '/' && s[i + 1] === '*') {
      i += 2;
      while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++;
      i++;
    } else out += ch;
  }
  return out.replace(/,\s*([}\]])/g, '$1');
}

/** Найти JSON в тексте (блок ```json или первая «{» … последняя «}»). */
export function extractJson(text) {
  const src = String(text || '').trim();
  if (!src) throw new Error('Вставьте текст проекта или ответ ИИ');
  if (!src.includes('{')) throw new Error('В тексте нет JSON проекта — попросите ИИ ответить блоком ```json');
  const blocks = [...src.matchAll(/```[a-zA-Z0-9]*\s*\n?([\s\S]*?)```/g)].map((m) => m[1]).sort((a, b) => b.length - a.length);
  const candidates = [...blocks, src];
  let lastErr = null;
  for (const c of candidates) {
    const a = c.indexOf('{');
    const b = c.lastIndexOf('}');
    for (const piece of [c, a >= 0 && b > a ? c.slice(a, b + 1) : null]) {
      if (!piece) continue;
      try {
        return JSON.parse(piece);
      } catch (e1) {
        try {
          return JSON.parse(cleanJson(piece));
        } catch (e2) {
          lastErr = e2;
        }
      }
    }
  }
  throw new Error(`Не удалось прочитать JSON: ${lastErr?.message || 'нет фигурных скобок'}`);
}

/**
 * Текст или объект → проект.
 * @returns {{ project, warnings: string[], format: 'native'|'ai' }}
 */
export function importProject(input) {
  const obj = typeof input === 'string' ? extractJson(input) : input;
  if (!obj || typeof obj !== 'object') throw new Error('Это не проект: ожидается объект JSON');
  const data = obj.project && typeof obj.project === 'object' ? obj.project : obj;
  const native = Array.isArray(data.walls) && Array.isArray(data.levels) && data.levels.every((l) => l && l.id && !Array.isArray(l.walls));
  if (native) {
    const warnings = [];
    const project = normalizeProject(data);
    healProject(project, warnings);
    return { project, warnings, format: 'native' };
  }
  if (!Array.isArray(data.levels) || !data.levels.length) throw new Error('В проекте нет этажей (levels)');
  return fromExchange(data);
}

// ── Импорт формата для ИИ ─────────────────────────────────────────────────

const num = (v, def) => {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v;
  return Number.isFinite(n) ? n : def;
};

function point(p, k = 1) {
  if (Array.isArray(p)) return { x: num(p[0], 0) * k, y: num(p[1], 0) * k };
  if (p && typeof p === 'object') return { x: num(p.x, 0) * k, y: num(p.y, 0) * k };
  return null;
}

const points = (list, k) => (Array.isArray(list) ? list.map((p) => point(p, k)).filter(Boolean) : []);

const KIND_ALIASES = {
  basement: 'basement',
  cellar: 'basement',
  plinth: 'basement',
  подвал: 'basement',
  цокольный: 'basement',
  attic: 'attic',
  mansard: 'attic',
  мансарда: 'attic',
  floor: 'floor',
};

function wallKind(v) {
  const s = String(v || '').toLowerCase();
  if (/inter|partition|перегор|внутр/.test(s)) return 'interior';
  return 'exterior';
}

function openingKind(v) {
  const s = String(v || '').toLowerCase();
  if (/win|окн/.test(s)) return 'window';
  if (/arch|open|проём|проем/.test(s)) return 'arch';
  return 'door';
}

/** Подобрать тип предмета каталога по типу или названию. */
function matchCatalog(type) {
  const s = String(type || '').toLowerCase().trim();
  if (!s) return null;
  const exact = CATALOG.find((c) => c.type === s);
  if (exact) return exact;
  return CATALOG.find((c) => c.name.toLowerCase() === s) || CATALOG.find((c) => c.name.toLowerCase().includes(s) || s.includes(c.type)) || null;
}

/** Масштаб единиц: метры по умолчанию; сантиметры и миллиметры распознаются. */
function unitScale(data) {
  const u = String(data.units || '').toLowerCase();
  if (u === 'mm' || u === 'мм') return 0.001;
  if (u === 'cm' || u === 'см') return 0.01;
  if (u === 'm' || u === 'м') return 1;
  let max = 0;
  for (const l of data.levels || []) for (const w of l.walls || []) for (const p of [point(w.from ?? [w.x1, w.y1]), point(w.to ?? [w.x2, w.y2])]) if (p) max = Math.max(max, Math.abs(p.x), Math.abs(p.y));
  if (max > 2000) return 0.001;
  if (max > 300) return 0.01;
  return 1;
}

export function fromExchange(data) {
  const warnings = [];
  const k = unitScale(data);
  if (k !== 1) warnings.push(`Размеры были в ${k === 0.01 ? 'сантиметрах' : 'миллиметрах'} — переведены в метры`);
  const project = createEmptyProject(String(data.name || 'Проект от ИИ'));
  project.levels = [];
  project.foundation = num(data.foundation, DEFAULTS.foundation / k) * k;
  const site = data.site || {};
  const boundary = points(site.boundary, k);
  if (boundary.length >= 3) project.site.boundary = boundary;
  if (site.fence !== undefined) project.site.fence.enabled = typeof site.fence === 'object' ? site.fence.enabled !== false : !!site.fence;
  if (site.fenceHeight || site.fence?.height) project.site.fence.height = num(site.fenceHeight ?? site.fence?.height, 1.8 / k) * k;

  // этажи: подвалы — вниз, мансарда — наверх
  const raw = data.levels.map((l, i) => ({ l: l || {}, i, kind: KIND_ALIASES[String(l?.kind || l?.type || 'floor').toLowerCase()] || 'floor' }));
  raw.sort((a, b) => order(a.kind) - order(b.kind) || a.i - b.i);
  let floorNo = 0;
  for (const { l, kind } of raw) {
    if (kind === 'floor') floorNo++;
    const lvl = createLevel(project.levels.length, {
      name: String(l.name || (kind === 'basement' ? 'Подвал' : kind === 'attic' ? 'Мансарда' : `${floorNo} этаж`)),
      kind,
      height: clamp(num(l.height, kind === 'basement' ? 2.4 / k : DEFAULTS.levelHeight / k) * k, 1.8, 8),
      slab: clamp(num(l.slab, DEFAULTS.slab / k) * k, 0.1, 0.6),
      ...(kind === 'attic' ? { kneeWall: clamp(num(l.kneeWall, 1.2 / k) * k, 0.3, 2.5) } : {}),
    });
    project.levels.push(lvl);
    importLevel(project, lvl, l, k, warnings);
  }

  for (const it of [...(data.outdoor || []), ...(data.items || []).filter((x) => x?.outdoor)]) addItem(project, SITE_LEVEL, it, k, warnings);
  for (const z of data.zones || []) {
    const pts = points(z.points, k);
    if (pts.length < 3) continue;
    const m = ZONE_MATERIALS[z.material] ? z.material : 'lawn';
    if (!ZONE_MATERIALS[z.material]) warnings.push(`Неизвестное покрытие участка «${z.material}» — стало газоном`);
    project.zones.push(createZone(pts, m));
  }
  if (!project.roofs.length && project.walls.length) warnings.push('Крыши нет — её можно поставить инструментом «Крыша» → «По контуру этажа»');
  const p = normalizeProject(project);
  healProject(p, warnings);
  return { project: p, warnings, format: 'ai' };
}

function order(kind) {
  return kind === 'basement' ? 0 : kind === 'attic' ? 2 : 1;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function importLevel(project, lvl, l, k, warnings) {
  const ids = new Map();
  const walls = [];
  (l.walls || []).forEach((w, i) => {
    const a = point(w.from ?? w.start ?? [w.x1, w.y1], k);
    const b = point(w.to ?? w.end ?? [w.x2, w.y2], k);
    if (!a || !b || dist(a, b) < 0.05) {
      warnings.push(`${lvl.name}: стена ${w.id ?? i + 1} слишком короткая — пропущена`);
      return;
    }
    const kind = wallKind(w.type ?? w.kind);
    const wall = createWall(lvl.id, a, b, {
      kind,
      thickness: clamp(num(w.thickness, DEFAULTS.wall[kind].thickness / k) * k, 0.05, 1.5),
      height: w.height ? num(w.height, 0) * k || null : null,
    });
    walls.push(wall);
    ids.set(String(w.id ?? i + 1), wall);
    ids.set(String(i), ids.get(String(i)) || wall);
  });
  project.walls.push(...walls);
  healWalls(walls);

  // проёмы: стена по id (или номеру), место — расстояние от начала стены или точка
  const geoms = computeWallGeometry(walls);
  for (const o of l.openings || []) {
    const kind = openingKind(o.type ?? o.kind);
    let wall = ids.get(String(o.wall ?? o.wallId ?? ''));
    const at = point(o.at ?? (o.x !== undefined ? [o.x, o.y] : null), k);
    if (!wall && at) wall = nearestWall(walls, at);
    if (!wall) {
      warnings.push(`${lvl.name}: ${kind === 'window' ? 'окно' : 'дверь'} без стены — пропущено`);
      continue;
    }
    const g = geoms.get(wall.id);
    if (!g) continue;
    const def = DEFAULTS[kind];
    const styles = OPENING_STYLES[kind];
    let style = o.style && styles[o.style] ? o.style : Object.keys(styles)[kind === 'window' ? 1 : 0];
    if (kind === 'door' && /garage|гараж/.test(String(o.type || ''))) style = 'garage';
    const width = clamp(num(o.width, def.width / k) * k, 0.3, Math.max(0.3, g.len - 0.1));
    let t = o.offset ?? o.t ?? o.position;
    t = t !== undefined ? num(t, g.len / 2 / k) * k : at ? projectOnSegment(at, g.a, g.b).along : g.len / 2;
    t = clamp(t, width / 2 + 0.05, g.len - width / 2 - 0.05);
    const existing = project.openings.filter((x) => x.wallId === wall.id);
    if (!canPlaceOpening(g, existing, t, width, null, 0.02)) {
      warnings.push(`${lvl.name}: проём на стене ${o.wall ?? ''} пересекается с другим — пропущен`);
      continue;
    }
    project.openings.push(
      createOpening(wall.id, kind, {
        style,
        t,
        width,
        height: clamp(num(o.height, def.height / k) * k, 0.3, 5),
        sill: kind === 'window' ? clamp(num(o.sill, def.sill / k) * k, 0, 3) : 0,
        flipSide: !!o.flipSide,
        flipHinge: !!o.flipHinge,
      }),
    );
  }

  // комнаты; если ИИ их не дал — найти по стенам
  const rooms = (l.rooms || []).map((r) => ({ r, pts: points(r.points ?? r.polygon, k) })).filter((x) => x.pts.length >= 3);
  for (const { r, pts } of rooms) {
    const floor = FLOOR_MATERIALS[r.floor] ? r.floor : 'laminate';
    project.rooms.push(createRoom(lvl.id, pts, { name: String(r.name || 'Комната'), floor }));
  }
  if (!rooms.length && walls.length) {
    const faces = findFaces(walls);
    for (const f of faces) project.rooms.push(createRoom(lvl.id, f.poly, { name: 'Комната' }));
    if (faces.length) warnings.push(`${lvl.name}: комнаты найдены по стенам (${faces.length})`);
  }

  for (const s of l.stairs || []) {
    const shape = STAIR_SHAPES[s.shape] ? s.shape : 'straight';
    const st = createStair(lvl.id, num(s.x, 0) * k, num(s.y, 0) * k, { shape, rotation: num(s.rotation, 0) });
    if (s.width) st.width = clamp(num(s.width, 1) * k, 0.5, 4);
    if (s.length) st.length = clamp(num(s.length, 3.6) * k, 0.5, 10);
    if (s.flight) st.flight = clamp(num(s.flight, 1) * k, 0.5, 2);
    st.flip = !!s.flip;
    project.stairs.push(st);
  }
  for (const it of l.furniture || l.items || []) addItem(project, it?.outdoor ? SITE_LEVEL : lvl.id, it, k, warnings);
  for (const r of l.roofs || (l.roof ? [l.roof] : [])) {
    const type = ROOF_TYPES[r.type] ? r.type : 'gable';
    project.roofs.push(
      createRoof(lvl.id, num(r.x, 0) * k, num(r.y, 0) * k, Math.max(0.5, num(r.w, 8) * k), Math.max(0.5, num(r.d, 8) * k), {
        type,
        rotation: num(r.rotation, 0),
        pitch: clamp(num(r.pitch, DEFAULTS.roof.pitch), 0, 60),
        overhang: clamp(num(r.overhang, DEFAULTS.roof.overhang / k) * k, 0, 2),
      }),
    );
  }
}

function addItem(project, levelId, it, k, warnings) {
  if (!it) return;
  const c = matchCatalog(it.type ?? it.name);
  const x = num(it.x, 0) * k;
  const y = num(it.y, 0) * k;
  if (!c) warnings.push(`Предмета «${it.type ?? it.name}» нет в каталоге — поставлен блок`);
  // в furniture этажа предмет остаётся на этаже (беседка на крыше-террасе), в outdoor — на участке
  const item = createItem(levelId, c ? c.type : 'box', x, y, { rotation: num(it.rotation, 0), onLevel: levelId !== SITE_LEVEL });
  if (it.w) item.w = clamp(num(it.w, item.w) * k, 0.05, 30);
  if (it.d) item.d = clamp(num(it.d, item.d) * k, 0.05, 30);
  if (it.h) item.h = clamp(num(it.h, item.h) * k, 0.01, 15);
  if (it.elevation) item.elevation = num(it.elevation, 0) * k;
  project.items.push(item);
}

function nearestWall(walls, p) {
  let best = null;
  for (const w of walls) {
    const d = projectOnSegment(p, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }).dist;
    if (d < 0.6 && (!best || d < best.d)) best = { w, d };
  }
  return best?.w || null;
}

// ── Починка геометрии ────────────────────────────────────────────────────

/**
 * Сводит почти совпадающие концы стен в одну точку и ставит концы,
 * почти лежащие на оси другой стены, точно на ось — иначе углы и Т-примыкания
 * не соединятся, а комнаты не найдутся.
 */
export function healWalls(walls, tol = 0.04) {
  let fixed = 0;
  const ends = [];
  for (const w of walls) ends.push({ w, i: 1 }, { w, i: 2 });
  const get = (e) => ({ x: e.w[`x${e.i}`], y: e.w[`y${e.i}`] });
  const set = (e, p) => {
    e.w[`x${e.i}`] = p.x;
    e.w[`y${e.i}`] = p.y;
  };
  // 1) кластеры концов
  const used = new Set();
  for (let a = 0; a < ends.length; a++) {
    if (used.has(a)) continue;
    const group = [a];
    for (let b = a + 1; b < ends.length; b++) if (!used.has(b) && dist(get(ends[a]), get(ends[b])) < tol) group.push(b);
    if (group.length < 2) continue;
    const c = group.reduce((s, i) => ({ x: s.x + get(ends[i]).x / group.length, y: s.y + get(ends[i]).y / group.length }), { x: 0, y: 0 });
    for (const i of group) {
      if (dist(get(ends[i]), c) > 1e-6) fixed++;
      set(ends[i], { x: r3(c.x), y: r3(c.y) });
      used.add(i);
    }
  }
  // 2) Т-примыкания: конец рядом с осью другой стены
  for (const e of ends) {
    const p = get(e);
    for (const w of walls) {
      if (w === e.w) continue;
      const pr = projectOnSegment(p, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
      if (pr.dist > 1e-4 && pr.dist < Math.max(tol, w.thickness / 2 + 0.01) && pr.rawT > 0.01 && pr.rawT < 0.99) {
        set(e, { x: r3(pr.point.x), y: r3(pr.point.y) });
        fixed++;
        break;
      }
    }
  }
  return fixed;
}

function healProject(project, warnings) {
  let fixed = 0;
  for (const l of project.levels) fixed += healWalls(project.walls.filter((w) => w.levelId === l.id));
  if (fixed) warnings.push(`Подправлены стыки стен: ${fixed}`);
}

/** Сводка для показа перед импортом. */
export function summarize(project) {
  const by = (coll, levelId) => project[coll].filter((e) => e.levelId === levelId).length;
  const ops = (levelId) => {
    const ids = new Set(project.walls.filter((w) => w.levelId === levelId).map((w) => w.id));
    return project.openings.filter((o) => ids.has(o.wallId));
  };
  return {
    name: project.name,
    levels: project.levels.map((l) => {
      const o = ops(l.id);
      return {
        name: l.name,
        kind: getLevel(project, l.id)?.kind || 'floor',
        walls: by('walls', l.id),
        rooms: by('rooms', l.id),
        doors: o.filter((x) => x.kind !== 'window').length,
        windows: o.filter((x) => x.kind === 'window').length,
        stairs: by('stairs', l.id),
        items: by('items', l.id),
        roofs: by('roofs', l.id),
      };
    }),
    outdoor: project.items.filter((i) => i.levelId === SITE_LEVEL).length,
    zones: project.zones.length,
  };
}

