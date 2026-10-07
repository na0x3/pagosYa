import type { BlockCall, EmailItem } from './email-assemble';
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

export function receiptCalls(type: EmailType, data: ReceiptData, copy: ResolvedCopy): BlockCall[] {
  const calls: BlockCall[] = [{ block: 'heading', title: copy.headline, text: copy.intro }];
  if (type === 'appointment_confirmed' && data.appointment) {
    calls.push({ block: 'note', text: [data.appointment.name, data.appointment.date].filter(Boolean).join(' · ') });
  }
  if (data.items.length) calls.push({ block: 'items', items: data.items, total: data.total, originalTotal: data.originalTotal });
  if (data.trackingUrl) calls.push({ block: 'button', href: data.trackingUrl, label: copy.cta });
  if (data.subscription) {
    const line = data.subscription.trim();
    calls.push({ block: 'note', text: /autom[aá]tic/i.test(line) ? line : `${line} ${NO_AUTO_CHARGE}` });
  }
  calls.push({ block: 'note', text: `${copy.signoff} Orden: ${data.orderId}` });
  return calls;
}
