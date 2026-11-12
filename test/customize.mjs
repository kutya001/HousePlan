/**
 * «Пользовательские» правки для теста на потери: каждому виду объектов задаём
 * нестандартные значения всех настраиваемых полей. Добавили в модель новое
 * поле — добавьте его сюда, и тест проверит, что ИИ-правка его сохраняет.
 */
export function customize(p) {
  Object.assign(p.site.fence, { height: 2.2, color: '#112233' });
  Object.assign(p.site, { north: 20, setback: 5, lat: 55.7, lon: 37.6, tz: 3 });
  p.facade = 'brick';
  p.levels[0].slab = 0.3;
  p.levels[0].height = 3.1;
  for (const s of p.stairs) Object.assign(s, { railing: 'both', color: '#445566', flip: true, flight: 1.2, ...(s.shape !== 'spiral' ? { style: 'solid' } : {}) });
  if (p.walls[0]) Object.assign(p.walls[0], { height: 2.2, color: '#aabbcc' });
  if (p.openings[0]) Object.assign(p.openings[0], { flipSide: true, flipHinge: true });
  if (p.items[0]) Object.assign(p.items[0], { h: 1.23, color: '#010203', elevation: 0.4 });
  if (p.rooms[0]) p.rooms[0].heatedFloor = true;
  if (p.roofs[0]) Object.assign(p.roofs[0], { cover: 'tiles', color: '#223344' });
  return p;
}
