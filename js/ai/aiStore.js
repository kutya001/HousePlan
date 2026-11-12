/**
 * Ключ API, выбранная модель и переписка ИИ-помощника — только в этом браузере
 * (localStorage). В проект, файлы, варианты и репозиторий ключ не попадает.
 */

const KEY = 'houseplan.ai.key.v1';
const MODEL = 'houseplan.ai.model.v1';
const MODELS = 'houseplan.ai.models.v1';
const CHAT = 'houseplan.ai.chat.v1';
const EFFORT = 'houseplan.ai.effort.v1';
const WORKSPACE = 'houseplan.ai.workspace.v1';

/** Модели по умолчанию — пока ключ не проверен и список с сервера не получен. */
export const DEFAULT_MODELS = [
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', note: 'быстрая и толковая — лучший выбор' },
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', note: 'самая умная, медленнее и дороже' },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', note: 'самая быстрая и дешёвая, для простых правок' },
  { id: 'claude-fable-5-2', name: 'Claude Fable 5.2', note: 'для самых сложных домов; заметно дороже' },
];
export const DEFAULT_MODEL = DEFAULT_MODELS[0].id;

function read(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function write(k, v) {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
    return true;
  } catch {
    return false;
  }
}

export const getKey = () => (read(KEY) || '').trim();
export const setKey = (k) => write(KEY, String(k || '').trim() || null);
export const clearKey = () => write(KEY, null);

/** «sk-ant-api03-…» → «sk-ant-…x7Qa» */
export function maskKey(k) {
  const s = String(k || '');
  if (s.length < 12) return s ? '••••' : '';
  return `${s.slice(0, 7)}…${s.slice(-4)}`;
}

/** Похоже ли на ключ Anthropic (только грубая проверка перед сохранением). */
export const looksLikeKey = (k) => /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(String(k || '').trim());

export function getModels() {
  try {
    const list = JSON.parse(read(MODELS) || 'null');
    if (Array.isArray(list) && list.length) return list;
  } catch {
    /* испорчено — по умолчанию */
  }
  return DEFAULT_MODELS;
}

/** Список с сервера: только Claude, новые сверху; подписи — из списка по умолчанию. */
export function saveModels(list) {
  const known = new Map(DEFAULT_MODELS.map((m, i) => [m.id, { ...m, order: i }]));
  // текущие модели — первыми и в привычном порядке, остальные (прежние поколения) — после
  const out = (list || [])
    .filter((m) => /^claude-/.test(m.id))
    .map((m) => ({ id: m.id, name: m.name || m.id, note: known.get(m.id)?.note || '', ...(known.has(m.id) ? {} : { old: true }) }))
    .sort((a, b) => (known.get(a.id)?.order ?? 99) - (known.get(b.id)?.order ?? 99));
  write(MODELS, out.length ? JSON.stringify(out) : null);
  return out.length ? out : DEFAULT_MODELS;
}

export function getModel() {
  const m = read(MODEL);
  const list = getModels();
  if (m && list.some((x) => x.id === m)) return m;
  return list.find((x) => x.id === DEFAULT_MODEL)?.id || list.find((x) => /sonnet/.test(x.id))?.id || list[0].id;
}

export const setModel = (id) => write(MODEL, id);

/** Усилие модели: low | medium | high (по умолчанию — «Обычно»). */
export function getEffort() {
  const e = read(EFFORT);
  return ['low', 'medium', 'high'].includes(e) ? e : 'medium';
}
export const setEffort = (e) => write(EFFORT, e);

/** ID рабочего пространства — только для ключей, не привязанных к одному пространству. */
export const getWorkspace = () => (read(WORKSPACE) || '').trim();
export const setWorkspace = (id) => write(WORKSPACE, String(id || '').trim() || null);

/** Переписка: только текст (без фото и JSON проекта), последние 60 реплик. */
export function loadChat() {
  try {
    const list = JSON.parse(read(CHAT) || '[]');
    return Array.isArray(list) ? list.filter((m) => m && (m.role === 'user' || m.role === 'assistant')) : [];
  } catch {
    return [];
  }
}

export function saveChat(list) {
  const keep = ['role', 'text', 'images', 'applied', 'kind', 'stats', 'issues', 'issueCount', 'issueErrors', 'undone', 'error', 'usage'];
  const slim = list.slice(-60).map((m) => Object.fromEntries(keep.filter((k) => m[k] !== undefined).map((k) => [k, m[k]])));
  write(CHAT, slim.length ? JSON.stringify(slim) : null);
}
