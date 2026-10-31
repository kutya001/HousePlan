/**
 * Срез стен мансарды скатами крыши. Верх стены — нижняя огибающая
 * нескольких плоскостей (горизонтальный верх стены и скаты), поэтому контур
 * стены в плане делится на участки, где «работает» одна плоскость.
 */
import { clipPolygonHalfPlane } from '../core/geometry.js';
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
  const all = [{ a: 0, b: 0, c: top }, ...planes];
  if (all.length === 1) return [{ poly, plane: all[0] }];
  const parts = [];
  for (let k = 0; k < all.length; k++) {
    const pk = all[k];
    let region = poly;
    for (let j = 0; j < all.length && region.length >= 3; j++) {
      if (j === k) continue;
      const pj = all[j];
      // оставить область, где pk ≤ pj:  A·p + C ≤ 0
      const ax = pk.a - pj.a;
      const ay = pk.b - pj.b;
      const C = pk.c - pj.c;
      const L2 = ax * ax + ay * ay;
      if (L2 < 1e-12) {
        if (C > 1e-9 || (Math.abs(C) <= 1e-9 && j < k)) region = [];
        continue;
      }
      region = clipPolygonHalfPlane(region, { x: (-C * ax) / L2, y: (-C * ay) / L2 }, { x: -ax, y: -ay });
    }
    if (region.length >= 3) parts.push({ poly: region, plane: pk });
  }
  return parts;
}

/** Высота плоскости в точке плана. */
export const planeAt = (pl, p) => pl.a * p.x + pl.b * p.y + pl.c;


