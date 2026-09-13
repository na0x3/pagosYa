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

export const sourceProductsSchema = {
  type: 'array', maxItems: 6, items: {
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

function operationRequest(instruction: string): string {
  return instruction.split('Pedido actual del comercio:').at(-1)!.trim();
}

function hasProductMutationRequest(instruction: string): boolean {
  return /\b(?:cambia|cambiar|actualiza|actualizar|modifica|modificar|edita|editar|renombra|renombrar|pon|asigna|usa|elimina|eliminar|borra|borrar|quita|quitar|remove|delete|update|edit|rename)\b/i.test(instruction)
    && /\b(?:producto|productos|art[ií]culo|art[ií]culos|product|products|cat[aá]logo|foto|imagen|nombre|precio|descripci[oó]n)\b/i.test(instruction);
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
  if (!Array.isArray(value) || value.length > 6) throw new BadRequestException('Puedes crear hasta 6 productos por mensaje.');
  const current = instruction.split('Pedido actual del comercio:').at(-1)!.trim();
  if (value.length && !/(?:crea|agrega|añad|anad|create|add|inclu|vend[oe]).{0,100}(?:producto|art[ií]culo|product|cat[aá]logo|camiseta|camisa|shirt|vestido|pantal[oó]n|zapato)|(?:producto|product).{0,60}(?:crea|agrega|añad|create|add)/is.test(current)) {
    throw new BadRequestException('Para crear productos, pídelo con su nombre y precio.');
  }
  return value.map(item => {
    if (!item || typeof item.priceText !== 'string' || !current.includes(item.priceText)) throw new BadRequestException('Indica el precio y la moneda de cada producto; YAPI no inventa precios.');
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
): SourceProductOperation[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 6) throw new BadRequestException('Puedes cambiar o eliminar hasta 6 productos por mensaje.');
  const current = operationRequest(instruction);
  if (value.length && !hasProductMutationRequest(current) && !((sourceOptionRequest(current) || sourceSubscriptionRequest(current)) && /\b(?:add|agrega|añade|crea|ofrece|configura|activa|offer|enable|update|change|cambia|actualiza|pon|set|remove|delete|elimina|quita|stock|agotad[oa]s?|sold out)\b/i.test(current))) {
    throw new BadRequestException('Solo cambio productos cuando lo pides explícitamente en el mensaje actual.');
  }
  const byId = new Map(currentItems.map(item => [item.id, item]));
  const existingImages = new Set(currentItems.flatMap(item => (item.imageUrls || []).map(canonicalUploadUrl)));
  const acceptedImages = new Set([...allowedImages, ...existingImages].map(canonicalUploadUrl));
  return value.map(raw => {
    if (!raw || typeof raw !== 'object' || typeof (raw as any).productId !== 'string' || !byId.has((raw as any).productId)) {
      throw new BadRequestException('Selecciona un producto existente de esta tienda para cambiarlo o eliminarlo.');
    }
    const item = raw as any;
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
    const variantOperations = requestedVariantOperations(item.variantOperations, current, byId.get(item.productId)!, acceptedImages);
    const subscriptionOperations = requestedSubscriptionOperations(item.subscriptionOperations, current);
    if (!Object.keys(changes).length && !variantOperations.length && !subscriptionOperations.length) throw new BadRequestException('Indica qué información del producto quieres cambiar.');
    if (changes.amount !== undefined || changes.currency !== undefined) {
      if (typeof item.priceText !== 'string' || !current.includes(item.priceText)) {
        throw new BadRequestException('Indica el precio nuevo y la moneda; YAPI no inventa precios.');
      }
      parsePriceQuote(item.priceText, Number(changes.amount), String(changes.currency));
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
