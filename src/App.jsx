import { useEffect, useMemo, useRef, useState } from 'react';
import { decode, encode, exampleCircuit, nextLabel, replaceType } from './logic.js';
import { useI18n } from './I18n.jsx';
import { load, save } from './storage.js';
import { newId } from './ids.js';
import { autoLayout } from './layout.js';
import { cone, exprToCircuit } from './notation.js';
import { KEYS } from './parts.js';
import { initEditor, useEditor } from './useEditor.js';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import PartsRail from './components/PartsRail.jsx';
import Canvas from './components/Canvas.jsx';
import TruthTable from './components/TruthTable.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import MobileToolbar from './components/MobileToolbar.jsx';
import PartsSheet from './components/PartsSheet.jsx';
import { useTier } from './useMedia.js';

const WIDE = '(min-width:1280px)';
const blank = (name) => ({ name, nodes: [], wires: [] });

function readItems() {
  try {
    const raw = JSON.parse(load('circuits') ?? '[]');
    // decode() is the trust boundary: it drops anything malformed.
    return raw.map((i) => ({ id: String(i.id), circuit: decode(encode(i.circuit)) })).filter((i) => i.circuit);
  } catch { return []; }
}

function boot(t) {
  let items = readItems();
  const hash = location.hash.startsWith('#c=') ? location.hash.slice(3) : null;
  const shared = hash ? decode(hash) : null;
  const badLink = !!hash && !shared;
  if (shared) return { items, editor: initEditor(newId('c'), shared, false), badLink };
  if (!items.length) items = [{ id: newId('c'), circuit: { ...exampleCircuit(), name: t('cs.example') } }];
  const cur = items.find((i) => i.id === load('cur')) ?? items[0];
  return { items, editor: initEditor(cur.id, cur.circuit, true), badLink };
}

export default function App() {
  const { t } = useI18n();
  const [init] = useState(() => boot(t));
  const [editor, dispatch] = useEditor(init.editor);
  const [library, setLibrary] = useState(init.items);
  const [palette, setPalette] = useState(false);
  const [parts, setParts] = useState(false);
  const tier = useTier();
  // A stored choice wins; otherwise collapse the rail when the open circuits sidebar would squeeze the canvas.
  const [collapsed, setCollapsed] = useState(() => {
    const saved = load('rail');
    if (saved) return saved === '1';
    return matchMedia('(max-width:1199px)').matches || (matchMedia(WIDE).matches && load('sidebar') !== '0' && innerWidth < 1600);
  });
  const [wide, setWide] = useState(() => matchMedia(WIDE).matches);
  const [side, setSide] = useState(() => matchMedia(WIDE).matches && load('sidebar') !== '0'); // narrow screens start closed
  const [dark, setDark] = useState(() => (document.documentElement.dataset.theme ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')) === 'dark');
  const [toast, setToast] = useState(null);
  const [fit, setFit] = useState(0);
  const [ttw, setTtw] = useState(() => Number(load('tt-width')) || null); // null = automatic 280/320px
  const [copySignal, setCopySignal] = useState(0);
  const [hover, setHover] = useState(null); // node id hovered on the canvas or in the Notation tab
  const anim = useRef(0);
  const viewRef = useRef(null);
  const { circuit, sel, persisted, id } = editor;

  const notify = (msg, undo) => setToast({ msg, undo, k: Date.now() });
  useEffect(() => {
    if (!toast) return;
    const tm = setTimeout(() => setToast(null), toast.undo ? 6000 : 2400); // an Undo button needs time to be reached
    return () => clearTimeout(tm);
  }, [toast]);
  useEffect(() => { if (init.badLink) notify(t('toast.badLink')); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const mq = matchMedia('(max-width:1199px)');
    const on = (e) => setCollapsed(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  useEffect(() => {
    const mq = matchMedia(WIDE);
    const on = (e) => { setWide(e.matches); setSide(e.matches && load('sidebar') !== '0'); };
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // Autosave: mirror the open circuit into the library, then write the library after a short pause.
  useEffect(() => {
    if (!persisted) return;
    setLibrary((l) => {
      const at = l.findIndex((i) => i.id === id);
      if (at < 0) return [...l, { id, circuit }];
      if (l[at].circuit === circuit) return l;
      return l.map((i, k) => (k === at ? { id, circuit } : i));
    });
    if (location.hash.startsWith('#c=')) history.replaceState(null, '', location.pathname + location.search);
  }, [circuit, persisted, id]);
  useEffect(() => {
    const tm = setTimeout(() => {
      save('circuits', JSON.stringify(library));
      if (persisted) save('cur', id);
    }, 200);
    return () => clearTimeout(tm);
  }, [library, persisted, id]);

  const highlight = useMemo(() => (hover && circuit.nodes.some((n) => n.id === hover) ? cone(circuit, hover) : null), [circuit, hover]);
  const sealed = sel && (sel.kind === 'node' ? circuit.nodes.some((n) => n.id === sel.id) : circuit.wires.some((w) => w.id === sel.id)) ? sel : null;

  function addPart(type, at) {
    let p = at ?? viewRef.current.center();
    if (!at) while (circuit.nodes.some((n) => Math.hypot(n.x - p.x, n.y - p.y) < 12)) p = { x: p.x + 24, y: p.y + 24 };
    const nid = newId();
    dispatch({
      type: 'edit',
      sel: { kind: 'node', id: nid },
      fn: (c) => {
        const node = { id: nid, type, x: Math.round(p.x), y: Math.round(p.y) };
        if (type === 'INPUT' || type === 'OUTPUT') node.label = nextLabel(c, type);
        if (type === 'INPUT') node.value = 0;
        return { ...c, nodes: [...c.nodes, node] };
      },
    });
  }
  const dropPart = (type, cx, cy) => { const w = viewRef.current.toWorld(cx, cy); if (w) addPart(type, w); };

  function duplicate() {
    const src = sealed?.kind === 'node' && circuit.nodes.find((n) => n.id === sealed.id);
    if (!src) return;
    const nid = newId();
    dispatch({
      type: 'edit',
      sel: { kind: 'node', id: nid },
      fn: (c) => {
        const copy = { ...src, id: nid, x: src.x + 24, y: src.y + 24 };
        if (src.type === 'INPUT' || src.type === 'OUTPUT') copy.label = nextLabel(c, src.type);
        return { ...c, nodes: [...c.nodes, copy] };
      },
    });
  }
  // One undo step; the toast says how many wires the new type had no port for.
  function replace(type) {
    const node = sealed?.kind === 'node' && circuit.nodes.find((n) => n.id === sealed.id);
    if (!node) return;
    const next = replaceType(circuit, node.id, type);
    if (next === circuit) return;
    dispatch({ type: 'edit', fn: (c) => replaceType(c, node.id, type) });
    const n = circuit.wires.length - next.wires.length;
    if (n) notify(t(n === 1 ? 'toast.wireRemoved' : 'toast.wiresRemoved', { n }), () => dispatch({ type: 'undo' }));
  }
  function remove() {
    if (!sealed) return;
    dispatch({
      type: 'edit',
      sel: null,
      fn: (c) => (sealed.kind === 'wire'
        ? { ...c, wires: c.wires.filter((w) => w.id !== sealed.id) }
        : { ...c, nodes: c.nodes.filter((n) => n.id !== sealed.id), wires: c.wires.filter((w) => w.from !== sealed.id && w.to !== sealed.id) }),
    });
  }

  // One undo step; positions ease over 200ms (instantly under reduced motion), then the view refits.
  function autoFormat() {
    if (!circuit.nodes.length) return;
    const to = new Map(autoLayout(circuit).nodes.map((n) => [n.id, n]));
    const from = new Map(circuit.nodes.map((n) => [n.id, n]));
    const put = (k) => dispatch({ type: 'set', fn: (c) => ({ ...c, nodes: c.nodes.map((n) => { const a = from.get(n.id); const b = to.get(n.id); return a && b ? { ...n, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k } : n; }) }) });
    dispatch({ type: 'checkpoint' });
    const run = ++anim.current;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t0 = performance.now();
    const step = (now) => {
      if (run !== anim.current) return;
      const p = still ? 1 : Math.min((now - t0) / 200, 1);
      put(1 - (1 - p) ** 3);
      if (p < 1) requestAnimationFrame(step); else setFit((f) => f + 1);
    };
    requestAnimationFrame(step);
  }

  // One undo step; the view refits to the new circuit.
  function build(expr, mode) {
    dispatch({ type: 'edit', sel: null, fn: (c) => exprToCircuit(expr, c, { mode }) });
    setHover(null);
    setFit((f) => f + 1);
    notify(t('nt.built'), () => dispatch({ type: 'undo' }));
  }

  const open = (item, persistedFlag = true) => dispatch({ type: 'load', id: item.id, circuit: item.circuit, persisted: persistedFlag });
  const circuits = {
    onSwitch: (to) => { const it = library.find((i) => i.id === to); if (it) open(it); },
    onNew: () => {
      const taken = new Set([circuit.name, ...library.map((i) => i.circuit.name)]);
      const base = t('cs.untitled');
      let name = base;
      for (let n = 2; taken.has(name); n++) name = `${base} ${n}`;
      open({ id: newId('c'), circuit: blank(name) });
    },
    onRename: (which, name) => (which === id ? dispatch({ type: 'rename', name }) : setLibrary((l) => l.map((i) => (i.id === which ? { ...i, circuit: { ...i.circuit, name } } : i)))),
    onDelete: (which) => {
      const rest = library.filter((i) => i.id !== which);
      setLibrary(rest);
      if (which === id || !persisted) open(rest[0] ?? { id: newId('c'), circuit: blank(t('cs.untitled')) });
    },
  };
  const clear = () => {
    if (!circuit.nodes.length) return;
    dispatch({ type: 'edit', sel: null, fn: (c) => ({ ...c, nodes: [], wires: [] }) });
    notify(t('toast.cleared'), () => dispatch({ type: 'undo' }));
  };
  const copyOf = (which, name) => {
    const src = which === id ? circuit : library.find((i) => i.id === which)?.circuit;
    if (src) open({ id: newId('c'), circuit: { ...src, name } });
  };
  const copy = (name) => copyOf(id, name);
  const setTT = (w, keep = true) => { setTtw(w); if (keep) save('tt-width', w ?? ''); };
  const toggleSide = () => { save('sidebar', side ? '0' : '1'); setSide(!side); };
  const fitView = () => (viewRef.current?.fit ? viewRef.current.fit() : setFit((f) => f + 1));
  const closeOverlay = () => { if (!wide) setSide(false); };
  const items = [
    ...(persisted ? [] : [{ id, name: circuit.name, count: circuit.nodes.length, unsaved: true }]),
    ...library.map((i) => ({ id: i.id, name: i.id === id ? circuit.name : i.circuit.name, count: (i.id === id ? circuit : i.circuit).nodes.length })),
  ];

  const theme = () => {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    save('theme', next);
    setDark(!dark);
  };

  // Global keys read the latest handlers through a ref, so the listener is attached once.
  const latest = useRef(null);
  latest.current = { saved: t('status.saved'), palette, overlay: side && !wide, addPart, duplicate, remove, autoFormat };
  useEffect(() => {
    const onKey = (e) => {
      const L = latest.current;
      const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable || e.target.getAttribute?.('role') === 'textbox' || !!e.target.closest?.('[role=menu],[role=dialog],[role=alertdialog]'); // menus, popovers and dialogs own their keys
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'k') { e.preventDefault(); setPalette((o) => !o); return; }
      if (mod && k === 's') { e.preventDefault(); dispatch({ type: 'persist' }); notify(L.saved); return; }
      if (L.palette || typing) return;
      if (mod && k === 'z') { e.preventDefault(); dispatch({ type: e.shiftKey ? 'redo' : 'undo' }); return; }
      if (mod && k === 'd') { e.preventDefault(); L.duplicate(); return; }
      if (mod || e.altKey) return;
      if (e.shiftKey && k === 'f') L.autoFormat();
      else if (e.key === 'Escape') {
        dispatch({ type: 'select', sel: null });
        // a row menu open in the sidebar takes this Esc first
        if (L.overlay && !document.querySelector('[data-sidebar] [aria-expanded="true"]')) setSide(false);
      }
      else if (e.key === 'Delete' || e.key === 'Backspace') L.remove();
      else if (!e.repeat && KEYS[e.key.toUpperCase()]) L.addPart(KEYS[e.key.toUpperCase()], viewRef.current.pointer());
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [dispatch]);

  const shareUrl = `${location.origin}${location.pathname}${location.search}#c=${encode(circuit)}`;
  const docked = side && wide;
  const cols = docked
    ? (collapsed ? 'grid-cols-[240px_56px_minmax(0,1fr)_var(--tt,360px)] max-[1439px]:grid-cols-[240px_56px_minmax(0,1fr)_var(--tt,320px)]' : 'grid-cols-[240px_248px_minmax(0,1fr)_var(--tt,360px)] max-[1439px]:grid-cols-[240px_248px_minmax(0,1fr)_var(--tt,320px)]')
    : (collapsed ? 'grid-cols-[56px_minmax(0,1fr)_var(--tt,360px)] max-[1100px]:grid-cols-[56px_minmax(0,1fr)_var(--tt,320px)]' : 'grid-cols-[248px_minmax(0,1fr)_var(--tt,360px)] max-[1100px]:grid-cols-[248px_minmax(0,1fr)_var(--tt,320px)]');

  // Below 1024px the truth table is a bottom sheet whose peek row reserves --peek at the foot of <main>.
  const mainCls = tier === 'desk' ? cols : `overflow-hidden pb-[var(--peek)] ${tier === 'mid' ? 'grid-cols-[56px_minmax(0,1fr)]' : 'grid-cols-[minmax(0,1fr)]'}`;
  const toastBottom = tier === 'desk' ? '1.5rem' : `calc(var(--peek) + ${tier === 'phone' ? '5.25rem + env(safe-area-inset-bottom)' : '1rem + env(safe-area-inset-bottom)'})`;

  return (
    <div className={`grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[calc(48px+env(safe-area-inset-top))_minmax(0,1fr)_auto] ${tier === 'phone' ? '' : 'pb-[env(safe-area-inset-bottom)]'} pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]`}>
      <Header
        tier={tier}
        editor={editor}
        sidebar={side}
        onSidebar={toggleSide}
        canUndo={editor.past.length > 0}
        canRedo={editor.future.length > 0}
        canClear={circuit.nodes.length > 0}
        copySignal={copySignal}
        dark={dark}
        shareUrl={shareUrl}
        actions={{ undo: () => dispatch({ type: 'undo' }), redo: () => dispatch({ type: 'redo' }), theme, save: () => dispatch({ type: 'persist' }), clear, copy, circuits }}
      />
      <main className={`relative grid min-h-0 ${mainCls}`} style={ttw ? { '--tt': `${ttw}px` } : undefined}>
        {side && !wide && <div className="absolute inset-0 z-20 bg-scrim" onPointerDown={() => setSide(false)} />}
        {side && (
          <Sidebar
            items={items}
            current={id}
            overlay={!wide}
            onSwitch={(to) => { if (to !== id) circuits.onSwitch(to); closeOverlay(); }}
            onNew={() => { circuits.onNew(); closeOverlay(); }}
            onRename={circuits.onRename}
            onCopy={copyOf}
            onDelete={circuits.onDelete}
          />
        )}
        {tier !== 'phone' && <PartsRail collapsed={collapsed || tier === 'mid'} fixed={tier === 'mid'} onCollapse={() => { save('rail', collapsed ? '0' : '1'); setCollapsed(!collapsed); }} onAdd={(ty) => addPart(ty)} onDrop={dropPart} onSearch={() => setPalette(true)} />}
        <Canvas key="canvas" circuit={circuit} highlight={highlight} onHoverNode={setHover} sel={sealed} dispatch={dispatch} notify={notify} viewRef={viewRef} fitKey={`${id}:${fit}`} onDuplicate={duplicate} onDelete={remove} onReplace={replace} onFormat={autoFormat} />
        <TruthTable key={id} circuit={circuit} width={ttw} onWidth={setTT} sheet={tier !== 'desk'} phone={tier === 'phone'} hover={hover} onHover={setHover} onBuild={build} />
      </main>
      {tier === 'phone' && <MobileToolbar canUndo={editor.past.length > 0} canRedo={editor.future.length > 0} onUndo={() => dispatch({ type: 'undo' })} onRedo={() => dispatch({ type: 'redo' })} onAdd={() => setParts(true)} onFormat={autoFormat} onFit={fitView} />}
      {parts && tier === 'phone' && <PartsSheet onClose={() => setParts(false)} onPick={(ty) => { setParts(false); addPart(ty); }} />}
      {palette && <CommandPalette gate={sealed?.kind === 'node' ? circuit.nodes.find((n) => n.id === sealed.id)?.type : null} onReplace={(ty) => { setPalette(false); replace(ty); }} onClose={() => setPalette(false)} onAdd={(ty) => { addPart(ty); setPalette(false); }} onFormat={() => { setPalette(false); autoFormat(); }}
        onNew={() => { setPalette(false); circuits.onNew(); }} onClear={() => { setPalette(false); clear(); }} onCopy={() => { setPalette(false); setCopySignal((n) => n + 1); }} onSidebar={() => { setPalette(false); toggleSide(); }} />}
      {toast && <div key={toast.k} role="status" className="fixed left-1/2 z-40 -translate-x-1/2 rounded-lg bg-raised px-3 py-2 text-xs shadow-pop" style={{ bottom: toastBottom }}>{toast.msg}{toast.undo && <button className="relative ml-3 font-[550] text-sig after:absolute after:-inset-x-2 after:-inset-y-4 after:content-[''] hover:underline" onClick={() => { toast.undo(); setToast(null); }}>{t('undo')}</button>}</div>}
    </div>
  );
}
