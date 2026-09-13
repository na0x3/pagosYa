export type OptionVariant = { id: string; options?: Array<{ name: string; value: string }> };
/** Groups come only from actual purchasable combinations, never a Cartesian guess. */
export function productOptionGroups(variants: OptionVariant[]) {
  const first = variants[0]?.options;
  if (!first?.length || variants.some(variant=>!variant.options || variant.options.length !== first.length || variant.options.some((option,index)=>option.name !== first[index].name))) return [];
  return first.map((option,index)=>({ name:option.name, values:[...new Set(variants.map(variant=>variant.options![index].value))] }));
}
export function matchingOptionVariant<T extends OptionVariant>(variants: T[], selections: Record<string,string>): T | undefined {
  return variants.find(variant=>variant.options?.length && variant.options.every(option=>selections[option.name]===option.value));
}
export function optionValueAvailable<T extends OptionVariant>(variants: T[], selections: Record<string,string>, group: string, value: string, available: (variant:T)=>boolean) {
  return variants.some(variant=>available(variant) && variant.options?.some(option=>option.name===group&&option.value===value)
    && variant.options.every(option=>option.name===group || !selections[option.name] || selections[option.name]===option.value));
}
