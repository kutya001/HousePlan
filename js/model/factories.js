/** Создание объектов проекта с разумными значениями по умолчанию. */
import { uid } from '../core/ids.js';
import { DEFAULTS, COLORS } from './defaults.js';
import { catalogItem } from './catalog.js';
import { SITE_LEVEL } from './project.js';

export function createWall(levelId, a, b, opts = {}) {
  const kind = opts.kind || 'exterior';
  return {
    id: uid('wall'),
    levelId,
    x1: a.x,
    y1: a.y,
    x2: b.x,
    y2: b.y,
    thickness: opts.thickness ?? DEFAULTS.wall[kind]?.thickness ?? 0.3,
    height: opts.height ?? null,
    kind,
    color: opts.color ?? null,
  };
}

export function createOpening(wallId, kind = 'door', opts = {}) {
  const base = DEFAULTS[kind] || DEFAULTS.door;
  const style = opts.style || (kind === 'door' ? 'single' : kind === 'window' ? 'double' : 'open');
  return {
    id: uid('open'),
    wallId,
    kind,
    style,
    t: opts.t ?? 1,
    width: opts.width ?? base.width,
    height: opts.height ?? base.height,
    sill: opts.sill ?? base.sill,
    flipSide: !!opts.flipSide,
    flipHinge: !!opts.flipHinge,
  };
}

export function createRoom(levelId, points, opts = {}) {
  return {
    id: uid('room'),
    levelId,
    name: opts.name ?? 'Комната',
    points: points.map((p) => ({ x: p.x, y: p.y })),
    floor: opts.floor ?? 'laminate',
  };
}

export function createStair(levelId, x, y, opts = {}) {
  const shape = opts.shape || 'straight';
  const presets = {
    straight: { width: 1.0, length: 3.6 },
    L: { width: 2.4, length: 3.0 },
    U: { width: 2.3, length: 3.0 },
    spiral: { width: 1.8, length: 1.8 },
  };
  const p = presets[shape] || presets.straight;
  return {
    id: uid('stair'),
    levelId,
    shape,
    x,
    y,
    rotation: opts.rotation ?? 0,
    width: opts.width ?? p.width,
    length: opts.length ?? p.length,
    flight: opts.flight ?? DEFAULTS.stair.flight,
    flip: !!opts.flip,
    color: opts.color ?? COLORS.stair,
  };
}

export function createItem(levelId, type, x, y, opts = {}) {
  const c = catalogItem(type) || { w: 1, d: 1, h: 1, color: '#c9c3b8', name: type };
  return {
    id: uid('item'),
    // объекты сада — на землю участка, если их не ставят явно на этаж (терраса на крыше)
    levelId: c.outdoor && !opts.onLevel ? SITE_LEVEL : levelId,
    type,
    x,
    y,
    rotation: opts.rotation ?? 0,
    w: opts.w ?? c.w,
    d: opts.d ?? c.d,
    h: opts.h ?? c.h,
    elevation: opts.elevation ?? c.elevation ?? 0,
    color: opts.color ?? c.color,
  };
}

export function createRoof(levelId, x, y, w, d, opts = {}) {
  return {
    id: uid('roof'),
    levelId,
    type: opts.type || 'gable',
    x,
    y,
    w,
    d,
    rotation: opts.rotation ?? 0,
    pitch: opts.pitch ?? DEFAULTS.roof.pitch,
    overhang: opts.overhang ?? DEFAULTS.roof.overhang,
    color: opts.color ?? COLORS.roof,
  };
}

export function createZone(points, material = 'lawn') {
  return {
    id: uid('zone'),
    material,
    points: points.map((p) => ({ x: p.x, y: p.y })),
  };
}
