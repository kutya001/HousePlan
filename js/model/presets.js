/**
 * Пресеты: коробки, готовые дома с планировкой и размеры участков.
 * Каждый пресет дома строит новый проект через небольшой «строитель» B.
 */
import { createEmptyProject, rectPoints, SITE_LEVEL } from './project.js';
import { createWall, createRoom, createItem, createStair, createRoof, createZone } from './factories.js';
import { ensureLevel, addOpeningAt, addStackedBox } from './operations.js';
import { DEFAULTS } from './defaults.js';

const R = (x0, y0, x1, y1) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

/** Помощник для компактного описания домов. */
class B {
  constructor(name, opts = {}) {
    this.p = createEmptyProject(name);
    if (opts.foundation != null) this.p.foundation = opts.foundation;
    if (opts.height) this.p.levels[0].height = opts.height;
  }
  lv(i) {
    return ensureLevel(this.p, i).id;
  }
  loop(i, pts, opts = {}) {
    const out = [];
    for (let k = 0; k < pts.length; k++) {
      const w = createWall(this.lv(i), pts[k], pts[(k + 1) % pts.length], { kind: 'exterior', ...opts });
      this.p.walls.push(w);
      out.push(w);
    }
    return out;
  }
  wall(i, x1, y1, x2, y2, opts = {}) {
    const w = createWall(this.lv(i), { x: x1, y: y1 }, { x: x2, y: y2 }, { kind: 'interior', ...opts });
    this.p.walls.push(w);
    return w;
  }
  room(i, name, pts, floor = 'laminate') {
    this.p.rooms.push(createRoom(this.lv(i), pts, { name, floor }));
  }
  door(wall, x, y, opts = {}) {
    return addOpeningAt(this.p, wall, { x, y }, 'door', opts);
  }
  arch(wall, x, y, opts = {}) {
    return addOpeningAt(this.p, wall, { x, y }, 'arch', opts);
  }
  win(wall, x, y, opts = {}) {
    return addOpeningAt(this.p, wall, { x, y }, 'window', opts);
  }
  item(i, type, x, y, rotation = 0, opts = {}) {
    // предмет этажа — даже «садовый» (скамья в бане, машина в гараже) стоит на полу этажа
    this.p.items.push(createItem(this.lv(i), type, x, y, { rotation, onLevel: true, ...opts }));
  }
  out(type, x, y, rotation = 0, opts = {}) {
    this.p.items.push(createItem(SITE_LEVEL, type, x, y, { rotation, ...opts }));
  }
  stair(i, shape, x, y, rotation = 0, opts = {}) {
    this.p.stairs.push(createStair(this.lv(i), x, y, { shape, rotation, ...opts }));
  }
  roof(i, type, x, y, w, d, rotation = 0, opts = {}) {
    this.p.roofs.push(createRoof(this.lv(i), x, y, w, d, { type, rotation, ...opts }));
  }
  zone(material, pts) {
    this.p.zones.push(createZone(pts, material));
  }
  site(w, d, cx = 0, cy = 0) {
    this.p.site.boundary = rectPoints(cx - w / 2, cy - d / 2, w, d);
  }
}

/** Типовое оформление участка вокруг дома: дорожка, площадка у входа, деревья, грядки. */
function landscape(b, { entrance, siteW = 25, siteD = 40, front = 20, drive = true }) {
  b.site(siteW, siteD);
  const hw = siteW / 2;
  const hd = siteD / 2;
  b.zone('paving', R(entrance.x - 0.7, entrance.y, entrance.x + 0.7, front));
  if (drive) {
    b.zone('paving', R(hw - 6.5, front - 8, hw - 2, front));
    b.out('car', hw - 4.25, front - 4, 90);
  }
  b.out('tree', -hw + 3.5, -hd + 4);
  b.out('conifer', hw - 3, -hd + 3.5);
  b.out('fruit_tree', -hw + 3, front - 5);
  b.out('fruit_tree', -hw + 7, front - 3);
  b.out('bush', entrance.x - 2.2, front - 2);
  b.out('bush', entrance.x + 2.2, front - 2);
  b.zone('soil', R(-5, -hd + 2, 3, -hd + 6));
  b.out('gazebo', hw - 4.5, -hd + 10);
  b.out('bbq', hw - 4.5, -hd + 12.8, 0);
  b.out('flowerbed', -hw + 4, -2, 90);
}

// ── Пресеты домов ────────────────────────────────────────────────────────

function boxPreset(floors) {
  return (params) => {
    const { w, d, h } = params;
    const b = new B(floors > 1 ? `Коробка ${w}×${d}, ${floors} этажа` : `Коробка ${w}×${d}`, { height: h });
    for (let i = 1; i < floors; i++) ensureLevel(b.p, i).height = h;
    addStackedBox(b.p, b.p.levels[0].id, -w / 2, -d / 2, w, d, {
      floors,
      roof: floors > 1 ? 'gable' : 'none',
      roomName: 'Комната',
    });
    if (floors > 1 && w >= 3 && d >= 4.6) {
      const t = DEFAULTS.wall.exterior.thickness;
      b.stair(0, 'straight', -w / 2 + t / 2 + 0.55, -d / 2 + t / 2 + 1.85, 0);
    }
    b.site(25, 40);
    return b.p;
  };
}

function house9() {
  const b = new B('Дом 9×9 с планировкой');
  const [top, right, bottom, left] = b.loop(0, R(-4.5, -4.5, 4.5, 4.5));
  const iA = b.wall(0, -4.5, 0, 4.5, 0);
  const iB = b.wall(0, 1.5, 0, 1.5, 4.5);
  b.wall(0, 1.5, -4.5, 1.5, 0);
  const iD = b.wall(0, -0.5, -4.5, -0.5, 0);
  void iD;

  b.room(0, 'Кухня-гостиная', R(-4.5, 0, 1.5, 4.5), 'laminate');
  b.room(0, 'Прихожая', R(1.5, 0, 4.5, 4.5), 'tile');
  b.room(0, 'Спальня', R(-4.5, -4.5, -0.5, 0), 'parquet');
  b.room(0, 'Санузел', R(-0.5, -4.5, 1.5, 0), 'tile');
  b.room(0, 'Детская', R(1.5, -4.5, 4.5, 0), 'parquet');

  b.door(bottom, 3, 4.5, { width: 1.0 });
  b.door(iB, 1.5, 1.0);
  b.door(iA, 3, 0);
  b.door(iA, -2.5, 0);
  b.door(iA, 0.5, 0, { width: 0.8 });

  b.win(bottom, -3.2, 4.5, { width: 1.6 });
  b.win(bottom, -0.6, 4.5, { width: 1.6 });
  b.win(left, -4.5, 2.2);
  b.win(left, -4.5, -2.2);
  b.win(top, 0.5, -4.5, { width: 0.6, height: 0.6, sill: 1.5, style: 'single' });
  b.win(top, 3, -4.5);
  b.win(right, 4.5, -2.2, { width: 1.2 });
  b.win(right, 4.5, 3.4, { width: 0.9, style: 'single' });

  // Кухня-гостиная
  b.item(0, 'kitchen_counter', -4.0, 1.4, 270);
  b.item(0, 'fridge', -3.95, 3.1, 270);
  b.item(0, 'dining_table', -2.7, 2.0);
  for (const [x, y, r] of [
    [-3.1, 1.32, 0],
    [-2.3, 1.32, 0],
    [-3.1, 2.68, 180],
    [-2.3, 2.68, 180],
  ])
    b.item(0, 'chair', x, y, r);
  b.item(0, 'sofa', -1.0, 3.2, 270);
  b.item(0, 'coffee_table', 0.1, 3.2, 90);
  b.item(0, 'tv_stand', 1.215, 3.2, 90);
  b.item(0, 'rug', 0.1, 3.2, 90, { w: 2.0, d: 1.6 });
  // Спальня
  b.item(0, 'bed_double', -2.5, -3.25);
  b.item(0, 'nightstand', -3.65, -4.1);
  b.item(0, 'nightstand', -1.35, -4.1);
  b.item(0, 'wardrobe', -0.86, -1.6, 90);
  // Санузел
  b.item(0, 'bathtub', 0.5, -3.925);
  b.item(0, 'toilet', 1.09, -2.4, 90);
  b.item(0, 'washbasin', -0.215, -2.2, 270);
  b.item(0, 'washing_machine', -0.14, -1.2, 270);
  // Детская
  b.item(0, 'bed_single', 3.3, -3.0, 90);
  b.item(0, 'desk', 2.3, -3.975);
  b.item(0, 'office_chair', 1.95, -3.25, 180);
  b.item(0, 'wardrobe', 1.86, -1.5, 270);
  // Прихожая
  b.item(0, 'wardrobe', 4.0, 1.5, 90, { w: 1.6 });

  b.roof(0, 'gable', 0, 0, 9.4, 9.4, 0);
  b.zone('deck', R(-4.7, 4.7, 1.0, 7.2));
  landscape(b, { entrance: { x: 3, y: 4.7 } });
  return b.p;
}

function house2floors() {
  const b = new B('Двухэтажный дом 10×12');
  // 1 этаж
  const [top, right, bottom, left] = b.loop(0, R(-5, -6, 5, 6));
  const i1 = b.wall(0, -5, 1, 5, 1);
  const i2 = b.wall(0, 0, -6, 0, 1);
  b.wall(0, -5, -1.5, 0, -1.5);

  b.room(0, 'Кухня-гостиная', R(-5, 1, 5, 6), 'laminate');
  b.room(0, 'Гостевая', R(-5, -6, 0, -1.5), 'parquet');
  b.room(0, 'Санузел', R(-5, -1.5, 0, 1), 'tile');
  b.room(0, 'Холл', R(0, -6, 5, 1), 'tile');

  b.door(right, 5, -1, { width: 1.0 });
  b.arch(i1, 0.9, 1, { width: 1.2 });
  b.door(i2, 0, -0.25, { width: 0.8 });
  b.door(i2, 0, -2.3);
  b.win(bottom, -3, 6, { width: 2.4, style: 'panoramic', sill: 0.1, height: 2.2 });
  b.win(bottom, 2.5, 6, { width: 2.4, style: 'panoramic', sill: 0.1, height: 2.2 });
  b.win(left, -5, 3.5);
  b.win(left, -5, -3.8);
  b.win(left, -5, -0.25, { width: 0.6, height: 0.6, sill: 1.5, style: 'single' });
  b.win(top, 1.2, -6, { width: 0.9, style: 'single' });
  b.win(right, 5, 3.5);

  b.item(0, 'kitchen_counter', -3.5, 1.36);
  b.item(0, 'stove', -1.95, 1.36);
  b.item(0, 'fridge', -1.25, 1.41);
  b.item(0, 'kitchen_island', -3.2, 2.9);
  b.item(0, 'dining_table', -0.6, 3.8, 90);
  for (const [x, y, r] of [
    [-1.25, 3.4, 270],
    [-1.25, 4.2, 270],
    [0.05, 3.4, 90],
    [0.05, 4.2, 90],
  ])
    b.item(0, 'chair', x, y, r);
  b.item(0, 'sofa_corner', 3.2, 4.95, 180);
  b.item(0, 'coffee_table', 3.2, 3.3);
  b.item(0, 'tv_stand', 3.2, 1.285);
  b.item(0, 'plant', 4.4, 1.5);
  b.item(0, 'bed_double', -2.0, -4.75);
  b.item(0, 'nightstand', -3.15, -5.6);
  b.item(0, 'nightstand', -0.85, -5.6);
  b.item(0, 'wardrobe', -3.5, -1.86, 180);
  b.item(0, 'toilet', -4.45, -0.9, 270);
  b.item(0, 'washbasin', -2.5, -1.215);
  b.item(0, 'shower', -4.35, 0.49);
  b.item(0, 'washing_machine', -1.5, 0.64, 180);
  b.item(0, 'wardrobe', 4.5, 0.3, 90, { w: 1.2 });
  b.stair(0, 'U', 3.5, -4.2, 0);

  // 2 этаж
  const [t2, r2, b2, l2] = b.loop(1, R(-5, -6, 5, 6));
  const a = b.wall(1, -5, 1.5, 5, 1.5);
  b.wall(1, 0, 1.5, 0, 6);
  const c = b.wall(1, -5, 0, 0, 0);
  b.wall(1, -5, -1.5, 0, -1.5);
  const e = b.wall(1, 0, -6, 0, 0);

  b.room(1, 'Спальня', R(-5, 1.5, 0, 6), 'parquet');
  b.room(1, 'Детская', R(0, 1.5, 5, 6), 'parquet');
  b.room(1, 'Коридор', R(-5, 0, 0, 1.5), 'laminate');
  b.room(1, 'Ванная', R(-5, -1.5, 0, 0), 'tile');
  b.room(1, 'Спальня 2', R(-5, -6, 0, -1.5), 'parquet');
  b.room(1, 'Холл', R(0, -6, 5, 1.5), 'laminate');

  b.door(a, -2.5, 1.5);
  b.door(a, 2.5, 1.5);
  b.door(c, -2.5, 0, { width: 0.8 });
  b.door(e, 0, -3.5);
  b.win(b2, -2.5, 6, { width: 1.6 });
  b.win(b2, 2.5, 6, { width: 1.6 });
  b.win(l2, -5, 3.7);
  b.win(l2, -5, -3.8);
  b.win(l2, -5, -0.75, { width: 0.6, height: 0.6, sill: 1.5, style: 'single' });
  b.win(r2, 5, 3.7);
  b.win(r2, 5, -1, { width: 1.2 });
  b.win(t2, -2.5, -6);
  b.win(t2, 1.2, -6, { width: 0.9, style: 'single' });

  b.item(1, 'bed_double', -1.11, 3.8, 90);
  b.item(1, 'nightstand', -0.31, 2.55, 90);
  b.item(1, 'nightstand', -0.31, 5.05, 90);
  b.item(1, 'wardrobe', -4.0, 1.86, 0, { w: 1.6 });
  b.item(1, 'bed_single', 3.8, 4.4, 90);
  b.item(1, 'desk', 1.2, 5.475, 180);
  b.item(1, 'wardrobe', 0.36, 3.2, 270, { w: 1.6 });
  b.item(1, 'bed_double', -2.0, -4.75);
  b.item(1, 'dresser', -3.5, -1.81, 180);
  b.item(1, 'bathtub', -3.9, -1.065);
  b.item(1, 'toilet', -1.0, -0.41, 180);
  b.item(1, 'washbasin', -0.285, -1.0, 90);

  b.roof(1, 'hip', 0, 0, 12.4, 10.4, 90);
  b.zone('deck', R(-5.2, 6.2, 5.2, 8.6));
  landscape(b, { entrance: { x: 5.2, y: -1 }, siteW: 28, siteD: 42, front: 21 });
  // дорожка от бокового входа к фасаду
  b.zone('paving', R(5.2, -1.7, 7.4, -0.3));
  b.zone('paving', R(6.0, -0.3, 7.4, 21));
  return b.p;
}

function lHouse() {
  const b = new B('Г-образный дом');
  const ext = b.loop(0, [
    { x: -6, y: -4 },
    { x: 6, y: -4 },
    { x: 6, y: 2 },
    { x: 0, y: 2 },
    { x: 0, y: 7 },
    { x: -6, y: 7 },
  ]);
  const [top, right, inner, wingRight, wingBottom, left] = ext;
  const p1 = b.wall(0, 0, -4, 0, 2);
  const p2 = b.wall(0, -6, 2, 0, 2);
  b.room(0, 'Гостиная', R(0, -4, 6, 2), 'parquet');
  b.room(0, 'Кухня-столовая', R(-6, -4, 0, 2), 'tile');
  b.room(0, 'Спальня', R(-6, 2, 0, 7), 'parquet');
  b.door(inner, 4.9, 2, { width: 1.0 });
  b.arch(p1, 0, -1, { width: 1.4 });
  b.door(p2, -3, 2);
  b.win(top, 3, -4, { width: 2.0 });
  b.win(top, -3, -4, { width: 1.6 });
  b.win(right, 6, -1, { width: 1.8 });
  b.win(left, -6, -1);
  b.win(left, -6, 4.5);
  b.win(wingBottom, -3, 7, { width: 1.6 });
  b.win(wingRight, 0, 5, { width: 1.0 });

  b.item(0, 'sofa', 3, 1.3, 180);
  b.item(0, 'coffee_table', 3, 0.1);
  b.item(0, 'tv_stand', 3, -3.575);
  b.item(0, 'armchair', 5.0, 0.0, 270);
  b.item(0, 'kitchen_counter', -4.5, -3.5);
  b.item(0, 'fridge', -2.85, -3.45);
  b.item(0, 'dining_table', -3, -0.6);
  for (const [x, y, r] of [
    [-3.4, -1.25, 0],
    [-2.6, -1.25, 0],
    [-3.4, 0.05, 180],
    [-2.6, 0.05, 180],
  ])
    b.item(0, 'chair', x, y, r);
  b.item(0, 'bed_double', -4.25, 4.5, 270);
  b.item(0, 'wardrobe', -1.5, 6.5, 180);

  b.roof(0, 'gable', 0, -1, 12.4, 6.4, 0);
  b.roof(0, 'gable', -3, 3.0, 8.4, 6.4, 90);
  landscape(b, { entrance: { x: 4.9, y: 2.2 } });
  return b.p;
}

/** Дом с цокольным этажом и мансардой: три уровня, две лестницы, стены мансарды под скатами. */
function mansardHouse() {
  const b = new B('Дом 8×10 с мансардой и цоколем', { foundation: 1.2 });
  // 0 — цокольный, 1 — первый этаж, 2 — мансарда
  const [bTop, bRight, bBottom, bLeft] = b.loop(0, R(-4, -5, 4, 5));
  const [top, right, bottom, left] = b.loop(1, R(-4, -5, 4, 5));
  const [aTop, , aBottom] = b.loop(2, R(-4, -5, 4, 5));
  const [basement, ground, attic] = b.p.levels;
  Object.assign(basement, { name: 'Цокольный этаж', kind: 'basement', height: 2.4 });
  ground.name = '1 этаж';
  Object.assign(attic, { name: 'Мансарда', kind: 'attic', height: 2.5, kneeWall: 1.2 });
  void ground;

  // цокольный этаж: мастерская, котельная и кладовая; окна-продухи над землёй
  const bw = b.wall(0, -4, 0.5, 4, 0.5);
  b.wall(0, -0.5, -5, -0.5, 0.5);
  b.room(0, 'Мастерская', R(-4, 0.5, 4, 5), 'stone');
  b.room(0, 'Котельная', R(-4, -5, -0.5, 0.5), 'tile');
  b.room(0, 'Холл', R(-0.5, -5, 4, 0.5), 'stone');
  b.door(bw, 2.6, 0.5);
  b.door(b.p.walls.at(-1), -0.5, -1.2);
  for (const [w, x, y] of [
    [bBottom, -2, 5],
    [bBottom, 2, 5],
    [bLeft, -4, -2.5],
    [bRight, 4, 2.6],
  ])
    b.win(w, x, y, { width: 0.9, height: 0.55, sill: 1.6 });
  void bTop;
  b.item(0, 'boiler', -3.58, -2.5, 270);
  b.item(0, 'washing_machine', -3.4, -4.5, 0);
  b.item(0, 'box', 0, 4.4, 180, { w: 2.2, d: 0.7, h: 0.9, color: '#a77a52' });
  b.item(0, 'bookshelf', -3.62, 2.5, 270);
  b.stair(0, 'straight', 2.6, -2.2, 180);

  // первый этаж: гостиная, кухня, холл с двумя лестницами
  const p1 = b.wall(1, -4, 0.5, 4, 0.5);
  b.wall(1, 0, -5, 0, 0.5);
  b.room(1, 'Гостиная', R(-4, 0.5, 4, 5), 'parquet');
  b.room(1, 'Кухня-столовая', R(-4, -5, 0, 0.5), 'tile');
  b.room(1, 'Холл', R(0, -5, 4, 0.5), 'laminate');
  b.door(bottom, 2.5, 5, { width: 1.0 });
  b.door(p1, 2.6, 0.5);
  b.arch(p1, -3.3, 0.5, { width: 1.2 });
  b.win(bottom, -2, 5, { width: 1.8 });
  b.win(left, -4, 2.8);
  b.win(left, -4, -2.3);
  b.win(top, -2, -5);
  b.win(right, 4, -2.2, { width: 1.0 });
  b.win(right, 4, 2.8);
  b.item(1, 'sofa', -1.6, 4.27, 180);
  b.item(1, 'coffee_table', -1.6, 3.0);
  b.item(1, 'tv_stand', -1.6, 0.93);
  b.item(1, 'armchair', 1.2, 3.2, 270);
  b.item(1, 'kitchen_counter', -2.6, -4.5);
  b.item(1, 'fridge', -0.75, -4.45);
  b.item(1, 'dining_table', -2, -2);
  b.item(1, 'chair', -2.5, -1.3, 180);
  b.item(1, 'chair', -1.5, -1.3, 180);
  b.item(1, 'chair', -2.5, -2.7, 0);
  b.item(1, 'chair', -1.5, -2.7, 0);
  b.stair(1, 'straight', 0.9, -2.2, 180);

  // мансарда: спальня и кабинет, окна во фронтонах, двускатная крыша 40°
  const p2 = b.wall(2, -4, 0.5, 4, 0.5);
  b.wall(2, 0, -5, 0, 0.5);
  b.room(2, 'Спальня', R(-4, 0.5, 4, 5), 'parquet');
  b.room(2, 'Кабинет', R(-4, -5, 0, 0.5), 'laminate');
  b.room(2, 'Холл', R(0, -5, 4, 0.5), 'laminate');
  b.door(p2, 2.9, 0.5);
  b.door(b.p.walls.at(-1), 0, -4.3, { width: 0.8 });
  b.win(aBottom, 0, 5, { width: 1.6, height: 1.5, sill: 0.8 });
  b.win(aTop, -2, -5, { width: 1.0, height: 1.3, sill: 0.9 });
  b.win(aTop, 2.4, -5, { width: 0.8, height: 1.1, sill: 1.0 });
  b.item(2, 'bed_double', 0, 1.62, 0);
  b.item(2, 'nightstand', -1.25, 0.77, 0);
  b.item(2, 'nightstand', 1.25, 0.77, 0);
  b.item(2, 'wardrobe', -1.55, 4.5, 180, { h: 1.9 });
  b.item(2, 'desk', -2, -4.47);
  b.item(2, 'office_chair', -2, -3.7, 180);
  b.roof(2, 'gable', 0, 0, 10.4, 8.4, 90, { pitch: 40, overhang: 0.5 });

  landscape(b, { entrance: { x: 2.5, y: 7.5 }, front: 20 });
  return b.p;
}

function banya() {
  const b = new B('Баня 6×4', { height: 2.3, foundation: 0.3 });
  const [top, right, bottom, left] = b.loop(0, R(-3, -2, 3, 2), { thickness: 0.2 });
  const p1 = b.wall(0, 0.5, -2, 0.5, 2, { thickness: 0.12 });
  const p2 = b.wall(0, 0.5, 0, 3, 0, { thickness: 0.12 });
  b.room(0, 'Комната отдыха', R(-3, -2, 0.5, 2), 'parquet');
  b.room(0, 'Моечная', R(0.5, 0, 3, 2), 'tile');
  b.room(0, 'Парная', R(0.5, -2, 3, 0), 'parquet');
  b.door(bottom, -1.2, 2, { width: 0.9, height: 2.0 });
  b.door(p1, 0.5, 1, { width: 0.7, height: 1.9 });
  b.door(p2, 1.75, 0, { width: 0.7, height: 1.9 });
  b.win(left, -3, 0, { width: 1.0, height: 0.9, sill: 0.9 });
  b.win(top, -1.2, -2, { width: 1.0, height: 0.9, sill: 0.9 });
  b.win(right, 3, -1, { width: 0.5, height: 0.4, sill: 1.4, style: 'single' });
  b.win(bottom, 1.75, 2, { width: 0.5, height: 0.5, sill: 1.3, style: 'single' });
  b.item(0, 'dining_table', -1.5, -0.6, 0, { w: 1.4, d: 0.8 });
  b.item(0, 'bench', -1.5, -1.6, 0);
  b.item(0, 'bench', -1.5, 0.4, 180);
  b.item(0, 'shower', 2.45, 1.45);
  b.item(0, 'box', 1.75, -1.6, 0, { w: 2.3, d: 0.6, h: 0.9, color: '#c79a6b' });
  b.item(0, 'box', 2.6, -0.4, 0, { w: 0.6, d: 0.6, h: 1.0, color: '#3b3c3e' });
  b.roof(0, 'gable', 0, 0, 6.2, 4.2, 0, { pitch: 25, overhang: 0.4 });
  b.site(20, 30);
  b.zone('paving', R(-1.9, 2.1, -0.5, 15));
  b.zone('deck', R(-3.1, 2.1, 0.5, 3.6));
  b.out('tree', -6, -9);
  b.out('conifer', 6, -10);
  return b.p;
}

function garage() {
  const b = new B('Гараж 4×6', { height: 2.6, foundation: 0.1 });
  const [top, right, bottom, left] = b.loop(0, R(-2, -3, 2, 3), { thickness: 0.3 });
  b.room(0, 'Гараж', R(-2, -3, 2, 3), 'concrete');
  b.door(bottom, 0, 3, { style: 'garage', width: 2.8, height: 2.3 });
  b.door(right, 2, -1.8, { width: 0.9 });
  b.win(left, -2, -1, { width: 0.8, height: 0.6, sill: 1.4, style: 'single' });
  void top;
  b.item(0, 'car', 0, 0.2, 90);
  b.item(0, 'bookshelf', -1.65, -2.0, 270, { w: 1.6, d: 0.45 });
  b.roof(0, 'shed', 0, 0, 6.3, 4.3, 90, { pitch: 10, overhang: 0.3 });
  b.site(16, 25);
  b.zone('paving', R(-2, 3.2, 2, 12.5));
  return b.p;
}

export const HOUSE_PRESETS = [
  {
    id: 'box1',
    name: 'Коробка, 1 этаж',
    description: 'Четыре наружные стены и пол. Дальше — перегородки, окна и двери.',
    params: [
      { key: 'w', label: 'Ширина, м', value: 8, min: 2, max: 40, step: 0.1 },
      { key: 'd', label: 'Глубина, м', value: 10, min: 2, max: 40, step: 0.1 },
      { key: 'h', label: 'Высота этажа, м', value: 2.8, min: 2.1, max: 6, step: 0.05 },
    ],
    build: boxPreset(1),
  },
  {
    id: 'box2',
    name: 'Коробка, 2 этажа',
    description: 'Два одинаковых этажа, прямая лестница и двускатная крыша.',
    params: [
      { key: 'w', label: 'Ширина, м', value: 8, min: 3, max: 40, step: 0.1 },
      { key: 'd', label: 'Глубина, м', value: 10, min: 4.6, max: 40, step: 0.1 },
      { key: 'h', label: 'Высота этажа, м', value: 2.8, min: 2.1, max: 6, step: 0.05 },
    ],
    build: boxPreset(2),
  },
  { id: 'house9', name: 'Дом 9×9', description: 'Одноэтажный: кухня-гостиная, две спальни, санузел, прихожая, участок 10 соток.', build: house9 },
  { id: 'house2', name: 'Двухэтажный 10×12', description: 'П-образная лестница, 4 спальни, вальмовая крыша, терраса.', build: house2floors },
  { id: 'lhouse', name: 'Г-образный дом', description: 'Гостиная, кухня-столовая и спальня в крыле, две пересекающиеся крыши.', build: lHouse },
  {
    id: 'mansard',
    name: 'Дом с мансардой',
    description: 'Цокольный этаж с мастерской, первый этаж, мансарда под двускатной крышей 40°, две лестницы.',
    build: mansardHouse,
  },
  { id: 'banya', name: 'Баня 6×4', description: 'Комната отдыха, моечная и парная из бруса.', build: banya },
  { id: 'garage', name: 'Гараж 4×6', description: 'Секционные ворота, боковая дверь, односкатная крыша.', build: garage },
];

export const SITE_PRESETS = [
  { id: 's4', name: '4 сотки', w: 16, d: 25 },
  { id: 's6', name: '6 соток', w: 20, d: 30 },
  { id: 's8', name: '8 соток', w: 20, d: 40 },
  { id: 's10', name: '10 соток', w: 25, d: 40 },
  { id: 's12', name: '12 соток', w: 30, d: 40 },
  { id: 's15', name: '15 соток', w: 30, d: 50 },
  { id: 's20', name: '20 соток', w: 40, d: 50 },
];

export function buildHousePreset(id, params = {}) {
  const preset = HOUSE_PRESETS.find((p) => p.id === id);
  if (!preset) return null;
  const values = {};
  for (const prm of preset.params || []) values[prm.key] = Number(params[prm.key] ?? prm.value);
  return preset.build(values);
}

/** Прямоугольный участок с центром в центре текущего дома. */
export function siteRect(w, d, center = { x: 0, y: 0 }) {
  return rectPoints(center.x - w / 2, center.y - d / 2, w, d);
}
