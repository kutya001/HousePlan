import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openingLook, doorLeaf, isGate, sidelightWidth, transomHeight, archRise, DOOR_SIZE } from '../../js/model/openings.js';
import { OPENING_STYLES, COLORS } from '../../js/model/defaults.js';
import { createOpening } from '../../js/model/factories.js';
import { computeEstimate, openingSchedule } from '../../js/model/estimate.js';
import { buildHousePreset } from '../../js/model/presets.js';
import { toExchange, importProject } from '../../js/io/exchange.js';
import { SCHEMAS } from '../../js/model/schemas.js';

const door = (o = {}) => ({ kind: 'door', style: 'single', width: 0.9, height: 2.1, sill: 0, ...o });
const rows = (p) => Object.fromEntries(computeEstimate(p).sections.flatMap((s) => s.rows).map((r) => [r.key, r]));

test('внешний вид проёма: умолчания не меняют старые проекты', () => {
  const d = openingLook(door());
  assert.deepEqual([d.leaf, d.leafColor, d.frameColor, d.glass, d.transom, d.side.n, d.gate], ['solid', COLORS.doorLeaf, COLORS.frame, null, 0, 0, false]);
  // раздвижная дверь и раньше была стеклянной
  assert.equal(doorLeaf(door({ style: 'sliding' })), 'glass');
  assert.equal(openingLook(door({ style: 'sliding' })).glass, 'full');
  assert.equal(doorLeaf(door({ style: 'sliding', leaf: 'panel' })), 'panel');
  assert.equal(doorLeaf(door({ leaf: 'нет такого' })), 'solid');
  const w = openingLook({ kind: 'window', style: 'double', width: 1.4, height: 1.4, sill: 0.85 });
  assert.deepEqual([w.grid, w.arched, w.frameColor], [false, false, COLORS.frame]);
  // свои цвета и негодные значения
  assert.equal(openingLook(door({ color: '#112233' })).leafColor, '#112233');
  assert.equal(openingLook(door({ color: 'red' })).leafColor, COLORS.doorLeaf);
  assert.equal(openingLook(door({ leaf: 'metal' })).leafColor, '#4b4f55');
});

test('ворота: три конструкции, без полотна, фрамуги и остекления', () => {
  for (const style of ['garage', 'garage_swing', 'garage_roll']) {
    const o = door({ style, width: 2.8, height: 2.3, leaf: 'glass', transom: 0.4, sidelight: 'both' });
    assert.ok(isGate(o), style);
    assert.ok(OPENING_STYLES.door[style]);
    assert.deepEqual(DOOR_SIZE[style], [2.8, 2.3]);
    const look = openingLook(o);
    assert.deepEqual([look.gate, look.glass, look.transom, look.side.n], [true, null, 0, 0]);
  }
  assert.ok(!isGate(door()) && !isGate({ kind: 'window', style: 'garage' }));
});

test('фрамуга и боковое остекление не съедают дверь', () => {
  assert.equal(transomHeight(door({ transom: 0.4, height: 2.5 })), 0.4);
  assert.ok(Math.abs(transomHeight(door({ transom: 0.8, height: 2.3 })) - 0.5) < 1e-9, 'полотно не ниже 1,8 м');
  assert.equal(transomHeight(door({ transom: 0.4, height: 1.8 })), 0);
  assert.equal(transomHeight({ kind: 'window', transom: 0.4, height: 2.5 }), 0);
  const both = sidelightWidth(door({ sidelight: 'both', width: 1.8 }));
  assert.deepEqual([both.n, both.left, both.right], [2, both.w, both.w]);
  assert.ok(1.8 - 2 * both.w >= 0.6);
  const left = sidelightWidth(door({ sidelight: 'left', width: 1.4 }));
  assert.ok(left.left > 0 && left.right === 0);
  assert.equal(sidelightWidth(door({ sidelight: 'both', width: 0.9 })).n, 0, 'узкая дверь остаётся без остекления');
  assert.equal(sidelightWidth(door({ sidelight: 'none' })).n, 0);
  // арка: полуциркульная, если хватает высоты, иначе пологая
  assert.equal(archRise(1.2, 2.4), 0.6);
  assert.ok(archRise(3, 2) < 1.5);
});

test('создание проёма: в модель попадает только заданное', () => {
  const plain = createOpening('w', 'door', {});
  assert.deepEqual(Object.keys(plain).filter((k) => ['leaf', 'color', 'frameColor', 'transom', 'sidelight', 'grid', 'arched'].includes(k)), []);
  const rich = createOpening('w', 'door', { leaf: 'glazed', transom: 0.3, sidelight: 'left', color: '#aabbcc' });
  assert.deepEqual([rich.leaf, rich.transom, rich.sidelight, rich.color], ['glazed', 0.3, 'left', '#aabbcc']);
  const win = createOpening('w', 'window', { grid: true, arched: false });
  assert.equal(win.grid, true);
  assert.equal('arched' in win, false);
});

test('формат для ИИ: вид дверей и окон без потерь, мусор отбрасывается', () => {
  const p = buildHousePreset('house9', {});
  const doors = p.openings.filter((o) => o.kind === 'door');
  const wins = p.openings.filter((o) => o.kind === 'window');
  Object.assign(doors[0], { leaf: 'metal', transom: 0.35, frameColor: '#333333' });
  Object.assign(doors[1], { style: 'fold', leaf: 'glass' });
  Object.assign(wins[0], { grid: true, arched: true });
  const x = toExchange(p, { ids: true });
  const all = x.levels.flatMap((l) => l.openings);
  const d0 = all.find((o) => o.leaf === 'metal');
  assert.deepEqual([d0.transom, d0.frameColor], [0.35, '#333333']);
  assert.ok(all.some((o) => o.style === 'fold' && o.leaf === 'glass'));
  assert.ok(all.some((o) => o.type === 'window' && o.grid && o.arched));
  // у обычных проёмов лишних полей нет
  const plain = all.find((o) => o.type === 'window' && !o.grid);
  assert.deepEqual(Object.keys(plain).filter((k) => ['leaf', 'color', 'frameColor', 'transom', 'sidelight', 'grid', 'arched'].includes(k)), []);
  const q = importProject(x).project;
  const pick = (o) => [o.kind, o.style, o.leaf, o.transom, o.sidelight, o.frameColor, !!o.grid, !!o.arched];
  const sort = (list) => list.map(pick).map((v) => JSON.stringify(v)).sort();
  assert.deepEqual(sort(q.openings), sort(p.openings));
  // ИИ прислал неизвестное полотно, цвет словом и раскладку двери — не ломаемся
  const lvl = x.levels[0];
  lvl.openings[0] = { ...lvl.openings[0], type: 'door', leaf: 'золотое', color: 'red', grid: true, sidelight: 'сверху', transom: 'большая' };
  const bad = importProject(x).project.openings.find((o) => o.kind === 'door');
  assert.ok(bad);
  const got = importProject(x).project.openings.filter((o) => o.kind === 'door' && (o.leaf === 'золотое' || o.color === 'red' || o.grid || o.sidelight === 'сверху'));
  assert.equal(got.length, 0);
});

test('смета и ведомость: двери по исполнению, ворота по конструкции', () => {
  const p = buildHousePreset('house9', {});
  const inner = p.openings.filter((o) => o.kind === 'door' && p.walls.find((w) => w.id === o.wallId).kind === 'interior');
  assert.ok(inner.length >= 3);
  const before = rows(p);
  inner[0].leaf = 'glass';
  inner[1].style = 'fold';
  const after = rows(p);
  assert.equal(after.door_glass.qty, 1);
  assert.equal(after.door_sliding.qty, 1);
  assert.equal(after.door_int.qty, before.door_int.qty - 2);
  // одинаковые по размеру двери с разным полотном — разные марки
  inner[2].leaf = 'solid';
  const twin = { ...inner[2], id: 'twin', leaf: 'panel' };
  p.openings.push(twin);
  const sched = openingSchedule(p);
  assert.notEqual(sched.marks.get(inner[2].id), sched.marks.get('twin'));
  assert.ok(sched.rows.some((r) => /полотно филёнчатое/.test(r.name)));
  assert.ok(sched.rows.some((r) => /полотно стеклянное/.test(r.name)));
  // ворота
  const g = buildHousePreset('garage', {});
  const gate = g.openings.find((o) => o.style === 'garage');
  assert.equal(rows(g).door_garage.qty, 1);
  gate.style = 'garage_roll';
  const r = rows(g);
  assert.equal(r.door_garage, undefined);
  assert.equal(r.gate_roll.qty, 1);
  assert.match(openingSchedule(g).rows.find((x) => x.mark.startsWith('В')).name, /рулонные/);
});

test('свойства проёма: поля видны по виду; смена конструкции на ворота ставит их размер', () => {
  const fields = SCHEMAS.opening;
  const shown = (o) => fields.filter((f) => !f.visible || f.visible(o, null)).map((f) => (typeof f.label === 'function' ? f.label(o) : f.label));
  const d = shown(door());
  for (const l of ['Полотно', 'Фрамуга над дверью', 'Остекление сбоку', 'Цвет полотна', 'Цвет коробки']) assert.ok(d.includes(l), l);
  assert.ok(!d.includes('Раскладка (шпросы)'));
  const w = shown({ kind: 'window', style: 'double', width: 1.4, height: 1.4, sill: 0.85 });
  for (const l of ['Раскладка (шпросы)', 'Арочный верх', 'Цвет рамы']) assert.ok(w.includes(l), l);
  assert.ok(!w.includes('Полотно') && !w.includes('Открывание на другую сторону'));
  const gate = shown(door({ style: 'garage_swing' }));
  assert.ok(gate.includes('Цвет ворот') && !gate.includes('Полотно') && !gate.includes('Фрамуга над дверью'));
  assert.ok(!shown(door({ leaf: 'glass' })).includes('Цвет полотна'), 'у стеклянной двери цвета полотна нет');
  const style = fields.find((f) => f.label === 'Конструкция');
  const o = door();
  style.set(o, 'garage_roll');
  assert.deepEqual([o.width, o.height], [2.8, 2.3]);
  style.set(o, 'single');
  assert.deepEqual([o.width, o.height], [0.9, 2.1]);
  const wide = door({ width: 1.1 });
  style.set(wide, 'double');
  assert.equal(wide.width, 1.1, 'между обычными дверями размер не трогаем');
});
