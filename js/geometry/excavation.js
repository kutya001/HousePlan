/**
 * Котлован под подвалом: контуры, где грунта нет (вырез в земле в 3D,
 * опора для манекена — дно подвала, а не земля).
 */
import { levelFootprints } from './roomDetect.js';
import { pointInPolygon, polygonArea } from '../core/geometry.js';
import { isBasement } from '../model/project.js';

export function excavationOutlines(project) {
  const all = [];
  for (const l of project.levels) {
    if (!isBasement(l)) continue;
    all.push(...levelFootprints(project.walls.filter((w) => w.levelId === l.id)));
  }
  // перекрывающиеся контуры (подвалы друг под другом) — оставляем больший
  all.sort((a, b) => polygonArea(b) - polygonArea(a));
  const out = [];
  for (const poly of all) {
    const overlaps = out.some((q) => poly.some((p) => pointInPolygon(p, q)) || q.some((p) => pointInPolygon(p, poly)));
    if (!overlaps) out.push(poly);
  }
  return out;
}

/** Внутри ли точка котлована. */
export function inExcavation(outlines, p) {
  return outlines.some((poly) => pointInPolygon(p, poly));
}
