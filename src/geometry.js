import { GATES } from './logic.js';

const OFFSETS = { 1: [0], 2: [-14, 14], 3: [-22, 0, 22] };
export const hasOut = (n) => n.type !== 'OUTPUT';
export const outPort = (n) => ({ x: n.x + 36, y: n.y });
export function inPorts(n) {
  const k = GATES[n.type].inputs;
  const dx = n.type === 'OUTPUT' ? -24 : -38;
  return (OFFSETS[k] ?? []).map((dy, i) => ({ x: n.x + dx, y: n.y + dy, i }));
}

// Dot spacing of the grid canvas (components/Grid.jsx). Node centres snap to it.
export const GRID = 24;
export const snap = (v) => Math.round(v / GRID) * GRID;

// Keep edits inside the range accepted by decode.
export const clampCoord = (v) => Math.max(-999999, Math.min(999999, v));

// Visible extent of each node type (INPUT and OUTPUT are narrower than gates).
const EXT = { INPUT: [36, 40, 18, 18], OUTPUT: [26, 24, 30, 54] };

const R = 6; // corner radius of square wires
const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// Pieces are ['L', p0, p1] or ['Q', p0, ctrl, p1]. d and at(t) both read them, so chips and pulses stay on the drawn wire.
function build(pieces, d) {
  const quad = (a, c, b, t) => { const u = 1 - t; return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]; };
  const at1 = (pc, t) => (pc[0] === 'L' ? [pc[1][0] + (pc[2][0] - pc[1][0]) * t, pc[1][1] + (pc[2][1] - pc[1][1]) * t] : quad(pc[1], pc[2], pc[3], t));
  const lens = pieces.map((pc) => { let l = 0; let prev = pc[1]; for (let k = 1; k <= 8; k++) { const q = at1(pc, k / 8); l += len(prev, q); prev = q; } return l; });
  const total = lens.reduce((a, b) => a + b, 0);
  const at = (t) => {
    let want = Math.min(Math.max(t, 0), 1) * total;
    for (let k = 0; k < pieces.length; k++) {
      if (want <= lens[k] || k === pieces.length - 1) return at1(pieces[k], lens[k] ? Math.min(want / lens[k], 1) : 0);
      want -= lens[k];
    }
    return pieces[0][1];
  };
  return { d, at, total };
}

// Orthogonal route through `pts` with rounded corners (radius capped at half of each adjacent segment).
function square(pts) {
  const pieces = [];
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  let cur = pts[0];
  const line = (to) => { if (len(cur, to) > 0.01) { pieces.push(['L', cur, to]); d += `L${to[0]} ${to[1]}`; cur = to; } };
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, c, b] = [pts[i - 1], pts[i], pts[i + 1]];
    const r = Math.min(R, len(a, c) / 2, len(c, b) / 2);
    const toward = (p, q) => [p[0] + ((q[0] - p[0]) / (len(p, q) || 1)) * r, p[1] + ((q[1] - p[1]) / (len(p, q) || 1)) * r];
    const enter = toward(c, a);
    const exit = toward(c, b);
    line(enter);
    pieces.push(['Q', cur, c, exit]);
    d += `Q${c[0]} ${c[1]} ${exit[0]} ${exit[1]}`;
    cur = exit;
  }
  line(pts.at(-1));
  return { ...build(pieces, d), pts };
}

// Obstacle-avoiding router. A* on a 12px lattice (plus the two port rows), bend penalty 2 cells.
const CELL = 12, PAD = 8, BEND = 24, BUDGET = 20000, LEAD = 24, SHARE = 0.4, MARGIN = 144;
const nodeBox = (n) => { const [l, r, u, d] = EXT[n.type] ?? [40, 40, 42, 42]; return [n.x - l - PAD, n.y - u - PAD, n.x + r + PAD, n.y + d + PAD]; };
// Does the axis-aligned segment p-q cross the open interior of box?
const hits = (p, q, b) => Math.max(p[0], q[0]) > b[0] && Math.min(p[0], q[0]) < b[2] && Math.max(p[1], q[1]) > b[1] && Math.min(p[1], q[1]) < b[3];

function heapPush(h, e) { h.push(e); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } }
function heapPop(h) {
  const top = h[0]; const last = h.pop();
  if (h.length) { h[0] = last; let i = 0; for (;;) { let m = i; const l = 2 * i + 1, r = l + 1; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } }
  return top;
}

// Returns the lattice path A -> stub -> ... -> stub -> B, or null (blocked, or over budget).
// `boxes` are every node's inflated box; `others` exclude the two endpoint nodes. `used` holds "x,y" points of earlier wires from the same source (cheaper to follow).
function search(A, B, boxes, others, used, budget) {
  const S = [Math.ceil((A[0] + LEAD) / CELL) * CELL, A[1]];
  const G = [Math.floor((B[0] - LEAD) / CELL) * CELL, B[1]];
  if (boxes.some((b) => hits(S, S, b) || hits(G, G, b)) || others.some((b) => hits(A, S, b) || hits(G, B, b))) return null;
  const xa = Math.floor((Math.min(S[0], G[0]) - MARGIN) / CELL);
  const nx = Math.ceil((Math.max(S[0], G[0]) + MARGIN) / CELL) - xa + 1;
  const ya = Math.floor((Math.min(A[1], B[1]) - MARGIN) / CELL);
  const yb = Math.ceil((Math.max(A[1], B[1]) + MARGIN) / CELL);
  // Bound storage before building lattice rows, including up to two extra port rows.
  if (nx * (yb - ya + 3) > BUDGET) return null;
  const ys = [...new Set([...Array.from({ length: yb - ya + 1 }, (_, k) => (ya + k) * CELL), A[1], B[1]])].sort((p, q) => p - q);
  const ny = ys.length;
  const yi = new Map(ys.map((y, j) => [y, j]));
  const X = (i) => (xa + i) * CELL;
  const area = [X(0), ys[0], X(nx - 1), ys[ny - 1]];
  const near = boxes.filter((b) => hits([area[0], area[1]], [area[2], area[3]], b));
  const g = new Float64Array(nx * ny * 4).fill(Infinity);
  const from = new Int32Array(nx * ny * 4).fill(-1);
  const gi = G[0] / CELL - xa, gj = yi.get(G[1]);
  const h = (i, j) => Math.abs(X(i) - G[0]) + Math.abs(ys[j] - G[1]);
  const s0 = ((yi.get(S[1]) * nx) + (S[0] / CELL - xa)) * 4;
  g[s0] = 0;
  const heap = [];
  heapPush(heap, [h(S[0] / CELL - xa, yi.get(S[1])), s0, 0]);
  let end = -1;
  while (heap.length) {
    if (budget.remaining <= 0) return null;
    budget.remaining--;
    const [, s, gs] = heapPop(heap);
    if (gs > g[s]) continue;
    const d = s % 4, cell = (s - d) / 4, i = cell % nx, j = (cell - i) / nx;
    if (i === gi && j === gj) {
      if (d === 0) { end = s; break; }
      const t = s - d;
      if (gs + BEND < g[t]) { g[t] = gs + BEND; from[t] = s; heapPush(heap, [gs + BEND, t, gs + BEND]); }
      continue;
    }
    for (const nd of [d, (d + 1) % 4, (d + 3) % 4]) {
      const ni = i + [1, 0, -1, 0][nd], nj = j + [0, 1, 0, -1][nd];
      if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
      const p = [X(i), ys[j]], q = [X(ni), ys[nj]];
      if (near.some((b) => hits(p, q, b))) continue;
      const step = Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]);
      const cost = gs + step * (used.size && used.has(p.join()) && used.has(q.join()) ? SHARE : 1) + (nd === d ? 0 : BEND);
      const t = (nj * nx + ni) * 4 + nd;
      if (cost < g[t]) { g[t] = cost; from[t] = s; heapPush(heap, [cost + h(ni, nj), t, cost]); }
    }
  }
  if (end < 0) return null;
  const grid = [B];
  for (let s = end; s >= 0; s = from[s]) { const c = (s - (s % 4)) / 4; const q = [X(c % nx), ys[(c - (c % nx)) / nx]]; if (q[0] !== grid.at(-1)[0] || q[1] !== grid.at(-1)[1]) grid.push(q); }
  grid.push(A);
  return grid.reverse();
}

// Drop points that sit on a straight run.
const corners = (g) => g.filter((p, k) => k === 0 || k === g.length - 1 || !((g[k - 1][0] === p[0] && p[0] === g[k + 1][0]) || (g[k - 1][1] === p[1] && p[1] === g[k + 1][1])));

// `nodes` are the obstacles (default: just the two ends). `used` is described at `search`.
export function wireGeom(from, to, port, style = 'square', nodes = [from, to], used = new Set(), budget = { remaining: BUDGET }) {
  const a = outPort(from);
  const b = inPorts(to)[port];
  if (style === 'curved') {
    const dx = (b.x - a.x) * 0.5;
    const p = [a.x, a.y, a.x + dx, a.y, b.x - dx, b.y, b.x, b.y];
    const at = (t) => {
      const u = 1 - t;
      return [u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6], u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7]];
    };
    return { d: `M${p[0]} ${p[1]}C${p.slice(2).join(' ')}`, at, chip: at(0.15) };
  }
  const A = [a.x, a.y];
  const B = [b.x, b.y];
  let grid = null;
  if (budget.remaining > 0) {
    const boxes = nodes.map(nodeBox);
    const others = nodes.filter((n) => n.id !== from.id && n.id !== to.id).map(nodeBox);
    grid = search(A, B, boxes, others, used, budget);
  }
  const finish = (pts, gr, fallback) => {
    const w = square(pts);
    return { ...w, grid: gr, stub: gr[1], fallback, chip: w.at(Math.min(14 / (w.total || 1), 1)) };
  };
  if (grid) return finish(corners(grid), grid, false);
  return finish(fallbackPts(A, B), fallbackPts(A, B), true);
}

// The old fixed route: horizontal, vertical at the midpoint, horizontal. Ignores nodes.
function fallbackPts(A, B) {
  if (Math.abs(A[1] - B[1]) < 0.5 && B[0] > A[0]) return [A, B];
  if (B[0] - A[0] >= 28) { const mx = (A[0] + B[0]) / 2; return [A, [mx, A[1]], [mx, B[1]], B]; }
  // Target at or left of the source: step out, run clear of the nodes, step back in.
  const x1 = A[0] + 14;
  const x2 = B[0] - 14;
  const ym = Math.abs(A[1] - B[1]) >= 84 ? (A[1] + B[1]) / 2 : Math.max(A[1], B[1]) + 56;
  return [A, [x1, A[1]], [x1, ym], [x2, ym], [x2, B[1]], B];
}

// Routes every wire of a circuit. Wires from one source share a trunk, the first one carries the chip, and `junction` marks where a wire leaves the trunk.
const memo = new Map();
// opts.frozen (a previous result) and opts.touch (a node id): only wires attached to that node are re-routed; the rest keep their old route. Used while dragging.
export function routeAll(circuit, style = 'square', opts = {}) {
  const byId = new Map(circuit.nodes.map((n) => [n.id, n]));
  const bk = circuit.nodes.map((n) => `${n.type}${n.x},${n.y}`).join(';');
  const bySrc = new Map();
  for (const w of circuit.wires) if (byId.has(w.from) && byId.has(w.to)) (bySrc.get(w.from) ?? bySrc.set(w.from, []).get(w.from)).push(w);
  const out = new Map();
  // shortcut: the aggregate budget can use obstacle-crossing fallbacks; use off-thread routing if strict large-circuit avoidance is required.
  const budget = { remaining: BUDGET };
  for (const ws of bySrc.values()) {
    const used = new Set();
    const keys = [];
    const prev = [];
    ws.forEach((w, k) => {
      const f = byId.get(w.from), t = byId.get(w.to);
      let g = opts.frozen && w.from !== opts.touch && w.to !== opts.touch ? opts.frozen.get(w.id) : null;
      if (g) g.grid?.forEach((p) => used.add(p.join()));
      else if (style === 'curved') g = wireGeom(f, t, w.port, 'curved');
      else {
        const b = inPorts(t)[w.port];
        const key = `${outPort(f).x},${outPort(f).y},${b.x},${b.y}|${bk}|${keys.join('>')}`;
        g = memo.get(key);
        if (!g) { g = wireGeom(f, t, w.port, 'square', circuit.nodes, used, budget); if (memo.size > 2000) memo.clear(); memo.set(key, g); }
        keys.push(`${b.x},${b.y}`);
        g.grid.forEach((p) => used.add(p.join()));
      }
      let junction = null;
      let best = 1;
      for (const o of g.grid ? prev : []) {
        let c = 0;
        while (c < g.grid.length && c < o.grid.length && g.grid[c][0] === o.grid[c][0] && g.grid[c][1] === o.grid[c][1]) c++;
        if (c > best) { best = c; junction = g.grid[c - 1]; }
      }
      const r = { ...g, junction, first: k === 0 };
      prev.push(r);
      out.set(w.id, r);
    });
  }
  return out;
}

// Nearest input port (any node but `skip`) within `max` px of a world point.
export function nearestInPort(circuit, pt, max = 26) {
  let best = null;
  let bd = max;
  for (const n of circuit.nodes) for (const p of inPorts(n)) {
    const d = Math.hypot(p.x - pt.x, p.y - pt.y);
    if (d < bd) { bd = d; best = { node: n.id, port: p.i, x: p.x, y: p.y }; }
  }
  return best;
}

export function bounds(circuit) {
  if (!circuit.nodes.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of circuit.nodes) {
    const [l, r, u, d] = EXT[n.type] ?? [40, 40, 42, 42];
    x0 = Math.min(x0, n.x - l); x1 = Math.max(x1, n.x + r);
    y0 = Math.min(y0, n.y - u); y1 = Math.max(y1, n.y + d);
  }
  return { x0, y0, x1, y1 };
}

// Canvas view = { x, y, k }: screen = world * k + (x, y). Zoom range of the canvas; fit may go lower to show a big circuit.
export const MIN_K = 0.4, MAX_K = 2, FIT_MIN_K = 0.25;
// View that shows bounds `b` whole inside a w x h canvas: zoomed out only if needed (never above 1), centred.
export function fitView(b, w, h, pad = 24) {
  if (!b) return { x: w / 2, y: h / 2, k: 1 };
  const k = Math.min(1, Math.max(FIT_MIN_K, Math.min((w - 2 * pad) / (b.x1 - b.x0), (h - 2 * pad) / (b.y1 - b.y0))));
  return { x: (w - (b.x1 - b.x0) * k) / 2 - b.x0 * k, y: (h - (b.y1 - b.y0) * k) / 2 - b.y0 * k, k };
}
// Zoom to `nk` keeping the world point under canvas pixel (px, py) in place.
export function zoomAt(v, nk, px, py) {
  const k = Math.min(MAX_K, Math.max(Math.min(MIN_K, v.k), nk));
  return { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k };
}
