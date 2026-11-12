/**
 * Поверхность кровли над точкой плана: высота верха и уклон ската.
 * Нужна мансардным окнам — они лежат в плоскости ската.
 */
import { roofPlanes, roofHeightAt } from './roofGeometry.js';
import { levelTop, levelElevation, levelWallHeight } from '../model/project.js';

/**
 * @returns {{ h, a, b, roof } | null} h — отметка верха кровли; (a, b) — рост высоты по x и y плана
 */
export function roofSurfaceAt(project, levelId, p) {
  const H = levelTop(project, levelId);
  let best = null;
  for (const roof of project.roofs) {
    if (roof.levelId !== levelId) continue;
    const rp = roofPlanes(roof, H);
    if (!rp.contains(p)) continue;
    // у одной крыши видна самая низкая из плоскостей, у пересекающихся — самая высокая крыша
    let low = null;
    for (const pl of rp.planes) {
      const h = pl.a * p.x + pl.b * p.y + pl.c;
      if (!low || h < low.h) low = { h, a: pl.a, b: pl.b, roof };
    }
    if (low && (!best || low.h > best.h)) best = low;
  }
  return best;
}

/** Поворот предмета так, чтобы его глубина шла вниз по скату (градусы). */
export function slopeRotation(surf) {
  const g = Math.hypot(surf.a, surf.b);
  if (g < 1e-6) return null;
  return (Math.atan2(surf.a, -surf.b) * 180) / Math.PI;
}

/** Угол ската, градусы. */
export const slopeAngle = (surf) => (Math.atan(Math.hypot(surf.a, surf.b)) * 180) / Math.PI;

/** На сколько дымоход выступает над кровлей, м. */
export const CHIMNEY_RISE = 0.6;

/**
 * Отметка верха дымохода: он проходит сквозь перекрытия и кровлю и выступает над ней.
 * Крыша над ним может стоять на любом этаже; если крыши нет — выше стен верхнего этажа.
 */
export function chimneyTop(project, item) {
  const hw = (item.w || 0.5) / 2;
  const hd = (item.d || 0.5) / 2;
  const corners = [
    { x: item.x - hw, y: item.y - hd },
    { x: item.x + hw, y: item.y - hd },
    { x: item.x + hw, y: item.y + hd },
    { x: item.x - hw, y: item.y + hd },
  ];
  let top = -Infinity;
  for (const roof of project.roofs) {
    const rp = roofPlanes(roof, levelTop(project, roof.levelId) + (roof.type === 'flat' ? 0.25 : 0));
    for (const p of [item, ...corners]) {
      const h = roofHeightAt(rp, p);
      if (h < Infinity) top = Math.max(top, h);
    }
  }
  if (top > -Infinity) return top + CHIMNEY_RISE;
  const last = project.levels[project.levels.length - 1];
  return levelElevation(project, last.id) + levelWallHeight(last) + CHIMNEY_RISE + 0.4;
}
