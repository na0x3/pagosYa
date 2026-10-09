import { ACCOUNT_PASSWORD_FIELDS, accountActionBody, type AccountAction } from '@pagosya/shared-types';

/** How a trusted parent answers the store's account requests (spec 2026-10-08-store-built-in-account-pages-design). */
export type AccountBridgeHandler = (action: AccountAction, body: Record<string, unknown>) => Promise<{ ok: boolean; body: unknown }>;
export type PasswordGuard = { remember(password: string): void; carries(payload: unknown): boolean };
const SECRET_KEYS = /token|secret/i;

/** Remembers the passwords the store page sent this visit and finds them hidden in its other messages: the store's code
 * can read what a shopper types but cannot reach the internet, so a review or an analytics event is its only way out. */
export function createPasswordGuard(): PasswordGuard {
  const needles = new Set<string>();
  const strings = (value: unknown, out: string[] = [], depth = 0): string[] => {
    if (depth > 6) return out;
    if (typeof value === 'string') out.push(value.toLowerCase());
    else if (Array.isArray(value)) value.forEach(item => strings(item, out, depth + 1));
    else if (value && typeof value === 'object') Object.values(value).forEach(item => strings(item, out, depth + 1));
    return out;
  };
  return {
    remember(password) {
      // Shorter strings cannot be a password (the API takes 8–128) and would match ordinary words.
      if (typeof password !== 'string' || password.length < 8) return;
      let encoded = '';
      try { encoded = btoa(unescape(encodeURIComponent(password))); } catch { /* keep the plain forms */ }
      for (const form of [password, [...password].reverse().join(''), encoded, encoded.replace(/=+$/, '')]) if (form.length >= 8) needles.add(form.toLowerCase());
    },
    carries(payload) {
      if (!needles.size) return false;
      return strings(payload).some(text => [...needles].some(needle => text.includes(needle)));
    },
  };
}

const strip = (value: unknown): unknown => Array.isArray(value) ? value.map(strip)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET_KEYS.test(key)).map(([key, item]) => [key, strip(item)])) : value;

/** The trusted side of the bridge, for one store frame. Replies never carry a token, whatever the handler returns. */
export function mountSourceAccountBridge(frame: HTMLIFrameElement, handler: AccountBridgeHandler, guard?: PasswordGuard): () => void {
  const receive = async (event: MessageEvent) => {
    if (event.source !== frame.contentWindow || event.origin !== 'null' || event.data?.type !== 'pagosya:account-request' || !Number.isSafeInteger(event.data.id)) return;
    const reply = (ok: boolean, body: unknown) => frame.contentWindow?.postMessage({ type: 'pagosya:account-response', id: event.data.id, ok, body: strip(body) }, '*');
    const action = event.data.action as AccountAction;
    const body = accountActionBody(action, event.data.body);
    if (!body) { reply(false, { message: 'Solicitud no válida.' }); return; }
    const field = ACCOUNT_PASSWORD_FIELDS[action];
    if (field && typeof body[field] === 'string') guard?.remember(body[field] as string);
    try { const result = await handler(action, body); reply(result.ok, result.body); }
    catch { reply(false, { message: 'No pudimos conectar. Inténtalo de nuevo.' }); }
  };
  window.addEventListener('message', receive);
  return () => window.removeEventListener('message', receive);
}
