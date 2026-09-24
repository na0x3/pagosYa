import { storePolicies } from '../stores/store-presentation';
import type { PrismaService } from '../prisma/prisma.service';
import { isPublicStore } from '../stores/active-store';

/**
 * Store Brain: one bounded, factual snapshot of the whole business that YAPI reads before it answers,
 * designs or edits. Everything here comes from the database; nothing is inferred. Private data
 * (customer identities, NIT, credentials, payout accounts) never enters it.
 */
export type KnowledgeProduct = {
  id: string; name: string; price: string; description?: string; category?: string; collections?: string[];
  stock: number | 'sin límite'; options?: string[]; variants?: number; photos: number; tags?: string[]; discountPercent?: number;
  sold30d: number; reviews?: { count: number; average: number };
};
export type StoreKnowledge = {
  version: 1;
  generatedAt: string;
  identity: { name: string; tagline?: string; about?: string; announcement?: string; checkout: string; logo: boolean };
  trust: { verifiedBusiness: boolean; electronicInvoicing: boolean; liveStore: boolean; publishedDesign: boolean; reviews: { count: number; average: number } };
  contact: { phone: boolean; email: boolean; contactForm: boolean };
  policies: { returns: boolean; delivery: boolean; privacy: boolean; terms: boolean };
  fulfillment: { delivery: boolean; pickup: boolean; locations: Array<{ name: string; address?: string; pickup: boolean; delivery: boolean; hours?: string }> };
  catalog: { productCount: number; categories: string[]; collections: Array<{ name: string; products: number }>; products: KnowledgeProduct[]; truncated: boolean };
  performance30d: { visits: number; productViews: number; addedToCart: number; checkoutsStarted: number; paidOrders: number; revenue: string; conversionPercent: number | null };
  gaps: string[];
};

type RawProduct = {
  id: string; name: string; description: string | null; amount: number; currency: string; stock: number | null; imageUrls: string[]; tags: string[];
  variants: unknown; discountPercent: number | null; discountStartsAt: Date | null; discountEndsAt: Date | null; createdAt: Date;
  category: { name: string } | null; collectionProducts: Array<{ collection: { name: string } }>;
};
export type StoreKnowledgeInput = {
  store: {
    name: string; tagline: string | null; aboutText: string | null; announcement: string | null; checkoutMode: string; logoUrl: string | null; contactPhone: string | null; contactEmail: string | null;
    contactFormEnabled: boolean; shippingEnabled: boolean; shippingPickupEnabled: boolean; locations: unknown; status: string; sourcePublicationPaused: boolean;
    publicVisibility: boolean; publishedSourceRevision: number | null; websitePublishedRevision: number; merchant: { status: string };
    policies?: unknown;
  };
  invoicingActive: boolean;
  products: RawProduct[];
  categories: string[];
  collections: Array<{ name: string; products: number }>;
  orders: Array<{ items: unknown; amount: number; currency: string }>;
  funnel: { visits: number; productViews: number; addedToCart: number; checkoutsStarted: number };
  reviews: Array<{ productId: string; rating: number }>;
  now: Date;
};

const MAX_PRODUCTS = 60;
const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const clip = (text: string | null | undefined, max: number) => {
  const value = (text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? value.slice(0, max - 1).trimEnd() + '…' : value || undefined;
};
export const money = (minor: number, currency: string) => `${currency === 'BOB' ? 'Bs' : currency} ${(minor / 100).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round1 = (value: number) => Math.round(value * 10) / 10;
const average = (values: number[]) => values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : 0;

function hoursSummary(hours: unknown): string | undefined {
  if (!Array.isArray(hours) || !hours.length) return undefined;
  return hours.filter((h: any) => h && Number.isInteger(h.day)).sort((a: any, b: any) => a.day - b.day)
    .map((h: any) => `${DAYS[h.day] ?? h.day} ${h.closed ? 'cerrado' : `${h.open}–${h.close}`}`).join(', ').slice(0, 200) || undefined;
}
function optionNames(variants: unknown): string[] | undefined {
  if (!Array.isArray(variants)) return undefined;
  const names = new Set<string>();
  for (const variant of variants) for (const option of (variant as any)?.options || []) if (typeof option?.name === 'string') names.add(option.name);
  return names.size ? [...names].slice(0, 4) : undefined;
}

/** Pure: same input, same snapshot. Kept small enough to ride along with every YAPI turn. */
export function buildStoreKnowledge(input: StoreKnowledgeInput): StoreKnowledge {
  const { store } = input;
  const sold = new Map<string, number>();
  let paidRevenue = 0, currency = 'BOB';
  for (const order of input.orders) {
    paidRevenue += order.amount; currency = order.currency || currency;
    for (const line of Array.isArray(order.items) ? order.items as any[] : []) {
      const id = typeof line?.paymentLinkId === 'string' ? line.paymentLinkId : null;
      if (id) sold.set(id, (sold.get(id) || 0) + (Number.isFinite(line.quantity) ? Number(line.quantity) : 1));
    }
  }
  const reviewsBy = new Map<string, number[]>();
  for (const review of input.reviews) reviewsBy.set(review.productId, [...(reviewsBy.get(review.productId) || []), review.rating]);
  const activeDiscount = (p: RawProduct) => p.discountPercent && (!p.discountStartsAt || p.discountStartsAt <= input.now) && (!p.discountEndsAt || p.discountEndsAt > input.now) ? p.discountPercent : undefined;

  const ranked = [...input.products].sort((a, b) => (sold.get(b.id) || 0) - (sold.get(a.id) || 0) || b.createdAt.getTime() - a.createdAt.getTime());
  const products: KnowledgeProduct[] = ranked.slice(0, MAX_PRODUCTS).map(p => {
    const ratings = reviewsBy.get(p.id);
    const variants = Array.isArray(p.variants) ? p.variants.length : 0;
    return {
      id: p.id, name: p.name, price: money(p.amount, p.currency),
      description: clip(p.description, 180), category: p.category?.name,
      collections: p.collectionProducts.length ? p.collectionProducts.map(c => c.collection.name).slice(0, 4) : undefined,
      stock: p.stock ?? 'sin límite', options: optionNames(p.variants), variants: variants || undefined, photos: p.imageUrls.length,
      tags: p.tags.length ? p.tags.slice(0, 5) : undefined, discountPercent: activeDiscount(p) || undefined,
      sold30d: sold.get(p.id) || 0,
      reviews: ratings?.length ? { count: ratings.length, average: average(ratings) } : undefined,
    };
  });

  const locations = (Array.isArray(store.locations) ? store.locations as any[] : []).slice(0, 6).map(l => ({
    name: String(l?.name || '').slice(0, 80), address: clip(l?.address, 140), pickup: Boolean(l?.pickupEnabled), delivery: Boolean(l?.deliveryEnabled), hours: hoursSummary(l?.openingHours),
  }));

  const gaps: string[] = [];
  const noPhoto = input.products.filter(p => !p.imageUrls.length);
  const noDescription = input.products.filter(p => !p.description?.trim() || p.description.trim() === p.name.trim());
  const soldOut = input.products.filter(p => p.stock === 0);
  const list = (items: RawProduct[]) => items.slice(0, 5).map(p => `«${p.name}»`).join(', ') + (items.length > 5 ? ` y ${items.length - 5} más` : '');
  if (!store.logoUrl) gaps.push('La tienda no tiene logo cargado.');
  if (!input.products.length) gaps.push('La tienda no tiene productos activos.');
  if (noPhoto.length) gaps.push(`Sin foto: ${list(noPhoto)}.`);
  if (input.products.length && input.products.every(p => p.imageUrls.length === 1)) gaps.push('Todos los productos tienen una sola foto.');
  if (noDescription.length) gaps.push(`Sin descripción útil: ${list(noDescription)}.`);
  if (soldOut.length) gaps.push(`Agotados: ${list(soldOut)}.`);
  if (!store.contactPhone && !store.contactEmail && !store.contactFormEnabled) gaps.push('No hay forma de contacto visible.');
  if (!locations.length && store.shippingPickupEnabled) gaps.push('Retiro activado pero sin sucursal cargada.');
  if (store.checkoutMode === 'payment' && store.merchant.status !== 'ACTIVE') gaps.push('Los pagos están en modo de prueba hasta que se apruebe la verificación del negocio.');
  if (!input.invoicingActive) gaps.push('La facturación electrónica SIN no está activa.');
  const policies = storePolicies(store.policies);
  const missingPolicies = ([['returns', 'cambios y devoluciones'], ['delivery', 'envíos y entregas']] as const).filter(([key]) => !policies[key]).map(([, label]) => label);
  if (missingPolicies.length && input.products.length) gaps.push(`Falta la política de ${missingPolicies.join(' y de ')}; el comercio debe escribirla (YAPI no inventa condiciones).`);
  if (!input.reviews.length && input.orders.length >= 5) gaps.push('Hay ventas pero ninguna reseña publicada todavía.');
  if (input.funnel.productViews >= 50 && !input.orders.length) gaps.push(`${input.funnel.productViews} visitas vieron productos en 30 días y no hubo ventas pagadas.`);

  const checkout = store.checkoutMode === 'payment' ? 'pagos integrados' : store.checkoutMode === 'whatsapp' ? 'pedido por WhatsApp' : store.checkoutMode === 'external' ? 'contacto externo' : store.checkoutMode;
  return {
    version: 1,
    generatedAt: input.now.toISOString().slice(0, 10),
    identity: { name: store.name, tagline: clip(store.tagline, 140), about: clip(store.aboutText, 400), announcement: clip(store.announcement, 140), checkout, logo: Boolean(store.logoUrl) },
    trust: {
      verifiedBusiness: store.merchant.status === 'ACTIVE', electronicInvoicing: input.invoicingActive,
      liveStore: isPublicStore(store as Parameters<typeof isPublicStore>[0]), publishedDesign: Boolean(store.publishedSourceRevision || store.websitePublishedRevision),
      reviews: { count: input.reviews.length, average: average(input.reviews.map(r => r.rating)) },
    },
    contact: { phone: Boolean(store.contactPhone), email: Boolean(store.contactEmail), contactForm: store.contactFormEnabled },
    policies: { returns: Boolean(policies.returns), delivery: Boolean(policies.delivery), privacy: Boolean(policies.privacy), terms: Boolean(policies.terms) },
    fulfillment: { delivery: store.shippingEnabled || locations.some(l => l.delivery), pickup: store.shippingPickupEnabled || locations.some(l => l.pickup), locations },
    catalog: { productCount: input.products.length, categories: input.categories.slice(0, 20), collections: input.collections.slice(0, 12), products, truncated: input.products.length > MAX_PRODUCTS },
    performance30d: {
      ...input.funnel, paidOrders: input.orders.length, revenue: money(paidRevenue, currency),
      conversionPercent: input.funnel.visits ? round1(input.orders.length / input.funnel.visits * 100) : null,
    },
    gaps,
  };
}

const PAID_STATUSES = ['PAID', 'PREPARING', 'READY_FOR_PICKUP', 'SHIPPED', 'DELIVERED'] as const;

export async function loadStoreKnowledge(prisma: PrismaService, merchantId: string, storeId: string, now = new Date()): Promise<StoreKnowledge | null> {
  const store = await prisma.store.findFirst({ where: { id: storeId, merchantId }, select: {
    name: true, tagline: true, aboutText: true, announcement: true, checkoutMode: true, logoUrl: true, contactPhone: true, contactEmail: true, contactFormEnabled: true,
    shippingEnabled: true, shippingPickupEnabled: true, locations: true, status: true, sourcePublicationPaused: true, publicVisibility: true,
    publishedSourceRevision: true, websitePublishedRevision: true, policies: true, merchant: { select: { status: true } },
  } });
  if (!store) return null;
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const visitsSince = { storeId, createdAt: { gte: since } };
  const [products, categories, collections, orders, visits, productViews, addedToCart, checkoutsStarted, reviews, invoicing] = await Promise.all([
    prisma.paymentLink.findMany({ where: { storeId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, take: 400, select: {
      id: true, name: true, description: true, amount: true, currency: true, stock: true, imageUrls: true, tags: true, variants: true,
      discountPercent: true, discountStartsAt: true, discountEndsAt: true, createdAt: true, category: { select: { name: true } },
      collectionProducts: { select: { collection: { select: { name: true } } } },
    } }),
    prisma.category.findMany({ where: { storeId }, select: { name: true } }),
    prisma.collection.findMany({ where: { storeId }, select: { name: true, _count: { select: { products: true } } }, orderBy: { sortOrder: 'asc' } }),
    prisma.storeOrder.findMany({ where: { storeId, createdAt: { gte: since }, status: { in: [...PAID_STATUSES] } }, select: { items: true, amount: true, currency: true }, take: 5000 }),
    prisma.storeFunnelVisit.count({ where: visitsSince }),
    prisma.storeFunnelVisit.count({ where: { ...visitsSince, productViewedAt: { not: null } } }),
    prisma.storeFunnelVisit.count({ where: { ...visitsSince, cartAddedAt: { not: null } } }),
    prisma.storeFunnelVisit.count({ where: { ...visitsSince, checkoutStartedAt: { not: null } } }),
    prisma.storeReview.findMany({ where: { storeId, status: 'PUBLISHED' }, select: { productId: true, rating: true }, take: 2000 }),
    prisma.merchantInvoicingProfile.findFirst({ where: { merchantId }, select: { cuis: true } }),
  ]);
  return buildStoreKnowledge({
    store, invoicingActive: Boolean(invoicing?.cuis),
    products: products as unknown as RawProduct[], categories: categories.map(c => c.name),
    collections: collections.map(c => ({ name: c.name, products: c._count.products })),
    orders, funnel: { visits, productViews, addedToCart, checkoutsStarted }, reviews, now,
  });
}

/** Generation already receives the public catalog, so it gets everything except the product list. */
export function storeKnowledgeForGeneration(knowledge: StoreKnowledge) {
  const { catalog, ...rest } = knowledge;
  return { ...rest, catalog: { productCount: catalog.productCount, categories: catalog.categories, collections: catalog.collections,
    bestSellers: catalog.products.filter(p => p.sold30d > 0).slice(0, 5).map(p => ({ id: p.id, name: p.name, sold30d: p.sold30d })) } };
}

export const STORE_KNOWLEDGE_RULES = 'businessKnowledge is the Store Brain: verified facts from the database about this business (identity, trust status, contact, fulfillment and hours, the full catalog with 30-day sales and reviews, and known gaps). Use it to understand the business before asking; never ask for something it already answers. Never state a business fact in a reply or on the site (hours, delivery, prices, stock, materials, invoicing, verification, reviews) unless it appears in businessKnowledge or the merchant said it in this conversation. identity.logo says whether the merchant has uploaded a brand mark. When it is false, ask for it once — early, in one sentence, naming where it would go (cabecera, pestaña del navegador, pie, correos y comprobantes) — and offer a text wordmark built from the store name as the alternative; never invent, draw or promise to generate a logo, and never ask again in the same conversation if they decline or ignore it. When it is true, place it deliberately rather than decoratively: the header at a legible size, the favicon, and at most one more considered appearance; never stretch it, never repeat it as a background pattern, and never use a product photo in its place. When the merchant asks how the store is doing or what to improve, answer with at most three concrete findings from performance30d, catalog and gaps, each with the number behind it, and offer — never apply without asking — one specific change per finding.';
