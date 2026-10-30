/** Действия меню «Файл»: сохранить/открыть проект, выгрузить картинки. */
import { saveProjectFile, pickProjectFile, download, safeName } from '../io/fileio.js';
import { getLevel } from '../model/project.js';

export class FileActions {
  constructor(app) {
    this.app = app;
  }

  save() {
    saveProjectFile(this.app.project);
    this.app.toast('Проект сохранён в файл');
  }

  async open() {
    try {
      const raw = await pickProjectFile();
      if (!raw) return;
      this.app.commands.loadProject(raw);
      this.app.toast(`Открыт проект «${this.app.project.name}»`);
    } catch (err) {
      this.app.toast(err.message, 'warn');
    }
  }

  exportPlanPNG() {
    const app = this.app;
    const lvl = getLevel(app.project, app.state.activeLevelId);
    download(`${safeName(app.project.name)} — ${safeName(lvl?.name)}.png`, app.editor.exportPNG(2));
  }

  async export3DPNG() {
    const app = this.app;
    if (app.state.viewMode === 'plan') await app.setViewMode('split');
    const v = await app.ensure3D();
    if (!v) return;
    if (v.dirty) v.rebuild();
    download(`${safeName(app.project.name)} — 3D.png`, v.screenshot());
  }
}
