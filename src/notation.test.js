import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exampleCircuit, encode, decode, truthTable, evaluate } from './logic.js';
import { bounds } from './geometry.js';
import { circuitExprs, exprText, exprTooLarge, cone, tokensFromText, parseTokens, exprToCircuit } from './notation.js';

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

test('exprToCircuit add preserves round trips at coordinate limits', () => {
  for (const y of [-999999.5, 999999.5]) {
    const base = {
      name: 'Edge',
      nodes: [
        { id: 'A', type: 'INPUT', label: 'A', value: 0, x: 0, y },
        { id: 'oldOut', type: 'OUTPUT', label: 'OUT', x: 200, y },
      ],
      wires: [{ id: 'oldWire', from: 'A', to: 'oldOut', port: 0 }],
    };
    const before = structuredClone(base);
    roundTrips(base);
    const c = exprToCircuit(parse('A'), base, { mode: 'add' });
    assert.deepEqual(base, before);
    assert.deepEqual(c.nodes.slice(0, base.nodes.length), before.nodes);
    assert.deepEqual(c.wires.slice(0, base.wires.length), before.wires);
    assert.equal(c.nodes.length, base.nodes.length + 1);
    const output = c.nodes.at(-1);
    assert.equal(output.type, 'OUTPUT');
    assert.ok(c.wires.some((w) => w.from === 'A' && w.to === output.id && w.port === 0));
    roundTrips(c);
  }
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

test('notation accepts prototype-named node IDs', () => {
  for (const id of ['constructor', 'toString', '__proto__']) {
    const c = one('NOT', 1);
    c.nodes.find((n) => n.id === 'g').id = id;
    c.wires = c.wires.map((w) => ({ ...w, from: w.from === 'g' ? id : w.from, to: w.to === 'g' ? id : w.to }));
    roundTrips(c);
    const r = circuitExprs(c);
    assert.equal(exprText(r.nodes[id]), "A'");
    assert.equal(exprText(r.outputs[0].expr), "A'");
    assert.equal(r.outputs[0].complete, true);
  }
});

test('reconvergent circuits retain complete expressions with bounded display text', () => {
  const c = { name: 'Shared branches', nodes: [{ id: 'a', type: 'INPUT', label: 'A', value: 1, x: 0, y: 0 }], wires: [] };
  let prev = 'a';
  for (let i = 0; i < 30; i++) {
    const id = `g${i}`;
    c.nodes.push({ id, type: 'AND', x: i * 100, y: 0 });
    for (let port = 0; port < 2; port++) c.wires.push({ id: `w${i}_${port}`, from: prev, to: id, port });
    prev = id;
  }
  c.nodes.push({ id: 'out', type: 'OUTPUT', label: 'OUT', x: 0, y: 0 });
  c.wires.push({ id: 'last', from: prev, to: 'out', port: 0 });
  roundTrips(c);
  assert.equal(evaluate(c).node.out, 1);
  c.nodes[0].value = 0;
  assert.equal(evaluate(c).node.out, 0);
  const r = circuitExprs(c);
  assert.equal(r.outputs[0].complete, true);
  assert.equal(exprText(r.outputs[0].expr), '…');
  assert.equal(exprText(r.nodes.g2), 'A·A·A·A·A·A·A·A');
});

test('expression builds allow 500 nodes and reject 501 in replace and add modes', () => {
  const expr = (terms) => ({ t: 'or', args: Array.from({ length: terms }, () => ({ t: 'var', name: 'A' })) });
  const c = exprToCircuit(expr(499), empty);
  assert.equal(c.nodes.length, 500);
  roundTrips(c);
  assert.equal(exprToCircuit(expr(500), empty), null);
  const base = { name: 'Base', nodes: Array.from({ length: 498 }, (_, i) => ({ id: `base${i}`, type: 'INPUT', label: i ? 'B' : 'A', value: 1, x: 0, y: 0 })), wires: [] };
  const before = structuredClone(base);
  const added = exprToCircuit(parse('A+A'), base, { mode: 'add' });
  assert.equal(added.nodes.length, 500);
  assert.deepEqual(added.nodes.slice(0, base.nodes.length), before.nodes);
  assert.equal(added.nodes.filter((n) => n.label === 'A').length, 1);
  roundTrips(added);
  assert.equal(exprToCircuit(parse('A+A+A'), base, { mode: 'add' }), null);
  assert.equal(exprToCircuit(parse('C+C'), base, { mode: 'add' }), null);
  assert.deepEqual(base, before);
});

test('display guard allows 1000 expanded nodes and rejects 1001', () => {
  const a = { t: 'var', name: 'A' };
  const e = { t: 'or', args: Array(999).fill(a) };
  assert.equal(exprTooLarge(e), false);
  assert.equal(exprText(e), Array(999).fill('A').join(' + '));
  e.args.push(a);
  assert.equal(exprTooLarge(e), true);
  assert.equal(exprText(e), '…');
});

test('oversized pasted expressions return a recoverable complexity error without losing tokens', () => {
  for (const input of ['('.repeat(4000) + 'A' + ')'.repeat(4000), '!'.repeat(12000) + 'A']) {
    const tokens = tokensFromText(input);
    const before = structuredClone(tokens);
    assert.deepEqual(parseTokens(tokens), { ok: false, error: { code: 'tooComplex' } });
    assert.deepEqual(tokens, before);
    tokens.splice(0, tokens.length, ...tokensFromText('A+B'));
    assert.equal(parseTokens(tokens).ok, true);
  }
});

test('expressions at the token budget still parse', () => {
  assert.equal(parseTokens(tokensFromText('A'.repeat(1000))).ok, true);
  assert.equal(parseTokens(tokensFromText('!'.repeat(999) + 'A')).ok, true);
  assert.equal(exprText(parse('('.repeat(200) + 'A+B' + ')'.repeat(200))), 'A + B');
  assert.equal(err('A'.repeat(1001)).code, 'tooComplex');
});
