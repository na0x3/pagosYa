import type { SourceImageUse } from './source-setup';

/** The same upload pattern the generator accepts for bundled images. */
const BUNDLABLE = /^\/v1\/uploads\/[a-f0-9-]+\.(png|jpe?g|webp)$/i;
const MAX_ASSETS = 24;

/** A store designed from scratch always carries its saved logo (spec 2026-10-10 part A); a local edit never adds it. */
export function withSavedLogo(input: { assetUrls: string[]; imageUses: SourceImageUse[]; logoUrl: string | null | undefined; fromScratch: boolean; owned: boolean }) {
  const { assetUrls, imageUses, logoUrl } = input;
  if (!input.fromScratch || !input.owned || !logoUrl || !BUNDLABLE.test(logoUrl)) return { assetUrls, imageUses };
  if (assetUrls.includes(logoUrl)) return { assetUrls, imageUses };
  if (assetUrls.length >= MAX_ASSETS) return { assetUrls, imageUses };
  return {
    assetUrls: [...assetUrls, logoUrl],
    imageUses: imageUses.some(use => use.url === logoUrl) ? imageUses : [...imageUses, { url: logoUrl, role: 'logo' as const, description: 'Logo de la tienda' }],
  };
}
