import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { slotifyFiles } from '../tools/slotify.mjs';

const { listTemplates, templateSourceFiles } = createRequire(import.meta.url)('../index.js');
const converted = listTemplates().filter(manifest => manifest.copy);

// Spec 2026-10-20 Plantillas fill §3: a converted template shows no text of its own outside its `copy` slots.
test('converted templates keep every visible text in copy slots', () => {
  assert.ok(converted.length >= 20, `only ${converted.length} templates converted`);
  for (const manifest of converted) {
    const files = templateSourceFiles(manifest.id).filter(file => /^components\/(home|Shell|product)\.tsx$/.test(file.path));
    assert.deepEqual(slotifyFiles(files).slots.map(slot => slot.default), [], `${manifest.id} still has literal text`);
    const keys = new Set(manifest.copy.map(slot => slot.key));
    for (const file of files) for (const [, key] of file.content.matchAll(/\bcopy\.([a-z]+_\d+)\b/g)) assert.ok(keys.has(key), `${manifest.id} uses copy.${key}, missing from template.json`);
  }
});

test('only converted templates are curated, and at least 20 are', () => {
  const curated = listTemplates().filter(manifest => manifest.curated);
  assert.ok(curated.length >= 20, `${curated.length} curated`);
  for (const manifest of curated) assert.ok(manifest.copy?.length, `${manifest.id} is curated but not converted`);
});
