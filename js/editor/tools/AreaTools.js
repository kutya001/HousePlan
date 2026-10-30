/** Инструменты площадей: комната (пол), граница участка, зона ландшафта. */
import { PolygonTool } from './PolygonTool.js';
import { createRoom, createZone } from '../../model/factories.js';
import { FLOOR_MATERIALS, ZONE_MATERIALS, ROOM_NAMES } from '../../model/defaults.js';
import { detectRoomAt } from '../../geometry/roomDetect.js';
import { pointInPolygon, polygonLabelPoint, polygonArea, bboxOf } from '../../core/geometry.js';
import { fmtArea, fmtSotki } from '../../core/format.js';
import { SITE_PRESETS, siteRect } from '../../model/presets.js';
import { withAlpha } from '../render/theme.js';

const names = (dict) => Object.fromEntries(Object.entries(dict).map(([k, v]) => [k, v.name]));

export class RoomTool extends PolygonTool {
  constructor(editor) {
    super(editor);
    this.id = 'room';
    this.name = 'Комната';
    this.hint =
      'Кликните внутри замкнутых стен — комната появится сама. Или обведите пол по точкам (клик в первую точку — готово), либо протяните прямоугольник.';
    this.settings = { name: 'Комната', floor: 'laminate' };
    this.options = [
      { key: 'name', label: 'Название', type: 'select', options: Object.fromEntries(['Комната', ...ROOM_NAMES].map((n) => [n, n])) },
      { key: 'floor', label: 'Пол', type: 'select', options: names(FLOOR_MATERIALS) },
      { key: 'auto', label: 'Найти все комнаты', type: 'button', action: () => this.app.commands.autoRooms() },
    ];
    this.snapOpts = { roomPoints: true };
  }

  pointerDown(e) {
    if (!this.points.length) {
      const walls = this.project.walls.filter((w) => w.levelId === this.levelId);
      const poly = detectRoomAt(walls, e.world);
      if (poly) {
        const label = polygonLabelPoint(poly);
        const existing = this.project.rooms.find((r) => r.levelId === this.levelId && pointInPolygon(label, r.points) && Math.abs(polygonArea(r.points) - polygonArea(poly)) < 0.5);
        if (existing) {
          this.state.select({ kind: 'room', id: existing.id });
          this.toast(`Здесь уже есть комната «${existing.name}»`);
          return;
        }
        let id;
        this.store.commit((p) => {
          const room = createRoom(this.levelId, poly, { name: this.settings.name, floor: this.settings.floor });
          id = room.id;
          p.rooms.push(room);
        });
        this.state.select({ kind: 'room', id });
        this.toast(`Комната ${fmtArea(polygonArea(poly))} по осям стен`);
        return;
      }
    }
    super.pointerDown(e);
  }

  complete(pts) {
    let id;
    this.store.commit((p) => {
      const room = createRoom(this.levelId, pts, { name: this.settings.name, floor: this.settings.floor });
      id = room.id;
      p.rooms.push(room);
    });
    this.state.select({ kind: 'room', id });
  }
}

export class SiteTool extends PolygonTool {
  constructor(editor) {
    super(editor);
    this.id = 'site';
    this.name = 'Участок';
    this.hint = 'Обведите границу участка по точкам или протяните прямоугольник. Готовые размеры — кнопками сверху.';
    this.settings = {};
    this.fill = 'rgba(141, 187, 110, 0.25)';
    this.snapOpts = { sitePoints: true, walls: false };
    this.options = SITE_PRESETS.map((s) => ({
      key: s.id,
      label: s.name,
      type: 'button',
      action: () => this.applyPreset(s),
    }));
  }

  applyPreset(s) {
    const walls = this.project.walls;
    let center = { x: 0, y: 0 };
    if (walls.length) {
      const bb = bboxOf(walls.flatMap((w) => [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }]));
      center = { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 };
    }
    this.store.commit((p) => {
      p.site.boundary = siteRect(s.w, s.d, center);
    });
    this.toast(`Участок ${s.w} × ${s.d} м — ${s.name}`);
    this.editor.fitToContent({ includeSite: true });
  }

  complete(pts) {
    this.store.commit((p) => {
      p.site.boundary = pts;
    });
    this.toast(`Участок: ${fmtSotki(polygonArea(pts))}`);
  }
}

export class ZoneTool extends PolygonTool {
  constructor(editor) {
    super(editor);
    this.id = 'zone';
    this.name = 'Ландшафт';
    this.hint = 'Обведите зону по точкам или протяните прямоугольник: газон, дорожка, терраса, пруд, грядки. Зоны видны на первом этаже.';
    this.settings = { material: 'paving' };
    this.options = [{ key: 'material', label: 'Покрытие', type: 'segmented', options: names(ZONE_MATERIALS) }];
    this.snapOpts = { sitePoints: true };
  }

  get fill() {
    return withAlpha(ZONE_MATERIALS[this.settings.material]?.color || '#888888', 0.45);
  }

  set fill(v) {
    void v;
  }

  activate() {
    const ground = this.project.levels[0]?.id;
    if (ground && this.levelId !== ground) {
      this.state.setLevel(ground);
      this.toast('Ландшафт рисуется на уровне земли — переключено на 1 этаж');
    }
  }

  complete(pts) {
    let id;
    this.store.commit((p) => {
      const z = createZone(pts, this.settings.material);
      id = z.id;
      p.zones.push(z);
    });
    this.state.select({ kind: 'zone', id });
  }
}
