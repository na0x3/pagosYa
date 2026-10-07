import type { PrismaService } from '../prisma/prisma.service';
import { readStoreLocations } from '../stores/store-locations';
import { storePolicies } from '../stores/store-presentation';
import type { EmailImage, EmailProduct } from './email-assemble';
import { emailImageUrl, type EmailIcon } from './email-image-url';

type PolicyKey = 'returns' | 'delivery' | 'privacy' | 'terms';

/** A store's real facts for an email. Every value comes from the platform; nothing here is written by the AI. */
export type EmailContext = {
  storeUrl: string | null;
  heroImage: EmailImage | null;
  nav: { label: string; href: string }[];
  socials: { icon: EmailIcon | null; label: string; href: string }[];
  address: string | null;
  policies: { key: PolicyKey; label: string; href: string }[];
  contact: { email: string | null; phone: string | null; whatsapp: boolean };
  delivers: boolean;
  review: { text: string; author: string; stars: number } | null;
  /** Codes that are active and marked "Mostrar en correos", newest first. */
  promos: { id: string; code: string; discount: string }[];
  /** 2–4 active products not in `exclude`, those with a photo first; fewer than 2 is no section, so []. */
  recommendations: (exclude: string[]) => EmailProduct[];
};

const HOSTS: [RegExp, EmailIcon][] = [
  [/(^|\.)instagram\.com$/, 'instagram'], [/(^|\.)tiktok\.com$/, 'tiktok'], [/(^|\.)(wa\.me|whatsapp\.com)$/, 'whatsapp'],
  [/(^|\.)(x|twitter)\.com$/, 'x'], [/(^|\.)facebook\.com$/, 'facebook'], [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
];

/** The network icon for a store link, or null for a host without one (it is then shown as text). */
export function socialIcon(url: string): EmailIcon | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return HOSTS.find(([re]) => re.test(host))?.[1] ?? null;
  } catch {
    return null;
  }
}

/** The promo card's discount, read from the code record: FIXED values are cents. */
export function promoDiscountLabel(type: 'PERCENT' | 'FIXED', value: number, currency: string): string {
  if (type === 'PERCENT') return `${value}% en tu próxima compra`;
  const units = value / 100;
  return `${currency === 'BOB' ? 'Bs' : currency} ${Number.isInteger(units) ? units : units.toFixed(2)} en tu próxima compra`;
}

const POLICY_LABELS: Record<PolicyKey, string> = { returns: 'Cambios y devoluciones', delivery: 'Envíos', privacy: 'Privacidad', terms: 'Términos' };
const RASTER = /\.(?:jpe?g|png|webp|gif)$/i;
const MAX_RECOMMENDATIONS = 4;
// Promo codes carry no currency of their own; stores sell in bolivianos.
const PROMO_CURRENCY = 'BOB';

/** The receipt's own amount format. */
const formatAmount = (amount: number, currency: string) => `${(amount / 100).toFixed(2)} ${currency}`;

const isHttps = (url: string) => { try { return new URL(url).protocol === 'https:'; } catch { return false; } };

/** The first raster photo on the published homepage, served from the public source-site asset route. */
function homepagePhoto(version: { digest: string; snapshot: unknown } | null, slug: string, revision: number, assetBase: string | null): string | null {
  if (!version || !assetBase?.startsWith('https://')) return null;
  const files = (version.snapshot as { files?: { path: string; content?: string }[] } | null)?.files ?? [];
  const index = files.find(f => f.path === 'index.html')?.content ?? '';
  for (const [, src] of index.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
    const path = src.replace(/^\.\//, '');
    if (!RASTER.test(path)) continue;
    if (!path.includes('..') && files.some(f => f.path === path)) {
      return `${assetBase}/v1/stores/public/${encodeURIComponent(slug)}/source-site/assets/${revision}-${version.digest.slice(0, 12)}/${path}`;
    }
    const absolute = emailImageUrl(src, assetBase);
    if (absolute) return absolute;
  }
  return null;
}

export async function loadEmailContext(prisma: PrismaService, storeId: string, opts: { assetBase: string | null; checkoutOrigin: string | null }): Promise<EmailContext> {
  const [store, links, collections, review, promos, products] = await Promise.all([
    prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true, slug: true, bannerUrl: true, contactEmail: true, contactPhone: true, checkoutMode: true, policies: true, locations: true,
        publishedSourceRevision: true, customDomains: { where: { status: 'ACTIVE' }, select: { hostname: true }, take: 1 } },
    }),
    prisma.storeLink.findMany({ where: { storeId }, orderBy: { sortOrder: 'asc' }, take: 6 }),
    prisma.collection.findMany({ where: { storeId }, orderBy: { sortOrder: 'asc' }, take: 3, select: { name: true, slug: true } }),
    prisma.storeReview.findFirst({ where: { storeId, status: 'PUBLISHED', rating: { gte: 4 } }, orderBy: { createdAt: 'desc' } }),
    prisma.promoCode.findMany({ where: { storeId, isActive: true, showInEmails: true }, orderBy: { createdAt: 'desc' } }),
    prisma.paymentLink.findMany({ where: { storeId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, name: true, amount: true, currency: true, imageUrls: true } }),
  ]);

  const domain = store?.customDomains?.[0]?.hostname;
  const origin = opts.checkoutOrigin?.replace(/\/$/, '');
  const storeUrl = !store ? null : domain ? `https://${domain}` : origin ? `${origin}/s/${encodeURIComponent(store.slug)}` : null;

  let heroSrc: string | null = null;
  if (store?.publishedSourceRevision) {
    const revision = store.publishedSourceRevision;
    const version = await prisma.storeSourceVersion.findUnique({ where: { storeId_revision: { storeId, revision } }, select: { snapshot: true, digest: true } });
    heroSrc = homepagePhoto(version, store.slug, revision, opts.assetBase);
  }
  heroSrc ??= emailImageUrl(store?.bannerUrl, opts.assetBase);

  const policies = storePolicies(store?.policies);
  const locations = readStoreLocations(store?.locations ?? []);
  const located = locations.find(l => l.address);
  const address = located?.address ? [located.address, located.city].filter(Boolean).join(', ') : null;

  // Without a store address there is nowhere for a recommendation to link, so there are none.
  const catalogue = storeUrl ? products.map(p => {
    const src = emailImageUrl(p.imageUrls[0], opts.assetBase);
    const product: EmailProduct = { name: p.name, price: formatAmount(p.amount, p.currency), href: `${storeUrl}/p/${encodeURIComponent(p.id)}`, image: src ? { src, alt: p.name } : null };
    return { id: p.id, product };
  }) : [];

  return {
    storeUrl,
    heroImage: heroSrc ? { src: heroSrc, alt: store?.name ?? '' } : null,
    nav: storeUrl ? collections.map(c => ({ label: c.name, href: `${storeUrl}/c/${encodeURIComponent(c.slug)}` })) : [],
    socials: links.filter(l => isHttps(l.url)).map(l => ({ icon: socialIcon(l.url), label: l.label, href: l.url })),
    address,
    policies: storeUrl ? (Object.keys(POLICY_LABELS) as PolicyKey[]).filter(key => policies[key]).map(key => ({ key, label: POLICY_LABELS[key], href: storeUrl })) : [],
    contact: { email: store?.contactEmail || null, phone: store?.contactPhone || null, whatsapp: store?.checkoutMode === 'whatsapp' && !!store.contactPhone },
    delivers: locations.some(l => l.deliveryEnabled) || !!policies.delivery,
    review: review ? { text: review.body, author: review.displayName.trim().split(/\s+/)[0], stars: review.rating } : null,
    promos: promos.map(p => ({ id: p.id, code: p.code, discount: promoDiscountLabel(p.discountType, p.discountValue, PROMO_CURRENCY) })),
    recommendations: (exclude: string[]) => {
      const left = catalogue.filter(c => !exclude.includes(c.id)).map(c => c.product);
      const picked = [...left.filter(p => p.image), ...left.filter(p => !p.image)].slice(0, MAX_RECOMMENDATIONS);
      return picked.length >= 2 ? picked : [];
    },
  };
}
