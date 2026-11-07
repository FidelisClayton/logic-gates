// Propagation wave: which wires and nodes pulse, and when, after input switches flip.
export const HOP = 450; // ms between one hop and the next: equal to WIRE_MS so the dash hands over wire to wire
export const WIRE_MS = 450; // one wire's pulse
export const GLOW_MS = 700;

// One energy front at constant speed. A wire takes length / SPEED; a gate holds the front for GATE_MS while it flares,
// and its output wires leave right as that ends, so the front never stops. Without `lenOf` every wire takes WIRE_MS
// and gates are instant (the old fixed hop).
export const SPEED = 0.5; // px per ms: a 220px wire takes ~440ms
export const GATE_MS = 70;
// Only a wire into an OUTPUT decelerates, into the lamp. It takes OUT_STRETCH times longer and its curve starts at slope
// y1/x1 = OUT_STRETCH, so its entry speed is exactly SPEED (no jump at the joint) and it eases to rest at the end.
export const OUT_STRETCH = 1.5;
export const OUT_EASE = [0.35, 0.35 * OUT_STRETCH, 0.6, 1];

// prev/cur are evaluate() results. Walks changed wires downstream from every flipped INPUT.
// `from` adds start nodes besides flipped inputs, such as a gate whose type was replaced.
// lenOf(wireId) is the routed length in px. Steps carry `delay` (when the front starts there) and, for wires, `dur`.
export function waveSteps(circuit, prev, cur, from = [], lenOf = null) {
  const flipped = circuit.nodes.filter((n) => (n.type === 'INPUT' || from.includes(n.id)) && prev.node[n.id] !== undefined && prev.node[n.id] !== cur.node[n.id]);
  const gate = lenOf ? GATE_MS : 0;
  const types = new Map(circuit.nodes.map((n) => [n.id, n.type]));
  const seen = new Set(flipped.map((n) => n.id));
  const queue = flipped.map((n) => n.id);
  const changed = [];
  for (let i = 0; i < queue.length; i++) {
    for (const w of circuit.wires) {
      if (w.from !== queue[i] || prev.wire[w.id] === cur.wire[w.id]) continue;
      changed.push(w);
      if (seen.has(w.to)) continue;
      seen.add(w.to);
      queue.push(w.to);
    }
  }
  const toOut = (w) => lenOf && types.get(w.to) === 'OUTPUT';
  const dur = (w) => (lenOf ? (lenOf(w.id) / SPEED) * (toOut(w) ? OUT_STRETCH : 1) : WIRE_MS);
  // out[id]: when the front leaves a node. Sources leave at 0; a gate leaves GATE_MS after its latest changed input arrives.
  // The graph is acyclic, so relaxing until nothing moves settles in at most one pass per wire.
  const out = new Map(flipped.map((n) => [n.id, 0]));
  const arrive = new Map();
  for (let moved = true, k = 0; moved && k <= changed.length; k++) {
    moved = false;
    for (const w of changed) {
      if (!out.has(w.from) || (out.get(w.to) === 0 && flipped.some((n) => n.id === w.to))) continue;
      const at = out.get(w.from) + dur(w);
      if (at <= (arrive.get(w.to) ?? -1)) continue;
      arrive.set(w.to, at);
      out.set(w.to, at + gate);
      moved = true;
    }
  }
  const wires = changed.map((w) => ({ id: w.id, delay: out.get(w.from), dur: dur(w), ease: toOut(w) ? `cubic-bezier(${OUT_EASE})` : 'linear', v: cur.wire[w.id] }));
  const nodes = flipped.filter((n) => n.type !== 'INPUT').map((n) => ({ id: n.id, delay: 0, dur: gate, v: cur.node[n.id] }));
  for (const [id, at] of arrive) if (prev.node[id] !== cur.node[id] && types.get(id) !== 'INPUT') nodes.push({ id, delay: at, dur: gate, v: cur.node[id] });
  return { wires, nodes };
}

// When each wire/node should show its new value: grouped by delay, delay 0 left out (those commit with the render).
export function commitSchedule(steps) {
  const at = new Map();
  for (const [kind, list] of [['wires', steps.wires], ['nodes', steps.nodes]]) {
    for (const s of list) {
      if (s.delay <= 0) continue;
      if (!at.has(s.delay)) at.set(s.delay, { wires: [], nodes: [] });
      at.get(s.delay)[kind].push(s.id);
    }
  }
  return [...at].sort((a, b) => a[0] - b[0]).map(([delay, ids]) => ({ delay, ...ids }));
}

// Energy-blade ignition and retraction. A wire turning on reveals its lit layers (React renders them) from the
// source port to the target port, with a hot tip and a brightness overshoot that settles over SETTLE_MS.
// A wire turning off has no lit layers any more, so cloned layers retract with the tail running source to target.
export const SETTLE_MS = 400;
const NS = 'http://www.w3.org/2000/svg';

// Plays the steps with the Web Animations API. Returns a cancel function.
export function playWave(svg, steps, pathLen = (el) => el.getTotalLength()) {
  const anims = [];
  const fx = svg.querySelector('.fx');
  const q = (attr, id) => svg.querySelector(`[${attr}="${CSS.escape(id)}"]`);
  // A transient path on the wire's route, removed when its animation ends.
  const ghost = (d, cls, L) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', cls);
    if (L) p.style.strokeDasharray = `${L} ${L}`;
    fx.append(p);
    return p;
  };
  const play = (el, frames, opts) => {
    const a = el.animate(frames, { fill: 'backwards', ...opts });
    if (el.parentNode === fx) a.onfinish = () => el.remove();
    anims.push(a);
  };
  for (const s of steps.wires) {
    const base = q('data-pw', s.id);
    if (!base) continue;
    const L = pathLen(base);
    const d = base.getAttribute('d');
    const dash = `${L} ${L}`;
    const opt = { delay: s.delay };
    const E = s.ease ?? 'linear';
    const D = s.dur ?? WIRE_MS; // the tip moves linearly: constant speed from wire to wire
    if (s.v) {
      for (const el of svg.querySelectorAll(`[data-bl="${CSS.escape(s.id)}"]`)) {
        if (el.classList.contains('bf')) play(el, [{ opacity: 0 }, { opacity: 0 }], { ...opt, duration: D }); // shimmer waits for the tip
        else play(el, [{ strokeDasharray: dash, strokeDashoffset: L }, { strokeDasharray: dash, strokeDashoffset: 0 }], { ...opt, duration: D, easing: E });
      }
      const T = D + SETTLE_MS; // the bloom tail fades alone after the tip; it never delays the next wire
      for (const cls of ['fx-bloom', 'fx-boost']) {
        play(ghost(d, cls, L), [
          { strokeDashoffset: L, opacity: 1, easing: E },
          { strokeDashoffset: 0, opacity: 1, offset: D / T, easing: 'ease-out' },
          { strokeDashoffset: 0, opacity: 0 },
        ], { ...opt, duration: T });
      }
      const tip = ghost(d, 'fx-tip');
      tip.style.opacity = '0'; // no backwards fill here: its first frame is lit, so hide it until the delay ends
      play(tip, [
        { strokeDashoffset: 14, opacity: 1 },
        { opacity: 1, offset: 0.9 },
        { strokeDashoffset: 14 - L, opacity: 0 },
      ], { ...opt, duration: D, easing: E, fill: 'none' });
    } else {
      for (const cls of ['bh', 'bg', 'bc']) play(ghost(d, `lit ${cls}`, L), [{ strokeDashoffset: 0 }, { strokeDashoffset: -L }], { ...opt, duration: D, easing: E });
    }
    base.dataset.pv = s.v;
  }
  // Gates flare their own outline and the OUT lamp its brightness and halo, then settle. A gate turning off dims from lit to rest.
  const none = 'drop-shadow(0 0 0 transparent)';
  for (const s of steps.nodes) {
    const el = q('data-ng', s.id);
    if (!el) continue;
    const lit = (a) => `color-mix(in oklab, var(--sig) ${a}%, var(--bg))`;
    const lamp = el.classList.contains('lamp1') || el.classList.contains('lamp0');
    const restAt = (v) => (lamp ? { fill: v ? 'var(--sig)' : 'var(--bg)', filter: `brightness(1) ${none}` } : { stroke: 'var(--gate)', fill: 'var(--bg)', filter: none });
    const rest = restAt(s.v);
    // The first frame is the OLD look and is held through the delay (fill backwards), so nothing lights before its turn.
    let frames;
    if (!s.v) frames = [lamp ? { fill: 'var(--sig)', filter: `brightness(1) ${none}` } : { stroke: 'var(--sig)', fill: lit(15), filter: 'drop-shadow(0 0 3px var(--sig))' }, rest];
    else frames = [restAt(0), lamp ? { fill: 'var(--sig)', filter: 'brightness(1.8) drop-shadow(0 0 14px var(--sig))', offset: 0.2 } : { stroke: 'var(--sig)', fill: lit(15), filter: 'drop-shadow(0 0 8px var(--sig))', offset: 0.2 }, rest];
    anims.push(el.animate(frames, { duration: GLOW_MS, delay: s.delay, easing: 'ease-out', fill: 'backwards' }));
  }
  return () => { anims.forEach((a) => a.cancel()); fx?.replaceChildren(); };
}
