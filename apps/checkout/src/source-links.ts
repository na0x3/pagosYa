/** Where a published design may send a shopper outside the store: only destinations the merchant
 * configured in their own dashboard settings, never an arbitrary URL written into generated code. */
type LinkStore = { links?: Array<{ url: string }>; leadCaptureUrl?: string | null; contactPhone?: string | null; contactEmail?: string | null };

const normalized = (value: string) => {
  const url = new URL(value);
  return `${url.protocol}//${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, '')}${url.search}`;
};
const digits = (value: string | null | undefined) => String(value || '').replace(/\D/g, '');

export function merchantDestination(href: string, store: LinkStore): { href: string; newTab: boolean } | null {
  let url: URL;
  try { url = new URL(href); } catch { return null; }
  const phone = digits(store.contactPhone);
  if (url.protocol === 'tel:') return phone && digits(url.pathname) === phone ? { href: `tel:+${phone}`, newTab: false } : null;
  if (url.protocol === 'mailto:') {
    const email = String(store.contactEmail || '').trim().toLowerCase();
    return email && decodeURIComponent(url.pathname).trim().toLowerCase() === email ? { href: `mailto:${email}`, newTab: false } : null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  const whatsapp = (url.host === 'wa.me' && digits(url.pathname) === phone) || (url.host === 'api.whatsapp.com' && url.pathname === '/send' && digits(url.searchParams.get('phone')) === phone);
  if (phone && whatsapp) return { href: url.href, newTab: true };
  const target = normalized(url.href);
  const configured = [...(store.links || []).map(link => link?.url), store.leadCaptureUrl].filter((value): value is string => typeof value === 'string' && value.length > 0);
  return configured.some(value => { try { return normalized(value) === target; } catch { return false; } }) ? { href: url.href, newTab: true } : null;
}
