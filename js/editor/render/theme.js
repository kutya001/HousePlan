/** Цвета и шрифты чертежа. Совпадают с токенами в css/tokens.css. */
export const THEME = {
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
  muted: '#6e7a85',
  ghost: 'rgba(55, 75, 92, 0.32)',
  danger: '#c9372c',
  siteStroke: '#5d7a4c',
  siteFill: 'rgba(141, 187, 110, 0.16)',
  itemStroke: '#46515b',
  font: '"Golos Text", system-ui, -apple-system, "Segoe UI", sans-serif',
};

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
