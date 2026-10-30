/**
 * Ручки редактирования выделенного объекта.
 * Один источник правды и для отрисовки, и для попадания курсора.
 */
import { getEntity } from '../model/project.js';
import { toWorld, mid } from '../core/geometry.js';
import { stairLayout } from '../geometry/stairGeometry.js';
import { stairRise } from './render/drawStairs.js';

export function computeHandles(editor) {
  const { state, project } = editor.app;
  if (state.selection.length !== 1) return [];
  const ref = state.selection[0];
  const e = getEntity(project, ref.kind, ref.id);
  if (!e) return [];
  const px = (n) => editor.viewport.px(n);
  const handles = [];

  if (ref.kind === 'wall') {
    handles.push({ type: 'wall-end', ref, end: 1, pos: { x: e.x1, y: e.y1 } });
    handles.push({ type: 'wall-end', ref, end: 2, pos: { x: e.x2, y: e.y2 } });
  } else if (ref.kind === 'item' || ref.kind === 'roof' || ref.kind === 'stair') {
    let w = e.w ?? e.width;
    let d = e.d ?? e.length;
    if (ref.kind === 'stair') {
      w = e.width;
      d = e.shape === 'spiral' ? e.width : e.length;
    }
    const rot = e.rotation || 0;
    const top = toWorld({ x: 0, y: -d / 2 }, e.x, e.y, rot);
    handles.push({
      type: 'rotate',
      ref,
      anchor: top,
      pos: toWorld({ x: 0, y: -d / 2 - px(28) }, e.x, e.y, rot),
    });
    if (!(ref.kind === 'stair' && e.shape === 'spiral')) {
      handles.push({ type: 'resize', ref, pos: toWorld({ x: w / 2, y: d / 2 }, e.x, e.y, rot) });
    }
  } else if (ref.kind === 'room' || ref.kind === 'zone') {
    addPolyHandles(handles, ref, e.points);
  } else if (ref.kind === 'site') {
    addPolyHandles(handles, ref, project.site.boundary);
  }
  return handles;
}

function addPolyHandles(handles, ref, points) {
  points.forEach((p, i) => handles.push({ type: 'vertex', ref, index: i, pos: { ...p } }));
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length];
    handles.push({ type: 'edge-mid', ref, index: i, pos: mid(p, q) });
  });
}

/** Контур объекта для обводки при выделении. */
export function entityOutline(editor, ref) {
  const { project } = editor.app;
  const e = getEntity(project, ref.kind, ref.id);
  if (!e) return null;
  if (ref.kind === 'stair') return stairLayout(e, stairRise(project, e)).outline;
  return null;
}

export function hitHandle(handles, p, tol) {
  let best = null;
  let bestD = tol;
  for (const h of handles) {
    const d = Math.hypot(h.pos.x - p.x, h.pos.y - p.y);
    const bias = h.type === 'edge-mid' ? 0.6 : 0; // вершины приоритетнее
    if (d + bias * tol < bestD) {
      best = h;
      bestD = d + bias * tol;
    }
  }
  return best;
}
