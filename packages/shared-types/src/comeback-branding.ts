import { normalizeCheckoutBranding, sourceCheckoutBranding } from './checkout-branding';

type CardStore = Parameters<typeof sourceCheckoutBranding>[0] & {
  tagline?: string | null;
  brandProfile?: { data?: unknown } | null;
};

/** Use the site's identity color as the card stock, with readable ink on top. */
export function sourceComebackBranding(store: CardStore, snapshot?: Parameters<typeof sourceCheckoutBranding>[1]) {
  const confirmed = (store.brandProfile?.data as { confirmed?: { field: string; value: unknown }[] } | undefined)?.confirmed;
  const facts = Object.fromEntries(Array.isArray(confirmed) ? confirmed.map(f => [f.field, f.value]) : []);
  const validColor = (value: unknown): value is string => typeof value === 'string' && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value);
  // Comeback belongs to the storefront, even if checkout has a quieter palette.
  const site = snapshot?.files?.some(f => f.path === 'index.html')
    ? { files: snapshot.files.filter(f => f.path !== 'checkout.html') } : snapshot;
  const identity = sourceCheckoutBranding({ ...store,
    accentColor: [facts.accent, store.accentColor].find(validColor),
    backgroundColor: [facts.background, facts.surface, store.backgroundColor].find(validColor),
  }, site);
  const hasSiteStyle = site?.files?.some(f => f.path.endsWith('.css') || /<style\b/i.test(f.content));
  const paper = hasSiteStyle ? identity.accent
    : [facts.accent, store.accentColor, facts.background, store.backgroundColor, facts.surface].find(validColor) || identity.accent;
  const card = normalizeCheckoutBranding({ ...identity, background: paper, surface: paper, foreground: identity.accentForeground }, store.name);
  const description = `${store.name} ${store.tagline || ''}`;
  return { name: card.name, logoUrl: card.logoUrl, background: card.background, foreground: card.foreground,
    bodyFont: card.bodyFont, headingFont: card.headingFont, fonts: card.fonts, radius: card.radius, fontStyle: store.fontStyle,
    stamp: /caf[eé]|coffee|roast|espresso|capuch|cappucc/i.test(description) ? 'coffee'
      : /panader|bakery|bread|\bpan\b/i.test(description) ? 'bread' : 'brand' };
}
