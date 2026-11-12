import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScope, describeTarget, checkScope, trimToScope, growScope, retarget, scopeText } from '../../js/ai/scope.js';
import { snapshotProject } from '../../js/ai/assistant.js';
import { runTurn } from '../../js/ai/agent.js';
import { applyPatch } from '../../js/ai/jsonPatch.js';
import { toExchange, importProject } from '../../js/io/exchange.js';
import { buildHousePreset } from '../../js/model/presets.js';
import { SITE_LEVEL } from '../../js/model/project.js';
import { sseStream, fakeFetch } from '../sse.mjs';

const house = () => buildHousePreset('house2', {});
const room = (p, name) => p.rooms.find((r) => r.name === name);
const patched = (snap, patch) => applyPatch(snap.exchange, patch);

test('область: названия для человека', () => {
  const p = house();
  assert.equal(describeTarget(p, { levelId: p.levels[1].id }), 'этаж «2 этаж»');
  assert.equal(describeTarget(p, { levelId: SITE_LEVEL }), 'участок');
  assert.equal(describeTarget(p, { selection: [{ kind: 'room', id: room(p, 'Гостевая').id }] }), 'комната «Гостевая»');
  assert.equal(describeTarget(p, { selection: [{ kind: 'wall', id: p.walls[0].id }] }), 'стена');
  assert.equal(describeTarget(p, { selection: p.walls.slice(0, 3).map((w) => ({ kind: 'wall', id: w.id })).concat([{ kind: 'item', id: p.items[0].id }]) }), 'выделенное: 3 стены, 1 предмет');
  // удалённые объекты и этажи — области нет
  assert.equal(describeTarget(p, { selection: [{ kind: 'room', id: 'нет-такой' }] }), null);
  assert.equal(describeTarget(p, { levelId: 'нет-такого' }), null);
  assert.equal(describeTarget(p, null), null);
});

test('область «комната»: её стены, проёмы и мебель; правки внутри проходят, снаружи — нет', () => {
  const p = house();
  const kitchen = room(p, 'Кухня-гостиная');
  const snap = snapshotProject(p, { scope: { selection: [{ kind: 'room', id: kitchen.id }] } });
  const part = snap.scope.parts[0];
  assert.deepEqual(Object.keys(snap.scope.parts), ['0']);
  assert.ok(part.rooms.has('r1'));
  assert.ok(part.walls.size >= 3 && part.walls.size < snap.exchange.levels[0].walls.length);
  const inside = [...part.furniture];
  const outside = snap.exchange.levels[0].furniture.map((f) => f.id).filter((id) => !part.furniture.has(id));
  assert.ok(inside.length && outside.length);
  assert.match(snap.context, /ОБЛАСТЬ ЗАДАНИЯ: комната «Кухня-гостиная»/);
  assert.doesNotMatch(snap.context, /ВЫДЕЛЕНО НА ПЛАНЕ/);
  const check = (patch) => checkScope(snap.exchange, patched(snap, patch), snap.scope);

  // внутри: подвинуть и удалить свою мебель, сменить пол, добавить предмет в комнату, окно в свою стену
  const c = kitchen.points.reduce((a, q) => ({ x: a.x + q.x / kitchen.points.length, y: a.y + q.y / kitchen.points.length }), { x: 0, y: 0 });
  const myWall = [...part.walls][0];
  check([
    { op: 'replace', path: `/levels/0/furniture/${inside[0]}/rotation`, value: 90 },
    { op: 'remove', path: `/levels/0/furniture/${inside[1]}` },
    { op: 'replace', path: '/levels/0/rooms/r1/floor', value: 'tile' },
    { op: 'add', path: '/levels/0/furniture/-', value: { type: 'armchair', x: c.x, y: c.y, rotation: 0 } },
    { op: 'add', path: '/levels/0/openings/-', value: { wall: myWall, type: 'window', offset: 0.9, width: 0.6, height: 1.2 } },
  ]);

  // снаружи: чужая мебель, чужая комната, другой этаж, участок, свойства проекта, новый предмет мимо комнаты
  assert.throws(() => check([{ op: 'replace', path: `/levels/0/furniture/${outside[0]}/x`, value: 0 }]), new RegExp(`изменён ${outside[0]}`));
  assert.throws(() => check([{ op: 'remove', path: `/levels/0/furniture/${outside[0]}` }]), /удалён/);
  assert.throws(() => check([{ op: 'replace', path: '/levels/0/rooms/r2/floor', value: 'tile' }]), /комната r2/);
  assert.throws(() => check([{ op: 'replace', path: '/levels/1/rooms/0/name', value: 'X' }]), /этаж вне области/);
  assert.throws(() => check([{ op: 'replace', path: '/site/fence', value: false }]), /участка/);
  assert.throws(() => check([{ op: 'replace', path: '/foundation', value: 1 }]), /общие свойства/);
  assert.throws(() => check([{ op: 'add', path: '/levels/0/furniture/-', value: { type: 'armchair', x: c.x + 40, y: c.y, rotation: 0 } }]), /вне области/);
  assert.throws(() => check([{ op: 'add', path: '/levels/-', value: { name: 'Ещё', walls: [] } }]), /этажи/);
  assert.throws(() => check([{ op: 'copy', from: `/levels/0/furniture/${outside[0]}`, path: '/levels/0/furniture/-' }]), /вне области/);
  // в сообщении об ошибке — название области
  assert.throws(() => check([{ op: 'replace', path: '/foundation', value: 1 }]), /область задания \(комната «Кухня-гостиная»\)/);
});

test('область «этаж»: внутри можно всё, другие этажи и участок — нельзя; JSON остальных этажей сокращён', () => {
  const p = house();
  const snap = snapshotProject(p, { scope: { levelId: p.levels[1].id }, activeLevelId: p.levels[1].id });
  assert.equal(snap.scope.label, 'этаж «2 этаж»');
  const check = (patch) => checkScope(snap.exchange, patched(snap, patch), snap.scope);
  check([
    { op: 'remove', path: '/levels/1/furniture/0' },
    { op: 'replace', path: '/levels/1/height', value: 3 },
    { op: 'add', path: '/levels/1/walls/-', value: { id: 'w90', from: [0, 0], to: [1, 0], type: 'interior', thickness: 0.1 } },
  ]);
  assert.throws(() => check([{ op: 'remove', path: '/levels/0/furniture/0' }]), /этаж вне области/);
  assert.throws(() => check([{ op: 'remove', path: '/outdoor/0' }]), /участок/);
  assert.throws(() => check([{ op: 'replace', path: '/levels/1/kind', value: 'attic' }]), /вид этажа/);
  // отправленный JSON: чужой этаж — только стены и лестницы, свой — целиком; номера этажей те же
  const sent = JSON.parse(snap.json);
  assert.equal(sent.levels.length, 2);
  assert.equal(sent.levels[0].furniture, undefined);
  assert.equal(sent.levels[0].walls.length, snap.exchange.levels[0].walls.length);
  assert.match(sent.levels[0].hidden, /вне области/);
  assert.deepEqual(sent.levels[1], snap.exchange.levels[1]);
  assert.ok(snap.json.length < JSON.stringify(snap.exchange).length);
  assert.deepEqual(trimToScope(snap.exchange, snap.scope).outdoor, snap.exchange.outdoor);
});

test('область «участок» и «выделенные объекты»', () => {
  const p = house();
  const site = snapshotProject(p, { scope: { levelId: SITE_LEVEL } });
  assert.equal(site.scope.label, 'участок');
  const onSite = (patch) => checkScope(site.exchange, patched(site, patch), site.scope);
  onSite([{ op: 'remove', path: '/outdoor/0' }, { op: 'replace', path: '/site/fenceHeight', value: 2 }, { op: 'add', path: '/zones/-', value: { material: 'paving', points: [[0, 0], [1, 0], [1, 1]] } }]);
  assert.throws(() => onSite([{ op: 'remove', path: '/levels/0/furniture/0' }]), /этаж вне области/);
  assert.match(scopeText(site.scope, site.exchange), /участок целиком/);

  // одна стена: можно менять её и её проёмы, добавить в неё окно; двигать мебель — нельзя
  const wall = p.walls.find((w) => w.levelId === p.levels[0].id && p.openings.some((o) => o.wallId === w.id));
  const one = snapshotProject(p, { scope: { selection: [{ kind: 'wall', id: wall.id }] } });
  const part = one.scope.parts[0];
  const wid = [...part.walls][0];
  assert.equal(part.walls.size, 1);
  assert.ok(part.openings.size >= 1);
  const onWall = (patch) => checkScope(one.exchange, patched(one, patch), one.scope);
  onWall([{ op: 'replace', path: `/levels/0/walls/${wid}/material`, value: 'brick' }, { op: 'replace', path: `/levels/0/openings/${[...part.openings][0]}/width`, value: 1.1 }]);
  assert.throws(() => onWall([{ op: 'replace', path: '/levels/0/furniture/0/x', value: 0 }]), /вне области/);
  assert.throws(() => onWall([{ op: 'add', path: '/levels/0/furniture/-', value: { type: 'sofa', x: 0, y: 0 } }]), /вне области/);

  // объект участка
  const tree = p.items.find((i) => i.levelId === SITE_LEVEL);
  const obj = snapshotProject(p, { scope: { selection: [{ kind: 'item', id: tree.id }] } });
  const gid = [...obj.scope.parts.site.outdoor][0];
  const onObj = (patch) => checkScope(obj.exchange, patched(obj, patch), obj.scope);
  onObj([{ op: 'replace', path: `/outdoor/${gid}/x`, value: 3 }]);
  assert.throws(() => onObj([{ op: 'add', path: '/outdoor/-', value: { type: 'tree', x: 1, y: 1 } }]), /только выбранные/);
  assert.throws(() => onObj([{ op: 'replace', path: '/site/fence', value: false }]), /участка/);
});

test('id элементов сохраняются между шагами: удаление не сдвигает номера, новые получают свободные', () => {
  const p = house();
  const a = toExchange(p, { ids: true });
  const lv = a.levels[0];
  const gone = lv.furniture[2].id;
  const data = applyPatch(a, [
    { op: 'remove', path: `/levels/0/furniture/${gone}` },
    { op: 'remove', path: `/levels/0/walls/${lv.walls.at(-1).id}` },
    { op: 'add', path: '/levels/0/furniture/-', value: { type: 'sofa', x: 0, y: 0 } },
    { op: 'add', path: '/levels/0/walls/-', value: { id: 'w77', from: [0, 0], to: [0, 1], type: 'interior', thickness: 0.1 } },
  ]);
  const { project, sourceIds } = importProject(data);
  const idMap = new Map();
  const b = toExchange(project, { ids: true, keep: sourceIds, idMap });
  const ids = (list) => list.map((e) => e.id);
  assert.deepEqual(ids(b.levels[0].furniture).slice(0, -1), ids(lv.furniture).filter((id) => id !== gone));
  const fresh = b.levels[0].furniture.at(-1).id;
  assert.ok(/^f\d+$/.test(fresh) && !ids(a.levels.flatMap((l) => l.furniture)).includes(fresh), 'новый предмет — со свободным id');
  assert.deepEqual(ids(b.levels[0].walls), [...ids(lv.walls).slice(0, -1), 'w77']);
  assert.deepEqual(ids(b.levels[1].rooms), ids(a.levels[1].rooms));
  assert.deepEqual(b.levels[0].openings.map((o) => [o.id, o.wall]), lv.openings.filter((o) => o.wall !== lv.walls.at(-1).id).map((o) => [o.id, o.wall]));
  assert.equal(new Set([...idMap.values()].filter((r) => r.level === 0 && /^[frsok]/.test(r.id)).map((r) => r.id)).size, b.levels[0].furniture.length + b.levels[0].rooms.length + b.levels[0].stairs.length + b.levels[0].openings.length + b.levels[0].roofs.length);
  // без keep — прежняя сквозная нумерация
  const c = toExchange(project, { ids: true });
  assert.equal(c.levels[0].walls.at(-1).id, `w${c.levels[0].walls.length}`);
  // негодные id (число, знаки пути, повтор) заменяются
  const odd = importProject({ levels: [{ walls: [{ id: '5', from: [0, 0], to: [4, 0] }, { id: 'a/b', from: [4, 0], to: [4, 4] }, { id: 'w9', from: [4, 4], to: [0, 4] }, { id: 'w9', from: [0, 4], to: [0, 0] }] }] });
  const o = toExchange(odd.project, { ids: true, keep: odd.sourceIds });
  assert.deepEqual(ids(o.levels[0].walls), ['w10', 'w11', 'w9', 'w12']);
});

test('ход с областью: выход за область возвращается Claude, область переносится на новый проект', async () => {
  const p = house();
  const guest = room(p, 'Гостевая');
  const snap = snapshotProject(p, { scope: { selection: [{ kind: 'room', id: guest.id }] } });
  const part = snap.scope.parts[0];
  const rid = [...part.rooms][0];
  const other = snap.exchange.levels[0].rooms.find((r) => r.id !== rid).id;
  const c = guest.points.reduce((a, q) => ({ x: a.x + q.x / guest.points.length, y: a.y + q.y / guest.points.length }), { x: 0, y: 0 });
  const wrong = { summary: 'Плитка везде', patch: [{ op: 'replace', path: `/levels/0/rooms/${other}/floor`, value: 'tile' }] };
  const right = { summary: 'Плитка и кресло в гостевой', patch: [{ op: 'replace', path: `/levels/0/rooms/${rid}/floor`, value: 'tile' }, { op: 'add', path: '/levels/0/furniture/-', value: { type: 'armchair', x: c.x, y: c.y } }] };
  const more = { summary: 'Кресло повернул', patch: [] };
  const f = fakeFetch([
    { sse: sseStream({ text: 'Строю заново.', tool: 'build_project', input: { summary: 'x', project: { levels: [] } }, id: 't0' }) },
    { sse: sseStream({ text: 'Меняю пол.', tool: 'edit_project', input: wrong, id: 't1' }) },
    { sse: sseStream({ text: 'Только гостевая.', tool: 'edit_project', input: right, id: 't2' }) },
    { sse: sseStream({ text: 'Поворачиваю кресло.', tool: 'edit_project', input: more, id: 't3' }) },
    { sse: sseStream({ text: 'Готово.' }) },
  ]);
  // третий шаг адресует кресло по id, который оно получило после второго
  let target = null;
  const res = await runTurn({
    key: 'k',
    model: 'm',
    text: 'плитку и кресло',
    snapshot: snap,
    fetchImpl: f,
    onStep: (st) => {
      target = st.target;
      const json = toExchange(st.project, { ids: true });
      const chair = json.levels[0].furniture.at(-1);
      more.patch.push({ op: 'replace', path: `/levels/0/furniture/${chair.id}/rotation`, value: 45 });
    },
  });
  assert.equal(res.steps.length, 1, 'пустой набор правок шагом не считается');
  assert.match(f.calls[1].body.messages.at(-1).content[0].content, /только edit_project/);
  const rejected = f.calls[2].body.messages.at(-1).content[0];
  assert.equal(rejected.is_error, true);
  assert.match(rejected.content, /выходит за область задания \(комната «Гостевая»\)/);
  // Claude видит сокращённый JSON и после шага
  const after = f.calls[3].body.messages.at(-1).content[0].content;
  assert.match(after, /этаж вне области/);
  // область в новом проекте — та же комната
  assert.deepEqual(res.target, target);
  assert.equal(res.target.selection.length, 1);
  const again = res.project.rooms.find((r) => r.id === res.target.selection[0].id);
  assert.equal(again.name, 'Гостевая');
  assert.equal(again.floor, 'tile');
  assert.equal(res.project.items.length, p.items.length + 1);
  // и новый предмет вошёл в область: следующий шаг может его менять
  const next = snapshotProject(res.project, { scope: res.target });
  const chairId = toExchange(res.project, { ids: true }).levels[0].furniture.at(-1).id;
  assert.ok(next.scope.parts[0].furniture.has(chairId));
});

test('область растёт вместе с правками: новое в комнате можно менять на следующем шаге', () => {
  const p = house();
  const guest = room(p, 'Гостевая');
  const idMap = new Map();
  const before = toExchange(p, { ids: true, idMap });
  const scope = buildScope(p, { selection: [{ kind: 'room', id: guest.id }] }, idMap);
  const c = guest.points.reduce((a, q) => ({ x: a.x + q.x / guest.points.length, y: a.y + q.y / guest.points.length }), { x: 0, y: 0 });
  const data = applyPatch(before, [{ op: 'add', path: '/levels/0/furniture/-', value: { type: 'armchair', x: c.x, y: c.y } }]);
  checkScope(before, data, scope);
  const { project, sourceIds } = importProject(data);
  const map2 = new Map();
  const after = toExchange(project, { ids: true, keep: sourceIds, idMap: map2 });
  const chair = after.levels[0].furniture.at(-1).id;
  assert.ok(!scope.parts[0].furniture.has(chair));
  growScope(scope, before, after);
  assert.ok(scope.parts[0].furniture.has(chair));
  checkScope(after, applyPatch(after, [{ op: 'replace', path: `/levels/0/furniture/${chair}/rotation`, value: 90 }]), scope);
  assert.equal(retarget(scope, project, map2).selection[0].kind, 'room');
  // этаж целиком переносится по номеру
  const lvl = buildScope(p, { levelId: p.levels[1].id }, idMap);
  assert.deepEqual(retarget(lvl, project, map2), { levelId: project.levels[1].id });
});
