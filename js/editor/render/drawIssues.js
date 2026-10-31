/**
 * Ошибки проверки на плане: красные (ошибки) и жёлтые (предупреждения) пятна
 * в месте пересечения и значок «!» — видно сразу, что стоит друг в друге.
 */
import { THEME, font } from './theme.js';
import { SITE_LEVEL } from '../../model/project.js';

const COLORS = {
  error: { fill: 'rgba(214, 48, 38, 0.22)', stroke: '#d63026', dark: { fill: 'rgba(255, 110, 98, 0.24)', stroke: '#ff7a6e' } },
  warn: { fill: 'rgba(222, 150, 20, 0.2)', stroke: '#c98a0b', dark: { fill: 'rgba(255, 190, 70, 0.2)', stroke: '#f2b84b' } },
};

export function drawIssues(ctx, r) {
  const checks = r.editor.app.checks;
  if (!checks || !r.settings.checks || r.exportMode) return;
  const list = checks.issues.filter((i) => (i.levelId === SITE_LEVEL ? r.ground : i.levelId === r.levelId));
  if (!list.length) return;
  for (const iss of list) {
    const c = COLORS[iss.level] || COLORS.warn;
    const col = THEME.dark ? c.dark : c;
    const focus = checks.focusId === iss.id;
    if (iss.area?.length >= 3) {
      r.path(ctx, iss.area);
      ctx.fillStyle = col.fill;
      ctx.fill();
      ctx.setLineDash(focus ? [] : [r.px(5), r.px(3)]);
      ctx.lineWidth = r.px(focus ? 2.5 : 1.5);
      ctx.strokeStyle = col.stroke;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  // значки поверх всего
  for (const iss of list) {
    if (!iss.at) continue;
    const c = COLORS[iss.level] || COLORS.warn;
    const col = THEME.dark ? c.dark : c;
    const focus = checks.focusId === iss.id;
    const s = r.vp.toScreen(iss.at);
    r.screen(ctx, () => {
      const rad = focus ? 10 : 8;
      ctx.beginPath();
      ctx.arc(s.x, s.y, rad, 0, Math.PI * 2);
      ctx.fillStyle = col.stroke;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = THEME.paper;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = font(focus ? 13 : 11, 800);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', s.x, s.y + 0.5);
    });
  }
}
