/** Миниатюра плана первого этажа (для карточек пресетов). */
import { computeWallGeometry } from '../geometry/wallGeometry.js';
import { bboxOf } from '../core/geometry.js';
import { FLOOR_MATERIALS } from '../model/defaults.js';
import { THEME, floorFill } from '../editor/render/theme.js';

export function drawPlanPreview(canvas, project) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || canvas.width;
  const H = canvas.clientHeight || canvas.height;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const lvl = project.levels[0].id;
  const walls = project.walls.filter((w) => w.levelId === lvl);
  if (!walls.length) return;
  const pts = walls.flatMap((w) => [
    { x: w.x1, y: w.y1 },
    { x: w.x2, y: w.y2 },
  ]);
  const bb = bboxOf(pts);
  const pad = 14;
  const s = Math.min((W - pad * 2) / (bb.w + 0.6), (H - pad * 2) / (bb.h + 0.6));
  ctx.translate(W / 2, H / 2);
  ctx.scale(s, s);
  ctx.translate(-(bb.minX + bb.maxX) / 2, -(bb.minY + bb.maxY) / 2);
  for (const r of project.rooms.filter((x) => x.levelId === lvl)) {
    ctx.beginPath();
    r.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = floorFill((FLOOR_MATERIALS[r.floor] || FLOOR_MATERIALS.laminate).color);
    ctx.fill();
  }
  const geoms = computeWallGeometry(walls);
  ctx.fillStyle = THEME.wallExt;
  for (const g of geoms.values()) {
    ctx.beginPath();
    g.poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
  }
  if (project.levels.length > 1) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '600 11px "Golos Text", system-ui, sans-serif';
    ctx.fillStyle = THEME.muted;
    ctx.fillText(`${project.levels.length} этажа`, 8, H - 8);
  }
}
