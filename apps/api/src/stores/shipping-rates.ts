import { BadRequestException } from '@nestjs/common';

export type ShippingRate = { countryCodes?: string[]; postalPrefixes?: string[]; id: string; name: string; fee: number; currency: string; minimumOrder: number; maximumOrder: number | null; freeAbove: number | null; minimumWeightGrams: number | null; maximumWeightGrams: number | null; isActive: boolean };
export function quoteShipping(rates: ShippingRate[], input: { shippingCountry?: string; shippingPostalCode?: string; zoneId?: string; currency: string; subtotal: number; weightGrams: number | null }) {
  const eligible = rates.filter(rate => rate.isActive && (!rate.countryCodes?.length || rate.countryCodes.includes(input.shippingCountry || ''))
    && (!rate.postalPrefixes?.length || !!input.shippingPostalCode && rate.postalPrefixes.some(prefix => input.shippingPostalCode!.replace(/[ -]/g, '').toUpperCase().startsWith(prefix)))
    && rate.currency === input.currency && input.subtotal >= rate.minimumOrder
    && (rate.maximumOrder === null || input.subtotal <= rate.maximumOrder)
    && (rate.minimumWeightGrams === null || input.weightGrams !== null && input.weightGrams >= rate.minimumWeightGrams)
    && (rate.maximumWeightGrams === null || input.weightGrams !== null && input.weightGrams <= rate.maximumWeightGrams));
  const options = eligible.map(rate => ({ id: rate.id, name: rate.name, amount: rate.freeAbove !== null && input.subtotal >= rate.freeAbove ? 0 : rate.fee, currency: rate.currency }));
  const selected = options.find(option => option.id === input.zoneId);
  if (input.zoneId && !selected) throw new BadRequestException('La opción de envío no está disponible para este pedido.');
  return { options, selected: selected ?? null };
}
