/**
 * Сборка 3D-сцены из проекта. Сцена пересобирается целиком при изменениях —
 * для домов из сотен объектов это быстро и избавляет от рассинхронизации.
 */
import * as THREE from 'three';
import { levelElevation, levelIndex, SITE_LEVEL, groundLevel } from '../model/project.js';
import { buildSite } from './builders/buildSite.js';
import { buildWalls } from './builders/buildWalls.js';
import { buildFloors, buildStairs, buildRoof } from './builders/buildStructure.js';
import { buildItem } from './builders/buildItems.js';
import { edgeMaterial } from './materials.js';

/**
 * Строим все этажи и крыши; «разрез» по активному этажу — это просто видимость
 * групп (applyCutaway): переключение этажей мгновенное, без пересборки сцены.
 * @param project
 * @param opts { activeLevelId, cutaway, roofs, furniture, edges }
 */
export function buildScene(project, opts) {
  const root = new THREE.Group();
  root.name = 'building';

  root.add(buildSite(project));
  if (opts.furniture) {
    for (const it of project.items.filter((i) => i.levelId === SITE_LEVEL)) root.add(buildItem(it, 0));
  }

  const ground = groundLevel(project);
  project.levels.forEach((level, i) => {
    const base = levelElevation(project, level.id);
    const g = new THREE.Group();
    g.name = level.id;
    g.add(buildFloors(project, level, base, i));
    g.add(buildWalls(project, level.id, base, { plinth: i === 0, porch: level === ground }));
    g.add(buildStairs(project, level.id, base));
    if (opts.furniture) for (const it of project.items.filter((x) => x.levelId === level.id)) g.add(buildItem(it, base));
    g.userData.levelIndex = i;
    root.add(g);
  });

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
