// Boolean notation: circuit <-> expression. Pure, no DOM. Contracts in docs/plan-notation.md.
import { GATES, MAX_NODES, nextLabel } from './logic.js';
import { autoLayout } from './layout.js';
import { bounds, clampCoord, GRID } from './geometry.js';
import { newId } from './ids.js';

const KIDS = ['and', 'or', 'xor'];
const isNary = (e) => KIDS.includes(e.t);
const KIND = { NOT: [null, 1], AND: ['and'], AND3: ['and'], NAND: ['and', 1], OR: ['or'], NOR: ['or', 1], XOR: ['xor'], XNOR: ['xor', 1] };

// ---- circuit -> expressions

export function circuitExprs(circuit) {
  const byId = new Map(circuit.nodes.map((n) => [n.id, n]));
  const feeding = new Map();
  for (const w of circuit.wires) feeding.set(`${w.to}:${w.port}`, w);
  const nodes = Object.create(null);
  const holes = new WeakMap();
  const hasHole = (e) => {
    if (!holes.has(e)) holes.set(e, e.t === 'hole' || (e.a ? hasHole(e.a) : e.args ? e.args.some(hasHole) : false));
    return holes.get(e);
  };
  const order = [];
  const visiting = new Set();
  const expr = (id) => {
    if (id in nodes) return nodes[id];
    const n = byId.get(id);
    if (!n || visiting.has(id)) return { t: 'hole' }; // missing or cyclic
    visiting.add(id);
    let e;
    if (n.type === 'INPUT') e = { t: 'var', name: n.label || '?', src: id };
    else {
      const args = [];
      for (let p = 0; p < GATES[n.type].inputs; p++) {
        const w = feeding.get(`${id}:${p}`);
        args.push(w ? expr(w.from) : { t: 'hole', src: id, port: p });
      }
      if (n.type === 'OUTPUT') e = args[0];
      else {
        const [kind, neg] = KIND[n.type];
        e = kind ? { t: kind, args, src: id } : args[0];
        if (neg) e = { t: 'not', a: e, src: id };
      }
      if (n.type !== 'OUTPUT') order.push(id);
    }
    visiting.delete(id);
    return (nodes[id] = e);
  };
  circuit.nodes.forEach((n) => expr(n.id));
  const outputs = circuit.nodes
    .filter((n) => n.type === 'OUTPUT')
    .map((n) => ({ id: n.id, label: n.label ?? '', expr: nodes[n.id], complete: !hasHole(nodes[n.id]) }));
  return { outputs, nodes, order };
}

// Everything feeding into nodeId, itself included, plus the wires between them.
export function cone(circuit, nodeId) {
  const into = new Map();
  for (const w of circuit.wires) (into.get(w.to) ?? into.set(w.to, []).get(w.to)).push(w);
  const nodes = new Set([nodeId]);
  const wires = new Set();
  const stack = [nodeId];
  while (stack.length) {
    for (const w of into.get(stack.pop()) ?? []) {
      wires.add(w.id);
      if (!nodes.has(w.from)) { nodes.add(w.from); stack.push(w.from); }
    }
  }
  return { nodes, wires };
}

const JOIN = { and: '·', or: ' + ', xor: ' ⊕ ' };
const PREC = { or: 0, xor: 1, and: 2 };
// Does child `c` need brackets inside a `parent` n-ary node? Same-type nesting is associative, so it needs none.
export const needsParens = (parent, c) => isNary(c) && c.t !== parent && PREC[c.t] < PREC[parent];

// Count expanded nodes, including repeated shared branches, without expanding the DAG.
export function exprTooLarge(expr) {
  const sizes = new WeakMap();
  const count = (e) => {
    if (sizes.has(e)) return sizes.get(e);
    let size = 1;
    for (const child of e.args ?? (e.a ? [e.a] : [])) {
      size += count(child);
      if (size > 1000) { size = 1001; break; }
    }
    sizes.set(e, size);
    return size;
  };
  return count(expr) > 1000;
}

// Plain text: NOT is a postfix "'" so it survives copy and aria-labels.
export function exprText(e) {
  if (exprTooLarge(e)) return '…';
  const text = (e) => {
    if (e.t === 'var') return e.name;
    if (e.t === 'hole') return '?';
    if (e.t === 'not') return (isNary(e.a) ? `(${text(e.a)})` : text(e.a)) + "'";
    return e.args.map((c) => (needsParens(e.t, c) ? `(${text(c)})` : text(c))).join(JOIN[e.t]);
  };
  return text(e);
}

// ---- editor: text -> tokens -> expression

const SYM = { '*': 'and', '.': 'and', '·': 'and', '+': 'or', '^': 'xor', '⊕': 'xor', '!': 'not', '~': 'not', '¬': 'not', '(': 'lp', ')': 'rp' };

export function tokensFromText(str) {
  const out = [];
  for (const ch of String(str)) {
    const up = ch.toUpperCase();
    if (/^[A-Z]$/.test(up)) out.push({ k: 'var', name: up });
    else if (SYM[ch]) out.push({ k: SYM[ch] });
    else if (ch === "'") {
      // Postfix not becomes a prefix not in front of the previous operand or group (and any nots already on it).
      let i = out.length - 1;
      if (out[i]?.k === 'rp') {
        for (let depth = 0; i >= 0; i--) {
          if (out[i].k === 'rp') depth++;
          else if (out[i].k === 'lp' && --depth === 0) break;
        }
        i = Math.max(i, 0);
      } else if (out[i]?.k !== 'var') continue;
      while (out[i - 1]?.k === 'not') i--;
      out.splice(i, 0, { k: 'not' });
    }
  }
  return out;
}

const GLYPH = { and: '·', or: '+', xor: '⊕', not: '¬', lp: '(', rp: ')' };
const mk = (t, args) => {
  const flat = args.flatMap((c) => (c.t === t ? c.args : [c]));
  return flat.length === 1 ? flat[0] : { t, args: flat };
};

export function parseTokens(tokens) {
  if (tokens.length > 1000) return { ok: false, error: { code: 'tooComplex' } };
  if (!tokens.length) return { ok: false, error: { code: 'empty', at: 0 } };
  let i = 0;
  const fail = (code, at) => {
    const name = GLYPH[tokens[at]?.k];
    throw { code, at, ...(name && { name }) };
  };
  const unary = () => {
    const tok = tokens[i];
    if (!tok) return fail('missingOperand', i - 1);
    if (tok.k === 'var') { i++; return { t: 'var', name: tok.name }; }
    if (tok.k === 'lp') {
      const open = i++;
      const e = chain(0);
      if (tokens[i]?.k !== 'rp') return fail('unclosed', open);
      i++;
      return e;
    }
    if (tok.k === 'not') {
      const at = i++;
      const nx = tokens[i];
      if (!nx) return fail('missingOperand', at);
      if (KIDS.includes(nx.k) || nx.k === 'rp') return fail('badNot', at);
      return { t: 'not', a: unary() };
    }
    // operator first has nothing before it; elsewhere the previous token is the one missing its operand
    return fail('missingOperand', KIDS.includes(tok.k) && i === 0 ? 0 : i - 1);
  };
  const LEVELS = ['or', 'xor', 'and'];
  const chain = (lvl) => {
    if (lvl === 3) return unary();
    const op = LEVELS[lvl];
    const args = [chain(lvl + 1)];
    for (;;) {
      const k = tokens[i]?.k;
      if (k === op) i++;
      else if (!(op === 'and' && (k === 'var' || k === 'lp' || k === 'not'))) break; // adjacent operands mean AND
      args.push(chain(lvl + 1));
    }
    return mk(op, args);
  };
  try {
    const expr = chain(0);
    if (i < tokens.length) fail('unopened', i);
    return { ok: true, expr };
  } catch (error) {
    if (error instanceof RangeError) return { ok: false, error: { code: 'tooComplex' } };
    if (error.code) return { ok: false, error };
    throw error;
  }
}

// ---- expression -> circuit

const NEG = { and: 'NAND', or: 'NOR', xor: 'XNOR' };
const PLAIN = { and: 'AND', or: 'OR', xor: 'XOR' };

export function exprToCircuit(expr, base, { mode = 'replace' } = {}) {
  const add = mode === 'add';
  const nodes = [];
  const wires = [];
  const inputs = new Map(); // variable name -> node id
  const stand = new Map(); // stand-in INPUT id -> existing base INPUT id (add mode)
  const shared = new Map(); // gate key -> node id
  const put = (type, extra) => { const id = newId('n'); nodes.push({ id, type, x: 0, y: 0, ...extra }); return id; };
  const wire = (from, to, port) => wires.push({ id: newId('w'), from, to, port });
  const gate = (type, ids) => {
    const key = `${type}|${ids}`;
    if (shared.has(key)) return shared.get(key);
    const id = put(type);
    ids.forEach((from, p) => wire(from, id, p));
    shared.set(key, id);
    return id;
  };
  const variable = (name) => {
    if (inputs.has(name)) return inputs.get(name);
    const old = add && base.nodes.find((n) => n.type === 'INPUT' && n.label === name);
    const id = put('INPUT', { label: name, value: 0 });
    if (old) stand.set(id, old.id);
    inputs.set(name, id);
    return id;
  };
  const nary = (type, ids, neg) => {
    if (type === 'and' && ids.length === 3 && !neg) return gate('AND3', ids);
    let acc = ids[0];
    for (let i = 1; i < ids.length; i++) acc = gate(neg && i === ids.length - 1 ? NEG[type] : PLAIN[type], [acc, ids[i]]);
    return acc;
  };
  const build = (e) => {
    if (e.t === 'var') return variable(e.name);
    if (e.t === 'not') {
      if (isNary(e.a) && e.a.args.length > 1) return nary(e.a.t, e.a.args.map(build), true);
      return gate('NOT', [build(e.a)]);
    }
    if (isNary(e)) return nary(e.t, e.args.map(build), false);
    throw new Error('Cannot build a circuit from an incomplete expression');
  };

  const root = build(expr);
  const out = put('OUTPUT', { label: nextLabel(add ? base : { nodes: [] }, 'OUTPUT') });
  wire(root, out, 0);

  if ((add ? base.nodes.length : 0) + nodes.length - stand.size > MAX_NODES) return null;

  // Reused inputs live in the base circuit: lay out with them, then drop the stand-ins and point wires at the originals.
  const laid = autoLayout({ name: '', nodes, wires });
  let part = laid.nodes;
  if (add) {
    const bb = base.nodes.length && bounds(base);
    const nb = bounds(laid);
    const dy = bb ? bb.y1 + 2 * GRID - nb.y0 : 0;
    part = part.map((n) => ({ ...n, y: clampCoord(n.y + dy) }));
  }
  const kept = part.filter((n) => !stand.has(n.id));
  const keptWires = wires.map((w) => ({ ...w, from: stand.get(w.from) ?? w.from }));
  return add
    ? { ...base, nodes: [...base.nodes, ...kept], wires: [...base.wires, ...keptWires] }
    : { name: base.name, nodes: kept, wires: keptWires };
}
