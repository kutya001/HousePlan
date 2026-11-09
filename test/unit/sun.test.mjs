import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solarPosition, BISHKEK, compassPoint, azimuthVector, vectorAzimuth } from '../../js/geometry/sun.js';

test('Бишкек, 21 июня: солнце в полдень высоко на юге', () => {
  // солнечный полдень в Бишкеке около 13:05 по местному времени (UTC+6)
  const p = solarPosition(BISHKEK, 6, 21, 13.1);
  assert.ok(p.elevation > 68 && p.elevation < 72, `высота ${p.elevation}`);
  assert.ok(Math.abs(p.azimuth - 180) < 10, `азимут ${p.azimuth}`);
});

test('зимой ночью солнце под горизонтом', () => {
  assert.ok(solarPosition(BISHKEK, 12, 21, 23).elevation < -20);
});

test('восход на востоке, закат на западе', () => {
  assert.equal(compassPoint(solarPosition(BISHKEK, 3, 20, 7).azimuth), 'В');
  assert.equal(compassPoint(solarPosition(BISHKEK, 3, 20, 19).azimuth), 'З');
});

test('азимут ↔ направление на плане с учётом севера', () => {
  for (const north of [0, 30, -90]) {
    const v = azimuthVector(135, north);
    assert.ok(Math.abs(vectorAzimuth(v, north) - 135) < 1e-6);
  }
});
