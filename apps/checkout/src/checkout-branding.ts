import { normalizeCheckoutBranding, type CheckoutBranding } from '@pagosya/shared-types';
import { assetUrl } from './api';
const loaded = new Map<string, { face: FontFace; source: string }>();

/** Only the payment surface inherits these tokens; the pagosYa printer is its sibling. */
export function applyCheckoutBranding(app: HTMLElement, value: CheckoutBranding | null | undefined) {
  document.body.classList.toggle('store-branded-checkout', !!value);
  if (!value) return null;
  const brand = normalizeCheckoutBranding(value, value.name);
  const stacks = { bodyFont: brand.bodyFont, headingFont: brand.headingFont };
  if (typeof FontFace !== 'undefined') for (const [index, descriptor] of brand.fonts.entries()) {
    const alias = `CheckoutStoreFont${index}`;
    const previous = loaded.get(alias);
    if (previous?.source !== descriptor.source) {
      if (previous) document.fonts.delete(previous.face);
      const face = new FontFace(alias, `url(${descriptor.source})`, { weight: descriptor.weight, style: descriptor.style, display: 'swap' });
      loaded.set(alias, { face, source: descriptor.source }); document.fonts.add(face); void face.load().catch(() => undefined);
    }
    for (const key of ['bodyFont', 'headingFont'] as const) stacks[key] = stacks[key].split(',').map(f => f.trim().replace(/^["']|["']$/g, '') === descriptor.family ? alias : f).join(',');
  }
  for (const key of ['background', 'surface', 'foreground', 'accent', 'accentForeground', 'radius', 'bodyFont', 'headingFont'] as const) {
    app.style.setProperty(`--checkout-${key.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}`, key in stacks ? stacks[key as keyof typeof stacks] : brand[key]);
  }
  app.style.colorScheme = parseInt(brand.background.slice(1, 3), 16) < 128 ? 'dark' : 'light';
  document.body.style.setProperty('--checkout-background', brand.background);
  document.title = `${brand.name} · Pago seguro`;
  return { ...brand, logoUrl: brand.logoUrl ? assetUrl(brand.logoUrl) : null };
}
