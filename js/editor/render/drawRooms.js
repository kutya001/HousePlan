/** Полы комнат и подписи (название + чистая площадь). */
import { THEME, tint } from './theme.js';
import { FLOOR_MATERIALS } from '../../model/defaults.js';
import { bboxOf, polygonLabelPoint } from '../../core/geometry.js';
import { fmtArea } from '../../core/format.js';
import { roomNetArea } from '../../geometry/roomDetect.js';

export function drawRooms(ctx, r) {
  const rooms = r.project.rooms.filter((x) => x.levelId === r.levelId);
  for (const room of rooms) {
    const mat = FLOOR_MATERIALS[room.floor] || FLOOR_MATERIALS.laminate;
    r.path(ctx, room.points);
    ctx.fillStyle = tint(mat.color, 0.5);
    ctx.fill();
    if (r.vp.scale > 35) {
      ctx.save();
      r.path(ctx, room.points);
      ctx.clip();
      const bb = bboxOf(room.points);
      ctx.strokeStyle = 'rgba(80, 60, 40, 0.08)';
      ctx.lineWidth = r.px(1);
      ctx.beginPath();
      if (room.floor === 'tile' || room.floor === 'stone') {
        const s = room.floor === 'tile' ? 0.3 : 0.6;
        for (let x = Math.floor(bb.minX / s) * s; x <= bb.maxX; x += s) {
          ctx.moveTo(x, bb.minY);
          ctx.lineTo(x, bb.maxY);
        }
        for (let y = Math.floor(bb.minY / s) * s; y <= bb.maxY; y += s) {
          ctx.moveTo(bb.minX, y);
          ctx.lineTo(bb.maxX, y);
        }
      } else if (room.floor === 'parquet' || room.floor === 'laminate') {
        const s = room.floor === 'parquet' ? 0.12 : 0.2;
        for (let y = Math.floor(bb.minY / s) * s; y <= bb.maxY; y += s) {
          ctx.moveTo(bb.minX, y);
          ctx.lineTo(bb.maxX, y);
        }
      }
      ctx.stroke();
      ctx.restore();
    }
  }
}

export function drawRoomLabels(ctx, r) {
  const rooms = r.project.rooms.filter((x) => x.levelId === r.levelId);
  const walls = r.project.walls.filter((w) => w.levelId === r.levelId);
  for (const room of rooms) {
    const bb = bboxOf(room.points);
    const sizePx = Math.min(bb.w, bb.h) * r.vp.scale;
    if (sizePx < 40) continue;
    const p = polygonLabelPoint(room.points);
    const big = sizePx > 90;
    const off = r.px(big ? 8 : 7);
    r.label(ctx, { x: p.x, y: p.y - off }, room.name, { size: big ? 13 : 11, weight: 600, color: THEME.text });
    r.label(ctx, { x: p.x, y: p.y + off }, fmtArea(roomNetArea(room, walls)), {
      size: big ? 12 : 10,
      weight: 500,
      color: THEME.muted,
    });
  }
}
