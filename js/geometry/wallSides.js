/**
 * Стороны стены: какая смотрит на улицу и какая комната с каждой стороны.
 * Сторона A — со стороны нормали стены (+n, справа по ходу на плане), B — напротив.
 * «Снаружи» — если за стеной нет ни комнаты, ни пятна дома; для неоднозначных случаев
 * (контур не замкнут) у наружной стены наружу смотрит сторона, дальняя от центра дома.
 */
import { pointInPolygon } from '../core/geometry.js';
import { levelFootprints } from './roomDetect.js';
import { outwardSign, wallsCenter } from './wallGeometry.js';

const PROBE = 0.18; // насколько отступить от грани стены, чтобы «заглянуть» за неё

function probe(g, sign, at = 0.5) {
  const k = g.half + PROBE;
  return { x: g.a.x + (g.b.x - g.a.x) * at + g.n.x * k * sign, y: g.a.y + (g.b.y - g.a.y) * at + g.n.y * k * sign };
}

/**
 * @param geoms — computeWallGeometry(стены этажа)
 * @returns {Map<wallId, { A: { outside, room }, B: { outside, room } }>}
 */
export function wallSides(project, levelId, geoms) {
  const rooms = project.rooms.filter((r) => r.levelId === levelId && r.points.length >= 3);
  const walls = [...geoms.values()].map((g) => g.wall);
  const fps = levelFootprints(walls);
  const center = wallsCenter(geoms);
  const out = new Map();
  for (const g of geoms.values()) {
    const look = (sign) => {
      // стену могут делить проёмы и примыкания — пробуем три точки вдоль неё
      let room = null;
      let inside = false;
      for (const at of [0.5, 0.25, 0.75]) {
        const p = probe(g, sign, at);
        room = room || rooms.find((r) => pointInPolygon(p, r.points)) || null;
        inside = inside || fps.some((f) => pointInPolygon(p, f));
      }
      return { room, inside: inside || !!room };
    };
    const a = look(1);
    const b = look(-1);
    let outA = !a.inside;
    let outB = !b.inside;
    if (g.wall.kind === 'exterior') {
      // у наружной стены наружу смотрит ровно одна сторона
      if (outA === outB) {
        const s = outwardSign(g, center);
        outA = s > 0;
        outB = s < 0;
      }
    } else if (outA && outB) {
      // отдельно стоящая внутренняя стена — обе стороны «в помещении»
      outA = false;
      outB = false;
    }
    out.set(g.wall.id, { A: { outside: outA, room: a.room }, B: { outside: outB, room: b.room } });
  }
  return out;
}

/** Подпись стороны для панели свойств: «снаружи», «к комнате „Кухня“». */
export function sideLabel(side) {
  if (side?.room) return `к «${side.room.name}»`;
  return side?.outside ? 'снаружи' : 'внутри';
}
