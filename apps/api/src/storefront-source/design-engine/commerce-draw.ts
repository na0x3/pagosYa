/**
 * Account, checkout and the path to them drawn per store (spec docs/superpowers/specs/2026-10-11-commerce-surfaces-draw-design.md).
 * Each style card draws these beside its header and hero; the picked card's values reach the built store. Presentation only:
 * the payment flow, account security and the data collected stay the platform's.
 */
import type { PlaybookKind } from './playbook';

export const COMMERCE_OPTIONS = {
  account: ['card', 'split', 'minimal', 'panel'],
  checkout: ['columns', 'steps', 'ticket', 'brand'],
  fields: ['boxed', 'underline', 'filled', 'pill'],
  cartSurface: ['drawer', 'sheet', 'page', 'overlay'],
  added: ['toast', 'ribbon', 'bubble', 'inline', 'stamp'],
} as const;
export type CommercePart = keyof typeof COMMERCE_OPTIONS;
export type CommerceDraw = { -readonly [P in CommercePart]: (typeof COMMERCE_OPTIONS)[P][number] };
const PARTS = Object.keys(COMMERCE_OPTIONS) as CommercePart[];

/** "Leans to": the calm card stays sober, the bold card goes loud. An empty narrowing falls back to every option. */
export const COMMERCE_LEAN: Record<'calm' | 'bold', Record<CommercePart, readonly string[]>> = {
  calm: { account: ['card', 'minimal'], checkout: ['columns', 'steps'], fields: ['boxed', 'underline'], cartSurface: ['drawer', 'page'], added: ['toast', 'inline'] },
  bold: { account: ['split', 'panel'], checkout: ['ticket', 'brand'], fields: ['filled', 'pill'], cartSurface: ['sheet', 'overlay'], added: ['ribbon', 'bubble', 'stamp'] },
};

/** Uniform among the options used at most `spread` more than the least used, like the frame draw. */
export function drawCommerce(random: () => number, recent: Array<Partial<CommerceDraw>>, mode: 'calm' | 'bold', spread = 1, lean: Partial<Record<CommercePart, readonly string[]>> = COMMERCE_LEAN[mode]): CommerceDraw {
  const draw = {} as Record<CommercePart, string>;
  for (const part of PARTS) {
    const all: readonly string[] = COMMERCE_OPTIONS[part];
    const narrowed = all.filter(id => lean[part]?.includes(id));
    const options = narrowed.length ? narrowed : all;
    const counts = options.map(id => recent.filter(item => item[part] === id).length);
    const fewest = Math.min(...counts);
    const pool = options.filter((_, i) => counts[i] <= fewest + spread);
    draw[part] = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  }
  return draw as CommerceDraw;
}

export function parseCommerceDraw(value: unknown): Partial<CommerceDraw> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, string> = {};
  for (const part of PARTS) {
    const id = (value as Record<string, unknown>)[part];
    if (typeof id === 'string' && (COMMERCE_OPTIONS[part] as readonly string[]).includes(id)) out[part] = id;
  }
  return out as Partial<CommerceDraw>;
}

/** The cart's own word per kind of business: the cart button and the drawer title. */
export const CART_WORDS: Record<PlaybookKind, string> = {
  'cafe-food': 'Tu pedido', 'bakery-sweets': 'Tu caja', clothing: 'Tu bolsa', beauty: 'Tu neceser', 'flowers-gifts': 'Tu ramo',
  'crafts-home': 'Tu selección', 'fitness-wellness': 'Tu plan', services: 'Tu solicitud', general: 'Tu carrito',
};
export const cartWordFor = (kind: unknown): string | undefined => typeof kind === 'string' && Object.prototype.hasOwnProperty.call(CART_WORDS, kind) ? CART_WORDS[kind as PlaybookKind] : undefined;

/** The checkout layout builds on one of the runtime's review arrangements; data-dna-checkout adds the rest. Brand is one column
 *  beside its panel: a two-column review next to the panel leaves the summary too narrow for its rows. */
export const REVIEW_FOR_CHECKOUT: Record<CommerceDraw['checkout'], 'split' | 'stacked' | 'ticket'> = { columns: 'split', steps: 'stacked', ticket: 'ticket', brand: 'stacked' };
/** Runtime-only DNA values (never in SOURCE_DNA_ENUMS: the planner and the seed must not see them). Pinned against commerce.js. */
export const COMMERCE_RUNTIME_ENUMS = { checkout: COMMERCE_OPTIONS.checkout, fields: COMMERCE_OPTIONS.fields } as const;

export function commerceRuntimeDna(draw: Partial<CommerceDraw>): Record<string, string> {
  return {
    ...(draw.cartSurface ? { cart: draw.cartSurface } : {}),
    ...(draw.added ? { added: draw.added } : {}),
    ...(draw.checkout ? { review: REVIEW_FOR_CHECKOUT[draw.checkout], checkout: draw.checkout } : {}),
    ...(draw.fields ? { fields: draw.fields } : {}),
  };
}

const LABELS = {
  account: { card: 'tarjeta', split: 'dividida', minimal: 'mínima', panel: 'panel' },
  checkout: { columns: 'dos columnas', steps: 'por pasos', ticket: 'ticket', brand: 'con marca' },
  cartSurface: { drawer: 'lateral', sheet: 'hoja', page: 'página', overlay: 'pantalla completa' },
} as const;
/** The preview's one line: the merchant sees that the choice carries through to payment. */
export function commerceSummary(draw: Partial<CommerceDraw>): string {
  return [
    draw.account ? `Cuenta: ${LABELS.account[draw.account]}` : '',
    draw.checkout ? `Pago: ${LABELS.checkout[draw.checkout]}` : '',
    draw.cartSurface ? `Carrito: ${LABELS.cartSurface[draw.cartSurface]}` : '',
  ].filter(Boolean).join(' · ');
}
