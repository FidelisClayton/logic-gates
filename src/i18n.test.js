import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DICTS, LOCALES, detectLocale, t } from './i18n.js';

test('all dictionaries have exactly the same keys', () => {
  const keys = Object.keys(DICTS.en).sort();
  for (const loc of Object.keys(LOCALES)) assert.deepEqual(Object.keys(DICTS[loc]).sort(), keys, loc);
});

test('placeholders match across locales', () => {
  const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const loc of Object.keys(LOCALES)) for (const k in DICTS.en) assert.equal(ph(DICTS[loc][k]), ph(DICTS.en[k]), `${loc} ${k}`);
});

test('detectLocale and t', () => {
  assert.equal(detectLocale(['pt-PT']), 'pt-BR');
  assert.equal(detectLocale(['it', 'de-AT']), 'de');
  assert.equal(detectLocale(['fr-CA']), 'fr');
  assert.equal(detectLocale(['it']), 'en');
  assert.equal(detectLocale(['es-MX']), 'es');
  assert.equal(detectLocale([]), 'en');
  assert.equal(t('de', 'aria.input', { label: 'A' }), 'Eingang A');
});

for (const [name, copy, confirmation] of [
  ['Lab $$ 1', 'Lab $$ 1 (copy)', 'Delete "Lab $$ 1"?'],
  ['A $& B', 'A $& B (copy)', 'Delete "A $& B"?'],
  ['A $` B', 'A $` B (copy)', 'Delete "A $` B"?'],
  ["A $' B", "A $' B (copy)", 'Delete "A $\' B"?'],
]) {
  test(`circuit names retain literal replacement characters: ${name}`, () => {
    assert.equal(t('en', 'cs.copyName', { name }), copy);
    assert.equal(t('en', 'cs.confirm', { name }), confirmation);
  });
}

test('interpolation keeps zero values and translation fallback', () => {
  assert.equal(t('en', 'cs.parts', { n: 0 }), 'Parts: 0');
  assert.equal(t('unknown', 'cs.copyName', { name: 'Circuit' }), 'Circuit (copy)');
  assert.equal(t('en', 'missing.key'), 'missing.key');
});
