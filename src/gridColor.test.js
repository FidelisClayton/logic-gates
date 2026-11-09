import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridColor } from './gridColor.js';

test('decodes source dark and light grid tokens', () => {
  assert.deepEqual(gridColor('rgba(255,255,255,.075)'), { rgb: '255,255,255', a: 0.075 });
  assert.deepEqual(gridColor(' rgba(0, 0, 0, .09) '), { rgb: '0,0,0', a: 0.09 });
});

test('decodes production hex grid tokens without losing their alpha', () => {
  assert.deepEqual(gridColor('#ffffff13'), { rgb: '255,255,255', a: 19 / 255 });
  assert.deepEqual(gridColor('#00000017'), { rgb: '0,0,0', a: 23 / 255 });
  assert.deepEqual(gridColor('#FFFFFF13'), { rgb: '255,255,255', a: 19 / 255 });
});

test('decodes opaque hex channels', () => {
  assert.deepEqual(gridColor('#123AbC'), { rgb: '18,58,188', a: 1 });
});

test('falls back to the source dark grid colour for empty or invalid tokens', () => {
  for (const token of ['', '   ', 'invalid', '#fff', '#ffffffzz', 'rgba(256,0,0,.1)', 'rgba(0,0,0,2)']) {
    assert.deepEqual(gridColor(token), { rgb: '255,255,255', a: 0.075 }, token);
  }
});
