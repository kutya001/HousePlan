/**
 * Смета и спецификации: объёмы работ и материалов по проекту, экспликация
 * помещений, ведомость проёмов с марками. Счёт ориентировочный — для
 * сравнения вариантов и разговора со строителями, не для договора.
 */
import { computeWallGeometry, pointOnWall } from '../geometry/wallGeometry.js';
import { levelFootprints, roomNetArea } from '../geometry/roomDetect.js';
import { roofPlanes } from '../geometry/roofGeometry.js';
import { roofSurfaceAt } from '../geometry/roofSurface.js';
import { roomWindowDirections } from '../geometry/orientation.js';
import { polygonArea, bboxOf } from '../core/geometry.js';
import { catalogItem, CATALOG } from './catalog.js';
import { FLOOR_MATERIALS, ZONE_MATERIALS, STAIR_SHAPES, OPENING_STYLES } from './defaults.js';
import { groundLevel, isAttic, isBasement, isRoofTerrace, levelElevation, levelTop, wallHeight } from './project.js';

/** Блок газобетона 600×300×250 мм. */
const BLOCK_M3 = 0.6 * 0.3 * 0.25;
const PARTITION_MAX = 0.15; // тоньше — перегородка
const REBAR_KG_M3 = 80;

/**
 * Цены по умолчанию, сом за единицу — ориентир для Бишкека, их стоит
 * поправить под свои (сохраняются в браузере).
 */
export const PRICE_DEFAULTS = {
  excavation: 450,
  found_concrete: 5800,
  found_rebar: 80,
  wall_ext: 5200,
  wall_int: 5200,
  partition: 900,
  lintel: 1800,
  slab: 13500,
  ground_slab: 6500,
  screed: 450,
  heated_floor: 1900,
  floor_parquet: 2600,
  floor_laminate: 950,
  floor_tile: 1300,
  floor_stone: 2600,
  floor_carpet: 750,
  floor_concrete: 350,
  roof_cover: 2100,
  roof_window: 38000,
  facade: 1600,
  int_finish: 650,
  ceiling: 700,
  window: 9500,
  door_ext: 38000,
  door_int: 12000,
  door_garage: 65000,
  stair_straight: 65000,
  stair_L: 95000,
  stair_U: 110000,
  stair_spiral: 130000,
  fence: 3800,
  zone_paving: 1600,
  zone_gravel: 450,
  zone_asphalt: 1400,
  zone_deck: 3200,
  zone_lawn: 300,
  zone_water: 6000,
  zone_soil: 250,
  zone_flowers: 600,
  mep_socket: 550,
  mep_socket_double: 750,
  mep_socket_kitchen: 750,
  mep_switch: 500,
  mep_ceiling_light: 2500,
  mep_spot_light: 900,
  mep_wall_lamp: 2200,
  mep_el_panel: 28000,
  mep_water_point: 1800,
  mep_sewer_point: 1600,
  mep_floor_drain: 3200,
  mep_water_heater: 26000,
  mep_radiator: 9500,
  mep_towel_rail: 8500,
};

export const CURRENCY = 'сом';

const r2 = (v) => Math.round(v * 100) / 100;
const OPENING_AREA = (o) => o.width * o.height;
const LIVING = /спальн|гостин|детск|кабинет|зал\b|^зал|столов/i;

/** Высота стены в точке: у мансарды — до ската (минус 10 см, как в 3D). */
function wallAreaClipped(project, g, base, H) {
  const level = project.levels.find((l) => l.id === g.wall.levelId);
  if (!isAttic(level) || !project.roofs.some((r) => r.levelId === level.id)) return g.len * H;
  const n = Math.max(4, Math.ceil(g.len / 0.1));
  let a = 0;
  for (let i = 0; i < n; i++) {
    const p = pointOnWall(g, ((i + 0.5) / n) * g.len);
    const s = roofSurfaceAt(project, level.id, p);
    const h = s ? Math.max(0, Math.min(H, s.h - 0.1 - base)) : H;
    a += (h * g.len) / n;
  }
  return a;
}

/** Площадь кровли с учётом уклона; у пересекающихся крыш видимая часть считается один раз. */
export function roofCoverArea(project) {
  const roofs = project.roofs;
  if (!roofs.length) return 0;
  const rps = roofs.map((r) => ({ r, rp: roofPlanes(r, levelTop(project, r.levelId)) }));
  const pts = [];
  for (const r of roofs) {
    const o = r.overhang ?? 0.5;
    const R = Math.hypot(r.w / 2 + o, r.d / 2 + o);
    pts.push({ x: r.x - R, y: r.y - R }, { x: r.x + R, y: r.y + R });
  }
  const bb = bboxOf(pts);
  const step = 0.1;
  let area = 0;
  for (let x = bb.minX + step / 2; x < bb.maxX; x += step) {
    for (let y = bb.minY + step / 2; y < bb.maxY; y += step) {
      const p = { x, y };
      let best = null;
      for (const { rp } of rps) {
        if (!rp.contains(p)) continue;
        let low = null;
        for (const pl of rp.planes) {
          const h = pl.a * x + pl.b * y + pl.c;
          if (!low || h < low.h) low = { h, pl };
        }
        if (low && (!best || low.h > best.h)) best = low;
      }
      if (best) area += step * step * Math.hypot(1, best.pl.a, best.pl.b);
    }
  }
  return area;
}

/** Марки проёмов: одинаковые по виду и размеру — одна марка (ОК-1, Д-2, В-1…). */
export function openingSchedule(project) {
  const wallLevel = new Map(project.walls.map((w) => [w.id, w]));
  const levelIdx = new Map(project.levels.map((l, i) => [l.id, i]));
  const groups = new Map();
  const ops = project.openings
    .filter((o) => wallLevel.has(o.wallId))
    .slice()
    .sort((a, b) => levelIdx.get(wallLevel.get(a.wallId).levelId) - levelIdx.get(wallLevel.get(b.wallId).levelId));
  for (const o of ops) {
    const w = wallLevel.get(o.wallId);
    const prefix = o.kind === 'window' ? 'ОК' : o.kind === 'arch' ? 'П' : o.style === 'garage' ? 'В' : 'Д';
    const key = [o.kind, o.style || '', r2(o.width), r2(o.height), o.kind === 'window' ? r2(o.sill || 0) : '', o.kind === 'door' ? w.kind : ''].join('|');
    if (!groups.has(key)) groups.set(key, { key, prefix, o, wallKind: w.kind, items: [], levels: new Set() });
    const g = groups.get(key);
    g.items.push(o);
    g.levels.add(levelIdx.get(w.levelId));
  }
  const counters = {};
  const marks = new Map();
  const rows = [];
  for (const g of groups.values()) {
    counters[g.prefix] = (counters[g.prefix] || 0) + 1;
    const mark = `${g.prefix}-${counters[g.prefix]}`;
    for (const o of g.items) marks.set(o.id, mark);
    const o = g.o;
    const styleName = OPENING_STYLES[o.kind]?.[o.style] || '';
    const kindName = o.kind === 'window' ? 'Окно' : o.kind === 'arch' ? 'Проём без двери' : o.style === 'garage' ? 'Ворота' : g.wallKind === 'exterior' ? 'Дверь входная' : 'Дверь межкомнатная';
    rows.push({
      mark,
      name: styleName && o.kind !== 'arch' && o.style !== 'garage' ? `${kindName}, ${styleName.toLowerCase()}` : kindName,
      width: o.width,
      height: o.height,
      sill: o.kind === 'window' ? o.sill || 0 : null,
      count: g.items.length,
      area: r2(OPENING_AREA(o) * g.items.length),
      levels: [...g.levels].sort().map((i) => project.levels[i]?.name).join(', '),
    });
  }
  return { rows, marks };
}

/**
 * Открытая терраса на крыше: верхний этаж, у которого наружные стены — в основном
 * низкий парапет (будка выхода на крышу не в счёт).
 */
export function isOpenTerrace(project, levelId) {
  if (!isRoofTerrace(project, levelId)) return false;
  let low = 0;
  let all = 0;
  for (const w of project.walls) {
    if (w.levelId !== levelId || w.kind !== 'exterior') continue;
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    all += len;
    if (wallHeight(project, w) <= 1.5) low += len;
  }
  return all > 0 && low / all > 0.5;
}

/** Экспликация помещений по этажам. */
export function roomSchedule(project) {
  const out = [];
  for (const level of project.levels) {
    const walls = project.walls.filter((w) => w.levelId === level.id);
    const rooms = project.rooms.filter((r) => r.levelId === level.id);
    rooms.forEach((r, i) => {
      out.push({
        level: level.name,
        levelId: level.id,
        no: `${project.levels.indexOf(level) + 1}.${i + 1}`,
        name: r.name,
        area: r2(roomNetArea(r, walls)),
        floor: FLOOR_MATERIALS[r.floor]?.name || '',
        heated: !!r.heatedFloor,
        living: LIVING.test(r.name || ''),
        terrace: isOpenTerrace(project, level.id),
        windows: roomWindowDirections(project, r).join(', '),
        id: r.id,
      });
    });
  }
  return out;
}

/**
 * Основные показатели и объёмы.
 * @returns {{ summary, sections: Array<{ title, rows: Array<{ key, name, qty, unit, note? }> }>, rooms, openings }}
 */
export function computeEstimate(project) {
  const sections = [];
  const sec = (title) => {
    const s = { title, rows: [] };
    sections.push(s);
    return s;
  };
  const row = (s, key, name, qty, unit, note) => {
    if (!(qty > 0.0001)) return;
    s.rows.push({ key, name, qty: unit === 'шт' ? Math.round(qty) : r2(qty), unit, note });
  };

  const levels = project.levels;
  const lowest = levels[0];
  const ground = groundLevel(project);
  const geomsByLevel = new Map(levels.map((l) => [l.id, computeWallGeometry(project.walls.filter((w) => w.levelId === l.id))]));
  const opsByWall = new Map();
  for (const o of project.openings) {
    if (!opsByWall.has(o.wallId)) opsByWall.set(o.wallId, []);
    opsByWall.get(o.wallId).push(o);
  }
  const footprintArea = (lid) => levelFootprints(project.walls.filter((w) => w.levelId === lid)).reduce((s, p) => s + polygonArea(p), 0);

  // ── Фундамент ──
  const fnd = sec('Фундамент и земляные работы');
  let concrete = 0;
  let excav = 0;
  if (isBasement(lowest)) {
    const fp = footprintArea(lowest.id);
    const depth = -levelElevation(project, lowest.id) + 0.45;
    excav += fp * 1.15 * Math.max(0.5, depth);
    concrete += fp * 0.15; // плита пола подвала
    for (const g of geomsByLevel.get(lowest.id).values()) {
      const w = g.wall;
      concrete += g.len * (w.thickness + 0.3) * 0.4; // подушка-лента под стенами
      if (w.kind === 'exterior') {
        const open = (opsByWall.get(w.id) || []).reduce((s, o) => s + OPENING_AREA(o), 0);
        concrete += Math.max(0, g.len * wallHeight(project, w) - open) * w.thickness;
      }
    }
    row(fnd, 'excavation', 'Котлован под подвал', excav, 'м³');
    row(fnd, 'found_concrete', 'Бетон: стены подвала, лента, плита пола', concrete, 'м³');
  } else {
    const plinth = project.foundation ?? 0.45;
    for (const g of geomsByLevel.get(ground.id).values()) {
      const w = g.wall;
      if (w.kind !== 'exterior' && w.thickness < 0.2) continue; // под перегородки — отдельная лента не нужна
      const depth = plinth + 0.8;
      concrete += g.len * (w.thickness + 0.1) * depth;
      excav += g.len * (w.thickness + 0.5) * 0.9;
    }
    row(fnd, 'excavation', 'Траншея под ленту', excav, 'м³');
    row(fnd, 'found_concrete', `Бетон ленточного фундамента (с цоколем ${plinth.toFixed(2).replace('.', ',')} м)`, concrete, 'м³');
  }
  row(fnd, 'found_rebar', `Арматура фундамента (≈${REBAR_KG_M3} кг на м³)`, concrete * REBAR_KG_M3, 'кг');

  // ── Стены ──
  const wl = sec('Стены');
  let ext = 0;
  let intr = 0;
  let part = 0;
  let lintels = 0;
  let facade = 0;
  let finish = 0;
  for (const level of levels) {
    const base = levelElevation(project, level.id);
    const underground = isBasement(level);
    for (const g of geomsByLevel.get(level.id).values()) {
      const w = g.wall;
      const H = wallHeight(project, w);
      const ops = opsByWall.get(w.id) || [];
      const open = ops.reduce((s, o) => s + OPENING_AREA(o), 0);
      const gross = wallAreaClipped(project, g, base, H);
      const net = Math.max(0, gross - open);
      if (w.kind === 'exterior') {
        if (!underground) {
          ext += net * w.thickness;
          facade += net;
        }
        finish += net; // одна сторона внутрь
        lintels += ops.filter((o) => o.kind !== 'arch').length;
      } else if (w.thickness < PARTITION_MAX + 1e-6) {
        part += net;
        finish += net * 2;
      } else {
        intr += net * w.thickness;
        finish += net * 2;
        lintels += ops.length;
      }
    }
  }
  row(wl, 'wall_ext', 'Наружные стены — газобетон D500 с клеем', ext, 'м³', ext ? `≈ ${Math.ceil((ext / BLOCK_M3) * 1.05)} блоков 600×300×250` : '');
  row(wl, 'wall_int', 'Внутренние несущие стены', intr, 'м³', intr ? `≈ ${Math.ceil((intr / BLOCK_M3) * 1.05)} блоков` : '');
  row(wl, 'partition', 'Перегородки', part, 'м²');
  row(wl, 'lintel', 'Перемычки над проёмами', lintels, 'шт');

  // ── Перекрытия и полы ──
  const fl = sec('Перекрытия и полы');
  let slab = 0;
  levels.forEach((level, i) => {
    if (i === 0) return;
    slab += footprintArea(levels[i - 1].id) * (level.slab ?? 0.25);
  });
  row(fl, 'slab', 'Монолитные перекрытия (бетон и арматура)', slab, 'м³');
  if (!isBasement(lowest)) row(fl, 'ground_slab', 'Пол по грунту: подготовка и плита 15 см', footprintArea(lowest.id) * 0.15, 'м³');
  const rooms = roomSchedule(project);
  const byFloor = {};
  let screed = 0;
  let heated = 0;
  for (const r of rooms) {
    const key = project.rooms.find((x) => x.id === r.id)?.floor || 'laminate';
    byFloor[key] = (byFloor[key] || 0) + r.area;
    if (!r.terrace) screed += r.area;
    if (r.heated) heated += r.area;
  }
  row(fl, 'screed', 'Стяжка пола', screed, 'м²');
  row(fl, 'heated_floor', 'Тёплый пол', heated, 'м²');
  for (const [k, a] of Object.entries(byFloor)) row(fl, `floor_${k}`, `Покрытие пола: ${FLOOR_MATERIALS[k]?.name.toLowerCase() || k} (+5% на подрезку)`, a * 1.05, 'м²');

  // ── Кровля ──
  const rf = sec('Кровля');
  const roofArea = roofCoverArea(project);
  row(rf, 'roof_cover', 'Кровля: стропила, утеплитель, покрытие', roofArea, 'м²');
  const roofWins = project.items.filter((it) => catalogItem(it.type)?.roofMount).length;
  row(rf, 'roof_window', 'Мансардные окна', roofWins, 'шт');

  // ── Отделка ──
  const fin = sec('Отделка');
  row(fin, 'facade', 'Фасад: утепление и декоративная штукатурка', facade, 'м²');
  row(fin, 'int_finish', 'Стены внутри: штукатурка и покраска', finish, 'м²');
  row(fin, 'ceiling', 'Потолки', screed, 'м²');

  // ── Окна, двери, лестницы ──
  const od = sec('Окна, двери, лестницы');
  const sched = openingSchedule(project);
  const wallKind = new Map(project.walls.map((w) => [w.id, w.kind]));
  let winArea = 0;
  let winCount = 0;
  let dExt = 0;
  let dInt = 0;
  let gates = 0;
  for (const o of project.openings) {
    if (!wallKind.has(o.wallId)) continue;
    if (o.kind === 'window') {
      winArea += OPENING_AREA(o);
      winCount++;
    } else if (o.kind === 'door') {
      if (o.style === 'garage') gates++;
      else if (wallKind.get(o.wallId) === 'exterior') dExt++;
      else dInt++;
    }
  }
  row(od, 'window', 'Окна ПВХ с подоконниками и отливами', winArea, 'м²', winCount ? `${winCount} шт.` : '');
  row(od, 'door_ext', 'Двери входные', dExt, 'шт');
  row(od, 'door_int', 'Двери межкомнатные', dInt, 'шт');
  row(od, 'door_garage', 'Гаражные ворота', gates, 'шт');
  for (const [shape, name] of Object.entries(STAIR_SHAPES)) {
    row(od, `stair_${shape}`, `Лестница: ${name.toLowerCase()}`, project.stairs.filter((s) => s.shape === shape).length, 'шт');
  }

  // ── Инженерия ──
  const mep = sec('Инженерия');
  for (const c of CATALOG.filter((x) => x.category === 'mep')) {
    row(mep, `mep_${c.type}`, c.name, project.items.filter((it) => it.type === c.type).length, 'шт');
  }

  // ── Участок ──
  const site = sec('Участок');
  const fence = project.site?.fence;
  if (fence?.enabled && project.site.boundary?.length > 2) {
    const b = project.site.boundary;
    const per = b.reduce((s, p, i) => s + Math.hypot(b[(i + 1) % b.length].x - p.x, b[(i + 1) % b.length].y - p.y), 0);
    row(site, 'fence', `Забор высотой ${String(fence.height ?? 1.8).replace('.', ',')} м`, per, 'м');
  }
  const zones = {};
  for (const z of project.zones || []) zones[z.material] = (zones[z.material] || 0) + polygonArea(z.points);
  for (const [k, a] of Object.entries(zones)) row(site, `zone_${k}`, `Покрытие: ${ZONE_MATERIALS[k]?.name.toLowerCase() || k}`, a, 'м²');

  // ── Показатели ──
  const groundFp = footprintArea(ground.id);
  const total = rooms.filter((r) => !r.terrace).reduce((s, r) => s + r.area, 0);
  const living = rooms.filter((r) => r.living && !r.terrace).reduce((s, r) => s + r.area, 0);
  const above = levels.filter((l) => !isBasement(l) && !isOpenTerrace(project, l.id)).length;
  let ridge = 0;
  for (const r of project.roofs) {
    const top = levelTop(project, r.levelId);
    const rp = roofPlanes(r, top);
    let m = top;
    for (const pl of rp.planes) m = Math.max(m, pl.a * r.x + pl.b * r.y + pl.c);
    ridge = Math.max(ridge, m);
  }
  const siteArea = project.site?.boundary?.length > 2 ? polygonArea(project.site.boundary) : 0;
  const summary = {
    built: r2(groundFp),
    total: r2(total),
    living: r2(living),
    floors: above,
    basement: isBasement(lowest),
    ridge: r2(ridge),
    site: r2(siteArea),
    walls: r2(ext + intr),
    roof: r2(roofArea),
    windows: r2(winArea),
  };

  return { summary, sections: sections.filter((s) => s.rows.length), rooms, openings: sched.rows, marks: sched.marks };
}

/** Цены: свои (из браузера) поверх умолчаний. */
export function priceOf(prices, key) {
  const v = prices?.[key];
  return Number.isFinite(v) ? v : PRICE_DEFAULTS[key] ?? 0;
}

/** Сумма по смете. */
export function estimateTotal(est, prices) {
  let s = 0;
  for (const sec of est.sections) for (const r of sec.rows) s += r.qty * priceOf(prices, r.key);
  return Math.round(s);
}
