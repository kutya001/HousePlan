/** Манекен на плане во время прогулки: фигура сверху, направление и сектор взгляда. */
import { THEME } from './theme.js';

export function drawCharacter(ctx, r, ch) {
  if (!ch?.active || ch.levelId !== r.levelId) return;
  ctx.save();
  ctx.translate(ch.x, ch.y);
  // сектор обзора камеры
  const view = ch.viewYaw ?? ch.yaw;
  const a = Math.atan2(Math.cos(view), Math.sin(view));
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, ch.firstPerson ? 3.2 : 2.4, a - 0.45, a + 0.45);
  ctx.closePath();
  ctx.fillStyle = THEME.dark ? 'rgba(107, 149, 255, 0.16)' : 'rgba(36, 86, 214, 0.12)';
  ctx.fill();
  // тело: плечи и голова, повернуты по yaw (вперёд — по направлению взгляда манекена)
  ctx.rotate(Math.atan2(Math.cos(ch.yaw), Math.sin(ch.yaw)) - Math.PI / 2);
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.23, 0.13, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#dcb88d';
  ctx.fill();
  ctx.lineWidth = r.px(1.5);
  ctx.strokeStyle = THEME.accent;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0.02, 0.1, 0, Math.PI * 2);
  ctx.fillStyle = '#b48a5e';
  ctx.fill();
  ctx.stroke();
  // стрелка «куда смотрит»
  ctx.beginPath();
  ctx.moveTo(-0.08, 0.17);
  ctx.lineTo(0, 0.32);
  ctx.lineTo(0.08, 0.17);
  ctx.strokeStyle = THEME.accent;
  ctx.lineWidth = r.px(2);
  ctx.stroke();
  ctx.restore();
  r.label(ctx, { x: ch.x, y: ch.y - Math.max(0.45, r.px(20)) }, '170 см', { size: 10, weight: 600, color: THEME.accent });
}

/** Своя точка появления манекена — булавка на плане (на её этаже или на участке у первого этажа). */
export function drawSpawn(ctx, r) {
  const s = r.project.site?.spawn;
  if (!s) return;
  if (s.levelId === 'site' ? !r.ground : s.levelId !== r.levelId) return;
  const on = r.settings.walkSpawn === 'point';
  const p = r.vp.toScreen(s);
  r.screen(ctx, () => {
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = on ? 1 : 0.55;
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 2.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-3, -7, -9, -11, -9, -18);
    ctx.arc(0, -18, 9, Math.PI, 0);
    ctx.bezierCurveTo(9, -11, 3, -7, 0, 0);
    ctx.closePath();
    ctx.fillStyle = on ? THEME.accent : THEME.text;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = THEME.paper;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -18, 3.4, 0, Math.PI * 2);
    ctx.fillStyle = THEME.paper;
    ctx.fill();
  });
  if (on) r.label(ctx, { x: s.x, y: s.y }, 'Старт прогулки', { size: 10, weight: 600, color: THEME.accent, baseline: 'top', bg: null });
}
