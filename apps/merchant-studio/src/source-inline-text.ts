/** Spec 2026-10-20 §6: which direct-edit field holds the text a merchant double-clicked in the preview. */
import type { VisualField } from './source-visual-fields';

const words = (text: string) => text.replace(/\s+/g, ' ').trim();

/** The first text field that shows exactly these words (whitespace aside). Two fields with the same words: the first
 *  wins and only it changes, which is what the merchant sees change on the page. */
export function matchInlineField(fields: readonly VisualField[], before: string): VisualField | undefined {
  const wanted = words(before);
  return wanted ? fields.find(field => field.kind === 'text' && words(field.previewValue ?? field.value) === wanted) : undefined;
}

type CatalogItem = { id?: unknown; name?: unknown; amount?: unknown; variants?: unknown; fulfillmentType?: unknown; discountPercent?: unknown; [key: string]: unknown };
export type InlineProductField = 'name' | 'description' | 'price';

/** «Bs 1.234,50», «320», «320.5» → cents; null for anything that is not one positive price. Bolivian writing first:
 *  a comma is the decimal mark and dots group thousands; a lone dot with one or two digits after it is a decimal. */
export function parseBolivianPrice(text: string): number | null {
  const bare = text.replace(/\b(bs|bob)\b\.?|\$|\s/gi, '');
  if (!/^\d[\d.,]*$/.test(bare)) return null;
  const whole = /^(\d+|\d{1,3}(\.\d{3})+)$/;
  let normal: string;
  if (bare.includes(',')) {
    const [int, dec, extra] = bare.split(',');
    if (extra !== undefined || !whole.test(int) || !/^\d{1,2}$/.test(dec)) return null;
    normal = `${int.replace(/\./g, '')}.${dec}`;
  } else if (/^\d+\.\d{1,2}$/.test(bare)) normal = bare;
  else if (whole.test(bare)) normal = bare.replace(/\./g, '');
  else return null;
  const cents = Math.round(Number(normal) * 100);
  return Number.isFinite(cents) && cents > 0 && cents < 100_000_000_00 ? cents : null;
}

/** A price is changed in place only on a simple product: options, memberships, a discount or a subscription plan each
 *  show more than one number, so those open the product editor at its price step. */
export function simplePrice(item: CatalogItem): boolean {
  const hasList = (value: unknown) => Array.isArray(value) && value.length > 0;
  return !hasList(item.variants) && item.fulfillmentType !== 'MEMBERSHIP' && !(Number(item.discountPercent) > 0)
    && !Object.entries(item).some(([key, value]) => /subscri/i.test(key) && (hasList(value) || value === true));
}

/** The products the preview may edit in place, and whether each one's price may be. */
export function inlineProducts(catalog: unknown): Record<string, { price: boolean }> {
  const items = (catalog as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? Object.fromEntries(items.filter(item => typeof item?.id === 'string').map(item => [item.id, { price: simplePrice(item) }])) : {};
}

/** A double-clicked product word changed in place → the product change to save, or why it goes to the editor instead. */
export function inlineProductChange(item: CatalogItem | undefined, field: InlineProductField, after: string):
  { patch: { name: string } | { description: string | null } | { amount: number } } | { editor: 'description' | 'price'; message: string } {
  const text = after.replace(/\s+/g, ' ').trim();
  if (!item) return { editor: 'description', message: 'No encontramos ese producto. Ábrelo en Productos.' };
  if (field === 'name') return text && text.length <= 120 ? { patch: { name: text } } : { editor: 'description', message: 'El nombre debe tener entre 1 y 120 caracteres.' };
  if (field === 'description') return text.length <= 2000 ? { patch: { description: text || null } } : { editor: 'description', message: 'La descripción es demasiado larga.' };
  if (!simplePrice(item)) return { editor: 'price', message: 'Este producto tiene opciones o descuento: cambia su precio en Productos.' };
  const amount = parseBolivianPrice(text);
  return amount ? { patch: { amount } } : { editor: 'price', message: 'Escribe el precio como «Bs 150» o «150,50».' };
}
