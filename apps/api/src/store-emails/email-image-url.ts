const UPLOAD_PATH = /^\/v1\/uploads\/[A-Za-z0-9._-]+$/;

/**
 * Gmail fetches every image itself, through its proxy, so an email can only carry an
 * absolute https address. Uploads are stored as `/v1/uploads/<file>`, relative to the API;
 * `base` is the API's public origin (PUBLIC_ASSET_BASE_URL). Anything that does not end
 * up https is dropped: a missing photo is better than a broken one.
 */
export function emailImageUrl(path: string | null | undefined, base: string | null): string | null {
  const value = (path ?? '').trim();
  if (!value) return null;
  if (UPLOAD_PATH.test(value) && !value.includes('..')) return base && base.startsWith('https://') ? `${base}${value}` : null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
