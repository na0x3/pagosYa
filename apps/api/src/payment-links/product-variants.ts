import { BadRequestException } from '@nestjs/common';
import { customAlphabet } from 'nanoid';
import type { ProductVariantDto } from './dto/create-payment-link.dto';

const variantIdPart = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);
export type ProductVariant = { id: string; name: string; amount: number; stock?: number | null; options?: Array<{ name: string; value: string }>; imageUrl?: string };
const key = (value: string) => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

export function normalizeProductVariants(variants: ProductVariantDto[] | undefined, existing: ProductVariant[] | null = null): ProductVariant[] {
  if (!variants?.length) return [];
  if (variants.length > 64) throw new BadRequestException('Usa hasta 64 combinaciones por producto.');
  if (variants.length < 2 && !variants[0].options?.length) throw new BadRequestException('Agrega por lo menos 2 opciones o elimina las opciones del producto');
  const names = new Set<string>(), ids = new Set<string>(), combinations = new Set<string>();
  let dimensions: string | undefined;
  let dimensionNames: string[] = [];
  const optionNames = new Map<string,string>();
  const normalized = variants.map(variant => {
    const previous = existing?.find(item => item.id === variant.id);
    if (existing !== null && variant.id && !previous) throw new BadRequestException('Una opción del producto ya no existe');
    const options = variant.options ?? previous?.options;
    const selected = options?.map(option => ({ name: option.name.trim(), value: option.value.trim() }));
    if (selected?.length) {
      if (selected.length > 3 || selected.some(option => !option.name || !option.value || option.name.length > 40 || option.value.length > 40)
        || new Set(selected.map(option => key(option.name))).size !== selected.length) throw new BadRequestException('Cada combinación necesita grupos únicos y valores completos.');
      const groupKey = JSON.stringify(selected.map(option => key(option.name)));
      if (dimensions === undefined) { dimensions = groupKey; dimensionNames = selected.map(option=>option.name); }
      if (dimensions !== groupKey) throw new BadRequestException('Todas las combinaciones deben usar los mismos grupos en el mismo orden.');
      selected.forEach((option,index)=>{
        option.name=dimensionNames[index];
        const valueKey=`${index}:${key(option.value)}`;
        if (!optionNames.has(valueKey)) optionNames.set(valueKey,option.value);
        option.value=optionNames.get(valueKey)!;
      });
      const combination = JSON.stringify(selected.map(option => key(option.value)));
      if (combinations.has(combination)) throw new BadRequestException('Esta combinación de opciones está repetida.');
      combinations.add(combination);
    }
    const name = selected?.length ? selected.map(option => option.value).join(' / ') : variant.name.trim();
    if (!name || name.length > 140 || names.has(key(name))) throw new BadRequestException(`La opción "${name}" está vacía o repetida`);
    if (!Number.isSafeInteger(variant.amount) || variant.amount < 0 || variant.amount > 2147483647) throw new BadRequestException('Revisa el precio de cada opción.');
    names.add(key(name));
    const id = previous?.id || `var_${variantIdPart()}`;
    if (ids.has(id)) throw new BadRequestException('Una opción aparece más de una vez.');
    ids.add(id);
    const result: ProductVariant = { id, name, amount: variant.amount,
      ...(selected?.length ? { options: selected } : {}),
      ...((variant.imageUrl ?? previous?.imageUrl) ? { imageUrl: variant.imageUrl ?? previous?.imageUrl } : {}),
    };
    if (existing === null || 'stock' in variant) result.stock = variant.stock ?? null;
    else if (previous && 'stock' in previous) result.stock = previous.stock;
    if (result.stock !== undefined && result.stock !== null && (!Number.isInteger(result.stock) || result.stock < 0 || result.stock > 1000000)) throw new BadRequestException('Revisa el stock de cada combinación.');
    return result;
  });
  if (dimensions && normalized.some(variant => !variant.options?.length)) throw new BadRequestException('No mezcles combinaciones estructuradas con opciones sin grupos.');
  if (normalized.some(variant => variant.stock === undefined) && normalized.some(variant => variant.stock !== undefined)) throw new BadRequestException('Asigna stock a todas las opciones para dejar de usar el stock compartido');
  return normalized;
}

export function totalVariantStock(variants: ProductVariant[]): number | null {
  return variants.some(variant => variant.stock == null) ? null : variants.reduce((sum, variant) => sum + variant.stock!, 0);
}
