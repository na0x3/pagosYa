import { privacy } from './privacy';
/** Last explicit partner link wins for this store during this browser session. */
export function storePartnerCode(slug: string): string | undefined {
  if (!privacy.analyticsAllowed(slug)) return undefined;
  const key = `pagosya:partner:${slug}`;
  const incoming = new URLSearchParams(location.search).get('partner');
  const valid = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,40}$/.test(value);
  try {
    if (valid(incoming)) sessionStorage.setItem(key, incoming);
    const saved = sessionStorage.getItem(key);
    return valid(incoming) ? incoming : valid(saved) ? saved : undefined;
  } catch { return valid(incoming) ? incoming : undefined; }
}
