import type { AccountBridgeHandler, PasswordGuard } from '@pagosya/storefront-preview';
import { AccountError, accountApi } from './account-api';
import { clearSession, readSession, saveSession } from './account-session';

/** The published store's answer to the account pages the store draws (spec 2026-10-08-store-built-in-account-pages-design).
 * The session token stays on this origin under the existing key; the store only ever learns "signed in as <name>". */
export type AccountEmailToken = { kind: 'verificar' | 'restablecer'; token: string };

/** An emailed link carries its token in the fragment; it is taken out of the address bar at once and kept here. */
export function takeAccountEmailToken(loc: Location, hist: History): AccountEmailToken | null {
  const match = /^#(verificar|restablecer)=([A-Za-z0-9_-]{16,200})$/.exec(loc.hash);
  if (!match) return null;
  hist.replaceState(hist.state, '', loc.pathname + loc.search);
  return { kind: match[1] as AccountEmailToken['kind'], token: match[2] };
}

export function createAccountBridgeHandler(slug: string, options: { preview: boolean; emailToken: () => AccountEmailToken | null; download: (data: unknown) => void }): AccountBridgeHandler {
  const ok = (body: unknown) => ({ ok: true, body });
  let verification: Promise<boolean> | null = null;
  return async (action, body) => {
    // The owner's preview of a published store: forms behave, nothing is sent.
    if (options.preview) return ok(action === 'state' ? { signedIn: false } : { message: 'Vista previa · No se crean cuentas' });
    try {
      const token = readSession(slug);
      switch (action) {
        case 'state': {
          // A verification link is confirmed once, on the first state after it, and reported to the login view.
          const email = options.emailToken();
          if (email?.kind === 'verificar' && !verification) {
            verification = accountApi.verifyEmail(slug, email.token).then(() => true, () => false);
            return ok({ signedIn: false, verified: await verification });
          }
          if (!token) return ok({ signedIn: false });
          const me = await accountApi.me(slug, token);
          return ok({ signedIn: true, name: me.name });
        }
        case 'login': { const session = await accountApi.login(slug, body as { email: string; password: string }); saveSession(slug, session); return ok({ signedIn: true, name: session.customer.name }); }
        case 'register': return ok(await accountApi.register(slug, body as { name: string; email: string; password: string }));
        case 'forgot': return ok(await accountApi.forgotPassword(slug, String(body.email ?? '')));
        case 'verify': {
          const email = options.emailToken();
          if (email?.kind !== 'verificar') return { ok: false, body: { message: 'El enlace de verificación no es válido.' } };
          return ok(await accountApi.verifyEmail(slug, email.token));
        }
        case 'reset': {
          const email = options.emailToken();
          if (email?.kind !== 'restablecer') return { ok: false, body: { message: 'Pide un enlace nuevo desde «¿Olvidaste tu contraseña?».' } };
          return ok(await accountApi.resetPassword(slug, { token: email.token, password: String(body.password ?? '') }));
        }
        case 'logout': { if (token) await accountApi.logout(slug, token).catch(() => undefined); clearSession(slug); return ok({ signedIn: false }); }
      }
      if (!token) return { ok: false, body: { status: 401, message: 'Ingresa para ver tu cuenta.' } };
      switch (action) {
        case 'me': return ok(await accountApi.me(slug, token));
        case 'update-me': return ok(await accountApi.updateProfile(slug, token, { name: String(body.name ?? ''), phone: String(body.phone ?? '') }));
        case 'orders': return ok(await accountApi.orders(slug, token));
        case 'subscriptions': return ok(await accountApi.subscriptions(slug, token));
        case 'addresses': return ok(await accountApi.replaceAddresses(slug, token, (Array.isArray(body.addresses) ? body.addresses : []) as never));
        case 'export': { options.download(await accountApi.exportData(slug, token)); return ok({ message: 'Descargamos tus datos.' }); }
        case 'delete': { await accountApi.deleteAccount(slug, token, String(body.password ?? '')); clearSession(slug); return ok({ signedIn: false }); }
      }
      return { ok: false, body: { message: 'Solicitud no válida.' } };
    } catch (error) {
      if (error instanceof AccountError && error.status === 401) { clearSession(slug); return { ok: false, body: { status: 401, message: error.message } }; }
      return { ok: false, body: { message: error instanceof AccountError ? error.message : 'No pudimos conectar. Inténtalo de nuevo.' } };
    }
  };
}

/** Password guard (spec): a store message, other than an account request, that carries a password typed on the store's
 * account pages goes nowhere; a request still gets a neutral answer so the store keeps working. */
export function blockedStoreMessage(passwords: PasswordGuard, data: any): { blocked: false } | { blocked: true; reply?: Record<string, unknown> } {
  if (data?.type === 'pagosya:account-request' || !passwords.carries(data)) return { blocked: false };
  return data?.type === 'pagosya:hosted-request' && Number.isSafeInteger(data.id)
    ? { blocked: true, reply: { type: 'pagosya:hosted-response', id: data.id, result: { ok: false, body: { message: 'No se pudo enviar.' } } } }
    : { blocked: true };
}
