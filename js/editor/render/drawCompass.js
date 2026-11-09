/**
 * Стрелка севера в углу плана. Угол — site.north (свойства участка или «Солнце» в 3D).
 */
import { THEME, font } from './theme.js';
import { siteGeo } from '../../geometry/sun.js';

export function drawCompass(ctx, r, { x = null, y = null, size = 22 } = {}) {
  const { north } = siteGeo(r.project.site);
  const cx = x ?? r.vp.width - size - 18;
  const cy = y ?? size + 18;
  const a = (north * Math.PI) / 180;
  r.screen(ctx, () => {
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fillStyle = THEME.dark ? 'rgba(30, 36, 44, 0.85)' : 'rgba(255, 255, 255, 0.88)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = THEME.muted;
    ctx.stroke();
    ctx.rotate(a);
    // стрелка: тёмная половина — на север
    ctx.beginPath();
    ctx.moveTo(0, -size + 4);
    ctx.lineTo(6, 2);
    ctx.lineTo(0, -2);
    ctx.closePath();
    ctx.fillStyle = '#d63026';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, size - 4);
    ctx.lineTo(-6, -2);
    ctx.lineTo(0, 2);
    ctx.closePath();
    ctx.fillStyle = THEME.muted;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -size + 4);
    ctx.lineTo(-6, 2);
    ctx.lineTo(0, -2);
    ctx.closePath();
    ctx.fillStyle = '#9b1c15';
    ctx.fill();
    // буква «С» не поворачивается вверх ногами
    ctx.rotate(-a);
    ctx.fillStyle = THEME.text;
    ctx.font = font(11, 800);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lx = Math.sin(a) * (size + 9);
    const ly = -Math.cos(a) * (size + 9);
    ctx.fillText('С', lx, ly);
  });
}
