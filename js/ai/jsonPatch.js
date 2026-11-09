/**
 * JSON Patch (RFC 6902) для правок проекта от ИИ-помощника.
 *
 * Операции: add, remove, replace, move, copy, test. Путь — JSON Pointer
 * ("/levels/0/rooms/2/name"). Одно расширение: элемент списка можно назвать
 * не номером, а значением его поля id ("/levels/0/furniture/f12/x") — ИИ не
 * приходится пересчитывать позиции, и номера не «съезжают» после удалений.
 * Документ не меняется: правки применяются к копии, при ошибке — исключение.
 */

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export class PatchError extends Error {
  constructor(message, index, op) {
    super(message);
    this.name = 'PatchError';
    this.index = index;
    this.op = op;
  }
}

/** "/a/b~1c/0" → ['a', 'b/c', '0'] */
export function parsePointer(path) {
  if (path === '' || path === '/') return [];
  if (typeof path !== 'string' || path[0] !== '/') throw new Error(`путь должен начинаться с «/»: ${JSON.stringify(path)}`);
  return path
    .slice(1)
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/** Номер элемента списка: число, «-» (в конец, только для add) или id элемента. */
function arrayIndex(arr, seg, { forAdd = false } = {}) {
  if (seg === '-') {
    if (forAdd) return arr.length;
    throw new Error('«-» можно использовать только в add');
  }
  if (/^\d+$/.test(seg)) {
    const i = Number(seg);
    if (i > arr.length || (!forAdd && i >= arr.length)) throw new Error(`в списке ${arr.length} элементов, номера ${i} нет`);
    return i;
  }
  const i = arr.findIndex((el) => el && typeof el === 'object' && String(el.id) === seg);
  if (i < 0) throw new Error(`элемента с id «${seg}» нет`);
  return i;
}

function child(node, seg) {
  if (Array.isArray(node)) return node[arrayIndex(node, seg)];
  if (node && typeof node === 'object') {
    if (!Object.prototype.hasOwnProperty.call(node, seg)) throw new Error(`поля «${seg}» нет`);
    return node[seg];
  }
  throw new Error(`«${seg}» — внутри не объект и не список`);
}

/** Родитель и последний сегмент пути. */
function locate(doc, path) {
  const segs = parsePointer(path);
  if (!segs.length) return { parent: null, key: null };
  let node = doc;
  for (const s of segs.slice(0, -1)) node = child(node, s);
  if (!node || typeof node !== 'object') throw new Error('путь ведёт внутрь значения, а не объекта');
  return { parent: node, key: segs[segs.length - 1] };
}

function getAt(doc, path) {
  let node = doc;
  for (const s of parsePointer(path)) node = child(node, s);
  return node;
}

function addAt(doc, path, value) {
  const { parent, key } = locate(doc, path);
  if (!parent) return value;
  if (Array.isArray(parent)) parent.splice(arrayIndex(parent, key, { forAdd: true }), 0, value);
  else parent[key] = value;
  return doc;
}

function removeAt(doc, path) {
  const { parent, key } = locate(doc, path);
  if (!parent) throw new Error('нельзя удалить весь проект');
  if (Array.isArray(parent)) return parent.splice(arrayIndex(parent, key), 1)[0];
  if (!Object.prototype.hasOwnProperty.call(parent, key)) throw new Error(`поля «${key}» нет`);
  const v = parent[key];
  delete parent[key];
  return v;
}

function replaceAt(doc, path, value) {
  const { parent, key } = locate(doc, path);
  if (!parent) return value;
  if (Array.isArray(parent)) parent[arrayIndex(parent, key)] = value;
  else parent[key] = value; // как и многие ИИ, разрешаем replace несуществующего поля — это add
  return doc;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Применить список правок к копии документа.
 * @returns новый документ
 * @throws PatchError — с номером правки и понятным текстом
 */
export function applyPatch(doc, ops) {
  if (!Array.isArray(ops)) throw new PatchError('patch должен быть списком правок', -1, null);
  let out = clone(doc);
  ops.forEach((op, i) => {
    try {
      if (!op || typeof op !== 'object') throw new Error('правка должна быть объектом');
      const { path } = op;
      switch (op.op) {
        case 'add':
          if (!('value' in op)) throw new Error('нет value');
          out = addAt(out, path, clone(op.value));
          break;
        case 'remove':
          removeAt(out, path);
          break;
        case 'replace':
          if (!('value' in op)) throw new Error('нет value');
          out = replaceAt(out, path, clone(op.value));
          break;
        case 'move': {
          if (typeof op.from !== 'string') throw new Error('нет from');
          if (path.startsWith(`${op.from}/`)) throw new Error('нельзя переместить элемент внутрь самого себя');
          const v = removeAt(out, op.from);
          out = addAt(out, path, v);
          break;
        }
        case 'copy':
          if (typeof op.from !== 'string') throw new Error('нет from');
          out = addAt(out, path, clone(getAt(out, op.from)));
          break;
        case 'test':
          if (!same(getAt(out, path), op.value)) throw new Error('значение не совпало');
          break;
        default:
          throw new Error(`неизвестная операция «${op.op}»`);
      }
    } catch (err) {
      throw new PatchError(`Правка ${i + 1} (${op?.op ?? '?'} ${op?.path ?? ''}): ${err.message}`, i, op);
    }
  });
  return out;
}
