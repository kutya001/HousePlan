/**
 * Камера 2D-плана: центр (в метрах) и масштаб (пикселей на метр).
 */
export class Viewport {
  constructor() {
    this.cx = 0;
    this.cy = 0;
    this.scale = 40;
    this.width = 1;
    this.height = 1;
    this.minScale = 3;
    this.maxScale = 800;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  toScreen(p) {
    return {
      x: (p.x - this.cx) * this.scale + this.width / 2,
      y: (p.y - this.cy) * this.scale + this.height / 2,
    };
  }

  toWorld(s) {
    return {
      x: (s.x - this.width / 2) / this.scale + this.cx,
      y: (s.y - this.height / 2) / this.scale + this.cy,
    };
  }

  /** Перевести пиксели экрана в метры. */
  px(n) {
    return n / this.scale;
  }

  pan(dxPx, dyPx) {
    this.cx -= dxPx / this.scale;
    this.cy -= dyPx / this.scale;
  }

  zoomAt(screenPoint, factor) {
    const before = this.toWorld(screenPoint);
    this.scale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * factor));
    const after = this.toWorld(screenPoint);
    this.cx += before.x - after.x;
    this.cy += before.y - after.y;
  }

  /** Вписать прямоугольник (в метрах) с отступом в пикселях. */
  fit(bbox, padding = 60) {
    if (!bbox || !Number.isFinite(bbox.minX)) return;
    const w = Math.max(1, bbox.maxX - bbox.minX);
    const h = Math.max(1, bbox.maxY - bbox.minY);
    this.cx = (bbox.minX + bbox.maxX) / 2;
    this.cy = (bbox.minY + bbox.maxY) / 2;
    const sx = (this.width - padding * 2) / w;
    const sy = (this.height - padding * 2) / h;
    this.scale = Math.max(this.minScale, Math.min(this.maxScale, Math.min(sx, sy)));
  }

  /** Матрица мир → экран для ctx.setTransform (с учётом devicePixelRatio). */
  transform(dpr) {
    const s = this.scale * dpr;
    return [s, 0, 0, s, (this.width / 2 - this.cx * this.scale) * dpr, (this.height / 2 - this.cy * this.scale) * dpr];
  }
}
