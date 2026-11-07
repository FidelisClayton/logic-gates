import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, exampleCircuit } from './logic.js';
import { GATE_MS, HOP, OUT_EASE, OUT_STRETCH, SPEED, WIRE_MS, commitSchedule, waveSteps } from './pulse.js';

test('flipping B reaches OR, then AND, then OUT, one hop apart', () => {
  const a = exampleCircuit();
  const b = { ...a, nodes: a.nodes.map((n) => (n.id === 'B' ? { ...n, value: 0 } : n)) };
  const { wires, nodes } = waveSteps(b, evaluate(a), evaluate(b));
  assert.deepEqual(wires.map((w) => [w.id, w.delay, w.v]), [['w2', 0, 0], ['w5', HOP, 0], ['w7', 2 * HOP, 0]]);
  assert.deepEqual(nodes.map((n) => [n.id, n.delay]), [['or1', WIRE_MS], ['and', HOP + WIRE_MS], ['out', 2 * HOP + WIRE_MS]]);
});

test('a flip that changes nothing downstream stops at the first wire', () => {
  const a = exampleCircuit();
  const b = { ...a, nodes: a.nodes.map((n) => (n.id === 'A' ? { ...n, value: 1 } : n)) };
  const { wires, nodes } = waveSteps(b, evaluate(a), evaluate(b));
  assert.deepEqual(wires.map((w) => w.id), ['w1']);
  assert.deepEqual(nodes, []);
});

test('commitSchedule groups ids by arrival time and skips delay 0', () => {
  const a = exampleCircuit();
  const b = { ...a, nodes: a.nodes.map((n) => (n.id === 'B' ? { ...n, value: 0 } : n)) };
  assert.deepEqual(commitSchedule(waveSteps(b, evaluate(a), evaluate(b))), [
    { delay: HOP, wires: ['w5'], nodes: ['or1'] },
    { delay: 2 * HOP, wires: ['w7'], nodes: ['and'] },
    { delay: 3 * HOP, wires: [], nodes: ['out'] },
  ]);
});

test('with lengths the front moves at SPEED and each gate adds GATE_MS before its output wire leaves', () => {
  const a = exampleCircuit();
  const b = { ...a, nodes: a.nodes.map((n) => (n.id === 'B' ? { ...n, value: 0 } : n)) };
  const len = { w2: 100, w5: 200, w7: 300 };
  const { wires, nodes } = waveSteps(b, evaluate(a), evaluate(b), [], (id) => len[id]);
  const d = (id) => len[id] / SPEED;
  assert.deepEqual(wires.map((w) => [w.id, w.delay, w.dur, w.ease]), [['w2', 0, d('w2'), 'linear'], ['w5', d('w2') + GATE_MS, d('w5'), 'linear'], ['w7', d('w2') + d('w5') + 2 * GATE_MS, d('w7') * OUT_STRETCH, `cubic-bezier(${OUT_EASE})`]]);
  assert.deepEqual(nodes.map((n) => [n.id, n.delay]), [['or1', d('w2')], ['and', d('w2') + GATE_MS + d('w5')], ['out', d('w2') + d('w5') + d('w7') * OUT_STRETCH + 2 * GATE_MS]]);
});

test('the wire into OUT starts at SPEED and ends at rest', () => {
  const a = exampleCircuit();
  const b = { ...a, nodes: a.nodes.map((n) => (n.id === 'B' ? { ...n, value: 0 } : n)) };
  const w7 = waveSteps(b, evaluate(a), evaluate(b), [], () => 300).wires.find((w) => w.id === 'w7');
  const [x1, y1, , y2] = OUT_EASE;
  assert.ok(Math.abs(((y1 / x1) * 300) / w7.dur - SPEED) / SPEED < 0.1); // px/ms at t=0
  assert.equal(y2, 1);
});
