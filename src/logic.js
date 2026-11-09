// Pure logic for the gate emulator. No DOM.
export const GATES = {
  INPUT: { label: 'Input', inputs: 0, key: 'I' },
  OUTPUT: { label: 'Output', inputs: 1, key: 'Q' },
  NOT: { label: 'NOT', inputs: 1, key: 'N', fn: (b) => +!b[0] },
  AND: { label: 'AND', inputs: 2, key: 'A', fn: (b) => b[0] & b[1] },
  AND3: { label: 'AND (3 inputs)', inputs: 3, key: '3', fn: (b) => b[0] & b[1] & b[2] },
  NAND: { label: 'NAND', inputs: 2, key: 'D', fn: (b) => +!(b[0] & b[1]) },
  OR: { label: 'OR', inputs: 2, key: 'O', fn: (b) => b[0] | b[1] },
  NOR: { label: 'NOR', inputs: 2, key: 'R', fn: (b) => +!(b[0] | b[1]) },
  XOR: { label: 'XOR', inputs: 2, key: 'X', fn: (b) => b[0] ^ b[1] },
  XNOR: { label: 'XNOR', inputs: 2, key: 'E', fn: (b) => +!(b[0] ^ b[1]) },
};

export const MAX_NODES = 500;
const MAX_INPUTS = 6;
const isType = (t) => typeof t === 'string' && Object.hasOwn(GATES, t);

export function evaluate(circuit) {
  const byId = new Map(circuit.nodes.map((n) => [n.id, n]));
  const feeding = new Map(); // "to:port" -> wire
  for (const w of circuit.wires) feeding.set(`${w.to}:${w.port}`, w);
  const node = Object.create(null);
  const visiting = new Set();
  const val = (id) => {
    if (id in node) return node[id];
    const n = byId.get(id);
    if (!n || visiting.has(id)) return 0; // missing or cyclic: read 0
    visiting.add(id);
    let v;
    if (n.type === 'INPUT') v = n.value ? 1 : 0;
    else {
      const bits = [];
      for (let p = 0; p < GATES[n.type].inputs; p++) {
        const w = feeding.get(`${id}:${p}`);
        bits.push(w ? val(w.from) : 0);
      }
      v = n.type === 'OUTPUT' ? bits[0] : GATES[n.type].fn(bits);
    }
    visiting.delete(id);
    return (node[id] = v);
  };
  circuit.nodes.forEach((n) => val(n.id));
  const wire = Object.create(null);
  for (const w of circuit.wires) wire[w.id] = node[w.from] ?? 0;
  return { node, wire };
}

// Swaps a gate's type in place. Wires into input ports the new type lacks are dropped; same type or a non-gate returns the circuit as is.
const isGate = (type) => type !== 'INPUT' && type !== 'OUTPUT' && isType(type);
export function replaceType(circuit, nodeId, newType) {
  const n = circuit.nodes.find((x) => x.id === nodeId);
  if (!n || !isGate(n.type) || !isGate(newType) || n.type === newType) return circuit;
  const ports = GATES[newType].inputs;
  return {
    ...circuit,
    nodes: circuit.nodes.map((x) => (x === n ? { ...x, type: newType } : x)),
    wires: circuit.wires.filter((w) => w.to !== nodeId || w.port < ports),
  };
}

export function wouldCreateCycle(circuit, fromId, toId) {
  if (fromId === toId) return true;
  // A cycle appears if `from` is reachable downstream of `to`.
  const seen = new Set([toId]);
  const stack = [toId];
  while (stack.length) {
    const cur = stack.pop();
    for (const w of circuit.wires) {
      if (w.from !== cur || seen.has(w.to)) continue;
      if (w.to === fromId) return true;
      seen.add(w.to);
      stack.push(w.to);
    }
  }
  return false;
}

export function nextLabel(circuit, type) {
  const used = new Set(circuit.nodes.filter((n) => n.type === type).map((n) => n.label));
  if (type === 'INPUT') {
    for (let i = 0; i < 26; i++) {
      const l = String.fromCharCode(65 + i);
      if (!used.has(l)) return l;
    }
    return '';
  }
  if (!used.has('OUT')) return 'OUT';
  for (let i = 2; ; i++) if (!used.has(`OUT${i}`)) return `OUT${i}`;
}

const byLabel = (a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);

export function truthTable(circuit) {
  const ins = circuit.nodes.filter((n) => n.type === 'INPUT').map((n) => ({ id: n.id, label: n.label ?? '' })).sort(byLabel);
  const outputs = circuit.nodes.filter((n) => n.type === 'OUTPUT').map((n) => ({ id: n.id, label: n.label ?? '' })).sort(byLabel);
  if (ins.length > MAX_INPUTS) return { tooMany: true, count: ins.length };
  const rows = [];
  for (let i = 0; i < 1 << ins.length; i++) {
    const inBits = ins.map((_, k) => (i >> (ins.length - 1 - k)) & 1);
    const vals = new Map(ins.map((x, k) => [x.id, inBits[k]]));
    const c = { ...circuit, nodes: circuit.nodes.map((n) => (vals.has(n.id) ? { ...n, value: vals.get(n.id) } : n)) };
    const r = evaluate(c);
    rows.push({ in: inBits, out: outputs.map((o) => r.node[o.id]) });
  }
  const cur = new Map(circuit.nodes.map((n) => [n.id, n.value ? 1 : 0]));
  const current = ins.reduce((acc, x) => (acc << 1) | cur.get(x.id), 0);
  return { inputs: ins, outputs, rows, current };
}

export function encode(circuit) {
  const bytes = new TextEncoder().encode(JSON.stringify(circuit));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const num = (n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e6;

export function decode(str) {
  try {
    if (typeof str !== 'string' || str.length > 1_000_000 || !/^[A-Za-z0-9_-]+$/.test(str)) return null;
    const bin = atob(str.replaceAll('-', '+').replaceAll('_', '/'));
    const j = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    if (!isObj(j) || typeof j.name !== 'string' || j.name.length > 100) return null;
    if (!Array.isArray(j.nodes) || !Array.isArray(j.wires) || j.nodes.length > MAX_NODES || j.wires.length > MAX_NODES * 3) return null;
    const nodes = [];
    const byId = new Map();
    for (const n of j.nodes) {
      if (!isObj(n) || typeof n.id !== 'string' || !ID.test(n.id) || byId.has(n.id)) return null;
      if (!isType(n.type) || !num(n.x) || !num(n.y)) return null;
      if (n.label !== undefined && (typeof n.label !== 'string' || n.label.length > 40)) return null;
      if (n.value !== undefined && n.value !== 0 && n.value !== 1) return null;
      const clean = { id: n.id, type: n.type, x: n.x, y: n.y };
      if (n.label !== undefined) clean.label = n.label;
      if (n.value !== undefined) clean.value = n.value;
      nodes.push(clean);
      byId.set(n.id, clean);
    }
    const wires = [];
    const wireIds = new Set();
    const ports = new Set();
    const circuit = { name: j.name, nodes, wires };
    const downstream = new Map(nodes.map((n) => [n.id, []]));
    const indegree = new Map(nodes.map((n) => [n.id, 0]));
    for (const w of j.wires) {
      if (!isObj(w) || typeof w.id !== 'string' || !ID.test(w.id) || wireIds.has(w.id)) return null;
      const src = byId.get(w.from);
      const dst = byId.get(w.to);
      if (!src || !dst || src.type === 'OUTPUT') return null;
      if (!Number.isInteger(w.port) || w.port < 0 || w.port >= GATES[dst.type].inputs) return null;
      if (ports.has(`${w.to}:${w.port}`)) return null;
      wireIds.add(w.id);
      ports.add(`${w.to}:${w.port}`);
      wires.push({ id: w.id, from: w.from, to: w.to, port: w.port });
      downstream.get(w.from).push(w.to);
      indegree.set(w.to, indegree.get(w.to) + 1);
    }
    const ready = nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
    for (let i = 0; i < ready.length; i++) {
      for (const to of downstream.get(ready[i])) {
        indegree.set(to, indegree.get(to) - 1);
        if (indegree.get(to) === 0) ready.push(to);
      }
    }
    if (ready.length !== nodes.length) return null;
    return circuit;
  } catch {
    return null;
  }
}

// Positions match the approved draft: switches at x=68, gates at x=290/510, output at x=665.
export function exampleCircuit() {
  const inp = (id, label, y, value) => ({ id, type: 'INPUT', x: 68, y, label, value });
  return {
    name: 'Two ORs into an AND',
    nodes: [
      inp('A', 'A', 70, 0), inp('B', 'B', 150, 1), inp('C', 'C', 270, 1), inp('D', 'D', 350, 0),
      { id: 'or1', type: 'OR', x: 290, y: 110 },
      { id: 'or2', type: 'OR', x: 290, y: 310 },
      { id: 'and', type: 'AND', x: 510, y: 210 },
      { id: 'out', type: 'OUTPUT', x: 665, y: 210, label: 'OUT' },
    ],
    wires: [
      { id: 'w1', from: 'A', to: 'or1', port: 0 },
      { id: 'w2', from: 'B', to: 'or1', port: 1 },
      { id: 'w3', from: 'C', to: 'or2', port: 0 },
      { id: 'w4', from: 'D', to: 'or2', port: 1 },
      { id: 'w5', from: 'or1', to: 'and', port: 0 },
      { id: 'w6', from: 'or2', to: 'and', port: 1 },
      { id: 'w7', from: 'and', to: 'out', port: 0 },
    ],
  };
}
