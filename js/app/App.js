/**
 * Корень приложения: создаёт хранилище, состояние, редактор, 3D-вид и интерфейс
 * и связывает их через шину событий. 3D загружается лениво — при первом показе.
 */
import { EventBus } from '../core/EventBus.js';
import { Store } from '../core/Store.js';
import { AppState } from './AppState.js';
import { Commands } from './commands.js';
import { FileActions } from './fileActions.js';
import { setupShortcuts } from './shortcuts.js';
import { createEmptyProject } from '../model/project.js';
import { loadSavedProject, setupAutosave } from '../io/storage.js';
import { Editor2D } from '../editor/Editor2D.js';
import { createToaster, confirmDialog } from '../ui/feedback.js';
import { TopBar } from '../ui/TopBar.js';
import { Toolbar } from '../ui/Toolbar.js';
import { ToolOptionsBar } from '../ui/ToolOptionsBar.js';
import { SidePanel } from '../ui/SidePanel.js';
import { StatusBar } from '../ui/StatusBar.js';
import { EmptyState } from '../ui/EmptyState.js';
import { PresetsDialog } from '../ui/PresetsDialog.js';
import { HelpDialog } from '../ui/HelpDialog.js';
import { View3DBar } from '../ui/View3DBar.js';

const VIEW_KEY = 'houseplan.view.v1';
const $ = (id) => document.getElementById(id);

export class App {
  constructor() {
    this.bus = new EventBus();
    this.store = new Store(this.bus, loadSavedProject() || createEmptyProject());
    this.state = new AppState(this.bus, this.store);
    this.commands = new Commands(this);
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
    this.editor = new Editor2D(this, $('plan-host'));
    this.ui.presets = new PresetsDialog(this);
    this.ui.help = new HelpDialog(this);
    this.ui.topbar = new TopBar(this, $('topbar'));
    this.ui.toolbar = new Toolbar(this, $('rail'));
    this.ui.side = new SidePanel(this, $('side'));
    this.ui.toolOptions = new ToolOptionsBar(this, $('tool-options'));
    this.ui.status = new StatusBar(this, $('statusbar'), $('zoom-ctrl'));
    this.ui.empty = new EmptyState(this, $('empty-state'));
    this.ui.view3dBar = new View3DBar(this, $('view3d-bar'));

    setupShortcuts(this);
    setupAutosave(this.bus, this.store);
    this.editor.setTool('select');

    let view = null;
    try {
      view = localStorage.getItem(VIEW_KEY);
    } catch {
      /* нет доступа к хранилищу */
    }
    this.setViewMode(view || (window.innerWidth > 1180 ? 'split' : 'plan'));
    document.body.classList.add('ready');
  }

  async setViewMode(mode) {
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
