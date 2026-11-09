/** Показатели проекта для сравнения вариантов. */
import { computeEstimate, estimateTotal } from './estimate.js';

const BEDROOM = /спальн|детск/i;
const BATH = /санузел|ванн|туалет|с\/у|душ/i;

/**
 * @returns {Array<{ key, label, value, unit, better }>} better: 'min' | 'max' | null —
 *          какое значение лучше (подсвечивается в таблице)
 */
export function projectMetrics(project, prices) {
  const est = computeEstimate(project);
  const s = est.summary;
  const rooms = est.rooms.filter((r) => !r.terrace);
  const total = estimateTotal(est, prices);
  const windows = project.openings.filter((o) => o.kind === 'window').length;
  return [
    { key: 'total', label: 'Общая площадь', value: s.total, unit: 'м²', better: 'max' },
    { key: 'living', label: 'Жилая площадь', value: s.living, unit: 'м²', better: 'max' },
    { key: 'built', label: 'Площадь застройки', value: s.built, unit: 'м²', better: null },
    { key: 'floors', label: 'Этажей над землёй', value: s.floors, unit: '', better: null },
    { key: 'rooms', label: 'Помещений', value: rooms.length, unit: '', better: null },
    { key: 'bed', label: 'Спален и детских', value: rooms.filter((r) => BEDROOM.test(r.name)).length, unit: '', better: 'max' },
    { key: 'bath', label: 'Санузлов', value: rooms.filter((r) => BATH.test(r.name)).length, unit: '', better: 'max' },
    { key: 'windows', label: 'Окон', value: windows, unit: 'шт', better: null },
    { key: 'light', label: 'Окна к площади пола', value: s.total ? Math.round((s.windows / s.total) * 1000) / 10 : 0, unit: '%', better: 'max' },
    { key: 'ridge', label: 'Высота до конька', value: s.ridge, unit: 'м', better: null },
    { key: 'roof', label: 'Площадь кровли', value: s.roof, unit: 'м²', better: null },
    { key: 'walls', label: 'Объём наружных стен', value: s.walls, unit: 'м³', better: null },
    { key: 'cost', label: 'Смета, ориентировочно', value: total, unit: 'сом', better: 'min' },
    { key: 'perm2', label: 'За 1 м² общей площади', value: s.total ? Math.round(total / s.total) : 0, unit: 'сом', better: 'min' },
  ];
}
