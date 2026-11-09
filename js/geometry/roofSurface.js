/**
 * Поверхность кровли над точкой плана: высота верха и уклон ската.
 * Нужна мансардным окнам — они лежат в плоскости ската.
 */
import { roofPlanes } from './roofGeometry.js';
import { levelTop } from '../model/project.js';

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
