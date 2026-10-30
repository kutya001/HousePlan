/**
 * Где манекен может сесть или лечь: стулья, кресла, диваны, скамейки, кровати.
 * Положения считаются в локальной системе предмета: X — ширина, Y (плана) — глубина,
 * «спинка» на −Y, лицом сидящий смотрит в +Y.
 */
import { toLocal, toWorld, clamp } from '../../core/geometry.js';
import { catalogItem } from '../../model/catalog.js';

// h — высота сиденья (null — по высоте предмета), z — где сидеть по глубине, inset — запас от краёв по ширине
const SIT = {
  chair: { h: 0.46, z: 0.03 },
  office_chair: { h: 0.5, z: 0.02 },
  armchair: { h: 0.44, z: 0.1, inset: 0.42 },
  sofa: { h: 0.45, z: 0.1, inset: 0.45 },
  sofa_corner: { h: 0.45, z: null, inset: 0.6 },
  bench: { h: 0.45, z: 0.02, inset: 0.3 },
  toilet: { h: 0.42, z: 0.1 },
  bed_double: { h: null, z: 'foot', inset: 0.35 },
  bed_single: { h: null, z: 'foot', inset: 0.35 },
  bathtub: { h: null, z: 'edge', inset: 0.4 },
};

// along — вдоль какой оси лежит тело: 'y' (кровать) или 'x' (диван)
const LIE = {
  bed_double: { along: 'y', top: null, inset: 0.38 },
  bed_single: { along: 'y', top: null, inset: 0.4 },
  sofa: { along: 'x', top: 0.47 },
  sofa_corner: { along: 'x', top: 0.47 },
  bench: { along: 'x', top: 0.45 },
};

function yawOf(item, dir = { x: 0, y: 1 }) {
  const f = toWorld(dir, 0, 0, item.rotation || 0);
  return Math.atan2(f.x, f.y);
}

/** Расстояние от точки до прямоугольника предмета (0 — внутри). */
function distToItem(item, p) {
  const l = toLocal(p, item.x, item.y, item.rotation || 0);
  const dx = Math.max(0, Math.abs(l.x) - item.w / 2);
  const dy = Math.max(0, Math.abs(l.y) - item.d / 2);
  return Math.hypot(dx, dy);
}

/**
 * Ближайшее место, чтобы сесть или лечь.
 * @param items — предметы этажа (и участка), на котором стоит манекен
 * @param p — точка в плане {x, y}
 * @returns {{ item, point, yaw, height, name } | null}
 *   point — где окажется таз (в плане), height — высота поверхности над полом предмета
 */
export function findSpot(items, p, kind = 'sit', maxDist = 0.9) {
  const table = kind === 'lie' ? LIE : SIT;
  let best = null;
  for (const it of items) {
    const def = table[it.type];
    if (!def) continue;
    const d = distToItem(it, p);
    if (d > maxDist || (best && d >= best.d)) continue;
    const spot = kind === 'lie' ? lieSpot(it, def, p) : sitSpot(it, def, p);
    if (spot) best = { ...spot, d, item: it, name: catalogItem(it.type)?.name?.toLowerCase() || 'предмет' };
  }
  return best;
}

function sitSpot(it, def, p) {
  const l = toLocal(p, it.x, it.y, it.rotation || 0);
  const half = it.w / 2 - (def.inset ?? 0);
  const lx = half > 0 ? clamp(l.x, -half, half) : 0;
  let ly = def.z;
  if (def.z === 'foot') ly = it.d / 2 - 0.28;
  else if (def.z === 'edge') ly = it.d / 2 - 0.08;
  else if (def.z === null) ly = -it.d / 2 + Math.min(0.95, it.d * 0.6) / 2 + 0.08;
  const height = def.h ?? it.h + 0.03;
  return { point: toWorld({ x: lx, y: ly }, it.x, it.y, it.rotation || 0), yaw: yawOf(it), height: Math.min(height, it.h + 0.05) };
}

function lieSpot(it, def, p) {
  const l = toLocal(p, it.x, it.y, it.rotation || 0);
  const top = def.top ?? it.h + 0.04;
  if (def.along === 'y') {
    if (it.d < 1.5) return null;
    const half = it.w / 2 - def.inset;
    const lx = half > 0 ? clamp(l.x, -half, half) : 0;
    // голова у изголовья (−Y), таз чуть ближе к ногам от центра
    return { point: toWorld({ x: lx, y: 0.1 }, it.x, it.y, it.rotation || 0), yaw: yawOf(it), height: top };
  }
  if (it.w < 1.5) return null;
  // диван: голова к подлокотнику со стороны, где стоит манекен
  const s = l.x >= 0 ? 1 : -1;
  const ly = def.top ? 0.08 : 0;
  return { point: toWorld({ x: s * 0.1, y: ly }, it.x, it.y, it.rotation || 0), yaw: yawOf(it, { x: -s, y: 0 }), height: top };
}
