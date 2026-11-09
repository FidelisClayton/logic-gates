import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRID, snap, clampCoord, wireGeom, outPort, inPorts } from './geometry.js';

const gate = (id, type, x, y) => ({ id, type, x, y });
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.01;

test('square wire starts and ends on the ports, for every routing case', () => {
  const src = gate('s', 'OR', 300, 100);
  for (const [x, y] of [[560, 220], [560, 100], [320, 180], [100, 100], [100, 300]]) {
    const dst = gate('t', 'AND', x, y);
    const g = wireGeom(src, dst, 1);
    const a = outPort(src); const b = inPorts(dst)[1];
    assert.ok(near(g.at(0), [a.x, a.y]), `start ${x},${y}`);
    assert.ok(near(g.at(1), [b.x, b.y]), `end ${x},${y}`);
  }
});

test('equal y gives a straight line; chips follow the path by arc length', () => {
  const a = gate('a', 'NOT', 100, 100); const b = gate('b', 'NOT', 400, 100);
  const g = wireGeom(a, b, 0);
  assert.equal(g.d, `M136 100L362 100`);
  assert.ok(near(g.at(0.5), [249, 100]));
});

test('curved style is still available', () => {
  assert.match(wireGeom(gate('a', 'NOT', 0, 0), gate('b', 'NOT', 300, 80), 0, 'curved').d, /C/);
});

test('snap rounds to the dot grid', () => {
  assert.equal(snap(13), 24); assert.equal(snap(11), 0); assert.equal(GRID, 24);
});

import { fitView, zoomAt } from './geometry.js';

test('fitView centres at 1 when it fits and zooms out when it does not', () => {
  const b = { x0: 0, y0: 0, x1: 200, y1: 100 };
  assert.deepEqual(fitView(b, 400, 300), { x: 100, y: 100, k: 1 });
  const v = fitView({ x0: 0, y0: 0, x1: 1000, y1: 100 }, 400, 300);
  assert.ok(Math.abs(v.k - 0.352) < 0.001 && Math.abs(v.x - 24) < 0.01);
});

test('zoomAt keeps the point under the cursor and clamps to the range', () => {
  const v = { x: 50, y: 20, k: 1 };
  const z = zoomAt(v, 2, 150, 120);
  assert.equal(z.k, 2);
  assert.equal((150 - z.x) / z.k, (150 - v.x) / v.k);
  assert.equal(zoomAt(v, 9, 0, 0).k, 2);
  assert.equal(zoomAt(v, 0.1, 0, 0).k, 0.4);
});

test('clampCoord preserves ordinary coordinates and bounds edits for persistence', () => {
  for (const v of [0, 24, -24, 123.5, -123.5, 999999, -999999]) assert.equal(clampCoord(v), v);
  for (const v of [999999.5, 1000024, Infinity]) assert.equal(clampCoord(v), 999999);
  for (const v of [-999999.5, -1000024, -Infinity]) assert.equal(clampCoord(v), -999999);
});
