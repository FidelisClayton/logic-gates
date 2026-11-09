import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { evaluate, GATES, wouldCreateCycle } from '../logic.js';
import { bodyPath, bubbleX } from '../glyphs.jsx';
import { bounds, clampCoord, fitView, hasOut, inPorts, nearestInPort, outPort, routeAll, snap, zoomAt } from '../geometry.js';
import { load, save } from '../storage.js';
import { WireIcon } from '../wireIcons.jsx';
import { newId } from '../ids.js';
import { useI18n } from '../I18n.jsx';
import { Icon } from '../icons.jsx';
import { btn, iconBtn, kbd } from '../ui.js';
import SelectionBar from './SelectionBar.jsx';
import { commitSchedule, playWave, waveSteps } from '../pulse.js';
import { partName } from '../parts.js';
import Grid from './Grid.jsx';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Popover, PopoverContent } from './ui/popover.jsx';
import { circuitExprs, exprText } from '../notation.js';
import Expr from './Expr.jsx';
import { GateIcon } from '../glyphs.jsx';

const SLOP = 5;

// Per-wire flicker phase and period from the wire id, so blades never flicker in sync and a re-render keeps each one's rhythm.
function hum(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 997;
  return { '--hd': `${(-(h / 997) * 4).toFixed(2)}s`, '--hp': `${(2.8 + (h / 997) * 1.6).toFixed(2)}s` };
}

// Card flip for a displayed 0/1: squash to nothing, swap the value at the midpoint, expand. Returns the value to render
// and a ref for the element to squash. Not on mount; reduced motion swaps at once. A change mid-flip restarts the
// squash and the midpoint swap reads the latest value, so a chip never stays squashed.
const FLIP_MS = 115;
const SQUASH = { transform: 'scaleY(0)', filter: 'brightness(1.5)' };
const REST = { transform: 'scaleY(1)', filter: 'brightness(1)' };
function useFlip(v) {
  const ref = useRef(null);
  const latest = useRef(v);
  const shownRef = useRef(v);
  const anim = useRef(null);
  const [shown, setShownState] = useState(v);
  const setShown = (x) => { shownRef.current = x; setShownState(x); };
  latest.current = v;
  // Deferred a frame: a wave start renders the new values once before the layout effect restores the old ones, and that
  // transient value must not flip. By the next frame `latest` is back to what is really on display.
  useEffect(() => {
    const f = requestAnimationFrame(() => {
      if (latest.current === shownRef.current) return;
      const el = ref.current;
      if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return setShown(latest.current);
      anim.current?.cancel();
      const a = el.animate([REST, SQUASH], { duration: FLIP_MS, easing: 'cubic-bezier(0.5, 0, 0.9, 0.5)', fill: 'forwards' });
      anim.current = a;
      a.onfinish = () => {
        setShown(latest.current);
        const b = el.animate([SQUASH, REST], { duration: FLIP_MS, easing: 'cubic-bezier(0.1, 0.5, 0.5, 1)' });
        anim.current = b;
        a.cancel(); // its forwards fill would hold the squash once b ends
        b.onfinish = () => { anim.current = null; };
      };
    });
    return () => cancelAnimationFrame(f);
  }, [v]);
  useEffect(() => () => anim.current?.cancel(), []);
  return [shown, ref];
}
const FLIP_STYLE = { transformBox: 'fill-box', transformOrigin: 'center' };

function Chip({ v, x, y, dim }) {
  const [shown, ref] = useFlip(v);
  return (
    <g className={`chip c${shown}${dim ? ' dim' : ''}`} transform={`translate(${x} ${y})`} pointerEvents="none">
      <g ref={ref} style={FLIP_STYLE}><rect x="-9" y="-8" width="18" height="16" /><text>{shown}</text></g>
    </g>
  );
}

function LampDigit({ v }) {
  const [shown, ref] = useFlip(v);
  return <text ref={ref} style={FLIP_STYLE} className={`lampd d${shown}`}>{shown}</text>;
}

const ZSTEP = 1.25;
function ZIcon({ children }) {
  return <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}

const MAGNET = 8; // px: a dragged port this close (vertically) to a wired port snaps level with it

export default function Canvas({ circuit, sel, dispatch, notify, viewRef, fitKey, onDuplicate, onDelete, onReplace, onFormat, highlight, onHoverNode }) {
  const { t } = useI18n();
  const wrap = useRef(null);
  const session = useRef(null);
  const [pan, setPan] = useState({ x: 0, y: 0, k: 1 }); // the view: screen = world * k + (x, y)
  const k = pan.k;
  const hs = Math.max(1, 1 / k); // hit areas grow as the view zooms out, so they stay 44 screen px
  const ptrs = useRef(new Map()); // active pointers in client px, for pinch
  const pinch = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [armed, setArmed] = useState(null);
  const [preview, setPreview] = useState(null);
  const [flash, setFlash] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [guide, setGuide] = useState(null);
  const [wstyle, setWstyle] = useState(() => (load('wires') === 'curved' ? 'curved' : 'square'));
  const setStyle = (v) => { setWstyle(v); save('wires', v); };
  const fitted = useRef(null);
  const mouse = useRef(null); // last mouse position over the canvas, in client pixels
  const svgRef = useRef(null);
  const prevEval = useRef(null);
  const cancelWave = useRef(null);
  const routeRef = useRef(null);
  const over = useRef({ node: Object.create(null), wire: Object.create(null) }); // OLD values still on display while the wave is on its way
  const timers = useRef([]);
  const [, bump] = useState(0);
  const [tip, setTip] = useState(null); // gate popover: { id, via: 'hover' | 'focus' | 'tap' }
  const [moving, setMoving] = useState(false); // a pan or pinch is under way

  useLayoutEffect(() => {
    const el = wrap.current;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function cancel() {
    session.current = null;
    pinch.current = null;
    ptrs.current.clear();
    setArmed(null);
    setPreview(null);
    setDragId(null);
    setGuide(null);
    setMoving(false);
    setFlash(null);
  }
  useLayoutEffect(() => { cancel(); mouse.current = null; setTip(null); }, [fitKey]);

  // Centre the circuit when a circuit loads or the canvas resizes.
  useLayoutEffect(() => {
    // Refit when a circuit loads or the canvas resizes, never mid-pan or mid-drag.
    const key = `${fitKey}|${size.w}x${size.h}`;
    if (!size.w || fitted.current === key || session.current?.moved) return;
    fitted.current = key;
    setPan(fitView(bounds(circuit), size.w, size.h));
  }, [fitKey, size, circuit]);

  // ctrl/cmd + wheel (and trackpad pinch) zooms at the cursor; a plain wheel pans. Needs a non-passive listener.
  useEffect(() => {
    const el = wrap.current;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) setPan((v) => zoomAt(v, v.k * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.01)), e.clientX - r.left, e.clientY - r.top));
      else setPan((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 700);
    return () => clearTimeout(id);
  }, [flash]);

  // The command palette switches the style through this event.
  useEffect(() => {
    const on = (e) => setStyle(e.detail === 'curved' ? 'curved' : 'square');
    addEventListener('lg:wires', on);
    return () => removeEventListener('lg:wires', on);
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setArmed(null);
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const toWorld = (cx, cy) => {
    const r = wrap.current.getBoundingClientRect();
    return { x: (cx - r.left - pan.x) / k, y: (cy - r.top - pan.y) / k, inside: cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom };
  };
  viewRef.current = {
    cancel,
    center: () => ({ x: snap((size.w / 2 - pan.x) / k), y: snap((size.h / 2 - pan.y) / k) }),
    zoom: k,
    fit: () => setPan(fitView(bounds(circuit), size.w, size.h)),
    zoomIn: () => setPan((v) => zoomAt(v, v.k * ZSTEP, size.w / 2, size.h / 2)),
    zoomOut: () => setPan((v) => zoomAt(v, v.k / ZSTEP, size.w / 2, size.h / 2)),
    pointer: () => { const m = mouse.current; return m ? viewRef.current.toWorld(m.x, m.y) : null; },
    toWorld: (cx, cy) => { const p = toWorld(cx, cy); return p.inside ? { ...p, x: snap(p.x), y: snap(p.y) } : null; },
  };

  // Dragging re-routes only the dragged node's wires (full re-route of 40 wires costs ~10ms); everything re-routes on drop.
  const routes = useMemo(() => routeAll(circuit, wstyle, dragId ? { frozen: routeRef.current, touch: dragId } : {}), [circuit, wstyle, dragId]);
  routeRef.current = routes;
  const ev = evaluate(circuit);
  const nv = { ...ev.node, ...over.current.node };
  const wv = { ...ev.wire, ...over.current.wire };
  const byId = new Map(circuit.nodes.map((n) => [n.id, n]));
  // Value arriving at each input port, for stub and port colour.
  const portVal = new Map(circuit.wires.map((w) => [`${w.to}:${w.port}`, wv[w.id] ?? 0]));

  // Input flip -> one wave downstream; every wire, gate and chip keeps its old value (over) until the wave arrives.
  // Anything else that changes the evaluation (undo, replace, wiring, circuit switch, format) snaps to it, as does reduced motion.
  useLayoutEffect(() => {
    const sig = `${fitKey}|${circuit.wires.map((w) => `${w.id}${w.from}${w.to}${w.port}`).join()}|${circuit.nodes.map((n) => n.id + n.type).join()}`;
    const key = JSON.stringify([ev.node, ev.wire]);
    const prev = prevEval.current;
    prevEval.current = { sig, key, node: ev.node, wire: ev.wire };
    if (prev && prev.sig === sig && prev.key === key) return; // a render that changed no value: leave a wave in flight alone
    cancelWave.current?.();
    cancelWave.current = null;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const had = Object.keys(over.current.node).length + Object.keys(over.current.wire).length;
    over.current = { node: Object.create(null), wire: Object.create(null) };
    const steps = prev && prev.sig === sig && !matchMedia('(prefers-reduced-motion: reduce)').matches
      ? waveSteps(circuit, { node: { ...prev.node, ...(prev.over?.node) }, wire: { ...prev.wire, ...(prev.over?.wire) } }, ev, [], (id) => svgRef.current.querySelector(`[data-pw="${CSS.escape(id)}"]`).getTotalLength())
      : { wires: [], nodes: [] };
    if (!steps.wires.length && !steps.nodes.length) {
      prevEval.current.over = null;
      if (had) bump((n) => n + 1);
      return;
    }
    const shown = { node: { ...prev.node, ...prev.over?.node }, wire: { ...prev.wire, ...prev.over?.wire } };
    for (const s of steps.nodes) if (s.delay > 0) over.current.node[s.id] = shown.node[s.id];
    for (const s of steps.wires) if (s.delay > 0) over.current.wire[s.id] = shown.wire[s.id];
    prevEval.current.over = over.current;
    for (const c of commitSchedule(steps)) {
      timers.current.push(setTimeout(() => {
        c.wires.forEach((id) => delete over.current.wire[id]);
        c.nodes.forEach((id) => delete over.current.node[id]);
        bump((n) => n + 1);
      }, c.delay));
    }
    cancelWave.current = playWave(svgRef.current, steps);
    bump((n) => n + 1);
  });

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function connect(from, to, port) {
    const source = byId.get(from), target = byId.get(to);
    if (!source || !target || !Object.hasOwn(GATES, source.type) || !Object.hasOwn(GATES, target.type)
      || !hasOut(source) || !Number.isInteger(port) || port < 0 || port >= GATES[target.type].inputs) return;
    const rest = circuit.wires.filter((w) => !(w.to === to && w.port === port));
    if (wouldCreateCycle({ ...circuit, wires: rest }, from, to)) {
      setFlash({ node: to, port, k: Date.now() });
      notify(t('toast.loop'));
      return;
    }
    if (circuit.wires.some((w) => w.from === from && w.to === to && w.port === port)) return;
    const id = newId('w');
    dispatch({ type: 'edit', fn: (c) => ({ ...c, wires: [...c.wires.filter((w) => !(w.to === to && w.port === port)), { id, from, to, port }] }) });
  }

  function down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2) {
      // A second finger turns whatever the first one started into a pinch.
      e.currentTarget.setPointerCapture(e.pointerId);
      const [a, b] = [...ptrs.current.values()];
      const r = wrap.current.getBoundingClientRect();
      pinch.current = { d0: Math.hypot(b.x - a.x, b.y - a.y) || 1, v: pan, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top };
      session.current = null;
      setPreview(null); setDragId(null); setGuide(null); setArmed(null);
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    const tgt = e.target.closest('[data-out],[data-tog],[data-node],[data-wire]');
    if (armed && !tgt?.dataset.out) {
      const hit = nearestInPort(circuit, w, 26 * hs);
      setArmed(null);
      if (hit) return connect(armed, hit.node, hit.port);
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const base = { sx: e.clientX, sy: e.clientY, moved: false, pan };
    const d = tgt?.dataset ?? {};
    if (d.out) session.current = { ...base, kind: 'out', id: d.out };
    else if (d.tog || d.node) {
      const id = d.tog ?? d.node;
      const n = byId.get(id);
      if (!d.tog) dispatch({ type: 'select', sel: { kind: 'node', id } });
      session.current = { ...base, kind: 'node', id, tog: !!d.tog, ox: n.x, oy: n.y };
    } else if (d.wire) session.current = { ...base, kind: 'wire', id: d.wire };
    else session.current = { ...base, kind: 'empty' };
  }

  function move(e) {
    if (ptrs.current.has(e.pointerId)) ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pz = pinch.current;
    if (pz) {
      const [a, b] = [...ptrs.current.values()];
      if (!b) return;
      const r = wrap.current.getBoundingClientRect();
      const mx = (a.x + b.x) / 2 - r.left;
      const my = (a.y + b.y) / 2 - r.top;
      const z = zoomAt(pz.v, (pz.v.k * Math.hypot(b.x - a.x, b.y - a.y)) / pz.d0, pz.mx, pz.my);
      setMoving(true);
      return setPan({ ...z, x: z.x + mx - pz.mx, y: z.y + my - pz.my });
    }
    const s = session.current;
    if (!s) return;
    const dx = e.clientX - s.sx;
    const dy = e.clientY - s.sy;
    if (!s.moved && Math.hypot(dx, dy) < SLOP) return;
    s.moved = true;
    if (s.kind === 'node') {
      if (!s.cp) { s.cp = true; dispatch({ type: 'checkpoint' }); setDragId(s.id); }
      let x = s.ox + dx / k;
      let y = s.oy + dy / k;
      let g = null;
      if (!e.altKey) {
        // Magnet: level a port with the port it is wired to; otherwise centre on the dot grid.
        const me = byId.get(s.id);
        const ports = (nx, ny) => circuit.wires.flatMap((w) => {
          const other = byId.get(w.from === s.id ? w.to : w.from);
          if (!other || other.id === s.id || (w.from !== s.id && w.to !== s.id)) return [];
          const out = w.from === s.id;
          return [{ mine: out ? outPort({ ...me, x: nx, y: ny }) : inPorts({ ...me, x: nx, y: ny })[w.port], theirs: out ? inPorts(other)[w.port] : outPort(other) }];
        });
        const pick = ports(x, y).reduce((m, p) => (Math.abs(p.theirs.y - p.mine.y) < Math.min(MAGNET + 1, m.d) ? { p, d: Math.abs(p.theirs.y - p.mine.y) } : m), { p: null, d: Infinity });
        const dyLevel = pick.p ? pick.p.theirs.y - pick.p.mine.y : 0;
        x = snap(x);
        y = pick.p ? y + dyLevel : snap(y);
        if (pick.p) {
          const at = ports(x, y).find((q) => q.theirs === pick.p.theirs) ?? pick.p;
          g = { y: at.theirs.y, x0: Math.min(at.mine.x, at.theirs.x) - 40, x1: Math.max(at.mine.x, at.theirs.x) + 40 };
        }
      }
      x = clampCoord(x);
      y = clampCoord(y);
      setGuide(g);
      dispatch({ type: 'set', fn: (c) => ({ ...c, nodes: c.nodes.map((n) => (n.id === s.id ? { ...n, x, y } : n)) }) });
    } else if (s.kind === 'out') {
      const w = toWorld(e.clientX, e.clientY);
      setPreview({ from: s.id, x: w.x, y: w.y, near: nearestInPort(circuit, w, 26 * hs) });
    } else { setMoving(true); setPan({ ...s.pan, x: s.pan.x + dx, y: s.pan.y + dy }); }
  }

  function up(e) {
    ptrs.current.delete(e.pointerId);
    if (!ptrs.current.size) setMoving(false);
    if (pinch.current) {
      if (ptrs.current.size < 2) pinch.current = null;
      session.current = null;
      return;
    }
    const s = session.current;
    session.current = null;
    setPreview(null);
    setDragId(null);
    setGuide(null);
    if (!s || e.type === 'pointercancel') return;
    // Touch or pen tap on a gate or OUT opens its popover (tap again, or tap elsewhere, closes it); a switch toggles instead.
    if (e.pointerType !== 'mouse' && !s.moved) {
      const n = s.kind === 'node' && !s.tog && byId.get(s.id);
      setTip((c) => (n && n.type !== 'INPUT' && !(c?.via === 'tap' && c.id === n.id) ? { id: n.id, via: 'tap' } : null));
    }
    if (s.kind === 'node' && !s.moved && s.tog) dispatch({ type: 'toggle', id: s.id });
    else if (s.kind === 'out') {
      if (s.moved) {
        const hit = nearestInPort(circuit, toWorld(e.clientX, e.clientY), 26 * hs);
        if (hit) connect(s.id, hit.node, hit.port);
      } else setArmed(armed === s.id ? null : s.id);
    } else if (!s.moved && s.kind === 'wire') dispatch({ type: 'select', sel: { kind: 'wire', id: s.id } });
    else if (!s.moved && s.kind === 'empty') dispatch({ type: 'select', sel: null });
  }

  // Keyboard edits use the same connection validation and history as pointer edits.
  const nodeKey = (e, n) => {
    if (e.key === 'Escape') setTip(null);
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (e.key.toLowerCase() === 'w' && hasOut(n)) {
      e.preventDefault();
      e.stopPropagation();
      setArmed(armed === n.id ? null : n.id);
      return;
    }
    if (armed && /^[123]$/.test(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      const port = Number(e.key) - 1;
      if (port < GATES[n.type].inputs) {
        connect(armed, n.id, port);
        setArmed(null);
      }
      return;
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      const dx = e.key === 'ArrowLeft' ? -24 : e.key === 'ArrowRight' ? 24 : 0;
      const dy = e.key === 'ArrowUp' ? -24 : e.key === 'ArrowDown' ? 24 : 0;
      dispatch({ type: 'edit', fn: (c) => ({ ...c, nodes: c.nodes.map((node) => node.id === n.id ? { ...node, x: clampCoord(node.x + dx), y: clampCoord(node.y + dy) } : node) }), sel: { kind: 'node', id: n.id } });
      return;
    }
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation();
    if (n.type === 'INPUT') dispatch({ type: 'toggle', id: n.id });
    else dispatch({ type: 'select', sel: { kind: 'node', id: n.id } });
  };

  // Selection bar anchor in canvas pixels.
  let bar = null;
  if (sel?.kind === 'node' && byId.has(sel.id)) bar = { x: byId.get(sel.id).x * k + pan.x, y: byId.get(sel.id).y * k + pan.y - 52, node: true, type: byId.get(sel.id).type };
  if (sel?.kind === 'wire') {
    const w = circuit.wires.find((q) => q.id === sel.id);
    if (w) { const [mx, my] = routes.get(w.id).at(0.5); bar = { x: mx * k + pan.x, y: my * k + pan.y - 14, node: false }; }
  }
  if (bar) { bar.x = Math.min(Math.max(bar.x, 130), Math.max(130, size.w - 130)); bar.y = Math.max(bar.y, 48); }

  // Gate popover: shown for the hovered, focused or tapped gate or OUT, hidden while it is dragged or the view moves.
  const tipNode = tip && byId.get(tip.id);
  const open = !!tipNode && !dragId && !moving && size.w > 0;
  useEffect(() => { onHoverNode?.(open ? tip.id : null); }, [open, tip?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const ex = useMemo(() => circuitExprs(circuit), [circuit]);
  // Virtual anchor at the node's screen box; a new object on every pan, zoom or move makes Radix reposition.
  const anchor = useMemo(() => {
    if (!tipNode || !wrap.current) return null;
    const r = wrap.current.getBoundingClientRect();
    const [hw, hh] = tipNode.type === 'OUTPUT' ? [24, 24] : [30, 26];
    const x = r.left + tipNode.x * k + pan.x - hw * k;
    const y = r.top + tipNode.y * k + pan.y - hh * k;
    return { current: { getBoundingClientRect: () => new DOMRect(x, y, 2 * hw * k, 2 * hh * k) } };
  }, [tipNode, k, pan.x, pan.y, size]);
  const dimWire = (id) => !!highlight && !highlight.wires.has(id);
  const dimNode = (id) => !!highlight && !highlight.nodes.has(id);

  const ringAt = (id, port) => {
    const n = byId.get(id);
    return n && (port === undefined ? outPort(n) : inPorts(n)[port]);
  };
  const outWired = new Set(circuit.wires.map((w) => w.from));
  const armedPt = armed && byId.has(armed) ? outPort(byId.get(armed)) : null;
  const flashPt = flash && ringAt(flash.node, flash.port);
  const prevFrom = preview && byId.get(preview.from);

  return (
    <div
      ref={wrap}
      data-clip className="relative min-w-0 overflow-hidden"
      onPointerMove={(e) => { mouse.current = e.pointerType === 'mouse' ? { x: e.clientX, y: e.clientY } : null; }}
      onPointerLeave={() => { mouse.current = null; }}
    >
      <span id="node-keys" className="sr-only">{t('aria.nodeKeys')}</span>
      <Grid host={wrap} view={pan} size={size} />
      <svg
        ref={svgRef}
        className="circuit absolute inset-0 size-full touch-none select-none"
        role="group"
        aria-label={t('aria.canvas')}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <g transform={`translate(${pan.x} ${pan.y}) scale(${k})`}>
          {circuit.wires.map((w) => <path key={`h${w.id}`} className={`halo${dimWire(w.id) ? ' dim' : ''}`} d={routes.get(w.id).d} />)}
          {sel?.kind === 'wire' && circuit.wires.filter((w) => w.id === sel.id).map((w) => <path key="ws" className="wsel" d={routes.get(w.id).d} />)}
          {circuit.wires.map((w) => <path key={w.id} className={`wire w0${dimWire(w.id) ? ' dim' : ''}`} data-pw={w.id} d={routes.get(w.id).d} />)}
          {circuit.wires.filter((w) => wv[w.id] === 1 || ev.wire[w.id] === 1).map((w) => {
            const d = routes.get(w.id).d;
            return (
              <g key={`b${w.id}`} className={`blade${dimWire(w.id) ? ' dim' : ''}`} style={hum(w.id)} pointerEvents="none">
                <path className="bh" data-bl={w.id} d={d} />
                <path className="bg" data-bl={w.id} d={d} />
                <path className="bc" data-bl={w.id} d={d} />
                <path className="bf" data-bl={w.id} d={d} />
              </g>
            );
          })}
          <g className="fx" pointerEvents="none" />
          {circuit.wires.map((w) => {
            const name = (id) => {
              const n = byId.get(id);
              return n.type === 'INPUT' || n.type === 'OUTPUT' ? t(`aria.${n.type.toLowerCase()}`, { label: n.label ?? '' }) : n.label || partName(t, n.type);
            };
            const select = () => dispatch({ type: 'select', sel: { kind: 'wire', id: w.id } });
            return <path key={`t${w.id}`} className="whit" data-wire={w.id} tabIndex={0} role="button" aria-pressed={sel?.kind === 'wire' && sel.id === w.id} aria-label={`${t('aria.wire')}: ${name(w.from)} → ${name(w.to)} (${w.port + 1})`} d={routes.get(w.id).d}
              onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) select(); }}
              onKeyDown={(e) => {
                if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
                if (e.key === 'Backspace') e.preventDefault();
                if (e.key !== ' ' && e.key !== 'Enter') return;
                e.preventDefault();
                e.stopPropagation();
                select();
              }} />;
          })}

          {circuit.nodes.map((n) => <NodeView key={n.id} n={n} dim={dimNode(n.id)} describedBy={open && tip.id === n.id ? 'node-keys gate-pop' : 'node-keys'} onFocus={() => dispatch({ type: 'select', sel: { kind: 'node', id: n.id } })} onTip={setTip} v={nv[n.id]} selected={sel?.kind === 'node' && sel.id === n.id} dragging={dragId === n.id} portVal={portVal} t={t} onKey={nodeKey} />)}


          {circuit.wires.map((w) => {
            const r = routes.get(w.id);
            return r.junction && <circle key={`j${w.id}`} className={`jdot w${wv[w.id]}${dimWire(w.id) ? ' dim' : ''}`} cx={r.junction[0]} cy={r.junction[1]} r="2.6" pointerEvents="none" />;
          })}

          {circuit.wires.filter((w) => routes.get(w.id).first).map((w) => {
            const [cx, cy] = routes.get(w.id).chip;
            const v = wv[w.id];
            return (
              <Chip key={`c${w.id}`} dim={dimWire(w.id)} v={v} x={cx.toFixed(1)} y={cy.toFixed(1)} />
            );
          })}

          {circuit.nodes.flatMap((n) => [
            ...(hasOut(n) ? [<Port key={`o${n.id}`} dim={dimNode(n.id)} p={outPort(n)} v={nv[n.id]} wired={outWired.has(n.id)} />] : []),
            ...inPorts(n).map((p) => <Port key={`i${n.id}${p.i}`} dim={dimNode(n.id)} p={p} v={portVal.get(`${n.id}:${p.i}`) ?? 0} wired={portVal.has(`${n.id}:${p.i}`)} />),
          ])}

          {circuit.nodes.filter(hasOut).map((n) => {
            const p = outPort(n);
            return [
              n.type === 'INPUT'
                ? <rect key={`ho${n.id}`} data-out={n.id} className="hitout" x={p.x - 6} y={p.y - 22 * hs} width={44 * hs} height={44 * hs} fill="transparent" />
                : <circle key={`ho${n.id}`} data-out={n.id} className="hitout" cx={p.x + 22 * (hs - 1)} cy={p.y} r={22 * hs} fill="transparent" />,
              <PortHi key={`hv${n.id}`} p={p} hover />,
            ];
          })}
          {circuit.nodes.filter((n) => n.type === 'INPUT').map((n) => (
            <rect key={`tg${n.id}`} data-tog={n.id} className="tog" x={n.x + 30 - 44 * hs} y={n.y - 22 * hs} width={44 * hs} height={44 * hs} fill="transparent" />
          ))}

          {guide && <line className="guide" x1={guide.x0} x2={guide.x1} y1={guide.y} y2={guide.y} pointerEvents="none" />}
          {armedPt && <PortHi p={armedPt} />}
          {preview && prevFrom && (
            <>
              <path className="preview" d={`M${outPort(prevFrom).x} ${outPort(prevFrom).y}L${(preview.near ?? preview).x} ${(preview.near ?? preview).y}`} />
              {preview.near && <PortHi p={preview.near} />}
            </>
          )}
          {flashPt && <PortHi key={flash.k} p={flashPt} bad />}
        </g>
      </svg>
      <div className="absolute top-3 right-3 flex gap-2">
        <div role="group" aria-label={t('zoom.group')} className="hidden h-7 items-center gap-0.5 rounded-md border border-line2 bg-raised p-0.5 md:inline-flex">
          <button className={`${iconBtn} size-6`} aria-label={t('zoom.out')} title={t('zoom.out')} disabled={k <= 0.4} onClick={() => viewRef.current.zoomOut()}><ZIcon><path d="M5 12h14" /></ZIcon></button>
          <button className={`${iconBtn} size-6`} aria-label={t('zoom.in')} title={t('zoom.in')} disabled={k >= 2} onClick={() => viewRef.current.zoomIn()}><Icon name="plus" /></button>
          <button className={`${iconBtn} size-6`} aria-label={t('zoom.fit')} title={t('zoom.fit')} onClick={() => viewRef.current.fit()}><ZIcon><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></ZIcon></button>
        </div>
        <div role="group" aria-label={t('wire.style')} className="inline-flex h-7 items-center gap-0.5 rounded-md border border-line2 bg-raised p-0.5">
          {['square', 'curved'].map((k) => (
            <button key={k} className={`${iconBtn} size-6 ${wstyle === k ? 'bg-hover text-ink' : ''}`} aria-label={t(`wire.${k}`)} title={t(`wire.${k}`)} aria-pressed={wstyle === k} onClick={() => setStyle(k)}><WireIcon style={k} /></button>
          ))}
        </div>
        <button className={`${btn} gap-2 bg-raised`} onClick={onFormat}><Icon name="format" /><span>{t('fmt.label')}</span><kbd className={kbd}>⇧F</kbd></button>
      </div>
      {anchor && (
        <Popover open={open} modal={false}>
          <PopoverPrimitive.Anchor virtualRef={anchor} />
          <PopoverContent
            id="gate-pop" role="tooltip" side="top" align="center" sideOffset={12} collisionBoundary={wrap.current}
            className="gpop pointer-events-none" onOpenAutoFocus={(e) => e.preventDefault()} onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <GatePop n={tipNode} ex={ex} circuit={circuit} nv={nv} t={t} />
            <PopoverPrimitive.Arrow className="gpop-tail" width={14} height={7} />
          </PopoverContent>
        </Popover>
      )}
      {bar && <SelectionBar x={bar.x} y={bar.y} onDuplicate={bar.node ? onDuplicate : null} onReplace={bar.node && bar.type !== 'INPUT' && bar.type !== 'OUTPUT' ? onReplace : null} type={bar.type} onDelete={onDelete} />}
    </div>
  );
}

// A port is always a small filled dot at the end of its stub; a hollow ring would read as an inversion bubble.
function Port({ p, v, wired, dim }) {
  return <circle className={`port ${wired ? `p${v}` : 'nc'}${dim ? ' dim' : ''}`} cx={p.x} cy={p.y} r="4" pointerEvents="none" />;
}

// Armed, drop-target, rejected and hover states: a larger filled dot on a soft halo, never a stroke ring.
function PortHi({ p, bad, hover }) {
  return (
    <g className={`hi${bad ? ' bad' : ''}${hover ? ' hov' : ''}`} transform={`translate(${p.x} ${p.y})`} pointerEvents="none">
      <circle className="hh" r="11" />
      <circle className="hd" r="6" />
    </g>
  );
}

function Val({ v }) {
  return <span className={`vchip c${v}`}>{v}</span>;
}

// English fallback until the keys land in i18n.js.
const tf = (t, key, vars, fb) => { const r = t(key, vars); return r === key ? fb : r; };

function GatePop({ n, ex, circuit, nv, t }) {
  const out = n.type === 'OUTPUT';
  const name = out ? t('aria.output', { label: n.label ?? '' }) : tf(t, 'pop.gate', { name: partName(t, n.type) }, `${partName(t, n.type)} gate`);
  const ins = inPorts(n).map((p) => circuit.wires.find((w) => w.to === n.id && w.port === p.i));
  return (
    <>
      <div className="gh"><GateIcon type={n.type} /><span className="gn">{name}</span><Val v={nv[n.id]} /></div>
      <div className="gx"><Expr expr={ex.nodes[n.id]} size="lg" /></div>
      <div className="gi">
        <span>{tf(t, 'pop.inputs', null, 'Inputs')}</span>
        {ins.map((w, i) => (
          <span key={i} className="mchip">{w ? <>{exprText(ex.nodes[w.from])} <b>{nv[w.from]}</b></> : '·'}</span>
        ))}
      </div>
    </>
  );
}

function NodeView({ n, v, selected, dragging, portVal, t, onKey, dim, describedBy, onTip, onFocus }) {
  const tr = `translate(${n.x} ${n.y})`;
  const cls = `nodeg${dragging ? ' dragging' : ''}${dim ? ' dim' : ''}`;
  const kb = { tabIndex: 0, onKeyDown: (e) => onKey(e, n), 'aria-describedby': describedBy, onFocus: (e) => {
    if (!e.currentTarget.matches(':focus-visible')) return;
    onFocus();
    if (n.type !== 'INPUT') onTip({ id: n.id, via: 'focus' });
  } };
  if (n.type !== 'INPUT') {
    // Mouse hover and keyboard focus open the popover; touch taps are handled in the canvas pointer-up.
    kb.onPointerEnter = (e) => e.pointerType === 'mouse' && onTip({ id: n.id, via: 'hover' });
    kb.onPointerLeave = (e) => e.pointerType === 'mouse' && onTip((c) => (c?.via === 'hover' && c.id === n.id ? null : c));
    kb.onBlur = () => onTip((c) => (c?.via === 'focus' && c.id === n.id ? null : c));
  }
  if (n.type === 'INPUT') {
    const c = v;
    return (
      <g className={cls} transform={tr} data-node={n.id} role="switch" aria-checked={c ? 'true' : 'false'} aria-label={t('aria.input', { label: n.label ?? '' })} {...kb}>
        {selected && <rect className="sel" x="-46" y="-26" width="92" height="52" rx="10" />}
        <rect className="fring" x="-46" y="-26" width="92" height="52" rx="10" />
        <rect className="swbox" x="-36" y="-16" width="72" height="32" rx="8" />
        <text className="swlbl" x="-24" y="4.5">{n.label}</text>
        <rect className={`track${c}`} x="-1" y="-8" width="30" height="16" rx="8" />
        <circle className={`knob${c}`} cx={c ? 21 : 7} cy="0" r="5" />
        <rect x="-44" y="-28" width="96" height="56" fill="transparent" />
      </g>
    );
  }
  if (n.type === 'OUTPUT') {
    return (
      <g className={cls} transform={tr} data-node={n.id} role="button" aria-pressed={selected} aria-label={t('aria.output', { label: n.label ?? '' })} {...kb}>
        {selected && <rect className="sel" x="-40" y="-40" width="80" height="92" rx="12" />}
        <rect className="fring" x="-40" y="-40" width="80" height="92" rx="12" />
        <circle className={`lamp${v}`} data-ng={n.id} r="24" />
        <LampDigit v={v} />
        <text className="nlabel" y="46">{n.label}</text>
        <circle r="30" fill="transparent" />
      </g>
    );
  }
  const bx = bubbleX(n.type);
  return (
    <g className={cls} transform={tr} data-node={n.id} role="button" aria-pressed={selected} aria-label={partName(t, n.type)} {...kb}>
      {selected && <rect className="sel" x="-48" y="-40" width="96" height="80" rx="10" />}
      <rect className="fring" x="-48" y="-40" width="96" height="80" rx="10" />
      <rect x="-50" y="-42" width="100" height="84" fill="transparent" />
      {inPorts({ ...n, x: 0, y: 0 }).map((p) => <path key={p.i} className={`stub s${portVal.get(`${n.id}:${p.i}`) ?? 0}`} d={`M-38,${p.y}H-28`} />)}
      <path className={`stub s${v}`} d="M20,0H36" />
      <g transform="scale(1.3)">
        <path className="body" data-ng={n.id} d={bodyPath(n.type)} />
        {bx !== undefined && <circle className="body" cx={bx} cy="0" r="4" />}
      </g>
      <text className="nlabel" y="4" x={n.type === 'NOT' ? -9 : -4}>{n.type === 'AND3' ? 'AND' : n.type}</text>
    </g>
  );
}
