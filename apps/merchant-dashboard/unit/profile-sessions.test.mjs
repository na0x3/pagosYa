import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devicesLine, ownerName, profileNameFromEmail } from '../src/profile-sessions.mjs';

test('the owner is the last real name the account used, else the email', () => {
  assert.equal(ownerName({ profiles: [{ profileName: 'Seleccionar perfil' }, { profileName: 'Yapi QA' }] }, 'a@x.bo'), 'Yapi QA');
  assert.equal(ownerName({ sessions: [{ profileName: 'Propietario' }] }, 'maria.lopez@x.bo'), profileNameFromEmail('maria.lopez@x.bo'));
  assert.equal(ownerName(null, 'maria.lopez@x.bo'), 'Maria Lopez');
});

test('devices read as one quiet line', () => {
  assert.equal(devicesLine(1), 'Abierta solo en este dispositivo');
  assert.equal(devicesLine(3), 'Abierta en 3 dispositivos');
});

test('signing in never asks who is signing in', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/profile-sessions.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /showModal|Quién está ingresando/);
});
