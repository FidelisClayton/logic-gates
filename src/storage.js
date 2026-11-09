import { decode, encode } from './logic.js';

// localStorage can throw (private mode, blocked data), so every access is wrapped.
const P = 'logic-gates:';
export function load(key) {
  try { return localStorage.getItem(P + key); } catch { return null; }
}
export function save(key, value) {
  try { localStorage.setItem(P + key, value); return true; } catch { return false; }
}

export function readItems() {
  let raw;
  try { raw = JSON.parse(load('circuits') ?? '[]'); } catch { return []; }
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    try {
      if (!item || typeof item.id !== 'string' || !item.id) return [];
      const circuit = decode(encode(item.circuit));
      return circuit ? [{ id: item.id, circuit }] : [];
    } catch { return []; }
  });
}

export function upsertItem(items, id, circuit) {
  const at = items.findIndex((item) => item.id === id);
  if (at < 0) return [...items, { id, circuit }];
  if (items[at].circuit === circuit) return items;
  return items.map((item, index) => (index === at ? { id, circuit } : item));
}

// Apply only local changes since the last save to the latest stored library.
// shortcut: simultaneous edits of the same circuit use the last save, upgrade if collaborative editing is needed.
export function mergeItems(baseline, local, remote) {
  const before = new Map(baseline.map((item) => [item.id, item]));
  const current = new Map(local.map((item) => [item.id, item]));
  const merged = new Map(remote.map((item) => [item.id, item]));
  for (const id of before.keys()) if (!current.has(id)) merged.delete(id);
  for (const item of local) {
    if (JSON.stringify(item) !== JSON.stringify(before.get(item.id))) merged.set(item.id, item);
  }
  return [...merged.values()];
}
