import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GATES, evaluate, wouldCreateCycle, nextLabel, truthTable, encode, decode, exampleCircuit, replaceType } from './logic.js';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

// One gate fed by inputs, returns its output for given bits.
function run(type, bits) {
  const n = GATES[type].inputs;
  const nodes = [{ id: 'g', type, x: 0, y: 0 }];
  const wires = [];
  bits.slice(0, n).forEach((v, i) => {
    nodes.push({ id: `i${i}`, type: 'INPUT', x: 0, y: 0, label: 'ABC'[i], value: v });
    wires.push({ id: `w${i}`, from: `i${i}`, to: 'g', port: i });
  });
  return evaluate({ name: 't', nodes, wires }).node.g;
}

const expected = {
  NOT: (a) => +!a, AND: (a, b) => a & b, AND3: (a, b, c) => a & b & c, NAND: (a, b) => +!(a & b),
  OR: (a, b) => a | b, NOR: (a, b) => +!(a | b), XOR: (a, b) => a ^ b, XNOR: (a, b) => +!(a ^ b),
};
for (const [type, fn] of Object.entries(expected)) {
  test(`${type} truth table`, () => {
    const n = GATES[type].inputs;
    for (let i = 0; i < 1 << n; i++) {
      const bits = Array.from({ length: n }, (_, k) => (i >> (n - 1 - k)) & 1);
      assert.equal(run(type, bits), fn(...bits), `${type} ${bits}`);
    }
  });
}

test('example evaluates to OUT=1', () => {
  const r = evaluate(exampleCircuit());
  assert.equal(r.node.out, 1);
  assert.equal(r.wire.w1, 0);
  assert.equal(r.wire.w7, 1);
});

test('unconnected port reads 0', () => {
  const c = { name: 't', nodes: [{ id: 'n', type: 'NOT', x: 0, y: 0 }, { id: 'o', type: 'OUTPUT', x: 0, y: 0, label: 'OUT' }], wires: [{ id: 'w', from: 'n', to: 'o', port: 0 }] };
  assert.equal(evaluate(c).node.n, 1);
  assert.equal(evaluate(c).node.o, 1);
});

test('cycle detection', () => {
  const c = exampleCircuit();
  assert.equal(wouldCreateCycle(c, 'and', 'or1'), true);
  assert.equal(wouldCreateCycle(c, 'or1', 'or1'), true);
  assert.equal(wouldCreateCycle(c, 'A', 'or2'), false);
});

test('nextLabel', () => {
  const c = exampleCircuit();
  assert.equal(nextLabel(c, 'INPUT'), 'E');
  assert.equal(nextLabel(c, 'OUTPUT'), 'OUT2');
  assert.equal(nextLabel({ ...c, nodes: [] }, 'OUTPUT'), 'OUT');
  assert.equal(nextLabel({ ...c, nodes: c.nodes.filter((n) => n.id !== 'B') }, 'INPUT'), 'B');
});

test('truthTable on example', () => {
  const t = truthTable(exampleCircuit());
  assert.equal(t.rows.length, 16);
  assert.deepEqual(t.inputs.map((i) => i.label), ['A', 'B', 'C', 'D']);
  assert.equal(t.current, 6);
  assert.deepEqual(t.rows[6], { in: [0, 1, 1, 0], out: [1] });
  assert.deepEqual(t.rows[15].out, [1]);
  assert.deepEqual(t.rows[0].out, [0]);
});

test('truthTable tooMany at 7 inputs', () => {
  const nodes = Array.from({ length: 7 }, (_, i) => ({ id: `i${i}`, type: 'INPUT', x: 0, y: 0, label: 'ABCDEFG'[i], value: 0 }));
  assert.deepEqual(truthTable({ name: 't', nodes, wires: [] }), { tooMany: true, count: 7 });
});

test('encode/decode round trip', () => {
  const c = exampleCircuit();
  const s = encode(c);
  assert.match(s, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decode(s), c);
  const u = { ...c, name: 'Üñí ✓' };
  assert.equal(decode(encode(u)).name, 'Üñí ✓');
});

test('decode rejects bad input', () => {
  const c = exampleCircuit();
  const bad = (m) => assert.equal(decode(b64(m(structuredClone(c)))), null);
  for (const s of ['', 'not base64!!', '%%%', b64('x'), b64([]), b64(null), 42, null]) assert.equal(decode(s), null);
  bad((x) => { x.nodes[0].type = 'WIRE'; return x; });
  bad((x) => { x.nodes[0].type = '__proto__'; return x; });
  bad((x) => { x.nodes[0].id = 'a b<'; return x; });
  bad((x) => { x.nodes[1].id = 'A'; return x; });
  bad((x) => { x.wires[0].to = 'ghost'; return x; });
  bad((x) => { x.wires[0].port = 2; return x; });
  bad((x) => { x.wires[0].port = -1; return x; });
  bad((x) => { x.wires[0].from = 'out'; return x; });
  bad((x) => { x.wires.push({ id: 'dup', from: 'C', to: 'or1', port: 0 }); return x; });
  bad((x) => { x.wires.push({ id: 'loop', from: 'and', to: 'or1', port: 0 }); x.wires.shift(); return x; });
  bad((x) => { x.nodes[0].x = 'far'; return x; });
  bad((x) => { x.nodes = Array.from({ length: 501 }, (_, i) => ({ id: `n${i}`, type: 'NOT', x: 0, y: 0 })); x.wires = []; return x; });
});

const rep = () => ({
  name: 'r',
  nodes: [
    { id: 'a', type: 'INPUT', x: 0, y: 0, label: 'A', value: 1 },
    { id: 'b', type: 'INPUT', x: 0, y: 50, label: 'B', value: 1 },
    { id: 'c', type: 'INPUT', x: 0, y: 100, label: 'C', value: 1 },
    { id: 'g', type: 'AND3', x: 90, y: 40 },
    { id: 'o', type: 'OUTPUT', x: 200, y: 40, label: 'OUT' },
  ],
  wires: [
    { id: 'w0', from: 'a', to: 'g', port: 0 },
    { id: 'w1', from: 'b', to: 'g', port: 1 },
    { id: 'w2', from: 'c', to: 'g', port: 2 },
    { id: 'w3', from: 'g', to: 'o', port: 0 },
  ],
});

test('replaceType: AND3 -> OR keeps ports 0,1 and drops port 2, keeps id, position and outgoing wire', () => {
  const r = replaceType(rep(), 'g', 'OR');
  assert.deepEqual(r.nodes.find((n) => n.id === 'g'), { id: 'g', type: 'OR', x: 90, y: 40 });
  assert.deepEqual(r.wires.map((w) => w.id), ['w0', 'w1', 'w3']);
});

test('replaceType: AND -> OR keeps every wire', () => {
  const c = rep();
  c.nodes[3].type = 'AND';
  c.wires = c.wires.filter((w) => w.id !== 'w2');
  assert.equal(replaceType(c, 'g', 'OR').wires.length, 3);
});

test('replaceType: AND3 -> AND drops port 2; -> NOT keeps only port 0', () => {
  assert.deepEqual(replaceType(rep(), 'g', 'AND').wires.map((w) => w.id), ['w0', 'w1', 'w3']);
  assert.deepEqual(replaceType(rep(), 'g', 'NOT').wires.map((w) => w.id), ['w0', 'w3']);
});

test('replaceType: INPUT/OUTPUT as source or target, and the same type, return the circuit unchanged', () => {
  const c = rep();
  assert.equal(replaceType(c, 'a', 'AND'), c);
  assert.equal(replaceType(c, 'o', 'AND'), c);
  assert.equal(replaceType(c, 'g', 'INPUT'), c);
  assert.equal(replaceType(c, 'g', 'OUTPUT'), c);
  assert.equal(replaceType(c, 'g', 'AND3'), c);
  assert.equal(replaceType(c, 'nope', 'OR'), c);
});

test('replaceType does not mutate its input', () => {
  const c = rep();
  const before = JSON.stringify(c);
  replaceType(c, 'g', 'NOT');
  assert.equal(JSON.stringify(c), before);
});

test('prototype-named node and wire IDs round-trip and evaluate numerically', () => {
  const ids = ['constructor', 'toString', '__proto__'];
  const c = {
    name: 'Safe IDs',
    nodes: ids.map((id, i) => ({ id, type: i === 0 ? 'INPUT' : 'OUTPUT', x: i * 100, y: 0, label: i === 0 ? 'A' : 'OUT', ...(i === 0 && { value: 1 }) })),
    wires: ids.map((id, i) => ({ id, from: ids[0], to: ids[i % 2 + 1], port: 0 })).slice(0, 2),
  };
  // All three names must also work as wire IDs, independently of node IDs.
  for (const id of ids) {
    c.wires[0].id = id;
    c.wires[1].id = 'other';
    const decoded = decode(encode(c));
    assert.deepEqual(decoded, c);
    const result = evaluate(decoded);
    for (const nodeId of ids) assert.equal(result.node[nodeId], 1);
    assert.equal(result.wire[id], 1);
    assert.equal(result.wire.other, 1);
  }
});

test('decode rejects otherwise-valid JSON above the encoded size limit', () => {
  const circuit = exampleCircuit();
  assert.deepEqual(decode(encode({ ...circuit, padding: 'x' })), circuit);
  const encoded = encode({ ...circuit, padding: 'x'.repeat(750000) });
  assert.ok(encoded.length > 1_000_000);
  assert.equal(decode(encoded), null);
});

test('decode rejects self, multi-node and disconnected cycles in either wire order', () => {
  const nodes = ['a', 'b', 'c', 'd'].map((id) => ({ id, type: 'NOT', x: 0, y: 0 }));
  for (const pairs of [[['a', 'a']], [['a', 'b'], ['b', 'a']], [['a', 'b'], ['c', 'd'], ['d', 'c']]]) {
    const wires = pairs.map(([from, to], i) => ({ id: `w${i}`, from, to, port: 0 }));
    for (const ordered of [wires, [...wires].reverse()]) assert.equal(decode(encode({ name: 'Cycle', nodes, wires: ordered })), null);
  }
});
