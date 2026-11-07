import test from 'node:test';
import assert from 'node:assert/strict';
import { autoLayout } from './layout.js';
import { exampleCircuit } from './logic.js';
import { GRID } from './geometry.js';

const at = (c, id) => c.nodes.find((n) => n.id === id);
const shuffled = () => {
  const c = exampleCircuit();
  c.nodes.forEach((n, i) => { n.x = 500 - i * 13; n.y = (i * 97) % 300; });
  return c;
};

test('example circuit: inputs above pairs, AND between ORs, OUT last', () => {
  const r = autoLayout(shuffled());
  const y = (id) => at(r, id).y;
  assert.ok(Math.max(y('A'), y('B')) < Math.min(y('C'), y('D')));
  assert.ok(y('or1') < y('and') && y('and') < y('or2'));
  const maxX = Math.max(...r.nodes.map((n) => n.x));
  assert.equal(at(r, 'out').x, maxX);
  assert.ok(at(r, 'A').x < at(r, 'or1').x && at(r, 'or1').x < at(r, 'and').x && at(r, 'and').x < at(r, 'out').x);
});

test('no overlaps on a 15-node circuit', () => {
  const types = ['AND', 'OR', 'NOT', 'XOR', 'NAND'];
  const nodes = [];
  const wires = [];
  let seed = 7;
  const rnd = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  for (let i = 0; i < 4; i++) nodes.push({ id: `i${i}`, type: 'INPUT', x: rnd(400), y: rnd(400) });
  for (let i = 0; i < 9; i++) nodes.push({ id: `g${i}`, type: types[rnd(5)], x: rnd(400), y: rnd(400) });
  for (let i = 0; i < 2; i++) nodes.push({ id: `o${i}`, type: 'OUTPUT', x: rnd(400), y: rnd(400) });
  nodes.slice(4, 13).forEach((n, i) => {
    wires.push({ id: `a${i}`, from: nodes[rnd(4 + i)].id, to: n.id, port: 0 });
    if (n.type !== 'NOT') wires.push({ id: `b${i}`, from: nodes[rnd(4 + i)].id, to: n.id, port: 1 });
  });
  wires.push({ id: 'w1', from: 'g8', to: 'o0', port: 0 });
  const r = autoLayout({ name: 'r', nodes, wires });
  for (const a of r.nodes) for (const b of r.nodes) {
    if (a !== b) assert.ok(Math.abs(a.x - b.x) >= 76 || Math.abs(a.y - b.y) >= 56, `${a.id} overlaps ${b.id}`);
  }
});

test('idempotent', () => {
  const once = autoLayout(shuffled());
  assert.deepEqual(autoLayout(once), once);
});

test('does not mutate the input and keeps ids and wires', () => {
  const c = shuffled();
  const copy = structuredClone(c);
  const r = autoLayout(c);
  assert.deepEqual(c, copy);
  assert.deepEqual(r.wires, c.wires);
  assert.deepEqual(r.nodes.map((n) => n.id), c.nodes.map((n) => n.id));
  assert.equal(r.name, c.name);
  assert.equal(at(r, 'B').value, 1);
});

test('unwired nodes sit at the bottom of their column', () => {
  const c = exampleCircuit();
  c.nodes.push({ id: 'lone', type: 'INPUT', x: 0, y: -999, label: 'Z', value: 0 });
  const r = autoLayout(c);
  assert.equal(at(r, 'lone').x, at(r, 'A').x);
  assert.ok(at(r, 'lone').y > Math.max(...['A', 'B', 'C', 'D'].map((id) => at(r, id).y)));
});

test('empty, cyclic and self-looping circuits do not throw and stay finite', () => {
  assert.deepEqual(autoLayout({ name: 'e', nodes: [], wires: [] }).nodes, []);
  const cyc = {
    name: 'c',
    nodes: [{ id: 'a', type: 'NOT', x: 0, y: 0 }, { id: 'b', type: 'NOT', x: 0, y: 0 }, { id: 'o', type: 'OUTPUT', x: 0, y: 0 }],
    wires: [{ id: 'w1', from: 'a', to: 'b', port: 0 }, { id: 'w2', from: 'b', to: 'a', port: 0 }, { id: 'w3', from: 'b', to: 'o', port: 0 }, { id: 'w4', from: 'a', to: 'a', port: 0 }],
  };
  for (const n of autoLayout(cyc).nodes) assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y));
});

test('node centres land on the dot grid', () => {
  for (const n of autoLayout(shuffled()).nodes) assert.ok(n.x % GRID === 0 && n.y % GRID === 0, `${n.id} at ${n.x},${n.y}`);
});
