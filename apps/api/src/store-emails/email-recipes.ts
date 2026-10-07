import type { BlockCall, EmailImage, EmailItem } from './email-assemble';
import type { StoredContent } from './email-content-store';
import type { EmailContext } from './email-context';
import { emailImageUrl, type EmailIcon } from './email-image-url';
import { DEFAULT_EMAIL_COPY } from './email-copy-defaults';
import { EMAIL_COPY_FIELDS, type EmailCopy, type EmailCopyField, type EmailType } from './email-kit-contract';

export type CopyOverrides = Partial<Record<EmailCopyField, string>>;
export type ResolvedCopy = Record<EmailCopyField, string>;
export type ReceiptData = { storeName: string; customerName: string | null; orderId: string; items: EmailItem[]; total: string; originalTotal: string | null;
  trackingUrl: string | null; subscription: string | null; appointment: { name: string; date: string | null } | null };

function fillPlaceholders(text: string, vars: { cliente: string | null; tienda: string }): string {
  const named = vars.cliente ? text.replace(/\{cliente\}/g, vars.cliente) : text.replace(/\s*\{cliente\}/g, '');
  return named.replace(/\{tienda\}/g, vars.tienda).replace(/\s+([,.;:!?])/g, '$1').trim();
}

/** Merchant edits win, then the store's kit, then the platform's wording. */
export function resolveCopy(type: EmailType, kitCopy: EmailCopy, overrides: CopyOverrides, vars: { cliente: string | null; tienda: string }): ResolvedCopy {
  const out = {} as ResolvedCopy;
  for (const field of Object.keys(EMAIL_COPY_FIELDS) as EmailCopyField[]) {
    out[field] = fillPlaceholders(overrides[field] || kitCopy[type]?.[field] || DEFAULT_EMAIL_COPY[type][field], vars);
  }
  return out;
}

export function receiptType(data: Pick<ReceiptData, 'appointment'>): EmailType {
  return data.appointment ? 'appointment_confirmed' : 'order_confirmation';
}

const NO_AUTO_CHARGE = 'No se cobra automáticamente.';

const subscriptionNote = (line: string) => (/autom[aá]tic/i.test(line) ? line : `${line} ${NO_AUTO_CHARGE}`);

export type Delivery = { method: 'delivery'; recipient: string | null; lines: string[] } | { method: 'pickup'; location: string | null } | null;
/** The merchant's content for one email, already resolved against their switches and the store's facts. */
export type ResolvedContent = {
  announcement: string | null; heroImage: EmailImage | null; promo: { code: string; discount: string } | null;
  story: { title: string; text: string; image: EmailImage | null } | null; note: string; recommendations: boolean;
};

/**
 * The merchant's saved content for one email, checked against today's facts. A picked promo
 * code goes out only while it is still active and shared (the context holds only those);
 * anything the merchant left unset falls back to the store's facts or the resolved wording.
 */
export function resolveContent(type: EmailType, stored: StoredContent, ctx: EmailContext, copy: ResolvedCopy, storeName: string, base: string | null): ResolvedContent {
  const on = stored.emails?.[type] ?? {};
  const image = (url: string | null | undefined) => { const src = emailImageUrl(url, base); return src ? { src, alt: storeName } : null; };

  const announcement = on.announcement === false || (stored.announcement && 'off' in stored.announcement) ? null
    : stored.announcement?.text ?? copy.announcement;
  const promo = on.promo === false || stored.promo?.promoCodeId === null ? null
    : stored.promo?.promoCodeId ? ctx.promos.find(p => p.id === stored.promo!.promoCodeId) ?? null
    : ctx.promos[0] ?? null;
  const story = on.story === false || (stored.story && 'off' in stored.story) ? null
    : stored.story ? { title: stored.story.title, text: stored.story.text, image: image(stored.story.imageUrl) }
    : { title: copy.storyTitle, text: copy.storyText, image: null };

  return {
    announcement,
    heroImage: image(stored.heroImage?.url),
    promo: promo && { code: promo.code, discount: promo.discount },
    story,
    note: stored.note?.text ?? copy.note,
    recommendations: stored.recommendations?.on !== false && on.recommendations !== false,
  };
}

const STEPS: Record<'delivery' | 'pickup' | 'appointment', [EmailIcon, string][]> = {
  delivery: [['check', 'Confirmado'], ['box', 'Preparando'], ['truck', 'En camino']],
  pickup: [['check', 'Confirmado'], ['box', 'Preparando'], ['store', 'Listo para retirar']],
  appointment: [['check', 'Confirmada'], ['calendar', 'Recordatorio'], ['pin', 'Te esperamos']],
};

// Over Gmail's size the highest goes first: recommendations, story, quote, promo, trust, steps.
// Hero, items, address, contact and notes carry no drop and are never cut.
const DROP = { steps: 1, trust: 2, promo: 3, quote: 4, story: 5, recommendations: 6 } as const;

const present = (x: string | null | undefined): x is string => !!x;

/**
 * The editorial receipt, top to bottom. A section whose facts are missing is left out rather
 * than shown empty, so a store with nothing set up still gets a complete, tidy email.
 */
export function richReceiptCalls(type: EmailType, data: ReceiptData & { delivery: Delivery }, copy: ResolvedCopy, ctx: EmailContext, content: ResolvedContent): BlockCall[] {
  const calls: BlockCall[] = [];
  if (content.announcement) calls.push({ block: 'announce', text: content.announcement });
  calls.push({ block: 'hero', image: content.heroImage ?? ctx.heroImage, title: copy.headline, text: copy.intro,
    href: data.trackingUrl, label: data.trackingUrl ? copy.cta : null });

  if (type === 'appointment_confirmed' && data.appointment) {
    calls.push({ block: 'address', title: 'Tu cita', lines: [data.appointment.name, data.appointment.date].filter(present) });
  }
  if (data.items.length) calls.push({ block: 'items', items: data.items, total: data.total, originalTotal: data.originalTotal });
  const d = data.delivery;
  if (d?.method === 'delivery' && (d.recipient || d.lines.length)) calls.push({ block: 'address', title: 'Envío a', lines: [d.recipient, ...d.lines].filter(present) });
  if (d?.method === 'pickup') calls.push({ block: 'address', title: 'Retiro en tienda', lines: [d.location ?? data.storeName] });

  const flow = type === 'appointment_confirmed' ? 'appointment' : d?.method === 'pickup' ? 'pickup' : 'delivery';
  calls.push({ block: 'steps', steps: STEPS[flow].map(([icon, title]) => ({ icon, title })), drop: DROP.steps });

  // Only what the store really offers: payment is always secure, the rest needs a policy or a contact.
  const trust: { icon: EmailIcon; label: string }[] = [{ icon: 'lock', label: 'Pago seguro' }];
  if (ctx.policies.some(p => p.key === 'returns')) trust.push({ icon: 'return', label: 'Cambios y devoluciones' });
  if (ctx.delivers) trust.push({ icon: 'truck', label: 'Envíos' });
  if (ctx.contact.email || ctx.contact.phone) trust.push({ icon: 'chat', label: 'Atención personalizada' });
  calls.push({ block: 'trust', items: trust, drop: DROP.trust });

  if (content.promo) calls.push({ block: 'promo', code: content.promo.code, discount: content.promo.discount, text: null, drop: DROP.promo });
  // Never an invented testimonial: without a real review the quote is the store's own note, signed by the store.
  calls.push(ctx.review
    ? { block: 'quote', text: ctx.review.text, author: ctx.review.author, stars: ctx.review.stars, drop: DROP.quote }
    : { block: 'quote', text: content.note, author: data.storeName, stars: null, drop: DROP.quote });
  if (content.story) calls.push({ block: 'story', ...content.story, drop: DROP.story });

  const recs = content.recommendations ? ctx.recommendations(data.items.map(i => i.productId).filter(present)) : [];
  if (recs.length) {
    calls.push({ block: 'heading', title: copy.recommendTitle, text: null, drop: DROP.recommendations },
      { block: 'products', products: recs, drop: DROP.recommendations });
  }

  const cards: { icon: EmailIcon; label: string; value: string; href: string }[] = [];
  if (ctx.contact.email) cards.push({ icon: 'mail', label: 'Escríbenos', value: ctx.contact.email, href: `mailto:${ctx.contact.email}` });
  if (ctx.contact.phone) {
    cards.push(ctx.contact.whatsapp
      ? { icon: 'whatsapp', label: 'WhatsApp', value: ctx.contact.phone, href: `https://wa.me/${ctx.contact.phone.replace(/\D/g, '')}` }
      : { icon: 'phone', label: 'Llámanos', value: ctx.contact.phone, href: `tel:${ctx.contact.phone.replace(/[^\d+]/g, '')}` });
  }
  if (cards.length) calls.push({ block: 'contact', title: copy.helpTitle, cards });

  if (data.subscription) calls.push({ block: 'note', text: subscriptionNote(data.subscription.trim()) });
  calls.push({ block: 'note', text: `${copy.signoff} Orden: ${data.orderId}` });
  return calls;
}
