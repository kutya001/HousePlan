/**
 * Маленькое хранилище «ключ → значение» в IndexedDB: варианты проекта и свои
 * 3D-модели (они крупнее, чем помещается в localStorage). Без IndexedDB
 * (приватный режим, старый браузер) — в памяти до перезагрузки.
 */
const DB = 'houseplan';
const VERSION = 1;
const STORES = ['variants', 'models'];

let dbPromise = null;
const memory = new Map(STORES.map((s) => [s, new Map()]));

function open() {
  if (!('indexedDB' in globalThis)) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB, VERSION);
        req.onupgradeneeded = () => {
          for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function idbGet(store, key) {
  const db = await open();
  if (!db) return memory.get(store).get(key);
  return tx(db, store, 'readonly', (s) => s.get(key));
}

export async function idbSet(store, key, value) {
  const db = await open();
  if (!db) return void memory.get(store).set(key, value);
  await tx(db, store, 'readwrite', (s) => s.put(value, key));
}

export async function idbDel(store, key) {
  const db = await open();
  if (!db) return void memory.get(store).delete(key);
  await tx(db, store, 'readwrite', (s) => s.delete(key));
}

/** Все значения хранилища: [{ key, value }]. */
export async function idbAll(store) {
  const db = await open();
  if (!db) return [...memory.get(store)].map(([key, value]) => ({ key, value }));
  const [keys, values] = await Promise.all([tx(db, store, 'readonly', (s) => s.getAllKeys()), tx(db, store, 'readonly', (s) => s.getAll())]);
  return keys.map((key, i) => ({ key, value: values[i] }));
}
