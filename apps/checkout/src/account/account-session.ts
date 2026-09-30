/** The shopper's session token for one store, kept only in this browser on the checkout origin. The store's own page
 * (a sandbox that also runs authored code) never sees it. */
const key = (slug: string) => `pagosya:customer:${slug}`;

export function readSession(slug: string): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(key(slug)) || "null");
    if (saved && typeof saved.token === "string" && typeof saved.expiresAt === "string" && new Date(saved.expiresAt).getTime() > Date.now()) return saved.token;
  } catch { /* Storage can be unavailable or hold something else: no session. */ }
  return null;
}

export function saveSession(slug: string, session: { token: string; expiresAt: string }) {
  try { localStorage.setItem(key(slug), JSON.stringify({ token: session.token, expiresAt: session.expiresAt })); } catch { /* The page still works for this visit. */ }
}

export function clearSession(slug: string) {
  try { localStorage.removeItem(key(slug)); } catch { /* Nothing to clear. */ }
}
