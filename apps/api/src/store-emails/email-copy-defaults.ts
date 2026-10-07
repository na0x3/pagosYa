// apps/api/src/store-emails/email-copy-defaults.ts
import { readFile } from 'node:fs/promises';
import { kitPath } from '@pagosya/storefront-kit';
import type { EmailCopyField, EmailType, ValidEmailKit } from './email-kit-contract';
import { validateEmailKit } from './email-kit-validate';

/** Platform wording, used for any field a store's kit or the merchant left empty. */
export const DEFAULT_EMAIL_COPY: Record<EmailType, Record<EmailCopyField, string>> = {
  order_confirmation: {
    subject: 'Recibo de tu compra en {tienda}',
    preheader: 'Tu pago fue confirmado. Aquí tienes el detalle.',
    headline: 'Gracias por tu compra',
    intro: 'Hola {cliente}, tu pago fue confirmado. Este es el detalle de tu pedido.',
    cta: 'Sigue tu pedido',
    signoff: 'Gracias por comprar en {tienda}.',
  },
  appointment_confirmed: {
    subject: 'Cita confirmada en {tienda}',
    preheader: 'Tu reserva está confirmada.',
    headline: 'Tu cita está confirmada',
    intro: 'Hola {cliente}, tu pago fue confirmado y tu reserva quedó registrada.',
    cta: 'Ver tu reserva',
    signoff: 'Te esperamos en {tienda}.',
  },
};

let floor: Promise<ValidEmailKit> | null = null;

/** The standard kit, read once. It ships with the platform and must always validate. */
export function loadFloorKit(): Promise<ValidEmailKit> {
  floor ??= (async () => {
    const [layout, blocks] = await Promise.all([
      readFile(kitPath('emails', 'layout.html'), 'utf8'),
      readFile(kitPath('emails', 'blocks.html'), 'utf8'),
    ]);
    const { kit, usable, repairs } = validateEmailKit({ layout, blocks, copy: {} });
    if (!usable) throw new Error(`The floor email kit is invalid: ${repairs.join('; ')}`);
    return kit;
  })();
  return floor;
}
