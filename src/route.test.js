import test from 'node:test';
import assert from 'node:assert/strict';
import { autoLayout } from './layout.js';
import { decode, encode, exampleCircuit } from './logic.js';
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
  const example = exampleCircuit();
  assert.equal(check(example), example.wires.length);
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

test('distant decoded nodes use finite fallback paths without allocating a lattice', (t) => {
  const noLattice = () => assert.fail('distant routes must skip lattice allocation');
  t.mock.method(Array, 'from', noLattice);
  t.mock.method(globalThis, 'Float64Array', noLattice);
  t.mock.method(globalThis, 'Int32Array', noLattice);
  const edge = 999999.5;
  for (const [x1, y1, x2, y2] of [
    [0, 0, 100000, 100000],
    [-edge, -edge, edge, edge], [edge, edge, -edge, -edge],
    [-edge, edge, edge, -edge], [edge, -edge, -edge, edge],
    [-edge, 0, edge, 0], [edge, 0, -edge, 0],
    [0, -edge, 0, edge], [0, edge, 0, -edge],
  ]) {
    const c = decode(encode({
      name: 'distant',
      nodes: [N('s', 'INPUT', x1, y1), N('t', 'OUTPUT', x2, y2)],
      wires: [{ id: 'w', from: 's', to: 't', port: 0 }],
    }));
    assert.ok(c);
    const g = routeAll(c).get('w');
    assert.equal(g.fallback, true);
    assert.ok(g.grid.length <= 6);
    assert.ok(Number.isFinite(g.total));
    assert.doesNotMatch(g.d, /NaN|Infinity/);
    for (const p of [...g.grid, g.chip, ...[0, 0.25, 0.5, 1].map(g.at)]) assert.ok(p.every(Number.isFinite));
    assert.deepEqual(g.grid[0], [x1 + 36, y1]);
    assert.deepEqual(g.grid.at(-1), [x2 - 24, y2]);
    assert.ok(Math.hypot(g.at(1)[0] - (x2 - 24), g.at(1)[1] - y2) < 0.01);
  }
});

test('fan-out: wires from one source share the stub and a junction marks the split', () => {
  const laid = autoLayout(userCircuit());
  const routes = routeAll(laid, 'square');
  const [w1, w2] = ['w1', 'w2'].map((id) => routes.get(id));
  assert.deepEqual(w1.stub, w2.stub);
  assert.ok(w1.first && !w2.first);
  assert.ok(w2.junction && w2.junction[0] >= w1.stub[0]);
});

test('wire searches consume one shared budget and skip work once exhausted', (t) => {
  const from = N('s', 'INPUT', 17, 19), to = N('t', 'OUTPUT', 317, 19);
  const nodes = [from, to, N('obstacle', 'AND', 167, 19)];
  const budget = { remaining: 20000 };
  assert.equal(wireGeom(from, to, 0, 'square', nodes, new Set(), budget).fallback, false);
  assert.ok(budget.remaining > 0 && budget.remaining < 20000);
  budget.remaining = 1;
  const limited = wireGeom(from, to, 0, 'square', nodes, new Set(), budget);
  assert.equal(limited.fallback, true);
  assert.equal(budget.remaining, 0);
  const noWork = () => assert.fail('exhausted searches must skip obstacles and lattice allocation');
  const unreadNodes = new Proxy(nodes, { get: (target, key) => key === 'map' ? noWork : Reflect.get(target, key) });
  t.mock.method(Array, 'from', noWork);
  t.mock.method(globalThis, 'Float64Array', noWork);
  t.mock.method(globalThis, 'Int32Array', noWork);
  const exhausted = wireGeom(from, to, 0, 'square', unreadNodes, new Set(), budget);
  assert.equal(budget.remaining, 0);
  assert.equal(exhausted.fallback, true);
  assert.equal(exhausted.d, limited.d);
  assert.ok(Number.isFinite(exhausted.total));
  for (const p of [...exhausted.grid, exhausted.chip, exhausted.at(0.5)]) assert.ok(p.every(Number.isFinite));
});

test('routeAll shares its search budget and reuses finite routes after exhaustion', () => {
  const nodes = [], wires = [];
  for (let i = 0; i < 166; i++) {
    nodes.push(N(`s${i}`, 'INPUT', 17, 19 + i * 200), N(`t${i}`, 'OUTPUT', 317, 19 + i * 200), N(`b${i}`, 'AND', 167, 19 + i * 200));
    wires.push({ id: `budget${i}`, from: `s${i}`, to: `t${i}`, port: 0 });
  }
  const c = { nodes, wires };
  const routes = routeAll(c);
  assert.equal(routes.get('budget0').fallback, false);
  const last = routes.get('budget165');
  assert.equal(last.fallback, true);
  assert.equal(wireGeom(nodes.at(-3), nodes.at(-2), 0, 'square', nodes).fallback, false);
  const warm = routeAll(c);
  assert.deepEqual([...warm.values()].map((r) => r.d), [...routes.values()].map((r) => r.d));
  assert.ok([...routes.values()].every((r) => Number.isFinite(r.total)));
});
