/** Автосохранение проекта в localStorage браузера. */
import { normalizeProject } from '../model/project.js';

const KEY = 'houseplan.project.v1';

export function loadSavedProject() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeProject(JSON.parse(raw)) : null;
  } catch (err) {
    console.warn('Не удалось прочитать сохранённый проект', err);
    return null;
  }
}

export function saveProject(project) {
  try {
    localStorage.setItem(KEY, JSON.stringify(project));
    return true;
  } catch (err) {
    console.warn('Не удалось сохранить проект', err);
    return false;
  }
}

/** Сохраняет проект через полсекунды после последнего изменения. */
export function setupAutosave(bus, store) {
  let timer = 0;
  bus.on('project:changed', ({ reason }) => {
    if (reason === 'gesture') return; // во время перетаскивания — не дёргаем хранилище
    clearTimeout(timer);
    timer = setTimeout(() => {
      const ok = saveProject(store.project);
      bus.emit('autosave', { ok, at: new Date() });
    }, 500);
  });
  window.addEventListener('beforeunload', () => saveProject(store.project));
}
