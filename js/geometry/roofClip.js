/**
 * Срез стен мансарды скатами крыши. Верх стены — нижняя огибающая
 * нескольких плоскостей (горизонтальный верх стены и скаты), поэтому контур
 * стены в плане делится на участки, где «работает» одна плоскость.
 */
import { lowerEnvelope } from '../core/geometry.js';
import { roofPlanes } from './roofGeometry.js';

/** Плоскости скатов крыш, накрывающих точку (верх кровли минус запас под толщину). */
export function coveringPlanes(roofs, baseHeight, point, inset = 0.1) {
  const out = [];
  for (const r of roofs) {
    const rp = roofPlanes(r, baseHeight);
    if (!rp.contains(point)) continue;
    for (const pl of rp.planes) out.push({ a: pl.a, b: pl.b, c: pl.c - inset });
  }
  return out;
}

/**
 * Разбить контур на участки с одной плоскостью верха.
 * @param poly — контур в плане, top — высота горизонтального верха
 * @returns {Array<{ poly, plane:{a,b,c} }>}
 */
export function splitByLowestPlane(poly, top, planes) {
  return lowerEnvelope(poly, [{ a: 0, b: 0, c: top }, ...planes]);
}

/** Высота плоскости в точке плана. */
export const planeAt = (pl, p) => pl.a * p.x + pl.b * p.y + pl.c;


