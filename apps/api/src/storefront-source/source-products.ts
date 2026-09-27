import { requestedSourceVariants, requestedVariantOperations, sourceVariantsSchema, sourceVariantOperationsSchema, sourceOptionRequest, type SourceVariantOperation } from './source-product-options';
import { requestedSourceSubscriptions, requestedSubscriptionOperations, sourceSubscriptionsSchema, sourceSubscriptionOperationsSchema, sourceSubscriptionRequest } from './source-product-options';
import type { ProductSubscriptionOptionDto } from '../payment-links/dto/update-product-subscriptions.dto';
import type { ProductSubscriptionOperation } from '../payment-links/product-subscriptions';
import type { ProductVariant } from '../payment-links/product-variants';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreatePaymentLinkDto } from '../payment-links/dto/create-payment-link.dto';
import { UpdatePaymentLinkDto } from '../payment-links/dto/update-payment-link.dto';

type SourceCatalogItem = {
  id: string;
  name?: string;
  imageUrls?: string[];
  variants?: ProductVariant[];
  amount?: number;
  currency?: string;
};

export type SourceProduct = CreatePaymentLinkDto & { subscriptionOptions?: ProductSubscriptionOptionDto[] };

export type SourceProductOperation = {
  action: 'update' | 'delete';
  productId: string;
  changes?: UpdatePaymentLinkDto;
  variantOperations?: SourceVariantOperation[];
  subscriptionOperations?: ProductSubscriptionOperation[];
};

/** A first catalog is often 8–10 items; 6 forced merchants to split their launch across messages. */
const MAX_CREATED_PRODUCTS = 12;
const plain = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** YAPI's agreed summaries list prices under a currency heading ("Catálogo (Bs): Matcha 22; Pistacho 22"), so an
 * exact "Bs 22" quote never appears although the merchant gave the price. Accept the price only when this product's
 * name is followed closely by exactly this amount and the text states the currency: still nothing invented. */
function priceStatedFor(text: string, item: { name?: unknown; amount?: unknown; currency?: unknown }) {
  if (typeof item.name !== 'string' || !item.name.trim() || !Number.isSafeInteger(item.amount) || (item.amount as number) < 0) return false;
  const source = plain(text), name = plain(item.name.trim());
  const currency = item.currency === 'USD' ? /\b(?:usd|us\$|dolares)/ : /\b(?:bs\.?|bob|bolivianos)(?![a-z])/;
  if (!currency.test(source)) return false;
  const whole = Math.floor((item.amount as number) / 100), cents = (item.amount as number) % 100;
  const number = cents ? `${whole}[.,]${String(cents).padStart(2, '0').replace(/0$/, '0?')}` : `${whole}(?:[.,]00?)?`;
  const amount = new RegExp(`^[^\\d]{0,24}?(?<![\\d.,])${number}(?![\\d]|[.,]\\d)`);
  for (let at = source.indexOf(name); at >= 0; at = source.indexOf(name, at + 1)) {
    // Whole names only: "Caja de 1" must not borrow a price from "Caja de 12 220".
    if (/[a-z0-9]/.test(source[at - 1] || '') || /[a-z0-9]/.test(source[at + name.length] || '')) continue;
    if (amount.test(source.slice(at + name.length, at + name.length + 40))) return true;
  }
  return false;
}

export const sourceProductsSchema = {
  type: 'array', maxItems: MAX_CREATED_PRODUCTS, items: {
    type: 'object', additionalProperties: false,
    required: ['name', 'description', 'amount', 'currency', 'priceText', 'imageUrls', 'variants', 'subscriptionOptions'],
    properties: {
      variants: sourceVariantsSchema,
      subscriptionOptions: sourceSubscriptionsSchema,
      name: { type: 'string' }, description: { type: 'string' },
      amount: { type: 'integer', minimum: 0 }, currency: { type: 'string', enum: ['BOB', 'USD'] },
      priceText: { type: 'string', description: 'Exact price and currency quote from the current merchant request, e.g. Bs 35 or USD 12.50.' },
      imageUrls: { type: 'array', maxItems: 10, items: { type: 'string' } },
    },
  },
};

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

/** Product mutations are deliberately separate from product creation. This
 * keeps the model from turning old conversation history into an accidental
 * edit while allowing a clear current request to manage the real catalog. */
export const sourceProductOperationsSchema = {
  type: 'array', maxItems: 6, items: {
    type: 'object', additionalProperties: false,
    required: ['action', 'productId', 'name', 'description', 'amount', 'currency', 'priceText', 'imageUrls', 'imagePositions', 'tags', 'stock', 'color', 'variantOperations', 'subscriptionOperations'],
    properties: {
      variantOperations: sourceVariantOperationsSchema,
      subscriptionOperations: sourceSubscriptionOperationsSchema,
      action: { type: 'string', enum: ['update', 'delete'] },
      productId: { type: 'string', minLength: 1 },
      name: nullable({ type: 'string' }),
      description: nullable({ type: 'string' }),
      amount: nullable({ type: 'integer', minimum: 0 }),
      currency: nullable({ type: 'string', enum: ['BOB', 'USD'] }),
      priceText: nullable({ type: 'string', description: 'Exact new price quote from the current merchant request.' }),
      imageUrls: nullable({ type: 'array', maxItems: 10, items: { type: 'string' } }),
      imagePositions: nullable({ type: 'array', maxItems: 10, items: { type: 'string' } }),
      tags: nullable({ type: 'array', maxItems: 6, items: { type: 'string' } }),
      stock: nullable({ type: 'integer', minimum: 0 }),
      color: nullable({ type: 'string' }),
    },
  },
};

function canonicalUploadUrl(value: string): string {
  if (/^\/v1\/uploads\//.test(value)) return value;
  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
}

const NAME_STOPWORDS = new Set(['del', 'las', 'los', 'con', 'para', 'por', 'sin', 'una', 'the', 'and', 'for', 'with']);
const nameTokens = (name: string) => plain(name).split(/[^a-z0-9]+/).filter(token => token.length >= 3 && !NAME_STOPWORDS.has(token));
const wholeWord = (text: string, phrase: string) => new RegExp(`(?:^|[^a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-z0-9])`).test(text);

/** Products the current request names. A full name beats a partial one, and a longer full name beats one it
 * contains, so "la funda de cojín" never authorizes a change to "Funda de sofá" or to a product called "Funda". */
export function productsNamedIn(request: string, items: SourceCatalogItem[]): Set<string> {
  if (items.length === 1) return new Set([items[0].id]);
  const text = plain(request);
  if (/\b(?:tod[oa]s|all)\b.{0,40}\b(?:productos?|articulos?|products?|catalogo)\b/.test(text)) return new Set(items.map(item => item.id));
  const full = items.filter(item => item.name && nameTokens(item.name).length && wholeWord(text, plain(item.name.trim())));
  if (full.length) return new Set(full.filter(item => !full.some(other => other !== item && plain(other.name!).length > plain(item.name!).length && plain(other.name!).includes(plain(item.name!)))).map(item => item.id));
  const words = new Set(text.split(/[^a-z0-9]+/));
  const scored = items.map(item => { const tokens = nameTokens(item.name || ''); return { id: item.id, score: tokens.length ? tokens.filter(token => words.has(token)).length / tokens.length : 0 }; });
  const best = Math.max(0, ...scored.map(item => item.score));
  return new Set(best > 0 ? scored.filter(item => item.score === best).map(item => item.id) : []);
}

/** A field may change only when the request talks about it, or literally contains the new value. */
const FIELD_REQUESTS: Record<string, RegExp> = {
  name: /\b(?:nombre|renombr\w*|llam\w*|titulo|rename|name)\b/,
  description: /\b(?:descripci\w*|describ\w*|texto|detalles?|description)\b/,
  imageUrls: /\b(?:fotos?|imagen(?:es)?|images?|photos?|portada|galeria)\b/,
  imagePositions: /\b(?:fotos?|imagen(?:es)?|images?|photos?|encuadre|recorte|posicion|centr\w*)\b/,
  tags: /\b(?:etiquetas?|tags?|categorias?|labels?)\b/,
  stock: /\b(?:stock|agotad[oa]s?|inventario|unidades|disponibles?|existencias?|sold out|cantidad)\b/,
  color: /\b(?:color(?:es)?|colour)\b/,
};
function assertFieldRequested(field: string, value: unknown, request: string) {
  const text = plain(request);
  if (FIELD_REQUESTS[field]?.test(text)) return;
  if (typeof value === 'string' && value.trim().length >= 3 && text.includes(plain(value.trim()))) return;
  throw new BadRequestException('Solo cambio la información del producto que mencionas en tu mensaje.');
}

function operationRequest(instruction: string): string {
  return instruction.split('Pedido actual del comercio:').at(-1)!.trim();
}

function hasProductMutationRequest(instruction: string): boolean {
  return /\b(?:cambia|cambiar|actualiza|actualizar|modifica|modificar|edita|editar|renombra|renombrar|pon|asigna|usa|elimina|eliminar|borra|borrar|quita|quitar|remove|delete|update|edit|rename)\b/i.test(instruction)
    && /\b(?:producto|productos|art[ií]culo|art[ií]culos|product|products|cat[aá]logo|fotos?|imagen(?:es)?|nombres?|precios?|descripci[oó]n(?:es)?|stock|inventario)\b/i.test(instruction);
}

function parsePriceQuote(quote: string, amount: number, currencyValue: string): void {
  const price = /^(?:Bs\.?|BOB|USD|US\$)\s*(\d+(?:[.,]\d{1,2})?)$|^(\d+(?:[.,]\d{1,2})?)\s*(?:Bs\.?|BOB|USD|US\$)$/i.exec(quote.trim());
  const currency = /USD|US\$/i.test(quote) ? 'USD' : 'BOB';
  if (!price || Math.round(Number((price[1] || price[2]).replace(',', '.')) * 100) !== amount || currencyValue !== currency) {
    throw new BadRequestException('Escribe precios claros, por ejemplo «Bs 35» o «USD 12.50».');
  }
}

export function requestedSourceProducts(value: unknown, instruction: string, allowedImages: Set<string>): SourceProduct[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_CREATED_PRODUCTS) throw new BadRequestException(`Puedes crear hasta ${MAX_CREATED_PRODUCTS} productos por mensaje.`);
  const current = instruction.split('Pedido actual del comercio:').at(-1)!.trim();
  if (value.length && !/(?:crea|agrega|añad|anad|create|add|inclu|vend[oe]).{0,100}(?:producto|art[ií]culo|product|cat[aá]logo|camiseta|camisa|shirt|vestido|pantal[oó]n|zapato)|(?:producto|product).{0,60}(?:crea|agrega|añad|create|add)/is.test(current)) {
    throw new BadRequestException('Para crear productos, pídelo con su nombre y precio.');
  }
  return value.map(raw => {
    // Two model slips that change nothing about the price: sentence punctuation after the quote ("Bs 22."), and the
    // amount written in bolivianos instead of centavos (22 for "Bs 22"). The quote is what gets checked against the
    // merchant's words, so it decides the amount.
    let item = raw;
    const quoted = typeof raw?.priceText === 'string' ? raw.priceText.trim().replace(/[.;,:]+$/, '') : '';
    const figure = /^(?:Bs\.?|BOB|USD|US\$)\s*(\d+(?:[.,]\d{1,2})?)$|^(\d+(?:[.,]\d{1,2})?)\s*(?:Bs\.?|BOB|USD|US\$)$/i.exec(quoted);
    const minor = figure ? Math.round(Number((figure[1] || figure[2]).replace(',', '.')) * 100) : undefined;
    if (raw && minor !== undefined) item = { ...raw, priceText: quoted, ...(Number.isSafeInteger(raw.amount) && raw.amount * 100 === minor ? { amount: minor } : {}) };
    if (!item || typeof item.priceText !== 'string' || !(current.includes(item.priceText) || priceStatedFor(current, item))) {
      const label = item && typeof item.name === 'string' && item.name.trim() ? `«${item.name.trim().slice(0, 60)}»` : 'un producto';
      throw new BadRequestException(`No encontré el precio de ${label} en lo que acordamos; YAPI no inventa precios. Escríbelo con su moneda, por ejemplo «Bs 35».`);
    }
    const quote = item.priceText.trim();
    const price = /^(?:Bs\.?|BOB|USD|US\$)\s*(\d+(?:[.,]\d{1,2})?)$|^(\d+(?:[.,]\d{1,2})?)\s*(?:Bs\.?|BOB|USD|US\$)$/i.exec(quote);
    const currency = /USD|US\$/i.test(quote) ? 'USD' : 'BOB';
    if (!price || Math.round(Number((price[1] || price[2]).replace(',', '.')) * 100) !== item.amount || item.currency !== currency) throw new BadRequestException('Escribe precios claros, por ejemplo «Bs 35» o «USD 12.50».');
    if (!Array.isArray(item.imageUrls) || item.imageUrls.some((url: string) => !allowedImages.has(url))) throw new BadRequestException('Usa únicamente fotos adjuntas de este comercio para los productos.');
    if (typeof item.name !== 'string' || !item.name.trim() || !Number.isSafeInteger(item.amount) || item.amount > 2147483647) throw new BadRequestException('Revisa el nombre y precio del producto.');
    const variants = requestedSourceVariants(item.variants, current, item.amount, item.currency, allowedImages);
    const product = plainToInstance(CreatePaymentLinkDto, { name: item.name, description: item.description, amount: item.amount, currency: item.currency, imageUrls: item.imageUrls, ...(variants ? { variants } : {}) });
    if (validateSync(product, { whitelist: true, forbidNonWhitelisted: true }).length) throw new BadRequestException('Revisa el nombre, descripción y precio del producto.');
    const subscriptionOptions = requestedSourceSubscriptions(item.subscriptionOptions, current);
    return subscriptionOptions ? Object.assign(product, { subscriptionOptions }) : product;
  });
}

export function requestedSourceProductOperations(
  value: unknown,
  instruction: string,
  currentItems: SourceCatalogItem[],
  allowedImages: Set<string>,
  options: { dropUnrequested?: boolean } = {},
): SourceProductOperation[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 6) throw new BadRequestException('Puedes cambiar o eliminar hasta 6 productos por mensaje.');
  const current = operationRequest(instruction);
  if (value.length && !hasProductMutationRequest(current) && !((sourceOptionRequest(current) || sourceSubscriptionRequest(current)) && /\b(?:add|agrega|añade|crea|ofrece|configura|activa|offer|enable|update|change|cambia|actualiza|pon|set|remove|delete|elimina|quita|stock|agotad[oa]s?|sold out)\b/i.test(current))) {
    // A generation that volunteers product changes nobody asked for loses them, not the whole attempt.
    if (options.dropUnrequested) return [];
    throw new BadRequestException('Solo cambio productos cuando lo pides explícitamente en el mensaje actual.');
  }
  const byId = new Map(currentItems.map(item => [item.id, item]));
  const named = productsNamedIn(current, currentItems);
  const existingImages = new Set(currentItems.flatMap(item => (item.imageUrls || []).map(canonicalUploadUrl)));
  const acceptedImages = new Set([...allowedImages, ...existingImages].map(canonicalUploadUrl));
  // During a generation, changes to products the merchant did not name are dropped; if nothing named is left the
  // request still fails, so the merchant (or the retry) hears which product to name.
  const kept = options.dropUnrequested ? value.filter(raw => raw && typeof raw === 'object' && named.has((raw as any).productId)) : value;
  const operations = kept.length || !options.dropUnrequested ? kept : value.slice(0, 1);
  return operations.map(raw => {
    if (!raw || typeof raw !== 'object' || typeof (raw as any).productId !== 'string' || !byId.has((raw as any).productId)) {
      throw new BadRequestException('Selecciona un producto existente de esta tienda para cambiarlo o eliminarlo.');
    }
    const item = raw as any;
    if (!named.has(item.productId)) throw new BadRequestException('Nombra el producto que quieres cambiar o eliminar; solo cambio los productos que mencionas.');
    if (item.action === 'delete') {
      if (!/\b(?:elimina|eliminar|borra|borrar|quita|quitar|remove|delete)\b/i.test(current)) {
        throw new BadRequestException('Para eliminar un producto, indícalo explícitamente.');
      }
      return { action: 'delete', productId: item.productId };
    }
    if (item.action !== 'update') throw new BadRequestException('La operación de producto no es válida.');
    const changes: Record<string, unknown> = {};
    for (const field of ['name', 'description', 'amount', 'currency', 'imageUrls', 'imagePositions', 'tags', 'stock', 'color']) {
      if (item[field] !== null && item[field] !== undefined) changes[field] = item[field];
    }
    for (const field of Object.keys(changes)) if (!['amount', 'currency'].includes(field)) assertFieldRequested(field, changes[field], current);
    const variantOperations = requestedVariantOperations(item.variantOperations, current, byId.get(item.productId)!, acceptedImages);
    const subscriptionOperations = requestedSubscriptionOperations(item.subscriptionOperations, current);
    if (!Object.keys(changes).length && !variantOperations.length && !subscriptionOperations.length) throw new BadRequestException('Indica qué información del producto quieres cambiar.');
    if (changes.amount !== undefined || changes.currency !== undefined) {
      if (typeof item.priceText !== 'string' || !current.includes(item.priceText)) {
        throw new BadRequestException('Indica el precio nuevo y la moneda; YAPI no inventa precios.');
      }
      parsePriceQuote(item.priceText, Number(changes.amount), String(changes.currency));
      // With several products named, the quoted price must follow this product's own name.
      const target = byId.get(item.productId)!;
      if (named.size > 1 && !priceStatedFor(current, { name: target.name, amount: changes.amount, currency: changes.currency })) {
        throw new BadRequestException('Escribe el precio nuevo junto al nombre de cada producto, por ejemplo «Café Bs 35».');
      }
    } else if (item.priceText != null) {
      throw new BadRequestException('El precio solo debe enviarse cuando estás cambiando el precio.');
    }
    if (Array.isArray(changes.imageUrls)) {
      changes.imageUrls = changes.imageUrls.map(canonicalUploadUrl);
      if ((changes.imageUrls as string[]).some(url => !acceptedImages.has(url))) {
        throw new BadRequestException('Usa únicamente fotos adjuntas o fotos que ya pertenecen a este producto.');
      }
    }
    const update = plainToInstance(UpdatePaymentLinkDto, changes);
    if (validateSync(update, { whitelist: true, forbidNonWhitelisted: true }).length) {
      throw new BadRequestException('Revisa la información nueva del producto.');
    }
    return { action: 'update', productId: item.productId, changes: update, ...(variantOperations.length ? { variantOperations } : {}), ...(subscriptionOperations.length ? { subscriptionOperations } : {}) };
  });
}
