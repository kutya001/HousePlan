/**
 * «Пользовательские» правки для теста на потери: каждому виду объектов задаём
 * нестандартные значения всех настраиваемых полей. Добавили в модель новое
 * поле — добавьте его сюда, и тест проверит, что ИИ-правка его сохраняет.
 */
export function customize(p) {
  Object.assign(p.site.fence, { height: 2.2, color: '#112233', type: 'picket', sides: { 1: { type: 'brick', height: 2.5 }, 2: { off: true } } });
  Object.assign(p.site, { north: 20, setback: 5, lat: 55.7, lon: 37.6, tz: 3 });
  p.facade = 'brick';
  Object.assign(p, { foundationType: 'piles', plinthFinish: 'tile', plinthColor: '#556677', blindArea: 1.1 });
  p.levels[0].slab = 0.3;
  p.levels[0].height = 3.1;
  for (const s of p.stairs) Object.assign(s, { railing: 'left', railStyle: 'glass', railHeight: 1.05, railColor: '#101010', color: '#445566', flip: true, flight: 1.2, ...(s.shape !== 'spiral' ? { style: 'solid' } : {}) });
  if (p.walls[0]) Object.assign(p.walls[0], { height: 2.2, color: '#aabbcc' });
  if (p.walls[1]) Object.assign(p.walls[1], { type: 'brick', thickness: 0.51, finishA: 'stone', colorA: '#998877', finishB: 'tile', colorB: '#ddeeff' });
  const inner = p.walls.find((w) => w.kind === 'interior');
  if (inner) Object.assign(inner, { type: 'glass', thickness: 0.02 });
  if (p.openings[0]) Object.assign(p.openings[0], { flipSide: true, flipHinge: true });
  // двери и окна со всеми настройками внешнего вида
  const doors = p.openings.filter((o) => o.kind === 'door' && !o.style.startsWith('garage'));
  if (doors[0]) Object.assign(doors[0], { leaf: 'glazed', color: '#334455', frameColor: '#222222', transom: 0.3, sidelight: 'both' });
  if (doors[1]) Object.assign(doors[1], { style: 'fold', leaf: 'glass' });
  const wins = p.openings.filter((o) => o.kind === 'window');
  if (wins[0]) Object.assign(wins[0], { grid: true, arched: true, frameColor: '#3a3a3a' });
  if (p.items[0]) Object.assign(p.items[0], { h: 1.23, color: '#010203', elevation: 0.4 });
  if (p.rooms[0]) p.rooms[0].heatedFloor = true;
  // ломаная крыша со своими уклонами и длинным свесом (длиннее, чем подставляется по умолчанию), без водостоков
  if (p.roofs[0]) Object.assign(p.roofs[0], { type: 'mansard', pitch: 62, pitch2: 22, breakH: 1.9, overhang: 0.45, cover: 'seam', color: '#223344', gutters: false });
  if (p.roofs[1]) Object.assign(p.roofs[1], { type: 'halfhip', hipPart: 0.55, cover: 'ondulin' });
  return p;
}
