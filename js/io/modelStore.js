/**
 * Свои 3D-модели (.glb): хранятся в IndexedDB браузера по id, в проекте —
 * только ссылка item.model. При сохранении в файл модели вкладываются в него
 * (base64), при открытии файла — снова раскладываются в хранилище.
 */
import { idbGet, idbSet } from './idb.js';

export const getModelRecord = (id) => idbGet('models', id);
export const putModelRecord = (id, rec) => idbSet('models', id, rec);

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out.buffer;
}

/** Модели, на которые ссылается проект, — для вложения в файл. */
export async function packModels(project) {
  const ids = [...new Set(project.items.filter((it) => it.model).map((it) => it.model))];
  const out = {};
  for (const id of ids) {
    const rec = await getModelRecord(id);
    if (rec?.data) out[id] = { name: rec.name, w: rec.w, d: rec.d, h: rec.h, data: toBase64(rec.data) };
  }
  return out;
}

/** Модели из файла проекта — в хранилище браузера. */
export async function unpackModels(models) {
  for (const [id, m] of Object.entries(models || {})) {
    if (!m?.data || typeof m.data !== 'string') continue;
    try {
      await putModelRecord(id, { name: m.name || 'Модель', w: m.w, d: m.d, h: m.h, data: fromBase64(m.data) });
    } catch (err) {
      console.warn('Не удалось сохранить модель', id, err);
    }
  }
}
