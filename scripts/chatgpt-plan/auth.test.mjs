import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { callbackRegistration, verifyIdentity, applyTokens } from './auth.mjs';

test('callback requires matching unexpired state, an issued client, and a code', () => {
  const pending = { state: 'expected', expiresAt: Date.now() + 10000 };
  const url = new URL('http://127.0.0.1/auth/callback?state=expected&client_id=oaiapp_test&code=test');
  assert.deepEqual(callbackRegistration(url, pending), { clientId: 'oaiapp_test', code: 'test' });
  assert.throws(() => callbackRegistration(url, { ...pending, state: 'wrong' }));
  assert.throws(() => callbackRegistration(url, { ...pending, expiresAt: 0 }));
  assert.throws(() => callbackRegistration(url, { ...pending, clientId: 'other-account' }));
  url.searchParams.set('error', 'access_denied');
  assert.throws(() => callbackRegistration(url, pending));
  url.searchParams.delete('error'); url.searchParams.delete('client_id');
  assert.throws(() => callbackRegistration(url, pending));
  assert.equal(callbackRegistration(url, { ...pending, clientId: 'saved-client' }).clientId, 'saved-client');
});

test('validates signature, issuer, audience, expiry and nonce before accepting identity', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const token = await new SignJWT({ nonce: 'nonce' }).setProtectedHeader({ alg: 'RS256' })
    .setIssuer('https://auth.openai.com').setAudience('client').setSubject('user').setIssuedAt().setExpirationTime('5m').sign(privateKey);
  assert.equal((await verifyIdentity(token, 'client', 'nonce', publicKey)).sub, 'user');
  await assert.rejects(verifyIdentity(token, 'different-client', 'nonce', publicKey));
  await assert.rejects(verifyIdentity(token, 'client', 'wrong-nonce', publicKey));
  await assert.rejects(verifyIdentity(token, 'client', 'nonce', (await generateKeyPair('RS256')).publicKey));
  for (const claims of [{ iss: 'https://wrong.test' }, { exp: 1 }]) {
    const invalid = await new SignJWT({ iss: 'https://auth.openai.com', aud: 'client', sub: 'user', nonce: 'nonce', iat: 1, exp: Math.floor(Date.now() / 1000) + 100, ...claims }).setProtectedHeader({ alg: 'RS256' }).sign(privateKey);
    await assert.rejects(verifyIdentity(invalid, 'client', 'nonce', publicKey));
  }
});

test('identity-only consent cannot enable inference and refresh rotates the whole token set', () => {
  const tokens = { access_token: 'access', refresh_token: 'refresh', token_type: 'Bearer', expires_in: 3600, scope: 'openid' };
  assert.throws(() => applyTokens({}, tokens));
  const first = applyTokens({}, { ...tokens, scope: 'resource.invoke chatgpt.tokens.use.direct' });
  const next = applyTokens(first, { access_token: 'new-access', refresh_token: 'new-refresh', token_type: 'Bearer', expires_in: 3600 });
  assert.equal(next.access_token, 'new-access'); assert.equal(next.refresh_token, 'new-refresh');
  assert.deepEqual(next.scopes, first.scopes);
  assert.throws(() => applyTokens(first, { ...tokens, expires_in: -1 }));
});
