/**
 * Смета и спецификации: объёмы работ и материалов по проекту, экспликация
 * помещений, ведомость проёмов с марками. Счёт ориентировочный — для
 * сравнения вариантов и разговора со строителями, не для договора.
 */
import { computeWallGeometry, pointOnWall } from '../geometry/wallGeometry.js';
import { levelFootprints, roomNetArea } from '../geometry/roomDetect.js';
import { roofPlanes, roofOutline } from '../geometry/roofGeometry.js';
import { roofGutters } from '../geometry/roofGutters.js';
import { foundationParts, blindArea } from '../geometry/foundation.js';
import { foundationOf, PLINTH_FINISHES } from './foundation.js';
import { ROOF_COVERS, roofCover } from './finishes.js';
import { roofSurfaceAt, chimneyTop } from '../geometry/roofSurface.js';
import { roomWindowDirections } from '../geometry/orientation.js';
import { polygonArea, bboxOf } from '../core/geometry.js';
import { catalogItem, CATALOG } from './catalog.js';
import { FLOOR_MATERIALS, ZONE_MATERIALS, STAIR_SHAPES, OPENING_STYLES } from './defaults.js';
import { groundLevel, isAttic, isBasement, isRoofTerrace, levelElevation, levelTop, wallHeight, SITE_LEVEL } from './project.js';
import { WALL_TYPES, WALL_FINISHES, wallType, wallTypeId, wallSideFinish, isBearing } from './wallTypes.js';
import { wallSides } from '../geometry/wallSides.js';

/** Блок газобетона 600×300×250 мм. */
const BLOCK_M3 = 0.6 * 0.3 * 0.25;
/** Строки сметы прежних версий — для стен «по умолчанию» (цены у пользователя сохранены по этим ключам). */
const WALL_KEY = { aerated: 'wall_ext', bearing_block: 'wall_int', part_block: 'partition' };
const WALL_ROW = { aerated: 'Наружные стены — газобетон D500 с клеем', bearing_block: 'Внутренние несущие стены из блоков', part_block: 'Перегородки из блоков' };
/** Поверхность самого материала стены: отдельной отделки не требует. */
const NATIVE_FINISH = new Set(['timber', 'log', 'wood', 'glass', 'glassblock', 'brick', 'concrete']);
const REBAR_KG_M3 = 80;

/**
 * Цены по умолчанию, сом за единицу — ориентир для Бишкека, их стоит
 * поправить под свои (сохраняются в браузере).
 */
export const PRICE_DEFAULTS = {
  excavation: 450,
  found_concrete: 5800,
  found_rebar: 80,
  found_sand: 1300,
  found_pile: 9500,
  found_screw: 6500,
  found_beam: 1400,
  plinth_stone: 3200,
  plinth_brick: 3000,
  plinth_tile: 2200,
  plinth_panels: 1800,
  plinth_plaster: 900,
  blind_area: 1500,
  wall_ext: 5200,
  wall_int: 5200,
  partition: 900,
  // прочие типы стен: кладка — за м³, каркас и перегородки — за м²
  wall_brick: 9500,
  wall_ceramic: 7800,
  wall_timber: 21000,
  wall_log: 19000,
  wall_frame: 3900,
  wall_sip: 3400,
  wall_concrete: 14500,
  wall_bearing_brick: 9500,
  wall_bearing_timber: 21000,
  wall_bearing_concrete: 14500,
  wall_part_brick: 1500,
  wall_drywall: 1100,
  wall_tongue: 950,
  wall_part_wood: 1300,
  wall_glassblock: 9000,
  wall_glass: 12000,
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
  roof_tiles: 4200,
  roof_shingle: 2300,
  roof_seam: 2900,
  roof_profsheet: 1700,
  roof_slate: 1500,
  roof_ondulin: 1600,
  roof_membrane: 2400,
  roof_sedum: 5200,
  roof_plain: 1900,
  gutter: 900,
  downpipe: 950,
  parapet: 2600,
  chimney: 9000,
  roof_window: 38000,
  facade: 1600,
  facade_paint: 600,
  facade_brick: 3200,
  facade_stone: 4500,
  facade_siding: 1500,
  facade_panels: 2800,
  facade_timber: 1800,
  facade_log: 1900,
  facade_wood: 1500,
  facade_concrete: 400,
  int_finish: 650,
  int_brick: 2800,
  int_stone: 3800,
  int_timber: 1800,
  int_log: 1900,
  int_wood: 1500,
  int_tile: 1900,
  int_wallpaper: 550,
  int_concrete: 300,
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
  for (const r of roofs) pts.push(...roofOutline(r));
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
    const f = foundationOf(project);
    const parts = foundationParts(project);
    const plinth = f.height;
    const m = (v) => v.toFixed(2).replace('.', ',');
    const bearing = [...geomsByLevel.get(ground.id).values()].filter((g) => isBearing(g.wall)); // под перегородки фундамент не нужен
    if (f.type === 'slab') {
      const fp = footprintArea(ground.id) * 1.08; // плита с выпуском за стены
      excav += fp * 0.5;
      concrete += fp * 0.3;
      // цоколь над плитой — под наружными стенами
      for (const g of bearing) if (g.wall.kind === 'exterior') concrete += g.len * g.wall.thickness * Math.max(0, plinth - 0.25);
      row(fnd, 'excavation', 'Котлован под плиту', excav, 'м³');
      row(fnd, 'found_sand', 'Песчано-гравийная подушка 30 см', fp * 0.3, 'м³');
      row(fnd, 'found_concrete', `Бетон плиты 30 см и цоколя (${m(plinth)} м)`, concrete, 'м³');
    } else if (f.type === 'piles') {
      const n = parts.piles.length;
      const depth = 2 + Math.max(0, plinth - 0.4); // до несущего грунта и над землёй до ростверка
      for (const g of bearing) concrete += g.len * (g.wall.thickness + 0.1) * 0.4; // ростверк
      row(fnd, 'found_pile', `Буронабивные сваи Ø300, длина ${m(depth)} м (бурение, каркас, бетон)`, n, 'шт');
      row(fnd, 'found_concrete', 'Бетон ростверка 400 мм', concrete, 'м³');
    } else if (f.type === 'screw') {
      row(fnd, 'found_screw', 'Винтовые сваи Ø108 с оголовками', parts.piles.length, 'шт');
      row(fnd, 'found_beam', 'Обвязка свай брусом 200×200', parts.bearingLength, 'м');
    } else {
      for (const g of bearing) {
        concrete += g.len * (g.wall.thickness + 0.1) * (plinth + 0.8);
        excav += g.len * (g.wall.thickness + 0.5) * 0.9;
      }
      row(fnd, 'excavation', 'Траншея под ленту', excav, 'м³');
      row(fnd, 'found_concrete', `Бетон ленточного фундамента (с цоколем ${m(plinth)} м)`, concrete, 'м³');
    }
  }
  row(fnd, 'found_rebar', `Арматура фундамента (≈${REBAR_KG_M3} кг на м³)`, concrete * REBAR_KG_M3, 'кг');
  // отделка цоколя — по наружным стенам на высоту цоколя; бетон без отделки не считаем
  const fo = foundationOf(project);
  const perimeter = [...geomsByLevel.get(lowest.id).values()].filter((g) => g.wall.kind === 'exterior').reduce((sum, g) => sum + g.len, 0);
  if (fo.finish !== 'concrete') row(fnd, `plinth_${fo.finish}`, `Отделка цоколя: ${PLINTH_FINISHES[fo.finish].name.toLowerCase()}`, perimeter * Math.max(0, fo.height), 'м²');
  const blind = blindArea(project);
  row(fnd, 'blind_area', `Отмостка шириной ${blind.width.toFixed(2).replace('.', ',')} м`, blind.area, 'м²');

  // ── Стены: по типам (из чего сложены) ──
  const wl = sec('Стены');
  const byType = new Map(); // id типа → количество в единицах типа (м³ или м²)
  const outFinish = new Map(); // отделка фасада → м²
  const inFinish = new Map(); // отделка в помещениях → м²
  const bump = (map, k, v) => map.set(k, (map.get(k) || 0) + v);
  let lintels = 0;
  for (const level of levels) {
    const base = levelElevation(project, level.id);
    const underground = isBasement(level);
    const geoms = geomsByLevel.get(level.id);
    const sides = wallSides(project, level.id, geoms);
    for (const g of geoms.values()) {
      const w = g.wall;
      const t = wallType(w);
      const H = wallHeight(project, w);
      const ops = opsByWall.get(w.id) || [];
      const open = ops.reduce((s, o) => s + OPENING_AREA(o), 0);
      const gross = wallAreaClipped(project, g, base, H);
      const net = Math.max(0, gross - open);
      const below = underground && w.kind === 'exterior'; // стены подвала — в бетоне фундамента
      if (!below) bump(byType, wallTypeId(w), t.unit === 'm3' ? net * w.thickness : net);
      if (t.bearing) lintels += ops.filter((o) => w.kind !== 'exterior' || o.kind !== 'arch').length;
      // отделка каждой стороны; «родная» поверхность (брус, бревно, стекло) отделки не требует
      const side = sides.get(w.id);
      for (const k of ['A', 'B']) {
        const outside = side[k].outside;
        if (below && outside) continue;
        const f = wallSideFinish(w, k, { outside, facade: project.facade || 'plaster' }).finish;
        if (NATIVE_FINISH.has(f) && f === (outside ? t.out : t.in) && !w[`finish${k}`]) continue;
        bump(outside ? outFinish : inFinish, f, net);
      }
    }
  }
  for (const [id, qty] of byType) {
    const t = WALL_TYPES[id];
    const blocks = id === 'aerated' || id === 'bearing_block' ? `≈ ${Math.ceil((qty / BLOCK_M3) * 1.05)} блоков 600×300×250` : '';
    row(wl, WALL_KEY[id] || `wall_${id}`, WALL_ROW[id] || `Стены: ${t.name.toLowerCase()}`, qty, t.unit === 'm3' ? 'м³' : 'м²', blocks);
  }
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
  // площадь делим между покрытиями по доле каждой крыши (пересечения считаются один раз)
  const roofArea = roofCoverArea(project);
  const own = project.roofs.map((r) => ({ r, a: roofCoverArea({ ...project, roofs: [r] }) }));
  const ownSum = own.reduce((sum, x) => sum + x.a, 0) || 1;
  const byCover = new Map();
  for (const { r, a } of own) byCover.set(roofCover(r), (byCover.get(roofCover(r)) || 0) + (a / ownSum) * roofArea);
  for (const [cover, area] of byCover) {
    const name = ROOF_COVERS[cover].toLowerCase();
    row(rf, cover === 'metal' ? 'roof_cover' : `roof_${cover}`, `Кровля: стропила, утеплитель, ${cover === 'plain' ? 'покрытие' : name}`, area, 'м²');
  }
  let gutterLen = 0;
  let pipeLen = 0;
  for (const r of project.roofs) {
    const g = roofGutters(project, r);
    gutterLen += g.length;
    pipeLen += g.pipeLength;
  }
  row(rf, 'gutter', 'Водосточные желоба с креплением', gutterLen, 'м');
  row(rf, 'downpipe', 'Водосточные трубы с коленами', pipeLen, 'м');
  const parapet = project.roofs.filter((r) => r.type === 'flat' && r.parapet > 0.02).reduce((sum, r) => sum + 2 * (r.w + r.d + 4 * (r.overhang ?? 0.5)) * r.parapet, 0);
  row(rf, 'parapet', 'Парапет плоской кровли', parapet, 'м²');
  // дымоходы — по высоте от пола этажа до верха над кровлей
  const chimneys = project.items.filter((it) => catalogItem(it.type)?.chimney && it.levelId !== SITE_LEVEL);
  row(rf, 'chimney', `Дымоход кирпичный${chimneys.length > 1 ? ` (${chimneys.length} шт)` : ''}`, chimneys.reduce((sum, it) => sum + Math.max(0, chimneyTop(project, it) - levelElevation(project, it.levelId)), 0), 'м');
  const roofWins = project.items.filter((it) => catalogItem(it.type)?.roofMount).length;
  row(rf, 'roof_window', 'Мансардные окна', roofWins, 'шт');

  // ── Отделка ──
  const fin = sec('Отделка');
  for (const [f, area] of outFinish) row(fin, f === 'plaster' ? 'facade' : `facade_${f}`, f === 'plaster' ? 'Фасад: утепление и декоративная штукатурка' : `Фасад: ${WALL_FINISHES[f].name.toLowerCase()}`, area, 'м²');
  // штукатурка и покраска — одной строкой, прочая отделка — по видам
  const plain = (inFinish.get('plaster') || 0) + (inFinish.get('paint') || 0);
  row(fin, 'int_finish', 'Стены внутри: штукатурка и покраска', plain, 'м²');
  for (const [f, area] of inFinish) if (f !== 'plaster' && f !== 'paint') row(fin, `int_${f}`, `Стены внутри: ${WALL_FINISHES[f].name.toLowerCase()}`, area, 'м²');
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
    walls: r2([...byType].reduce((sum, [id, q]) => sum + (WALL_TYPES[id].unit === 'm3' ? q : 0), 0)), // кладка, м³
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
