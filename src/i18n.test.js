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
