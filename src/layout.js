import { snap } from './geometry.js';

// Auto format: left-to-right layered layout. Pure; returns a new circuit, only x/y change.
// x/y are node centres (see exampleCircuit). Defaults match the draft: ports sit 36-38px off centre, rows 80px apart, columns 220px apart.
const SWEEPS = 4;
const SIZE = () => ({ w: 76, h: 56 });

export function autoLayout(circuit, { size = SIZE, gapX = 144, gapY = 24, origin = { x: 68, y: 70 } } = {}) {
  const nodes = circuit.nodes ?? [];
  const wires = (circuit.wires ?? []).filter((w) => w.from !== w.to);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const src = new Map(nodes.map((n) => [n.id, []]));
  const dst = new Map(nodes.map((n) => [n.id, []]));
  for (const w of wires) {
    if (!byId.has(w.from) || !byId.has(w.to) || byId.get(w.from).type === 'OUTPUT') continue;
    src.get(w.to).push(w.from);
    dst.get(w.from).push(w.to);
  }

  // Depth by longest path; a node revisited while still on the stack (cycle) counts as 0.
  const col = new Map();
  const visiting = new Set();
  const depth = (id) => {
    if (col.has(id)) return col.get(id);
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const t = byId.get(id).type;
    const d = t === 'INPUT' ? 0 : 1 + Math.max(0, ...src.get(id).map(depth));
    visiting.delete(id);
    col.set(id, d);
    return d;
  };
  nodes.forEach((n) => n.type !== 'OUTPUT' && depth(n.id));
  const last = Math.max(1, ...[...col.values()].map((c) => c + 1));
  nodes.forEach((n) => n.type === 'OUTPUT' && col.set(n.id, last));

  // Sugiyama dummies: a wire spanning several columns gets one dummy per column it crosses (shared by wires from one source),
  // so real nodes are ordered around its lane. They have no output node and are dropped at the end.
  const dummyY = new Map();
  for (const w of wires) {
    if (!src.has(w.to) || !byId.has(w.from) || byId.get(w.from).type === 'OUTPUT') continue;
    const [c0, c1] = [col.get(w.from), col.get(w.to)];
    let prev = w.from;
    for (let c = c0 + 1; c < c1; c++) {
      const id = `\0${w.from}@${c}`;
      if (!src.has(id)) {
        src.set(id, [prev]); dst.set(id, []); col.set(id, c);
        dummyY.set(id, byId.get(w.from).y + ((byId.get(w.to).y - byId.get(w.from).y) * (c - c0)) / (c1 - c0));
        dst.get(prev).push(id);
      }
      prev = id;
    }
    if (prev !== w.from) {
      src.set(w.to, src.get(w.to).map((x) => (x === w.from ? prev : x)));
      dst.set(w.from, dst.get(w.from).filter((x) => x !== w.to));
      dst.get(prev).push(w.to);
    }
  }
  const yOf = (id) => byId.get(id)?.y ?? dummyY.get(id);
  const cols = Array.from({ length: last + 1 }, () => []);
  col.forEach((c, id) => cols[c].push(id));
  const wired = (id) => src.get(id).length + dst.get(id).length > 0;
  const rank = new Map();
  const place = (c) => c.forEach((id, i) => rank.set(id, i));
  // Start from current y; unwired nodes are kept out of the sweeps and appended at the bottom.
  const free = cols.map((c) => c.filter((id) => !wired(id)).sort((a, b) => byId.get(a).y - byId.get(b).y));
  const rows = cols.map((c) => c.filter(wired).sort((a, b) => yOf(a) - yOf(b) || (a < b ? -1 : 1)));
  rows.forEach(place);
  const sweep = (c, nb) => {
    const key = (id) => {
      const p = nb.get(id).filter((x) => rank.has(x)).map((x) => rank.get(x));
      return p.length ? p.reduce((a, b) => a + b) / p.length : rank.get(id);
    };
    const k = new Map(rows[c].map((id) => [id, key(id)]));
    rows[c].sort((a, b) => k.get(a) - k.get(b) || rank.get(a) - rank.get(b) || (a < b ? -1 : 1));
    place(rows[c]);
  };
  for (let s = 0; s < SWEEPS; s++) {
    for (let c = 1; c < rows.length; c++) sweep(c, src);
    for (let c = rows.length - 2; c >= 0; c--) sweep(c, dst);
  }

  const sz = nodes.map((n) => size(n));
  const w = Math.max(76, ...sz.map((s) => s.w));
  const h = Math.max(56, ...sz.map((s) => s.h));
  const ordered = rows.map((r, c) => [...r, ...free[c]]);
  const tallest = Math.max(...ordered.map((r) => r.length));
  const pos = new Map();
  ordered.forEach((r, c) => r.forEach((id, i) => pos.set(id, {
    // Node centres land on the dot grid. Ports sit 14/22/36/38px off centre, so only the centre row can line up exactly.
    x: snap(origin.x + c * (w + gapX)),
    y: snap(origin.y + ((tallest - r.length) * (h + gapY)) / 2 + i * (h + gapY)),
  })));
  return { ...circuit, nodes: nodes.map((n) => ({ ...n, ...pos.get(n.id) })) };
}
