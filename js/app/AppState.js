/**
 * Состояние интерфейса (не попадает в файл проекта и в историю):
 * активный этаж, выделение, инструмент, режим вида, настройки отображения.
 */
import { getEntity, getLevel } from '../model/project.js';

const SETTINGS_KEY = 'houseplan.settings.v1';

const DEFAULT_SETTINGS = {
  snap: true, // привязки
  dims: true, // размеры на плане
  lowerLevel: true, // показывать этаж ниже полупрозрачным
  roofs2d: true, // контуры крыш на плане
  roofs3d: true, // крыши в 3D
  cutaway: false, // в 3D скрывать этажи выше активного
  edges: true, // контуры граней в 3D
  shadows: true,
  furniture3d: true,
};

export class AppState {
  constructor(bus, store) {
    this.bus = bus;
    this.store = store;
    this.activeLevelId = store.project.levels[0].id;
    this.selection = [];
    this.hover = null;
    this.toolId = 'select';
    this.viewMode = 'plan';
    this.settings = { ...DEFAULT_SETTINGS, ...loadSettings() };
    bus.on('project:changed', () => this._validate());
  }

  get project() {
    return this.store.project;
  }

  get level() {
    return getLevel(this.project, this.activeLevelId) || this.project.levels[0];
  }

  setLevel(levelId) {
    if (!getLevel(this.project, levelId) || levelId === this.activeLevelId) return;
    this.activeLevelId = levelId;
    this.selection = [];
    this.bus.emit('level:changed', { levelId });
    this.bus.emit('selection:changed', { selection: this.selection });
  }

  setSelection(list) {
    this.selection = list.filter(Boolean);
    this.bus.emit('selection:changed', { selection: this.selection });
  }

  select(ref, additive = false) {
    if (!ref) {
      if (!additive) this.setSelection([]);
      return;
    }
    if (additive) {
      const exists = this.isSelected(ref.kind, ref.id);
      this.setSelection(exists ? this.selection.filter((s) => !(s.kind === ref.kind && s.id === ref.id)) : [...this.selection, ref]);
    } else {
      this.setSelection([ref]);
    }
  }

  clearSelection() {
    if (this.selection.length) this.setSelection([]);
  }

  isSelected(kind, id) {
    return this.selection.some((s) => s.kind === kind && s.id === id);
  }

  get primary() {
    return this.selection.length === 1 ? this.selection[0] : null;
  }

  setHover(ref) {
    const same = ref?.kind === this.hover?.kind && ref?.id === this.hover?.id;
    if (same) return false;
    this.hover = ref;
    return true;
  }

  setTool(id) {
    if (this.toolId === id) return;
    this.toolId = id;
    this.bus.emit('tool:changed', { toolId: id });
  }

  setViewMode(mode) {
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    this.bus.emit('view:changed', { viewMode: mode });
  }

  setSetting(key, value) {
    this.settings[key] = value;
    saveSettings(this.settings);
    this.bus.emit('settings:changed', { key, value });
  }

  _validate() {
    if (!getLevel(this.project, this.activeLevelId)) {
      this.activeLevelId = this.project.levels[0].id;
      this.bus.emit('level:changed', { levelId: this.activeLevelId });
    }
    const before = this.selection.length;
    this.selection = this.selection.filter((s) => getEntity(this.project, s.kind, s.id));
    if (this.selection.length !== before) this.bus.emit('selection:changed', { selection: this.selection });
  }
}

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* хранилище недоступно — не критично */
  }
}
