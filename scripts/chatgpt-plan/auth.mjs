import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, chmod, open, unlink } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export const storage = fileURLToPath(new URL('../../.yapi-chatgpt/', import.meta.url));
const issuer = 'https://auth.openai.com';
const tokenEndpoint = `${issuer}/api/accounts/oauth/token`;
const resource = 'https://api.openai.com/v1';
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
const random = () => randomBytes(32).toString('base64url');

export async function readState() {
  try { return JSON.parse(await readFile(`${storage}account.json`, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}

export async function saveState(state) {
  await mkdir(storage, { recursive: true, mode: 0o700 });
  await chmod(storage, 0o700);
  const temporary = `${storage}account-${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx' });
  await rename(temporary, `${storage}account.json`);
}

// One CLI/gateway owns the rotating refresh token for its entire lifetime.
export async function lockAccount() {
  await mkdir(storage, { recursive: true, mode: 0o700 });
  const path = `${storage}runtime.lock`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const file = await open(path, 'wx', 0o600);
      await file.writeFile(String(process.pid));
      await file.close();
      return () => unlink(path).catch(() => {});
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const pid = Number(await readFile(path, 'utf8'));
      try { if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('invalid lock'); process.kill(pid, 0); }
      catch (probe) {
        if (probe.code === 'ESRCH') { await unlink(path); continue; }
      }
      throw new Error('Another Yapi ChatGPT command is running. Stop it before signing in or switching modes.');
    }
  }
  throw new Error('Could not lock the ChatGPT account.');
}

export class ChatGPTAuthorizationError extends Error {
  constructor(httpStatus) {
    super(httpStatus >= 500 ? `ChatGPT authorization is temporarily unavailable (${httpStatus}). Your saved session was preserved.` : `ChatGPT authorization was rejected (${httpStatus}). Reconnect with pnpm chatgpt:login.`);
    this.httpStatus = httpStatus;
  }
}
async function exchange(fields) {
  const response = await fetch(tokenEndpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...fields, resource }), signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new ChatGPTAuthorizationError(response.status);
  return response.json();
}

export async function verifyIdentity(token, clientId, nonce, keys = jwks) {
  const { payload } = await jwtVerify(token, keys, {
    issuer, audience: clientId, requiredClaims: ['sub', 'exp', 'iat'],
    algorithms: ['RS256', 'ES256'], clockTolerance: 5,
  });
  if (!payload.sub || payload.nonce !== nonce) throw new Error('ChatGPT identity could not be verified.');
  return payload;
}

export function applyTokens(state, tokens) {
  const scopes = typeof tokens.scope === 'string' ? tokens.scope.split(' ') : state.scopes ?? [];
  if (!scopes.includes('chatgpt.tokens.use.direct') || !scopes.includes('resource.invoke')) {
    throw new Error('ChatGPT plan usage was not authorized. Sign in again and enable plan usage for Yapi.');
  }
  if (typeof tokens.access_token !== 'string' || !tokens.access_token ||
      String(tokens.token_type).toLowerCase() !== 'bearer' || !(Number(tokens.expires_in) > 0)) {
    throw new Error('ChatGPT returned an invalid token response.');
  }
  return { ...state, access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? state.refresh_token,
    id_token: tokens.id_token ?? state.id_token, scopes,
    expires_at: Date.now() + Number(tokens.expires_in) * 1000 };
}

export function callbackRegistration(url, pending) {
  if (url.searchParams.get('state') !== pending.state || Date.now() >= pending.expiresAt) throw new Error('Invalid sign-in state.');
  if (url.searchParams.has('error')) throw new Error('ChatGPT sign-in was cancelled or denied.');
  const clientId = url.searchParams.get('client_id') || pending.clientId;
  if (!clientId || clientId === 'dynamic_agent_client' || (pending.clientId && clientId !== pending.clientId)) throw new Error('Invalid ChatGPT client registration.');
  const code = url.searchParams.get('code');
  if (!code) throw new Error('Missing authorization code.');
  return { clientId, code };
}

export async function signIn() {
  let saved = await readState();
  saved.ext_agent_host_id ??= `urn:uuid:${randomUUID()}`;
  await saveState(saved);
  const pending = { state: random(), nonce: random(), verifier: random(),
    clientId: saved.client_id, expiresAt: Date.now() + 10 * 60_000 };
  let consumed = false;
  let resolveDone, rejectDone;
  const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const origin = `http://127.0.0.1:${server.address().port}`;
    const url = new URL(req.url, origin);
    if (req.headers.host !== new URL(origin).host || req.method !== 'GET') { res.writeHead(403).end(); return; }
    if (url.pathname === `/continue/${pending.state}` && !consumed) {
      const authorize = new URL(`${issuer}/api/accounts/authorize`);
      authorize.search = new URLSearchParams({
        client_id: saved.client_id || 'dynamic_agent_client',
        ...(saved.client_id ? {} : { agent_name_hint: 'Yapi Local' }),
        ext_agent_host_id: saved.ext_agent_host_id,
        ...(saved.id_token ? { id_token_hint: saved.id_token } : {}),
        response_type: 'code', redirect_uri: `${origin}/auth/callback`,
        scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
        resource, state: pending.state, nonce: pending.nonce,
        code_challenge_method: 'S256', code_challenge: createHash('sha256').update(pending.verifier).digest('base64url'),
      }).toString();
      res.writeHead(302, { Location: authorize.toString() }).end(); return;
    }
    if (url.pathname !== '/auth/callback' || consumed) { res.writeHead(404).end(); return; }
    // A stray request must not consume a real pending browser sign-in.
    if (url.searchParams.get('state') !== pending.state) { res.writeHead(400).end('Invalid sign-in state.'); return; }
    consumed = true;
    try {
      const { clientId, code } = callbackRegistration(url, pending);
      // Preserve an issued registration even when the one-time code exchange fails.
      await saveState({ ...saved, client_id: clientId });
      const tokens = await exchange({ grant_type: 'authorization_code', client_id: clientId,
        code, code_verifier: pending.verifier, redirect_uri: `${origin}/auth/callback` });
      const identity = await verifyIdentity(tokens.id_token, clientId, pending.nonce);
      if (saved.subject && (identity.sub !== saved.subject || identity.iss !== saved.issuer)) throw new Error('The selected ChatGPT account changed.');
      saved = applyTokens({ ...saved, client_id: clientId, subject: identity.sub, issuer: identity.iss, email: identity.email }, tokens);
      await saveState(saved);
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('ChatGPT connected to Yapi Local. You can close this tab.');
      resolveDone(saved);
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Sign-in could not be completed. Check the Yapi terminal and try again.');
      rejectDone(error);
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  console.log(`Continue with ChatGPT: http://127.0.0.1:${server.address().port}/continue/${pending.state}`);
  console.log('In ChatGPT, enable plan usage for Yapi Local. Leave credit spending disabled if you want only your included allowance.');
  const timer = setTimeout(() => rejectDone(new Error('Sign-in timed out. Run pnpm chatgpt:login again.')), 10 * 60_000);
  try { return await done; }
  finally { clearTimeout(timer); server.closeAllConnections(); server.close(); }
}

export function createSession() {
  let refreshing;
  return { async token() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      let state = await readState();
      if (!state.access_token || !state.client_id) throw new Error('Connect your account first: pnpm chatgpt:login');
      if (state.expires_at < Date.now() + 60_000) {
        if (!state.refresh_token) throw new Error('ChatGPT session expired. Run pnpm chatgpt:login.');
        state = applyTokens(state, await exchange({ grant_type: 'refresh_token', client_id: state.client_id, refresh_token: state.refresh_token }));
        await saveState(state);
      }
      return state.access_token;
    })();
    try { return await refreshing; } finally { refreshing = undefined; }
  } };
}

export async function signOut() {
  const state = await readState();
  let revoked = !state.refresh_token;
  try {
    if (state.refresh_token) {
      const discovery = await fetch(`${issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(15_000) });
      const endpoint = new URL((await discovery.json()).revocation_endpoint);
      if (endpoint.origin !== issuer) throw new Error('Unexpected revocation endpoint.');
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: state.refresh_token, token_type_hint: 'refresh_token', client_id: state.client_id }), signal: AbortSignal.timeout(15_000) });
      revoked = response.status === 200;
    }
  } catch { /* Local sign-out still clears credentials. */ }
  const { access_token, refresh_token, id_token, expires_at, scopes, ...registration } = state;
  await saveState(registration);
  console.log(revoked ? 'Signed out of Yapi Local.' : 'Signed out locally. Remote revocation was not confirmed; disconnect Yapi Local in ChatGPT Settings.');
}
