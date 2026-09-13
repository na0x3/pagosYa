import { privacy } from './privacy';
export function sourceVisitorId(slug: string): string | undefined {
  if (!privacy.analyticsAllowed(slug)) return undefined;
  try {
    const key = `pagosya:source-visitor:${slug}`;
    const stored = localStorage.getItem(key);
    if (stored && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(stored)) return stored;
    const id = crypto.randomUUID(); localStorage.setItem(key, id); return id;
  } catch { return undefined; }
}
export function rememberSourceVisit(slug: string, token: string | null) {
  if (!privacy.analyticsAllowed(slug)) token = null;
  try {
    const key = `pagosya:source-visit:${slug}`;
    if (token && /^[\w-]{32}$/.test(token)) sessionStorage.setItem(key, JSON.stringify({ token, expires: Date.now() + 30 * 86400000 }));
    else sessionStorage.removeItem(key);
  } catch {}
}
export function sourceVisitToken(slug: string): string | undefined {
  if (!privacy.analyticsAllowed(slug)) return undefined;
  try {
    const saved = JSON.parse(sessionStorage.getItem(`pagosya:source-visit:${slug}`) || 'null');
    return saved?.expires > Date.now() && /^[\w-]{32}$/.test(saved.token) ? saved.token : undefined;
  } catch { return undefined; }
}
