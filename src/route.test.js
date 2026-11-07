import test from 'node:test';
import assert from 'node:assert/strict';
import { autoLayout } from './layout.js';
import { exampleCircuit } from './logic.js';
import { routeAll, wireGeom, outPort, inPorts } from './geometry.js';

const N = (id, type, x = 0, y = 0) => ({ id, type, x, y, ...(type === 'INPUT' ? { label: id, value: 1 } : {}) });
const userCircuit = () => ({
  name: 'u',
  nodes: [N('A', 'INPUT', 70, 90), N('B', 'INPUT', 70, 230), N('and', 'AND', 300, 90), N('not', 'NOT', 300, 230), N('or', 'OR', 520, 130), N('out', 'OUTPUT', 700, 130)],
  wires: [
    { id: 'w1', from: 'A', to: 'and', port: 1 }, { id: 'w2', from: 'A', to: 'or', port: 0 },
    { id: 'w3', from: 'B', to: 'not', port: 0 }, { id: 'w4', from: 'not', to: 'or', port: 1 }, { id: 'w5', from: 'or', to: 'out', port: 0 },
  ],
});
const random15 = () => {
  const types = ['AND', 'OR', 'NOT', 'XOR', 'NAND'];
  const nodes = []; const wires = [];
  let seed = 7;
  const rnd = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  for (let i = 0; i < 4; i++) nodes.push(N(`i${i}`, 'INPUT', rnd(400), rnd(400)));
  for (let i = 0; i < 9; i++) nodes.push(N(`g${i}`, types[rnd(5)], rnd(400), rnd(400)));
  for (let i = 0; i < 2; i++) nodes.push(N(`o${i}`, 'OUTPUT', rnd(400), rnd(400)));
  nodes.slice(4, 13).forEach((n, i) => {
    wires.push({ id: `a${i}`, from: nodes[rnd(4 + i)].id, to: n.id, port: 0 });
    if (n.type !== 'NOT') wires.push({ id: `b${i}`, from: nodes[rnd(4 + i)].id, to: n.id, port: 1 });
  });
  wires.push({ id: 'w1', from: 'g8', to: 'o0', port: 0 });
  return { name: 'r', nodes, wires };
};

// Real (not inflated) visible boxes, same extents as geometry.js.
const EXT = { INPUT: [36, 40, 18, 18], OUTPUT: [26, 24, 30, 54] };
const box = (n) => { const [l, r, u, d] = EXT[n.type] ?? [40, 40, 42, 42]; return [n.x - l, n.y - u, n.x + r, n.y + d]; };
const crosses = (p, q, b) => Math.max(p[0], q[0]) > b[0] && Math.min(p[0], q[0]) < b[2] && Math.max(p[1], q[1]) > b[1] && Math.min(p[1], q[1]) < b[3];

function check(c) {
  const routes = routeAll(c, 'square');
  const byId = new Map(c.nodes.map((n) => [n.id, n]));
  let routed = 0;
  for (const w of c.wires) {
    const r = routes.get(w.id);
    if (r.fallback) continue;
    routed++;
    for (const n of c.nodes) {
      if (n.id === w.from || n.id === w.to) continue;
      for (let k = 1; k < r.pts.length; k++) assert.ok(!crosses(r.pts[k - 1], r.pts[k], box(n)), `${w.id} passes through ${n.id}`);
    }
    const a = outPort(byId.get(w.from)); const b = inPorts(byId.get(w.to))[w.port];
    assert.ok(r.grid[1][1] === a.y && r.grid[1][0] > a.x, `${w.id} leaves rightward`);
    assert.ok(r.grid.at(-2)[1] === b.y && r.grid.at(-2)[0] < b.x, `${w.id} enters from the left`);
  }
  return routed;
}

test('routed wires avoid nodes and run out right / in from the left', () => {
  const laid = autoLayout(userCircuit());
  assert.equal(check(laid), laid.wires.length, 'no fallback on the user circuit');
  const ex = autoLayout(exampleCircuit());
  assert.equal(check(ex), ex.wires.length);
  check(exampleCircuit());
  const r = autoLayout(random15());
  assert.ok(check(r) >= r.wires.length - 1);
});

test('auto format moves the AND off the long A -> OR lane', () => {
  const laid = autoLayout(userCircuit());
  const at = (id) => laid.nodes.find((n) => n.id === id);
  assert.equal(at('A').x, at('B').x);
  assert.equal(at('and').x, at('not').x);
  assert.ok(at('A').x < at('and').x && at('and').x < at('or').x && at('or').x < at('out').x);
  assert.notEqual(at('and').y, at('A').y);
});

test('fallback: an unreachable port gives the old 3-segment route', () => {
  const from = N('s', 'INPUT', 100, 100); const to = N('t', 'AND', 400, 100);
  const wall = N('x', 'AND', 340, 100); // sits on the target's lead
  const g = wireGeom(from, to, 0, 'square', [from, to, wall]);
  assert.equal(g.fallback, true);
  assert.ok(g.d.startsWith('M136 86') || g.d.startsWith('M136 100'));
  assert.equal(wireGeom(from, to, 0, 'square', [from, to]).fallback, false);
});

test('fan-out: wires from one source share the stub and a junction marks the split', () => {
  const laid = autoLayout(userCircuit());
  const routes = routeAll(laid, 'square');
  const [w1, w2] = ['w1', 'w2'].map((id) => routes.get(id));
  assert.deepEqual(w1.stub, w2.stub);
  assert.ok(w1.first && !w2.first);
  assert.ok(w2.junction && w2.junction[0] >= w1.stub[0]);
});
