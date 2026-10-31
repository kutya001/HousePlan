/**
 * Корень приложения: создаёт хранилище, состояние, редактор, 3D-вид и интерфейс
 * и связывает их через шину событий. 3D загружается лениво — при первом показе.
 */
import { EventBus } from '../core/EventBus.js';
import { Store } from '../core/Store.js';
import { AppState } from './AppState.js';
import { Commands } from './commands.js';
import { ProjectChecks } from './checks.js';
import { FileActions } from './fileActions.js';
import { setupShortcuts } from './shortcuts.js';
import { buildContextItems, contextTitle } from './contextActions.js';
import { setupPWA } from './pwa.js';
import { createEmptyProject } from '../model/project.js';
import { loadSavedProject, setupAutosave } from '../io/storage.js';
import { Editor2D } from '../editor/Editor2D.js';
import { applyCanvasTheme } from '../editor/render/theme.js';
import { createToaster, confirmDialog } from '../ui/feedback.js';
import { ExchangeDialog } from '../ui/ExchangeDialog.js';
import { openMenu } from '../ui/ContextMenu.js';
import { TopBar } from '../ui/TopBar.js';
import { Toolbar, BottomBar } from '../ui/Toolbar.js';
import { ToolOptionsBar } from '../ui/ToolOptionsBar.js';
import { SidePanel } from '../ui/SidePanel.js';
import { StatusBar } from '../ui/StatusBar.js';
import { EmptyState } from '../ui/EmptyState.js';
import { PresetsDialog } from '../ui/PresetsDialog.js';
import { HelpDialog } from '../ui/HelpDialog.js';
import { SettingsDialog } from '../ui/SettingsDialog.js';
import { CommandPalette } from '../ui/CommandPalette.js';
import { View3DBar } from '../ui/View3DBar.js';
import { SelectionBar } from '../ui/SelectionBar.js';
import { HintPill } from '../ui/HintPill.js';

const VIEW_KEY = 'houseplan.view.v1';
const $ = (id) => document.getElementById(id);
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

export class App {
  constructor() {
    this.bus = new EventBus();
    this.store = new Store(this.bus, loadSavedProject() || createEmptyProject());
    this.state = new AppState(this.bus, this.store);
    this.commands = new Commands(this);
    this.checks = new ProjectChecks(this);
    this.file = new FileActions(this);
    this.toast = createToaster($('toasts'));
    this.ui = {};
    this.modalOpen = false;
    this.view3d = null;
    this._view3dPromise = null;
  }

  get project() {
    return this.store.project;
  }

  confirm(message, okLabel) {
    return confirmDialog(this, message, okLabel);
  }

  start() {
    this.applyTheme();
    this._syncLayoutAttr();
    this.editor = new Editor2D(this, $('plan-host'));
    this.ui.presets = new PresetsDialog(this);
    this.ui.exchange = new ExchangeDialog(this);
    this.ui.help = new HelpDialog(this);
    this.ui.settings = new SettingsDialog(this);
    this.ui.palette = new CommandPalette(this);
    this.ui.side = new SidePanel(this, $('side'));
    this.ui.topbar = new TopBar(this, $('topbar'));
    this.ui.toolbar = new Toolbar(this, $('rail'));
    this.ui.bottombar = new BottomBar(this, $('bottombar'));
    this.ui.toolOptions = new ToolOptionsBar(this, $('tool-options'));
    this.ui.status = new StatusBar(this, $('statusbar'), $('zoom-ctrl'));
    this.ui.empty = new EmptyState(this, $('empty-state'));
    this.ui.view3dBar = new View3DBar(this, $('view3d-bar'));
    this.ui.selectionBar = new SelectionBar(this, $('selection-bar'));
    this.ui.hint = new HintPill(this, $('hint-pill'));

    setupShortcuts(this);
    setupAutosave(this.bus, this.store);
    this.pwa = setupPWA(this);
    this._setupFileDrop();
    this.editor.setTool('select');
    this.checks.run();

    this.bus.on('settings:changed', ({ key }) => {
      if (key === 'theme') this.applyTheme();
      if (key === 'gridStep') this.toast(`Шаг привязки: ${Math.round(this.state.settings.gridStep * 100)} см`);
    });
    darkQuery.addEventListener('change', () => this.state.settings.theme === 'system' && this.applyTheme());
    this.bus.on('layout:changed', () => this._onLayout());

    let view = null;
    try {
      view = localStorage.getItem(VIEW_KEY);
    } catch {
      /* нет доступа к хранилищу */
    }
    if (!view) view = window.innerWidth > 1180 ? 'split' : 'plan';
    if (this.state.isPhone && view === 'split') view = 'plan';
    this.setViewMode(view);
    document.body.classList.add('ready');
  }

  /** Тема интерфейса и чертежа: светлая, тёмная или как в системе. */
  applyTheme() {
    const pref = this.state.settings.theme || 'system';
    const dark = pref === 'dark' || (pref === 'system' && darkQuery.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    applyCanvasTheme(dark);
    $('meta-theme')?.setAttribute('content', dark ? '#1c2228' : '#fbfcfc');
    this.bus.emit('theme:changed', { dark });
    this.editor?.requestRender();
  }

  _syncLayoutAttr() {
    document.body.dataset.layout = this.state.layout;
    document.body.classList.toggle('coarse', this.state.coarse);
  }

  _onLayout() {
    this._syncLayoutAttr();
    if (this.state.isPhone && this.state.viewMode === 'split') this.setViewMode('plan');
    requestAnimationFrame(() => {
      this.editor.resize();
      this.view3d?.resize();
    });
  }

  async setViewMode(mode) {
    if (this.state.isPhone && mode === 'split') mode = 'plan';
    this.state.setViewMode(mode);
    $('stage').dataset.view = mode;
    try {
      localStorage.setItem(VIEW_KEY, mode);
    } catch {
      /* не критично */
    }
    if (mode !== 'plan') {
      const v = await this.ensure3D();
      v?.setVisible(true);
    } else this.view3d?.setVisible(false);
    requestAnimationFrame(() => {
      this.editor.resize();
      this.view3d?.resize();
    });
  }

  /** Файл проекта или ответ ИИ, брошенный на окно, — сразу в импорт. */
  _setupFileDrop() {
    const hasFile = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    window.addEventListener('dragover', (e) => {
      if (hasFile(e)) e.preventDefault();
    });
    window.addEventListener('drop', async (e) => {
      if (!hasFile(e) || e.target.closest?.('.xch-input')) return;
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file || this.modalOpen) return;
      this.ui.exchange.open('import', { text: await file.text() });
    });
  }

  /** Контекстное меню: ПКМ на ПК, долгое нажатие на сенсорном экране. */
  openContextMenu({ client, world, hit, touch }) {
    const items = buildContextItems(this, { hit, world });
    openMenu(this, {
      x: client.x,
      y: client.y,
      title: contextTitle(this, hit),
      items,
      sheet: this.state.isPhone || (touch && this.state.compact),
    });
  }

  /**
   * Прогулка манекеном. На ПК план остаётся рядом (видно, где манекен),
   * на телефоне и планшете — 3D на весь экран.
   * @param at — точка плана, куда поставить манекена
   */
  async walk(at = null) {
    if (this.state.viewMode === 'plan') await this.setViewMode(this.state.layout === 'desktop' ? 'split' : '3d');
    const v = await this.ensure3D();
    if (!v) return;
    v.setVisible(true);
    v.startWalk({ at });
  }

  /** Ленивая загрузка 3D-модуля (Three.js ~700 КБ) — план открывается мгновенно. */
  ensure3D() {
    if (this.view3d) return Promise.resolve(this.view3d);
    if (!this._view3dPromise) {
      $('pane-3d').classList.add('loading');
      this._view3dPromise = import('../view3d/View3D.js')
        .then(({ View3D }) => {
          this.view3d = new View3D(this, $('view3d-host'));
          return this.view3d;
        })
        .catch((err) => {
          console.error(err);
          this.toast(`3D не запустился: ${err.message}`, 'warn');
          this._view3dPromise = null;
          return null;
        })
        .finally(() => $('pane-3d').classList.remove('loading'));
    }
    return this._view3dPromise;
  }
}
