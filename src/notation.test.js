import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exampleCircuit, encode, decode, truthTable, evaluate } from './logic.js';
import { bounds } from './geometry.js';
import { circuitExprs, exprText, cone, tokensFromText, parseTokens, exprToCircuit } from './notation.js';

const parse = (s) => { const r = parseTokens(tokensFromText(s)); assert.ok(r.ok, s); return r.expr; };
const err = (s) => { const r = parseTokens(tokensFromText(s)); assert.equal(r.ok, false, s); return r.error; };
const ev = (e, env) => ({
  var: () => env[e.name], not: () => +!ev(e.a, env),
  and: () => +e.args.every((c) => ev(c, env)), or: () => +e.args.some((c) => ev(c, env)),
  xor: () => e.args.reduce((a, c) => a ^ ev(c, env), 0),
})[e.t]();
const vars = (e, s = new Set()) => { if (e.t === 'var') s.add(e.name); (e.args ?? [e.a]).filter(Boolean).forEach((c) => vars(c, s)); return [...s].sort(); };
// Output column of the circuit's first OUTPUT, rows in truthTable order, vs the expression over the same rows.
function sameTable(expr, circuit) {
  const tt = truthTable(circuit);
  const names = tt.inputs.map((i) => i.label);
  assert.deepEqual(names, vars(expr));
  tt.rows.forEach((r) => assert.equal(r.out[0], ev(expr, Object.fromEntries(names.map((n, k) => [n, r.in[k]])))));
}
// A circuit with one gate over 3 labelled inputs and an OUTPUT.
const one = (type, n, wired = n) => ({
  name: 't',
  nodes: [...Array.from({ length: n }, (_, i) => ({ id: `i${i}`, type: 'INPUT', x: 0, y: 0, label: 'ABC'[i], value: 0 })), { id: 'g', type, x: 0, y: 0 }, { id: 'o', type: 'OUTPUT', x: 0, y: 0, label: 'OUT' }],
  wires: [...Array.from({ length: wired }, (_, i) => ({ id: `w${i}`, from: `i${i}`, to: 'g', port: i })), { id: 'wo', from: 'g', to: 'o', port: 0 }],
});

test('example circuit reads (A + B)·(C + D)', () => {
  const r = circuitExprs(exampleCircuit());
  assert.equal(exprText(r.outputs[0].expr), '(A + B)·(C + D)');
  assert.equal(r.outputs[0].complete, true);
  assert.deepEqual(r.order.sort(), ['and', 'or1', 'or2']);
  assert.equal(exprText(r.nodes.or1), 'A + B');
  assert.equal(r.nodes.and.src, 'and');
  assert.equal(exprText(r.nodes.out), exprText(r.nodes.and));
});

test('order is topological', () => {
  const { order } = circuitExprs(exampleCircuit());
  assert.ok(order.indexOf('and') > order.indexOf('or1') && order.indexOf('and') > order.indexOf('or2'));
});

for (const [type, n, text, shape] of [
  ['NAND', 2, "(A·B)'", 'and'], ['NOR', 2, "(A + B)'", 'or'], ['XNOR', 2, "(A ⊕ B)'", 'xor'],
  ['NOT', 1, "A'", 'var'], ['AND3', 3, 'A·B·C', 'and'],
]) {
  test(`${type} maps to expression and back`, () => {
    const c = one(type, n);
    const e = circuitExprs(c).outputs[0].expr;
    assert.equal(exprText(e), text);
    if (type === 'AND3') assert.equal(e.args.length, 3);
    else assert.equal(e.t, 'not');
    assert.equal((e.a ?? e).t, shape);
    const back = exprToCircuit(parse(text), { name: 'x', nodes: [], wires: [] }, { mode: 'replace' });
    assert.ok(back.nodes.some((x) => x.type === type), `${type} in rebuilt`);
    sameTable(parse(text), back);
  });
}

test('holes mark an incomplete output', () => {
  const r = circuitExprs(one('AND', 2, 1));
  assert.equal(r.outputs[0].complete, false);
  assert.equal(exprText(r.outputs[0].expr), 'A·?');
  assert.deepEqual(r.outputs[0].expr.args[1], { t: 'hole', src: 'g', port: 1 });
  const bare = { name: 't', nodes: [{ id: 'o', type: 'OUTPUT', x: 0, y: 0, label: 'OUT' }], wires: [] };
  assert.equal(circuitExprs(bare).outputs[0].complete, false);
});

test('cone collects everything feeding a node', () => {
  const c = exampleCircuit();
  const k = cone(c, 'or1');
  assert.deepEqual([...k.nodes].sort(), ['A', 'B', 'or1']);
  assert.deepEqual([...k.wires].sort(), ['w1', 'w2']);
  assert.equal(cone(c, 'out').nodes.size, 8);
  assert.equal(cone(c, 'out').wires.size, 7);
});

test('exprText parenthesises by precedence', () => {
  assert.equal(exprText(parse('A + B·C')), 'A + B·C');
  assert.equal(exprText(parse('(A + B)·C')), '(A + B)·C');
  assert.equal(exprText(parse('A ^ B + C')), 'A ⊕ B + C');
  assert.equal(exprText(parse('A ^ (B + C)')), 'A ⊕ (B + C)');
  assert.equal(exprText(parse("(A + B)'")), "(A + B)'");
});

test('tokensFromText', () => {
  const k = (s) => tokensFromText(s).map((t) => t.name ?? t.k).join(' ');
  assert.equal(k('a*b.c·d'), 'A and B and C and D');
  assert.equal(k('A+B^C⊕D'), 'A or B xor C xor D');
  assert.equal(k('!A ~B ¬C'), 'not A not B not C');
  assert.equal(k("A'"), 'not A');
  assert.equal(k("(A+B)'"), 'not lp A or B rp');
  assert.equal(k("((A+B)C)'"), 'not lp lp A or B rp C rp');
  assert.equal(k("A''"), 'not not A');
  assert.equal(k("!A'"), 'not not A');
  assert.equal(k("'A"), 'A');
  assert.equal(k('A 1 ? B'), 'A B');
  assert.equal(k('(a+b)(c+d)'), 'lp A or B rp lp C or D rp');
});

test('implicit AND and precedence', () => {
  assert.deepEqual(parse('AB'), { t: 'and', args: [{ t: 'var', name: 'A' }, { t: 'var', name: 'B' }] });
  assert.equal(exprText(parse('(a+b)(c+d)')), '(A + B)·(C + D)');
  assert.equal(exprText(parse('A!B')), "A·B'");
  assert.equal(exprText(parse('A+BC^D')), 'A + B·C ⊕ D');
  assert.equal(parse('A+BC^D').args[1].t, 'xor'); // and > xor > or
  assert.equal(parse('(A·B)·C').args.length, 3); // flattened
  assert.equal(parse('!!A').a.t, 'not');
  assert.equal(parse("!(A+B)").a.t, 'or');
});

test('every error code', () => {
  assert.equal(err('').code, 'empty');
  assert.deepEqual(err('(A + B'), { code: 'unclosed', at: 0, name: '(' });
  assert.equal(err('A·(B').code, 'unclosed');
  assert.equal(err('A·(B').at, 2);
  assert.equal(err('A + B)').code, 'unopened');
  assert.equal(err('A + B)').at, 3);
  assert.equal(err('A + ').code, 'missingOperand');
  assert.equal(err('A + ').at, 1);
  assert.equal(err('A + ').name, '+');
  assert.equal(err('+ A').at, 0);
  assert.equal(err('A ⊕ + B').at, 1);
  assert.equal(err('(A +)').at, 2);
  assert.equal(err('A·!').code, 'missingOperand');
  assert.equal(err('A·!').at, 2);
  assert.equal(err('!+A').code, 'badNot');
  assert.equal(err('(!)').code, 'badNot');
  assert.equal(err('()').code, 'missingOperand');
});

const empty = { name: 'Mine', nodes: [], wires: [] };
const roundTrips = (c) => assert.deepEqual(decode(encode(c)), c);

test('exprToCircuit replace builds a valid circuit with the same truth table', () => {
  for (const s of ['(A+B)(C+D)', "A'", '!(A·B)', '!(A+B)', '!(A^B)', 'ABC', 'A+B+C+D', "A^B^C", "!(A+B+C)", "!(ABC)", "A + A·B", "(A+B)'·(A+B)", "!!A", 'A']) {
    const e = parse(s);
    const c = exprToCircuit(e, exampleCircuit(), { mode: 'replace' });
    assert.equal(c.name, 'Two ORs into an AND');
    assert.equal(c.nodes.filter((n) => n.type === 'OUTPUT').length, 1);
    assert.ok(c.nodes.every((n) => n.type !== 'INPUT' || n.value === 0));
    roundTrips(c);
    sameTable(e, c);
  }
});

test('gate mapping and sharing', () => {
  const types = (s) => exprToCircuit(parse(s), empty, { mode: 'replace' }).nodes.map((n) => n.type).sort().join();
  assert.equal(types('A·B·C'), 'AND3,INPUT,INPUT,INPUT,OUTPUT');
  assert.equal(types('A+B+C'), 'INPUT,INPUT,INPUT,OR,OR,OUTPUT');
  assert.equal(types('!(A+B)'), 'INPUT,INPUT,NOR,OUTPUT');
  assert.equal(types('(A+B)(A+B)'), 'AND,INPUT,INPUT,OR,OUTPUT');
  assert.equal(types('!(A·B·C)'), 'AND,INPUT,INPUT,INPUT,NAND,OUTPUT');
  const c = exprToCircuit(parse('(A+B)(A+B)C'), empty, { mode: 'replace' }); // identical OR is shared
  assert.equal(c.nodes.filter((n) => n.type === 'OR').length, 1);
});

test('exprToCircuit add reuses inputs, keeps existing nodes, sits below', () => {
  const base = exampleCircuit();
  const e = parse('A·E');
  const c = exprToCircuit(e, base, { mode: 'add' });
  roundTrips(c);
  base.nodes.forEach((n) => assert.deepEqual(c.nodes.find((x) => x.id === n.id), n));
  base.wires.forEach((w) => assert.deepEqual(c.wires.find((x) => x.id === w.id), w));
  assert.equal(c.nodes.filter((n) => n.type === 'INPUT' && n.label === 'A').length, 1);
  assert.equal(c.nodes.filter((n) => n.type === 'INPUT' && n.label === 'E').length, 1);
  assert.equal(c.nodes.length, base.nodes.length + 3); // E, AND, OUT2
  const added = c.nodes.slice(base.nodes.length);
  assert.ok(added.some((n) => n.type === 'OUTPUT' && n.label === 'OUT2'));
  const bb = bounds(base);
  const nb = bounds({ nodes: added });
  assert.ok(nb.y0 >= bb.y1 + 48 - 1e-9, `${nb.y0} vs ${bb.y1}`);
  // the new AND is fed by the original A switch
  const and = added.find((n) => n.type === 'AND');
  assert.ok(c.wires.some((w) => w.from === 'A' && w.to === and.id));
  // both outputs evaluate correctly: OUT is unchanged, OUT2 = A·E
  const run = (vals) => {
    const r = evaluate({ ...c, nodes: c.nodes.map((n) => (n.label in vals && n.type === 'INPUT' ? { ...n, value: vals[n.label] } : n)) });
    return [r.node.out, r.node[added.find((n) => n.type === 'OUTPUT').id]];
  };
  assert.deepEqual(run({ A: 1, B: 0, C: 0, D: 1, E: 1 }), [1, 1]);
  assert.deepEqual(run({ A: 0, B: 0, C: 0, D: 1, E: 1 }), [0, 0]);
});

test('add onto an empty circuit works', () => {
  const c = exprToCircuit(parse('A+B'), empty, { mode: 'add' });
  roundTrips(c);
  sameTable(parse('A+B'), c);
});

test('circuit -> expr -> circuit keeps the truth table', () => {
  for (const type of ['NAND', 'NOR', 'XNOR', 'AND', 'OR', 'XOR']) {
    const c = one(type, 2);
    const re = exprToCircuit(circuitExprs(c).outputs[0].expr, empty, { mode: 'replace' });
    assert.deepEqual(truthTable(re).rows.map((r) => r.out), truthTable(c).rows.map((r) => r.out), type);
  }
  const ex = exampleCircuit();
  const re = exprToCircuit(circuitExprs(ex).outputs[0].expr, ex, { mode: 'replace' });
  assert.deepEqual(truthTable(re).rows.map((r) => r.out), truthTable(ex).rows.map((r) => r.out));
  roundTrips(re);
});

test('exprToCircuit refuses holes', () => {
  assert.throws(() => exprToCircuit({ t: 'hole' }, empty, { mode: 'replace' }));
});
