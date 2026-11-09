import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeItems, readItems, save, upsertItem } from './storage.js';
import { GATES, decode, encode } from './logic.js';

const item = (id, name = id) => ({ id, circuit: { name, nodes: [], wires: [] } });

test('one malformed stored entry does not discard other circuits', () => {
  const good = item('valid');
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: { getItem: () => JSON.stringify([null, good, {}, { id: 'bad', circuit: null }, item('other')]) } });
  try { assert.deepEqual(readItems(), [good, item('other')]); }
  finally { if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete globalThis.localStorage; }
});

test('non-array and invalid JSON storage produce an empty library', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    for (const value of ['null', '{}', 'oops']) {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: { getItem: () => value } });
      assert.deepEqual(readItems(), []);
    }
  } finally { if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete globalThis.localStorage; }
});

test('stale tabs preserve independent additions and edits to other circuits', () => {
  const a = item('a'), b = item('b');
  const local = item('a', 'local edit'), remote = item('b', 'remote edit'), added = item('new');
  assert.deepEqual(mergeItems([a, b], [local, b], [a, remote, added]), [local, remote, added]);
  assert.deepEqual(mergeItems([a], [a, item('local')], [a, added]), [a, added, item('local')]);
});

test('remote deletions stay deleted and local deletions preserve remote additions', () => {
  const a = item('a'), b = item('b'), added = item('new');
  assert.deepEqual(mergeItems([a, b], [a, b, added], [a]), [a, added]);
  assert.deepEqual(mergeItems([a, b], [a], [a, b, added]), [a, added]);
});

test('own dirty edits win over a concurrent edit or deletion of the same circuit', () => {
  const a = item('a'), edited = item('a', 'edited');
  assert.deepEqual(mergeItems([a], [edited], []), [edited]);
  assert.deepEqual(mergeItems([a], [edited], [item('a', 'remote edit')]), [edited]);
});

test('explicit save restores the displayed circuit after a remote deletion and preserves other edits', () => {
  const a = item('a'), b = item('b'), renamed = item('b', 'renamed');
  const merged = mergeItems([a, b], [a, renamed], [b]);
  assert.deepEqual(merged, [renamed]);
  const local = upsertItem(merged, a.id, a.circuit);
  assert.deepEqual(mergeItems(merged, local, [item('b', 'new remote name')]), [item('b', 'new remote name'), a]);
  assert.deepEqual(merged, [renamed]);
});

test('upsert replaces a remotely edited circuit without changing other entries or the input array', () => {
  const displayed = item('a'), remote = item('a', 'remote edit'), b = item('b');
  const items = [remote, b];
  const updated = upsertItem(items, displayed.id, displayed.circuit);
  assert.deepEqual(updated, [displayed, b]);
  assert.equal(updated[1], b);
  assert.deepEqual(items, [remote, b]);
  assert.equal(upsertItem(updated, displayed.id, displayed.circuit), updated);
});

test('first-run example is retained when a new circuit is added before first save', () => {
  const example = item('example'), added = item('new');
  assert.deepEqual(mergeItems([], [example, added], []), [example, added]);
});

test('save reports success and storage failures without throwing', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    const writes = [];
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: { setItem: (...args) => writes.push(args) } });
    assert.equal(save('circuits', '[]'), true);
    assert.deepEqual(writes, [['logic-gates:circuits', '[]']]);
    globalThis.localStorage.setItem = () => { throw new Error('Storage unavailable'); };
    assert.equal(save('circuits', '[]'), false);
  } finally { if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete globalThis.localStorage; }
});

test('a large maximum-size DAG round-trips and survives storage merges', () => {
  const nodes = Array.from({ length: 500 }, (_, i) => ({ id: `n${i}`.padEnd(40, '_'), type: i === 499 ? 'OUTPUT' : i ? 'AND3' : 'INPUT', x: 2013.9499919999998, y: 2013.9499919999998, label: '\u0000'.repeat(40) }));
  const wires = [];
  for (let i = 1; i < nodes.length; i++) {
    for (let port = 0; port < Math.min(i, GATES[nodes[i].type].inputs); port++) wires.push({ id: `w${i}_${port}`.padEnd(40, '_'), from: nodes[i - port - 1].id, to: nodes[i].id, port });
  }
  const circuit = { name: '\u0000'.repeat(100), nodes, wires: wires.reverse() };
  assert.equal(wires.length, 1492);
  const encoded = encode(circuit);
  assert.ok(encoded.length > 200000);
  assert.deepEqual(decode(encoded), circuit);
  const large = { id: 'large', circuit }, other = item('other'), renamed = item('other', 'renamed');
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: { getItem: () => JSON.stringify([large, other]) } });
  try {
    const stored = readItems();
    assert.deepEqual(stored, [large, other]);
    assert.deepEqual(mergeItems([large, other], [large, renamed], stored), [large, renamed]);
  } finally { if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete globalThis.localStorage; }
});
