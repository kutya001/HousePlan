/**
 * Наружные ступени на плане: крыльцо у входных дверей первого этажа и приямки
 * входов в подвал с улицы (на первом этаже — как часть участка, на плане подвала —
 * площадка у двери).
 */
import { THEME, withAlpha } from './theme.js';
import { porchSteps } from '../../geometry/porch.js';
import { cellarEntries } from '../../geometry/cellarEntry.js';
import { levelElevation, isBasement, getLevel } from '../../model/project.js';

export function drawOutdoorSteps(ctx, r) {
  const project = r.project;
  const level = getLevel(project, r.levelId);
  const fill = THEME.dark ? '#3a3f45' : '#ddd8cf';
  const line = THEME.dark ? 'rgba(220, 228, 235, 0.45)' : 'rgba(60, 66, 72, 0.5)';
  const wall = THEME.dark ? '#8f8b85' : '#8f8b85';
  const step = (poly) => {
    r.path(ctx, poly);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = r.px(1);
    ctx.strokeStyle = line;
    ctx.stroke();
  };

  if (r.ground && !isBasement(level)) {
    const geoms = r.geoms;
    for (const st of porchSteps(project, r.levelId, geoms, levelElevation(project, r.levelId))) step(st.poly);
  }
  const entries = cellarEntries(project);
  if (!entries.length) return;
  const showHere = r.ground || entries.some((e) => e.levelId === r.levelId);
  if (!showHere) return;
  ctx.save();
  for (const e of entries) {
    if (!r.ground && e.levelId !== r.levelId) continue;
    step(e.landing.poly);
    for (const st of e.steps) step(st.poly);
    for (const w of e.walls) {
      r.path(ctx, w.poly);
      ctx.fillStyle = w.rail ? wall : withAlpha(wall, 0.6);
      ctx.fill();
    }
    // стрелка «вверх» по ступеням и подпись
    const c = centroid(e.pit);
    const a = { x: c.x - e.dir.x * 0.6, y: c.y - e.dir.y * 0.6 };
    const b = { x: c.x + e.dir.x * 0.6, y: c.y + e.dir.y * 0.6 };
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    const nx = -e.dir.y;
    const ny = e.dir.x;
    ctx.moveTo(b.x - e.dir.x * 0.18 + nx * 0.12, b.y - e.dir.y * 0.18 + ny * 0.12);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(b.x - e.dir.x * 0.18 - nx * 0.12, b.y - e.dir.y * 0.18 - ny * 0.12);
    ctx.lineWidth = r.px(1.6);
    ctx.strokeStyle = THEME.muted;
    ctx.stroke();
    if (r.vp.scale > 22) r.label(ctx, { x: c.x, y: c.y }, r.ground && e.levelId !== r.levelId ? 'спуск в подвал' : 'вход с улицы', { size: 10, color: THEME.muted });
  }
  ctx.restore();
}

function centroid(poly) {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / poly.length, y: y / poly.length };
}
