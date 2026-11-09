import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circuitName, initEditor, interruptibleDispatch, reducer } from './useEditor.js';
import { decode, encode } from './logic.js';

test('copy names are bounded so they survive storage decoding', () => {
  const name = circuitName(`${'a'.repeat(100)} (copy)`);
  assert.equal(name.length, 100);
  assert.equal(decode(encode({ name, nodes: [], wires: [] })).name, name);
});

test('Undo before the first format frame cancels the format and consumes its single history step', () => {
  const circuit = { name: 'a', nodes: [{ id: 'n', type: 'INPUT', value: 0, x: 10, y: 20 }], wires: [] };
  let state = initEditor('a', circuit, true);
  const raw = (a) => { state = reducer(state, a); };
  const animation = { current: 0 };
  const dispatch = interruptibleDispatch(raw, animation);
  raw({ type: 'checkpoint' });
  const run = ++animation.current;
  dispatch({ type: 'undo' });
  if (run === animation.current) raw({ type: 'set', fn: (c) => ({ ...c, nodes: [] }) });
  assert.deepEqual(state.circuit, circuit);
  assert.equal(state.past.length, 0);
  assert.equal(state.future.length, 1);
});

test('all conflicting public actions cancel format while selection and Save leave it running', () => {
  const animation = { current: 0 };
  const actions = [];
  const dispatch = interruptibleDispatch((a) => actions.push(a), animation);
  for (const type of ['undo', 'redo', 'load', 'edit', 'checkpoint', 'set', 'toggle', 'rename']) {
    const before = animation.current;
    dispatch({ type });
    assert.equal(animation.current, before + 1, type);
  }
  const before = animation.current;
  dispatch({ type: 'select' });
  dispatch({ type: 'persist' });
  assert.equal(animation.current, before);
  assert.equal(actions.length, 10);
});

test('conflicting public actions dismiss an old Undo toast before dispatch, while selection and Save preserve it', () => {
  let toast = 'Clear A';
  const events = [];
  const dispatch = interruptibleDispatch((action) => events.push([action.type, toast]), { current: 0 }, () => { toast = null; });
  dispatch({ type: 'select' });
  dispatch({ type: 'persist' });
  assert.equal(toast, 'Clear A');
  for (const type of ['load', 'edit', 'checkpoint', 'set', 'undo', 'redo', 'rename', 'toggle']) {
    toast = 'Old Undo';
    dispatch({ type });
    assert.equal(toast, null, type);
    assert.deepEqual(events.at(-1), [type, null]);
  }
  // An edit can publish its own toast after dispatch without clearing that new toast.
  toast = 'Build circuit';
  dispatch({ type: 'select' });
  assert.equal(toast, 'Build circuit');
});

test('renaming after an edit survives Undo and Redo while the graph changes', () => {
  const original = { name: 'Original', nodes: [], wires: [] };
  const node = { id: 'n', type: 'INPUT', value: 0, x: 10, y: 20 };
  let state = initEditor('a', original, true);
  state = reducer(state, { type: 'edit', fn: (c) => ({ ...c, nodes: [node] }) });
  state = reducer(state, { type: 'rename', name: 'Renamed' });
  state = reducer(state, { type: 'undo' });
  assert.deepEqual(state.circuit, { ...original, name: 'Renamed' });
  state = reducer(state, { type: 'redo' });
  assert.deepEqual(state.circuit, { name: 'Renamed', nodes: [node], wires: [] });
});

test('renaming after Undo survives Redo without discarding its graph snapshot', () => {
  const original = { name: 'Original', nodes: [], wires: [] };
  const node = { id: 'n', type: 'INPUT', value: 0, x: 10, y: 20 };
  let state = initEditor('a', original, true);
  state = reducer(state, { type: 'edit', fn: (c) => ({ ...c, nodes: [node] }) });
  state = reducer(state, { type: 'undo' });
  state = reducer(state, { type: 'rename', name: 'Renamed after Undo' });
  state = reducer(state, { type: 'redo' });
  assert.deepEqual(state.circuit, { name: 'Renamed after Undo', nodes: [node], wires: [] });
});

test('structural and history actions cancel a pointer gesture before dispatch; live gesture actions keep it', () => {
  let active = true;
  const events = [];
  const dispatch = interruptibleDispatch((action) => events.push([action.type, active]), { current: 0 }, undefined, () => { active = false; });
  for (const type of ['undo', 'redo', 'load', 'edit', 'checkpoint', 'set', 'select', 'persist', 'toggle', 'rename']) {
    active = true;
    dispatch({ type });
    assert.deepEqual(events.at(-1), [type, !['undo', 'redo', 'load', 'edit'].includes(type)], type);
  }
});
