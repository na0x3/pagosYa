import { BadRequestException } from '@nestjs/common';
import { ProductVariantDto } from '../payment-links/dto/create-payment-link.dto';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { normalizeProductVariants, type ProductVariant } from '../payment-links/product-variants';
import { ProductSubscriptionCadence } from '@prisma/client';
import { ProductSubscriptionOptionDto } from '../payment-links/dto/update-product-subscriptions.dto';
import { validateProductSubscriptions, type ProductSubscriptionOperation } from '../payment-links/product-subscriptions';

const nullable = (schema: object) => ({ anyOf: [schema, { type: 'null' }] });
const properties = {
  name: nullable({ type: 'string', maxLength: 140 }),
  options: nullable({ type: 'array', maxItems: 3, items: { type: 'object', additionalProperties: false, required: ['name','value'], properties: { name: { type: 'string', maxLength: 40 }, value: { type: 'string', maxLength: 40 } } } }),
  amount: nullable({ type: 'integer', minimum: 0, maximum: 2147483647 }),
  priceText: nullable({ type: 'string', description: 'Exact current merchant price quote, or a surcharge such as +Bs 20. Null inherits the product price for a new combination, or preserves an existing price.' }),
  stock: nullable({ type: 'integer', minimum: 0, maximum: 1000000 }),
  stockText: nullable({ type: 'string', description: 'Exact current stock quote, such as 5 de cada una, sold out, or sin límite. Required for new combinations. Null preserves existing stock; stock:null with an explicit unlimited quote disables tracking.' }),
  imageUrl: nullable({ type: 'string', description: 'Original uploaded product-photo URL; null preserves an existing assignment.' }),
};
export const sourceVariantsSchema = { type: 'array', maxItems: 64, items: { type: 'object', additionalProperties: false, required: Object.keys(properties), properties } };
export const sourceVariantOperationsSchema = { type: 'array', maxItems: 64, items: { type: 'object', additionalProperties: false,
  required: ['action','variantId',...Object.keys(properties)], properties: { action: { type: 'string', enum: ['add','update','delete'] }, variantId: nullable({ type: 'string' }), ...properties } } };
export type SourceVariantOperation = { action: 'add' | 'update' | 'delete'; variantId?: string; changes?: Partial<ProductVariantDto> };
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const quoted = (quote: unknown, instruction: string): quote is string => typeof quote === 'string' && !!quote.trim() && instruction.includes(quote);

export const sourceOptionRequest = (text: string) => /\b(?:opcion(?:es)?|options?|combinacion(?:es)?|combinations?|variantes?|variants?|tallas?|sizes?|colores?|colors?|stock|agotad[oa]s?|sold out)\b/i.test(normalize(text));

const subscriptionProperties = {
  cadence: { type: 'string', enum: Object.values(ProductSubscriptionCadence) },
  discountPercent: { type: 'integer', minimum: 0, maximum: 99 },
  confirmationText: { type: 'string', maxLength: 160, description: 'Exact current merchant quote tying this cadence to its discount, e.g. monthly with 10% off, semanal con 5% de descuento, or mensual sin descuento. Never quote a bare percentage or combine separate quotes.' },
};
export const sourceSubscriptionsSchema = { type: 'array', maxItems: 3, items: {
  type: 'object', additionalProperties: false, required: Object.keys(subscriptionProperties), properties: subscriptionProperties,
} };
export const sourceSubscriptionOperationsSchema = { type: 'array', maxItems: 3, items: {
  type: 'object', additionalProperties: false, required: ['action', ...Object.keys(subscriptionProperties)], properties: {
    ...subscriptionProperties,
    action: { type: 'string', enum: ['upsert', 'delete'] },
    discountPercent: nullable(subscriptionProperties.discountPercent),
    confirmationText: { ...subscriptionProperties.confirmationText, description: subscriptionProperties.confirmationText.description + ' For deletion quote the removal and cadence together, e.g. elimina mensual / remove weekly, and use discountPercent:null.' },
  },
} };

export const sourceSubscriptionRequest = (text: string) => /\b(?:suscripcion(?:es)?|subscriptions?|subscribe|compra(?:s)? recurrente(?:s)?|recurring(?: purchase| delivery)?|entrega(?:s)? recurrente(?:s)?)\b/.test(normalize(text));
const cadencePhrases: Record<ProductSubscriptionCadence, string> = {
  WEEKLY: '(?:weekly|semanal|cada semana|every week)',
  BIWEEKLY: '(?:biweekly|cada (?:2|dos) semanas|every (?:2|two) weeks)',
  MONTHLY: '(?:monthly|mensual|cada mes|every month)',
};

function subscriptionRequest(instruction: string): string {
  const current = instruction.split('Pedido actual del comercio:').at(-1)!.trim();
  const request = normalize(current).replace(/^(?:suscripciones|subscriptions)\b[^:\n]*:\s*/, '');
  if (!sourceSubscriptionRequest(current) || /[?¿]/.test(current)
    || !/^(?:(?:por favor|please)[,:]?\s+)?(?:crea|crear|agrega|agregar|anade|ofrece|ofrecer|configura|activa|quiero|cambia|actualiza|pon|elimina|eliminar|quita|quitar|borra|borrar|create|add|offer|enable|set|want|update|change|remove|delete|subscribe)\b/.test(request)) {
    throw new BadRequestException('Pide configurar las suscripciones explícitamente en el mensaje actual.');
  }
  return current;
}

/** A single quote must bind the cadence and its discount; separate quotes could
 * swap the discounts of two cadences or reuse a one-time sale percentage. */
function confirmedSubscription(raw: any, current: string, deleting = false): ProductSubscriptionOptionDto {
  if (!raw || typeof raw !== 'object' || !Object.hasOwn(cadencePhrases, raw.cadence)
    || !quoted(raw.confirmationText, current) || raw.confirmationText.length > 160) {
    throw new BadRequestException('Confirma la cadencia y su descuento; YAPI no inventa suscripciones.');
  }
  const quote = normalize(raw.confirmationText.trim());
  // Reject quotes cut out of longer words/numbers (e.g. weekly from biweekly).
  const quotedAt = current.indexOf(raw.confirmationText);
  if (/\b(?:no|not|never|except|excepto)\s*$/i.test(current.slice(0, quotedAt))) {
    throw new BadRequestException('Confirma qué cadencia sí quieres ofrecer.');
  }
  if (/[\p{L}\p{N}]/u.test(current[quotedAt - 1] || '') || /[\p{L}\p{N}]/u.test(current[quotedAt + raw.confirmationText.length] || '')) {
    throw new BadRequestException('Copia completa la confirmación de la suscripción.');
  }
  const cadence = raw.cadence as ProductSubscriptionCadence;
  const phrase = cadencePhrases[cadence];
  if (deleting) {
    if (raw.discountPercent !== null || !new RegExp(`^(?:elimina|eliminar|quita|quitar|borra|borrar|remove|delete)\\s+(?:(?:la\\s+)?suscripcion\\s+|subscription\\s+)?${phrase}$`).test(quote)) {
      throw new BadRequestException('Para eliminar una suscripción, confirma explícitamente qué cadencia quitar.');
    }
    return { cadence, discountPercent: 0 };
  }
  const match = new RegExp(`^${phrase}\\s+(?:(?:con|with)\\s+)?(?:(\\d{1,2})\\s*%(?:\\s+(?:de descuento|off|discount))?|(sin descuento|no discount))$`).exec(quote);
  const percent = match ? (match[1] === undefined ? 0 : Number(match[1])) : undefined;
  if (percent === undefined || raw.discountPercent !== percent) {
    throw new BadRequestException('El descuento debe coincidir con el porcentaje confirmado para esa cadencia.');
  }
  return { cadence, discountPercent: percent };
}

export function requestedSourceSubscriptions(value: unknown, instruction: string): ProductSubscriptionOptionDto[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value) || value.length > 3) throw new BadRequestException('Usa hasta tres cadencias por producto.');
  if (!value.length) return undefined;
  const current = subscriptionRequest(instruction);
  const options = value.map(raw => confirmedSubscription(raw, current));
  return validateProductSubscriptions({ options });
}

export function requestedSubscriptionOperations(value: unknown, instruction: string): ProductSubscriptionOperation[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 3) throw new BadRequestException('Cambia hasta tres cadencias por mensaje.');
  if (!value.length) return [];
  const current = subscriptionRequest(instruction);
  const touched = new Set<ProductSubscriptionCadence>();
  return value.map(raw => {
    if (!raw || !['upsert', 'delete'].includes(raw.action)) throw new BadRequestException('La operación de suscripción no es válida.');
    const option = confirmedSubscription(raw, current, raw.action === 'delete');
    if (touched.has(option.cadence)) throw new BadRequestException('Cambia cada cadencia una sola vez por mensaje.');
    touched.add(option.cadence);
    return raw.action === 'delete' ? { action: 'delete', cadence: option.cadence } : { action: 'upsert', ...option };
  });
}

const SOURCE_PRODUCT_SUBSCRIPTIONS = `Recurring-purchase offers are real catalog data, separate from variants and scheduled one-time discounts. Suggest asking about subscriptions for replenishable goods such as coffee, skincare routines, meal kits and subscription boxes; do not suggest them for one-off items. A suggestion is not authorization. Never enable an offer or invent a cadence, discount percentage, savings claim or billing promise from the product category, a reference site, old conversation or design needs. Ask the merchant to confirm each cadence together with its exact discount (including zero/no discount) when missing. Supported cadences are WEEKLY (7 days), BIWEEKLY (14 days, not twice a week or 15 days), MONTHLY (one calendar month). One option per cadence, integer discountPercent 0–99 off the one-time product/variant price; no assumed stacking with promotions or bundles. For new products use subscriptionOptions; for existing products use subscriptionOperations with action upsert/delete keyed by cadence. Every upsert needs confirmationText copied exactly from the CURRENT merchant instruction tying cadence and discount together, e.g. "monthly with 10% off", "cada dos semanas con 5% de descuento", "mensual sin descuento". Separate cadence/percentage quotes are insufficient. For delete use discountPercent:null and quote the explicit removal plus cadence, e.g. "elimina mensual". Ask for a clear confirmation if the wording cannot be validated. Empty arrays mean unchanged; omitted cadences remain unchanged and upserts preserve existing option IDs. Resolve the exact product ID from the catalog and ask if ambiguous. For subscription-only changes preserve page design and use empty source edits. The backend configures offers only: storefront cadence rendering, customer enrollment, recurring orders and automatic charging are not implemented by this primitive. Never hardcode cadence selectors or claim a subscription is enrolled or a recurring charge is scheduled.`;

function price(value: any, instruction: string, baseAmount: number, currency: string, creating: boolean) {
  if (value.amount == null && value.priceText == null) return creating ? baseAmount : undefined;
  if (!quoted(value.priceText, instruction)) throw new BadRequestException('Indica el precio o recargo de la combinación; YAPI no inventa precios.');
  const quote = value.priceText.trim();
  const match = /^(\+)?\s*(?:Bs\.?|BOB|USD|US\$)\s*(\d+(?:[.,]\d{1,2})?)$|^(\+)?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:Bs\.?|BOB|USD|US\$)$/i.exec(quote);
  const quoteCurrency = /USD|US\$/i.test(quote) ? 'USD' : 'BOB';
  const expected = match ? Math.round(Number((match[2] || match[4]).replace(',','.')) * 100) + (match[1] || match[3] ? baseAmount : 0) : NaN;
  if (!Number.isSafeInteger(value.amount) || value.amount !== expected || currency !== quoteCurrency) throw new BadRequestException('El precio de la combinación no coincide con el precio indicado.');
  return value.amount as number;
}

function stock(value: any, instruction: string, creating: boolean): { stock?: number | null } {
  if (value.stockText == null && value.stock == null && !creating) return {};
  if (!quoted(value.stockText, instruction)) throw new BadRequestException('Indica cuántas unidades hay de cada combinación, o si el stock es sin límite.');
  const quote = normalize(value.stockText);
  if (/\b(?:bs|bob|usd)\b|US\$/i.test(quote)) throw new BadRequestException('Indica las unidades de stock por separado del precio.');
  if (/\b(?:sin limite|sin control de stock|ilimitad[oa]|unlimited|untracked)\b/.test(quote) && value.stock === null) return { stock: null };
  if (/\b(?:agotad[oa]s?|sold out|out of stock)\b/.test(quote) && value.stock === 0) return { stock: 0 };
  const words: Record<string,number> = { cero:0,zero:0,uno:1,una:1,one:1,dos:2,two:2,tres:3,three:3,cuatro:4,four:4,cinco:5,five:5,seis:6,six:6,siete:7,seven:7,ocho:8,eight:8,nueve:9,nine:9,diez:10,ten:10 };
  const counts = [...quote.matchAll(/\b\d+\b/g)].map(m=>Number(m[0]));
  for (const token of quote.split(/\W+/)) if (token in words) counts.push(words[token]);
  if (!Number.isInteger(value.stock) || value.stock < 0 || value.stock > 1000000 || !counts.includes(value.stock)) throw new BadRequestException('El stock de la combinación no coincide con las unidades indicadas.');
  return { stock: value.stock };
}

function changes(raw: any, instruction: string, baseAmount: number, currency: string, images: Set<string>, creating: boolean): Partial<ProductVariantDto> {
  if (!raw || typeof raw !== 'object') throw new BadRequestException('La combinación no es válida.');
  const result: Partial<ProductVariantDto> = { ...stock(raw,instruction,creating) };
  const amount = price(raw,instruction,baseAmount,currency,creating);
  if (amount !== undefined) result.amount = amount;
  if (raw.options != null) {
    if (!Array.isArray(raw.options) || !raw.options.length || raw.options.length > 3 || raw.options.some((option: any) => !option || typeof option.name !== 'string' || typeof option.value !== 'string' || !option.value.trim() || !normalize(instruction).includes(normalize(option.value.trim())))) throw new BadRequestException('Usa solo los colores, tallas u opciones indicados por el comercio.');
    result.options = raw.options;
    result.name = raw.options.map((option: any)=>option.value.trim()).join(' / ');
  } else if (raw.name != null) {
    if (typeof raw.name !== 'string' || !raw.name.trim() || !normalize(instruction).includes(normalize(raw.name.trim()))) throw new BadRequestException('Indica el nombre de la opción.');
    result.name = raw.name;
  }
  if (raw.imageUrl != null) {
    if (typeof raw.imageUrl !== 'string' || !images.has(raw.imageUrl)) throw new BadRequestException('Usa una foto que pertenezca a este producto o a los archivos adjuntos.');
    result.imageUrl = raw.imageUrl;
  }
  if (creating && !result.name) throw new BadRequestException('Indica las opciones de la nueva combinación.');
  if (validateSync(plainToInstance(ProductVariantDto, { name:'Opción', amount:baseAmount, ...result }), {whitelist:true,forbidNonWhitelisted:true}).length) throw new BadRequestException('Revisa los nombres, valores, precio y foto de la combinación.');
  return result;
}

export function requestedSourceVariants(value: unknown, instruction: string, amount: number, currency: string, images: Set<string>): ProductVariantDto[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value) || value.length > 64) throw new BadRequestException('Usa hasta 64 combinaciones por producto.');
  if (!value.length) return undefined;
  if (!sourceOptionRequest(instruction)) throw new BadRequestException('Pide las opciones explícitamente.');
  const variants = value.map(raw => changes(raw,instruction,amount,currency,images,true) as ProductVariantDto);
  normalizeProductVariants(variants);
  return variants;
}

export function requestedVariantOperations(value: unknown, instruction: string, product: { variants?: ProductVariant[]; amount?: number; currency?: string }, images: Set<string>): SourceVariantOperation[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 64) throw new BadRequestException('Cambia hasta 64 combinaciones por mensaje.');
  if (value.length && !sourceOptionRequest(instruction)) throw new BadRequestException('Pide el cambio de opciones explícitamente.');
  const touched = new Set<string>();
  return value.map(raw => {
    if (!raw || !['add','update','delete'].includes(raw.action)) throw new BadRequestException('La operación de opción no es válida.');
    const existing = product.variants?.find(variant=>variant.id===raw.variantId);
    if (raw.action !== 'add' && (!existing || touched.has(raw.variantId))) throw new BadRequestException('Selecciona una combinación existente, una sola vez por mensaje.');
    if (raw.action === 'add' && raw.variantId != null) throw new BadRequestException('Una nueva combinación no debe reemplazar una existente.');
    if (raw.variantId) touched.add(raw.variantId);
    if (raw.action === 'delete') {
      if (!/\b(?:elimina|eliminar|borra|borrar|quita|quitar|remove|delete)\b/i.test(instruction)) throw new BadRequestException('Para eliminar una combinación, pídelo explícitamente.');
      return { action:'delete', variantId:existing!.id };
    }
    const patch = changes(raw,instruction,existing?.amount ?? product.amount ?? 0,product.currency || 'BOB',images,raw.action==='add');
    if (!Object.keys(patch).length) throw new BadRequestException('Indica qué quieres cambiar de la combinación.');
    return { action:raw.action, ...(existing ? {variantId:existing.id}:{}), changes:patch };
  });
}

/** Apply deltas to inventory read inside the save transaction; never copy old model stock. */
export function applyVariantOperations(existing: ProductVariant[], operations: SourceVariantOperation[]): ProductVariant[] {
  let next: ProductVariantDto[] = existing.map(variant=>({...variant}));
  for (const operation of operations) {
    if (operation.action === 'add') next.push(operation.changes as ProductVariantDto);
    else {
      const index = next.findIndex(variant=>variant.id===operation.variantId);
      if (index < 0) throw new BadRequestException('La combinación cambió o ya no existe. Actualiza antes de editar.');
      if (operation.action === 'delete') next.splice(index,1);
      else next[index] = {...next[index],...operation.changes};
    }
  }
  if (!next.length) throw new BadRequestException('Conserva una combinación o marca el producto como agotado.');
  return normalizeProductVariants(next,existing);
}

export const SOURCE_PRODUCT_OPTIONS = `Product options are real catalog data. Use variants for new products and variantOperations (add/update/delete by stable variantId) for existing products. Each purchasable combination has options [{name:"Color",value:"Negro"},{name:"Talla",value:"M"}], one full price, its own stock and optionally a product imageUrl. Up to 3 ordered groups and 64 actual combinations. Keep the same group names/order for every combination. Never model colors/sizes as additive extras or hardcode selectors in generated HTML. Ask which combinations exist and their stock when unspecified; never silently assume all cross-products or unlimited inventory. Support "same price for all", "five of each", explicit unlimited stock and sold-out combinations. New amount/priceText null inherits the confirmed product price; existing null means unchanged. For a surcharge use an exact quote like +Bs 20 and the resulting total price. stockText must quote the current instruction (including sold out / sin límite); no stockText preserves existing stock. On a follow-up, resolve the exact product and variant IDs from the current catalog; ask if ambiguous. Return only changed combinations and fields; never copy all variants or their old stock on a rename/price edit. Keep untouched IDs, prices and stock. Review the requested combination count, price exceptions and stock in your reply. For product-only work preserve page design and use empty source edits. Existing checkout renders real options and enforces their price and availability.

${SOURCE_PRODUCT_SUBSCRIPTIONS}`;
