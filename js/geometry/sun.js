/**
 * Солнце и стороны света.
 * Положение солнца — по формулам NOAA (точность ~1°, для теней хватает).
 * Север на плане задаётся углом site.north: 0 — север вверху плана,
 * 90 — север справа (по часовой стрелке).
 */
const RAD = Math.PI / 180;

export const BISHKEK = { lat: 42.874, lon: 74.612, tz: 6 };

/** Широта, долгота, часовой пояс и север участка (с умолчаниями для Бишкека). */
export function siteGeo(site) {
  return {
    lat: Number.isFinite(site?.lat) ? site.lat : BISHKEK.lat,
    lon: Number.isFinite(site?.lon) ? site.lon : BISHKEK.lon,
    tz: Number.isFinite(site?.tz) ? site.tz : BISHKEK.tz,
    north: Number.isFinite(site?.north) ? site.north : 0,
  };
}

function dayOfYear(month, day) {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let n = day;
  for (let m = 0; m < month - 1; m++) n += days[m];
  return n;
}

/**
 * @param geo { lat, lon, tz }
 * @param month 1–12, day 1–31, hour — местное время (14.5 = 14:30)
 * @returns {{ elevation, azimuth }} градусы; азимут от севера по часовой
 */
export function solarPosition(geo, month, day, hour) {
  const N = dayOfYear(month, day);
  const g = ((2 * Math.PI) / 365) * (N - 1 + (hour - 12) / 24);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const tst = hour * 60 + eqt + 4 * geo.lon - 60 * geo.tz;
  const ha = (tst / 4 - 180) * RAD;
  const lat = geo.lat * RAD;
  const cosZ = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(Math.max(-1, Math.min(1, cosZ)));
  const elevation = 90 - zen / RAD;
  let az = Math.acos(Math.max(-1, Math.min(1, (Math.sin(lat) * Math.cos(zen) - Math.sin(decl)) / (Math.cos(lat) * Math.sin(zen) || 1e-9)))) / RAD;
  az = ha > 0 ? (az + 180) % 360 : (540 - az) % 360;
  return { elevation, azimuth: az };
}

/** Направление на север в плане (единичный вектор, y вниз). */
export function northVector(north = 0) {
  const t = north * RAD;
  return { x: Math.sin(t), y: -Math.cos(t) };
}

/** Направление в плане для азимута (от севера по часовой). */
export function azimuthVector(azimuth, north = 0) {
  const n = northVector(north);
  const e = { x: -n.y, y: n.x };
  const a = azimuth * RAD;
  return { x: n.x * Math.cos(a) + e.x * Math.sin(a), y: n.y * Math.cos(a) + e.y * Math.sin(a) };
}

/** Азимут (от севера по часовой) для направления в плане. */
export function vectorAzimuth(v, north = 0) {
  const n = northVector(north);
  const e = { x: -n.y, y: n.x };
  const a = Math.atan2(v.x * e.x + v.y * e.y, v.x * n.x + v.y * n.y) / RAD;
  return (a + 360) % 360;
}

const POINTS = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
const POINTS_LONG = ['север', 'северо-восток', 'восток', 'юго-восток', 'юг', 'юго-запад', 'запад', 'северо-запад'];

export function compassPoint(azimuth, long = false) {
  const i = Math.round((((azimuth % 360) + 360) % 360) / 45) % 8;
  return (long ? POINTS_LONG : POINTS)[i];
}

export const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export function fmtHour(h) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}:${String(mm).padStart(2, '0')}`;
}
