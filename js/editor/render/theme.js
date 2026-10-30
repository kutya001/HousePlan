/**
 * Цвета и шрифты чертежа. Совпадают с токенами в css/tokens.css.
 * Объект THEME меняется на месте при смене темы (applyCanvasTheme),
 * поэтому все слои всегда берут актуальные цвета.
 */
const LIGHT = {
  dark: false,
  paper: '#edf1f3',
  gridMinor: 'rgba(60, 90, 110, 0.07)',
  gridMajor: 'rgba(60, 90, 110, 0.17)',
  axis: 'rgba(60, 90, 110, 0.28)',
  ink: '#22282e',
  wallExt: '#2b3036',
  wallInt: '#68717a',
  wallStroke: '#1b1f23',
  accent: '#2456d6',
  accentSoft: 'rgba(36, 86, 214, 0.14)',
  hover: 'rgba(36, 86, 214, 0.45)',
  snap: '#0e9f6e',
  guide: '#d6336c',
  dim: '#3c4752',
  text: '#1c2329',
  muted: '#5f6b75',
  ghost: 'rgba(55, 75, 92, 0.32)',
  danger: '#c9372c',
  siteStroke: '#55723f',
  siteFill: 'rgba(141, 187, 110, 0.16)',
  itemStroke: '#46515b',
  halo: 'rgba(237, 241, 243, 0.92)',
  windowFill: '#fbfcfc',
  voidFill: 'rgba(255, 255, 255, 0.55)',
  handleFill: '#ffffff',
  labelInk: '#ffffff',
};

const DARK = {
  dark: true,
  paper: '#161b20',
  gridMinor: 'rgba(170, 190, 205, 0.06)',
  gridMajor: 'rgba(170, 190, 205, 0.13)',
  axis: 'rgba(170, 190, 205, 0.24)',
  ink: '#d9e0e5',
  wallExt: '#dfe4e8',
  wallInt: '#97a2ab',
  wallStroke: '#07090b',
  accent: '#6b95ff',
  accentSoft: 'rgba(107, 149, 255, 0.18)',
  hover: 'rgba(107, 149, 255, 0.5)',
  snap: '#2fc98f',
  guide: '#ff6b9a',
  dim: '#aab5be',
  text: '#e8edf1',
  muted: '#9aa6b0',
  ghost: 'rgba(190, 205, 215, 0.32)',
  danger: '#ff7a6e',
  siteStroke: '#8fb27a',
  siteFill: 'rgba(141, 187, 110, 0.09)',
  itemStroke: '#c0c9d0',
  halo: 'rgba(22, 27, 32, 0.92)',
  windowFill: '#26303a',
  voidFill: 'rgba(0, 0, 0, 0.35)',
  handleFill: '#1d2329',
  labelInk: '#0d1114',
};

export const THEME = {
  ...LIGHT,
  font: '"Golos Text", system-ui, -apple-system, "Segoe UI", sans-serif',
};

export function applyCanvasTheme(dark) {
  Object.assign(THEME, dark ? DARK : LIGHT);
}

export const font = (size, weight = 500) => `${weight} ${size}px ${THEME.font}`;

/** Смешивание hex-цвета с белым (amount 0..1). */
export function tint(hex, amount = 0.5) {
  const c = parseHex(hex);
  if (!c) return hex;
  const m = (v) => Math.round(v + (255 - v) * amount);
  return `rgb(${m(c.r)}, ${m(c.g)}, ${m(c.b)})`;
}

/** Затемнение hex-цвета (amount 0..1). */
export function shade(hex, amount = 0.3) {
  const c = parseHex(hex);
  if (!c) return hex;
  const m = (v) => Math.round(v * (1 - amount));
  return `rgb(${m(c.r)}, ${m(c.g)}, ${m(c.b)})`;
}

/** Смешивание двух hex-цветов. */
export function mix(hexA, hexB, t) {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  if (!a || !b) return hexA;
  const m = (x, y) => Math.round(x + (y - x) * t);
  return `rgb(${m(a.r, b.r)}, ${m(a.g, b.g)}, ${m(a.b, b.b)})`;
}

/** Заливка пола комнаты с учётом темы. */
export function floorFill(hex) {
  return THEME.dark ? mix(hex, THEME.paper, 0.62) : tint(hex, 0.5);
}

/** Заливка мебели с учётом темы. */
export function itemFill(hex) {
  return THEME.dark ? mix(hex, THEME.paper, 0.45) : tint(hex, 0.55);
}

export function withAlpha(hex, alpha) {
  const c = parseHex(hex);
  if (!c) return hex;
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

function parseHex(hex) {
  if (typeof hex !== 'string' || hex[0] !== '#') return null;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
