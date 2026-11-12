/**
 * Сборка 3D-сцены из проекта. Сцена пересобирается целиком при изменениях —
 * для домов из сотен объектов это быстро и избавляет от рассинхронизации.
 */
import * as THREE from 'three';
import { levelElevation, levelIndex, SITE_LEVEL, groundLevel, levelWallHeight } from '../model/project.js';

const levelWallHeightOf = (project, level) => levelWallHeight(level);
import { buildSite } from './builders/buildSite.js';
import { buildWalls } from './builders/buildWalls.js';
import { buildFloors, buildStairs, buildStairGuards } from './builders/buildStructure.js';
import { buildRoof, ROOF_LIFT } from './builders/buildRoof.js';
import { buildFoundation, buildBlindArea } from './builders/buildFoundation.js';
import { buildItem } from './builders/buildItems.js';
import { edgeMaterial, TEX } from './materials.js';
import { itemVisible, itemElevation } from '../model/layers.js';
import { catalogItem } from '../model/catalog.js';
import { roofSurfaceAt, chimneyTop } from '../geometry/roofSurface.js';

/**
 * Строим все этажи и крыши; «разрез» по активному этажу — это просто видимость
 * групп (applyCutaway): переключение этажей мгновенное, без пересборки сцены.
 * @param project
 * @param opts { activeLevelId, cutaway, roofs, furniture, edges }
 */
export function buildScene(project, opts) {
  TEX.on = opts.textures !== false;
  const root = new THREE.Group();
  root.name = 'building';

  const site = buildSite(project);
  const blind = buildBlindArea(project);
  if (blind) site.add(blind);
  root.add(site);
  // слои (электрика, сантехника, отопление) — те же переключатели, что на плане
  const shown = (it) => (opts.furniture || catalogItem(it.type)?.category === 'structure') && itemVisible(opts.layers, it);
  for (const it of project.items.filter((i) => i.levelId === SITE_LEVEL && shown(i))) root.add(buildItem(it, 0));

  const ground = groundLevel(project);
  const roofItems = [];
  project.levels.forEach((level, i) => {
    const base = levelElevation(project, level.id);
    const g = new THREE.Group();
    g.name = level.id;
    g.add(buildFloors(project, level, base, i));
    g.add(buildWalls(project, level.id, base, { porch: level === ground }));
    if (i === 0) g.add(buildFoundation(project));
    g.add(buildStairs(project, level.id, base));
    g.add(buildStairGuards(project, level.id, base));
    for (const it of project.items.filter((x) => x.levelId === level.id && shown(x))) {
      if (catalogItem(it.type)?.roofMount) {
        // мансардное окно — в плоскости ската (крыши может не быть — тогда на перекрытии)
        const surf = roofSurfaceAt(project, level.id, it);
        const gr = surf ? buildItem(it, 0, surf.h + ROOF_LIFT + 0.005, surf) : buildItem(it, base, levelWallHeightOf(project, level));
        // в разрезе прячется вместе с крышей
        gr.userData.levelIndex = i;
        gr.userData.isRoof = !!surf;
        if (surf) roofItems.push(gr);
        else g.add(gr);
      } else if (catalogItem(it.type)?.chimney) {
        // дымоход — от пола своего этажа до верха над кровлей
        g.add(buildItem({ ...it, h: Math.max(0.6, chimneyTop(project, it) - base) }, base, 0));
      } else g.add(buildItem(it, base, itemElevation(project, it)));
    }
    g.userData.levelIndex = i;
    root.add(g);
  });

  for (const gr of roofItems) if (opts.roofs) root.add(gr);
  if (opts.roofs) {
    for (const roof of project.roofs) {
      const idx = levelIndex(project, roof.levelId);
      if (idx < 0) continue;
      const r = buildRoof(project, roof);
      r.userData.levelIndex = idx;
      r.userData.isRoof = true;
      root.add(r);
    }
  }

  if (opts.edges) {
    root.traverse((obj) => {
      if (obj.isMesh && (obj.userData.edges || obj.userData.edgesFrom)) {
        const src = obj.userData.edgesFrom || obj.geometry;
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(src, 28), edgeMaterial);
        if (obj.userData.edgesFrom) {
          obj.userData.edgesFrom.dispose();
          delete obj.userData.edgesFrom;
        }
        edges.raycast = () => {};
        obj.add(edges);
      }
    });
  }
  applyCutaway(root, project, opts.activeLevelId, opts.cutaway);
  return root;
}

/** Разрез: скрыть этажи выше активного, его крышу и всё, что над ним. */
export function applyCutaway(root, project, activeLevelId, enabled) {
  if (!root) return;
  const active = Math.max(0, levelIndex(project, activeLevelId));
  for (const ch of root.children) {
    const i = ch.userData.levelIndex;
    if (i == null) continue;
    ch.visible = !enabled || (ch.userData.isRoof ? i < active : i <= active);
  }
}

/** Виден ли объект (с учётом скрытых родителей) — лучи не должны задевать спрятанное. */
export function isShown(obj) {
  for (let o = obj; o; o = o.parent) if (!o.visible) return false;
  return true;
}

export function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
}
