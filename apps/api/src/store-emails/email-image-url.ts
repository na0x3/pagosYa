const UPLOAD_PATH = /^\/v1\/uploads\/[A-Za-z0-9._-]+$/;

/**
 * Gmail fetches every image itself, through its proxy, so an email can only carry an
 * absolute https address. Uploads are stored as `/v1/uploads/<file>`, relative to the API, and
 * resolve against `base`, which the caller chooses: a sent email only ever gets the https
 * PUBLIC_ASSET_BASE_URL (StoreEmailService.base); the dashboard preview gets the address the
 * merchant's browser reaches the API on. An absolute image must be https. Anything else is
 * dropped: a missing photo is better than a broken one.
 */
export function emailImageUrl(path: string | null | undefined, base: string | null): string | null {
  const value = (path ?? '').trim();
  if (!value) return null;
  if (UPLOAD_PATH.test(value) && !value.includes('..')) return base && /^https?:\/\//.test(base) ? `${base}${value}` : null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export const EMAIL_ICONS = ['lock', 'return', 'truck', 'store', 'chat', 'check', 'box', 'calendar', 'mail', 'whatsapp', 'phone', 'pin', 'star', 'instagram', 'tiktok', 'facebook', 'x', 'youtube'] as const;
export type EmailIcon = typeof EMAIL_ICONS[number];
export type IconTone = 'dark' | 'light';

/** Icons are PNGs on the API's public origin (Gmail strips SVG), resolved like uploads: see emailImageUrl. */
export function emailIconUrl(icon: EmailIcon, tone: IconTone, base: string | null): string | null {
  return base && /^https?:\/\//.test(base) ? `${base}/v1/email-assets/icons/${icon}-${tone}.png` : null;
}
