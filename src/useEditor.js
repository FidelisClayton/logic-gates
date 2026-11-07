import { useReducer } from 'react';

const snap = (c) => JSON.stringify(c);
const MAX = 100;

// Restoring a snapshot keeps each input's current switch position: toggling is not an undo step.
function restore(json, current) {
  const c = JSON.parse(json);
  const vals = new Map(current.nodes.filter((n) => n.type === 'INPUT').map((n) => [n.id, n.value ?? 0]));
  return { ...c, nodes: c.nodes.map((n) => (vals.has(n.id) ? { ...n, value: vals.get(n.id) } : n)) };
}

export const initEditor = (id, circuit, persisted) => ({ id, circuit, persisted, past: [], future: [], sel: null });

function reducer(s, a) {
  switch (a.type) {
    case 'load':
      return initEditor(a.id, a.circuit, a.persisted);
    case 'edit': // a history step
      return { ...s, circuit: a.fn(s.circuit), past: [...s.past, snap(s.circuit)].slice(-MAX), future: [], persisted: true, sel: a.sel !== undefined ? a.sel : s.sel };
    case 'checkpoint': // start of a drag: one history step for the whole gesture
      return { ...s, past: [...s.past, snap(s.circuit)].slice(-MAX), future: [] };
    case 'set': // live change inside a gesture
      return { ...s, circuit: a.fn(s.circuit), persisted: true };
    case 'toggle':
      return { ...s, persisted: true, circuit: { ...s.circuit, nodes: s.circuit.nodes.map((n) => (n.id === a.id ? { ...n, value: n.value ? 0 : 1 } : n)) } };
    case 'rename':
      return { ...s, persisted: true, circuit: { ...s.circuit, name: a.name } };
    case 'persist':
      return { ...s, persisted: true };
    case 'select':
      return { ...s, sel: a.sel };
    case 'undo': {
      if (!s.past.length) return s;
      const prev = s.past[s.past.length - 1];
      return { ...s, circuit: restore(prev, s.circuit), past: s.past.slice(0, -1), future: [...s.future, snap(s.circuit)], persisted: true };
    }
    case 'redo': {
      if (!s.future.length) return s;
      const next = s.future[s.future.length - 1];
      return { ...s, circuit: restore(next, s.circuit), future: s.future.slice(0, -1), past: [...s.past, snap(s.circuit)], persisted: true };
    }
    default:
      return s;
  }
}

export const useEditor = (init) => useReducer(reducer, init);
