/**
 * Загрузка своих моделей .glb (GLTFLoader из three/addons): разбор файла,
 * приведение к «низ по центру на нуле», кэш в памяти для пересборки сцены.
 */
import * as THREE from 'three';
import { getModelRecord, putModelRecord } from '../io/modelStore.js';
import { uid } from '../core/ids.js';

const ready = new Map(); // id → Object3D (нормализованная)
const pending = new Map();
const listeners = new Set();

/** Подписка: модель догрузилась — сцену стоит пересобрать. */
export function onModelLoaded(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const modelReady = (id) => ready.get(id) || null;

async function parse(buffer) {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  return new Promise((resolve, reject) => new GLTFLoader().parse(buffer, '', (gltf) => resolve(gltf.scene), (err) => reject(err instanceof Error ? err : new Error(String(err?.message || err)))));
}

/** Центр по X/Z, низ на нуле; размеры — в userData.size (метры). */
function normalize(obj) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const wrap = new THREE.Group();
  obj.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));
  wrap.add(obj);
  wrap.userData.size = { w: Math.max(size.x, 0.01), d: Math.max(size.z, 0.01), h: Math.max(size.y, 0.01) };
  wrap.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return wrap;
}

/** Догрузить модель из хранилища (асинхронно), потом позвать подписчиков. */
export function requestModel(id) {
  if (!id || ready.has(id) || pending.has(id)) return;
  const p = (async () => {
    const rec = await getModelRecord(id);
    if (!rec?.data) return;
    ready.set(id, normalize(await parse(rec.data)));
    for (const fn of listeners) fn(id);
  })()
    .catch((err) => console.warn('Модель не загрузилась', id, err))
    .finally(() => pending.delete(id));
  pending.set(id, p);
}

/**
 * Импорт файла .glb: проверка, размеры, запись в хранилище.
 * @returns {{ id, name, w, d, h }}
 */
export async function importModelFile(file) {
  const data = await file.arrayBuffer();
  let obj;
  try {
    obj = normalize(await parse(data));
  } catch (err) {
    throw new Error(`Не удалось прочитать модель: ${err.message}. Нужен файл .glb (glTF 2.0, без Draco-сжатия)`);
  }
  let { w, d, h } = obj.userData.size;
  // модели в сантиметрах или миллиметрах — к метрам
  let k = 1;
  const big = Math.max(w, d, h);
  if (big > 60) k = big > 6000 ? 0.001 : 0.01;
  w *= k;
  d *= k;
  h *= k;
  const id = uid('model');
  const name = file.name.replace(/\.(glb|gltf)$/i, '').slice(0, 60) || 'Модель';
  await putModelRecord(id, { name, w, d, h, data });
  ready.set(id, obj);
  return { id, name, w: round(w), d: round(d), h: round(h) };
}

const round = (v) => Math.round(v * 1000) / 1000;
