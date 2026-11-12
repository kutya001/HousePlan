/**
 * Геометрия забора: пролёты по сторонам участка с разрывами под ворота и калитки.
 * Общая для 3D, плана, столкновений манекена и сметы.
 */
import { DEG, projectOnSegment } from '../core/geometry.js';
import { SITE_LEVEL } from '../model/project.js';
import { fenceSide, isFenceGate } from '../model/fence.js';

const NEAR = 0.6; // ворота ближе этого к линии забора — стоят в заборе

/** Ворота и калитки, стоящие на стороне a → b: отрезки вдоль стороны [s0, s1]. */
function gateSpans(project, a, b) {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  const ang = Math.atan2(b.y - a.y, b.x - a.x) / DEG;
  const out = [];
  for (const it of project.items) {
    if (it.levelId !== SITE_LEVEL || !isFenceGate(it)) continue;
    const pr = projectOnSegment(it, a, b);
    if (pr.dist > NEAR || pr.along < -0.05 || pr.along > L + 0.05) continue;
    // створ идёт вдоль стороны (в любую сторону)
    const d = Math.abs((((it.rotation || 0) - ang) % 180) + 180) % 180;
    if (Math.min(d, 180 - d) > 20) continue;
    out.push([Math.max(0, pr.along - it.w / 2), Math.min(L, pr.along + it.w / 2), it]);
  }
  return out.sort((x, y) => x[0] - y[0]);
}

/**
 * Пролёты забора.
 * @returns {Array<{ side, a, b, type, height, color, length }>} a, b — концы пролёта в плане
 */
export function fenceRuns(project) {
  const b = project.site?.boundary || [];
  const out = [];
  if (b.length < 2) return out;
  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    const q = b[(i + 1) % b.length];
    const L = Math.hypot(q.x - p.x, q.y - p.y);
    const side = fenceSide(project.site, i);
    if (side.off || L < 0.05) continue;
    const at = (s) => ({ x: p.x + ((q.x - p.x) * s) / L, y: p.y + ((q.y - p.y) * s) / L });
    let from = 0;
    const push = (s0, s1) => {
      if (s1 - s0 > 0.08) out.push({ side: i, a: at(s0), b: at(s1), type: side.type, height: side.height, color: side.color, length: s1 - s0 });
    };
    for (const [s0, s1] of gateSpans(project, p, q)) {
      push(from, s0);
      from = Math.max(from, s1);
    }
    push(from, L);
  }
  return out;
}

/**
 * Поставить ворота на линию забора: ближайшая сторона участка в пределах reach.
 * @returns {{ x, y, rotation, side } | null}
 */
export function snapToFence(project, p, width = 1, reach = 1.5) {
  const b = project.site?.boundary || [];
  let best = null;
  for (let i = 0; i < b.length; i++) {
    const a = b[i];
    const c = b[(i + 1) % b.length];
    const L = Math.hypot(c.x - a.x, c.y - a.y);
    if (L < width) continue;
    const pr = projectOnSegment(p, a, c);
    if (pr.dist > reach || (best && pr.dist >= best.dist)) continue;
    // целиком на стороне, не выступая за углы
    const s = Math.max(width / 2, Math.min(L - width / 2, pr.along));
    best = { dist: pr.dist, x: a.x + ((c.x - a.x) * s) / L, y: a.y + ((c.y - a.y) * s) / L, rotation: Math.round((Math.atan2(c.y - a.y, c.x - a.x) / DEG) * 10) / 10, side: i };
  }
  return best;
}
