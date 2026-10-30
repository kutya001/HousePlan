/**
 * Тип устройства и раскладка интерфейса.
 *  phone   — до 760 px: нижняя панель инструментов, шторка, компактная шапка;
 *  tablet  — 761–1180 px: инструменты слева, панель свойств выезжает справа;
 *  desktop — шире 1180 px: все панели на экране.
 * coarse — основной ввод пальцем (крупнее ручки и зоны попадания).
 */

const PHONE = '(max-width: 760px)';
const TABLET = '(max-width: 1180px)';
const COARSE = '(pointer: coarse)';

export function currentLayout() {
  if (window.matchMedia(PHONE).matches) return 'phone';
  if (window.matchMedia(TABLET).matches) return 'tablet';
  return 'desktop';
}

export function isCoarse() {
  return window.matchMedia(COARSE).matches;
}

/** Следит за сменой раскладки (поворот экрана, изменение окна). */
export function watchLayout(onChange) {
  const handler = () => onChange(currentLayout(), isCoarse());
  for (const q of [PHONE, TABLET, COARSE]) window.matchMedia(q).addEventListener('change', handler);
  return handler;
}

/** Короткая тактильная отдача (Android). */
export function haptic(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* не поддерживается */
  }
}
