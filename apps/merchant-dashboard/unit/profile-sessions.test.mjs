import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoProfileName, profileChoices, profileNameFromEmail } from '../src/profile-sessions.mjs';

test('profileChoices dedupes and skips placeholders', () => {
  const payload = { profiles: [{ profileName: 'Ana' }, { profileName: 'ana' }, { profileName: 'Seleccionar perfil' }, { profileName: '' }, { profileName: 'Luis' }] };
  assert.deepEqual(profileChoices(payload).map(c => c.profileName), ['Ana', 'Luis']);
  assert.deepEqual(profileChoices({ sessions: [{ profileName: 'Ana' }] }).map(c => c.profileName), ['Ana']);
});

test('one or no profile is chosen for the merchant; two or more ask', () => {
  assert.equal(autoProfileName([], 'maria.lopez@x.bo'), profileNameFromEmail('maria.lopez@x.bo'));
  assert.equal(autoProfileName([{ profileName: 'Propietario' }], 'a@x.bo'), 'Propietario');
  assert.equal(autoProfileName([{ profileName: 'Ana' }, { profileName: 'Luis' }], 'a@x.bo'), null);
});

test('the dialog is skipped only when the sessions list loaded', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/profile-sessions.mjs', import.meta.url), 'utf8');
  assert.match(src, /const automatic = loaded \? autoProfileName\(profileChoices\(payload\), emailEl\.value\) : null;/);
});
