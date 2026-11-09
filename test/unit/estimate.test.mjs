import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHousePreset } from '../../js/model/presets.js';
import { computeEstimate, estimateTotal, openingSchedule, roofCoverArea } from '../../js/model/estimate.js';
import { projectMetrics } from '../../js/model/compare.js';
import { buildXlsx, crc32 } from '../../js/io/xlsx.js';
import { estimateWorkbook } from '../../js/io/estimateXlsx.js';

const house2 = buildHousePreset('house2', {});

test('смета: разделы, показатели, итог', () => {
  const est = computeEstimate(house2);
  assert.ok(est.sections.length >= 6);
  assert.equal(est.summary.floors, 2);
  assert.ok(est.summary.total > 150 && est.summary.total < 260, `общая ${est.summary.total}`);
  assert.ok(estimateTotal(est, {}) > 1e6);
  // свои цены учитываются
  assert.ok(estimateTotal(est, { wall_ext: 0 }) < estimateTotal(est, {}));
});

test('кровля с уклоном больше пятна дома', () => {
  assert.ok(roofCoverArea(house2) > computeEstimate(house2).summary.built);
});

test('марки проёмов: одинаковые — одна марка', () => {
  const { rows, marks } = openingSchedule(house2);
  assert.equal(marks.size, house2.openings.length);
  assert.equal(new Set(rows.map((r) => r.mark)).size, rows.length);
  assert.equal(
    rows.reduce((s, r) => s + r.count, 0),
    house2.openings.length,
  );
});

test('сравнение вариантов: показатели', () => {
  const m = projectMetrics(house2, {});
  assert.ok(m.find((x) => x.key === 'cost').value > 0);
  assert.ok(m.find((x) => x.key === 'bed').value >= 2);
});

test('CRC32 и ZIP', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const x = buildXlsx([{ name: 'Лист', rows: [['a', 1, { v: 2, f: 'B1*2' }]] }]);
  assert.equal(String.fromCharCode(x[0], x[1], x[2], x[3]), 'PK\u0003\u0004');
});

test('книга Excel по смете собирается', () => {
  const data = estimateWorkbook(house2, computeEstimate(house2), {});
  assert.ok(data.length > 5000);
});
