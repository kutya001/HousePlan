/**
 * Водостоки: желоба вдоль карнизов и трубы по стенам.
 *
 * Желоб идёт по карнизу там, где тот ничем не накрыт: у дома из нескольких крыш
 * (Г-, Т-образный) скат крыла уходит под кровлю главного объёма — там желоба нет.
 * Трубы — у свободных концов карниза, по стене; на длинном карнизе — с обеих сторон.
 * Короткие верхние карнизы (вальмы полувальмовой крыши) — только желоб.
 */
import { roofGeometry, roofPlanes, roofHeightAt } from './roofGeometry.js';
import { levelTop } from '../model/project.js';

export const GUTTER_R = 0.07; // радиус желоба
export const PIPE_R = 0.045; // радиус трубы
const STEP = 0.2;
const ONE_PIPE_UP_TO = 8; // длиннее — трубы с обоих концов

/**
 * @returns {{ gutters: Array<[a, b]>, pipes: Array<{ from, top, bottom }>, length, pipeLength }}
 *   gutters — отрезки желобов (3D-точки по кромке кровли);
 *   pipes — from: точка на желобе, top: верх трубы у стены, bottom: низ у земли;
 *   length, pipeLength — метры желобов и труб (для сметы)
 */
export function roofGutters(project, roof) {
  const out = { gutters: [], pipes: [], length: 0, pipeLength: 0 };
  if (!roof.gutters || roof.type === 'flat') return out;
  const H = levelTop(project, roof.levelId);
  const { eaves } = roofGeometry(roof, H);
  if (!eaves.length) return out;
  const others = project.roofs.filter((r) => r !== roof && r.id !== roof.id && r.type !== 'flat').map((r) => roofPlanes(r, levelTop(project, r.levelId)));
  const lowest = Math.min(...eaves.map((e) => e.a.y));
  for (const e of eaves) {
    const L = Math.hypot(e.b.x - e.a.x, e.b.z - e.a.z);
    const n = Math.max(1, Math.round(L / STEP));
    const at = (t) => ({ x: e.a.x + (e.b.x - e.a.x) * t, y: e.a.y, z: e.a.z + (e.b.z - e.a.z) * t });
    // накрыт другой крышей — её кровля над этой точкой карниза
    const covered = (p) => others.some((rp) => roofHeightAt(rp, { x: p.x, y: p.z }) > p.y + 0.03 && roofHeightAt(rp, { x: p.x, y: p.z }) < Infinity);
    const runs = [];
    let start = null;
    for (let i = 0; i <= n; i++) {
      const free = !covered(at(i / n));
      if (free && start === null) start = i;
      if ((!free || i === n) && start !== null) {
        const end = free ? i : i - 1;
        if (end > start) runs.push([start / n, end / n]);
        start = null;
      }
    }
    const main = e.a.y < lowest + 0.02;
    for (const [t0, t1] of runs) {
      const a = at(t0);
      const b = at(t1);
      const len = L * (t1 - t0);
      if (len < 0.4) continue;
      out.gutters.push([a, b]);
      out.length += len;
      if (!main) continue;
      // трубы — только у концов самого карниза (не там, где желоб упёрся в другую крышу)
      const ends = [];
      if (t1 > 1 - 1e-6) ends.push(1);
      if (t0 < 1e-6 && (len > ONE_PIPE_UP_TO || !ends.length)) ends.push(0);
      const o = Math.hypot(e.inset.x, e.inset.z);
      for (const t of ends) {
        // от конца карниза — внутрь на свес и ещё немного, чтобы труба встала на стену у угла
        const back = Math.min(len / 2, o + 0.35) / L;
        const g = at(t === 1 ? 1 - back : back);
        const top = { x: g.x + e.inset.x * (o > 0.1 ? 1 - 0.09 / o : 0), y: g.y - (o > 0.1 ? 0.3 : 0.12), z: g.z + e.inset.z * (o > 0.1 ? 1 - 0.09 / o : 0) };
        const bottom = { x: top.x, y: 0.2, z: top.z };
        if (top.y - bottom.y < 0.5) continue;
        out.pipes.push({ from: { x: g.x, y: g.y - GUTTER_R, z: g.z }, top, bottom });
        out.pipeLength += top.y - bottom.y + Math.hypot(top.x - g.x, top.z - g.z);
      }
    }
  }
  return out;
}
