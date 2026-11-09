/** Действия меню «Файл»: сохранить/открыть проект, выгрузить картинки. */
import { saveProjectFile, pickProjectFile, download, safeName } from '../io/fileio.js';
import { getLevel } from '../model/project.js';
import { packModels } from '../io/modelStore.js';
import { createItem } from '../model/factories.js';
import { pointInPolygon, polygonArea, polygonLabelPoint } from '../core/geometry.js';

const fmt = (v) => String(Math.round(v * 100) / 100).replace('.', ',');

export class FileActions {
  constructor(app) {
    this.app = app;
  }

  async save() {
    const project = this.app.project;
    // свои 3D-модели едут внутри файла, чтобы проект открылся на другом устройстве
    const models = project.items.some((it) => it.model) ? await packModels(project) : null;
    saveProjectFile(models && Object.keys(models).length ? { ...project, models } : project);
    this.app.toast('Проект сохранён в файл');
  }

  /** Своя модель .glb: выбрать файл, положить в хранилище и поставить на активный этаж. */
  async importModel() {
    const app = this.app;
    const file = await new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.glb,model/gltf-binary';
      input.addEventListener('change', () => resolve(input.files?.[0] || null));
      input.click();
    });
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) return app.toast('Модель больше 30 МБ — упростите её перед загрузкой', 'warn');
    app.toast('Загружаю модель…');
    try {
      const { importModelFile } = await import('../view3d/models.js');
      const m = await importModelFile(file);
      const vp = app.editor.viewport;
      const levelId = app.state.activeLevelId;
      // ставим в комнату под центром экрана (или в самую большую на этаже), а не в стену
      const rooms = app.project.rooms.filter((r) => r.levelId === levelId);
      const c = { x: vp.cx, y: vp.cy };
      const room = rooms.find((r) => pointInPolygon(c, r.points)) || rooms.slice().sort((a, b) => polygonArea(b.points) - polygonArea(a.points))[0];
      const at = room ? polygonLabelPoint(room.points) : c;
      const item = createItem(levelId, 'custom', at.x, at.y, { w: m.w, d: m.d, h: m.h });
      item.model = m.id;
      item.name = m.name;
      app.store.commit((p) => p.items.push(item));
      app.state.select({ kind: 'item', id: item.id });
      app.toast(`Модель «${m.name}» ${fmt(m.w)} × ${fmt(m.d)} × ${fmt(m.h)} м — перетащите её на место`);
    } catch (err) {
      app.toast(err.message, 'warn');
    }
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

  /** Снимок 3D-вида в высоком качестве (в 3 раза крупнее экрана, до 4096 px). */
  async export3DPNG({ scale = 3 } = {}) {
    const app = this.app;
    if (app.state.viewMode === 'plan') await app.setViewMode('split');
    const v = await app.ensure3D();
    if (!v) return;
    if (v.dirty) v.rebuild();
    app.toast('Готовлю снимок высокого качества…');
    await new Promise((r) => setTimeout(r, 30));
    download(`${safeName(app.project.name)} — 3D.png`, v.screenshot({ scale }));
  }
}
