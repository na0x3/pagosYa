/** Tokens stay on the trusted checkout origin, never in authored storefront code. */
const key = (slug: string) => `pagosya:customer:${slug}`;
type Session = { token: string; expiresAt: string };
// Some browsers block storage in an embedded account. Keep that visit usable without persisting elsewhere.
const fallback = new Map<string, Session | null>();
function remember(slug: string, value: Session | null) {
  fallback.delete(slug);
  fallback.set(slug, value);
  if (fallback.size > 64) fallback.delete(fallback.keys().next().value!);
}

export function readSession(slug: string): string | null {
  let saved: Session | null = fallback.get(slug) ?? null;
  if (!fallback.has(slug)) {
    try { saved = JSON.parse(localStorage.getItem(key(slug)) || 'null'); }
    catch { return null; }
  }
  if (saved && typeof saved.token === 'string' && typeof saved.expiresAt === 'string' && new Date(saved.expiresAt).getTime() > Date.now()) return saved.token;
  clearSession(slug);
  return null;
}

export function saveSession(slug: string, session: Session) {
  const value = { token: session.token, expiresAt: session.expiresAt };
  try { localStorage.setItem(key(slug), JSON.stringify(value)); fallback.delete(slug); }
  catch { remember(slug, value); }
}

export function clearSession(slug: string) {
  try { localStorage.removeItem(key(slug)); fallback.delete(slug); }
  catch { remember(slug, null); }
}
