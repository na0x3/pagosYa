import sharp from 'sharp';
import { kitPath } from '@pagosya/storefront-kit';
import { DEFAULT_IDENTITY, type StoreIdentity } from './store-identity';
import { typographicLogo, type LogoMode } from './typographic-logo';

export const FAVICON_SIZES = [32, 180, 192, 512] as const;
export const faviconSize = (raw: unknown) => { const size = Number(raw); return (FAVICON_SIZES as readonly number[]).includes(size) ? size : 32; };
const fontFile = (id: string) => kitPath('fonts', `${id}.ttf`);

/** The store's own font first, then the default font in the store's colours, then a blank square: drawing never throws. */
function drawn(name: string, identity: StoreIdentity, mode: LogoMode): string {
  const text = name.trim() || '?';
  try { return typographicLogo({ name: text, fontPath: fontFile(identity.fontId), ink: identity.ink, ground: identity.ground, mode, upper: identity.upper }); } catch { /* next */ }
  try { return typographicLogo({ name: text, fontPath: fontFile(DEFAULT_IDENTITY.fontId), ink: identity.ink, ground: identity.ground, mode }); } catch { /* next */ }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100" height="100" fill="${DEFAULT_IDENTITY.ground}"/></svg>`;
}
export const markSvg = (name: string, identity: StoreIdentity) => drawn(name, identity, 'mark');
export const wordmarkSvg = (name: string, identity: StoreIdentity) => drawn(name, identity, 'wordmark');

export async function faviconPng(input: { logo: Buffer | null; name: string; identity: StoreIdentity; size: number }): Promise<Buffer> {
  if (input.logo) {
    try {
      return await sharp(input.logo, { animated: false }).resize(input.size, input.size, { fit: 'contain', background: input.identity.ground }).flatten({ background: input.identity.ground }).png().toBuffer();
    } catch { /* a logo that will not decode falls through to the drawn mark */ }
  }
  return sharp(Buffer.from(markSvg(input.name, input.identity))).resize(input.size, input.size).png().toBuffer();
}
