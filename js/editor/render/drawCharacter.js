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
