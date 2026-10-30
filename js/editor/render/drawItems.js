import { drawItemSymbol } from './symbols2d.js';

/** Мебель активного этажа: ковры снизу, высокие объекты сверху. */
export function drawItems(ctx, r) {
  const items = r.project.items.filter((i) => i.levelId === r.levelId);
  items.sort((a, b) => a.elevation + a.h - (b.elevation + b.h));
  for (const it of items) drawItemSymbol(ctx, it, r.px(1.1));
}
