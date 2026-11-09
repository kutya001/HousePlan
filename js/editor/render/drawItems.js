import { drawItemSymbol } from './symbols2d.js';
import { itemVisible, isMarker } from '../../model/layers.js';
import { catalogItem } from '../../model/catalog.js';

const isMep = (it) => catalogItem(it.type)?.category === 'mep';

/** Мебель активного этажа: ковры снизу, высокие объекты сверху. Инженерия — отдельно, поверх стен. */
export function drawItems(ctx, r) {
  const items = r.project.items.filter((i) => i.levelId === r.levelId && !isMep(i) && itemVisible(r.settings, i));
  items.sort((a, b) => a.elevation + a.h - (b.elevation + b.h));
  for (const it of items) drawItemSymbol(ctx, it, r.px(1.1));
}

/** Слои инженерии: розетки, светильники, выводы труб, радиаторы — поверх стен и проёмов. */
export function drawMepItems(ctx, r) {
  const items = r.project.items.filter((i) => i.levelId === r.levelId && isMep(i) && itemVisible(r.settings, i));
  // крупные (радиатор, щит) снизу, значки сверху
  items.sort((a, b) => Number(isMarker(a)) - Number(isMarker(b)));
  const px = r.px(1);
  for (const it of items) drawItemSymbol(ctx, it, r.px(1.1), { px });
}
