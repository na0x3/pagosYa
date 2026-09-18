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

const colorNames: Record<string, string> = {
  negro: '#292b29', black: '#292b29', blanco: '#fffdf7', white: '#fffdf7',
  rojo: '#b5443f', red: '#b5443f', azul: '#446a98', blue: '#446a98',
  verde: '#71866a', green: '#71866a', rosa: '#d89ca6', pink: '#d89ca6',
  beige: '#d8c5a9', crema: '#eee4c9', cream: '#eee4c9', salvia: '#8b987b', 'verde salvia': '#8b987b', sage: '#8b987b', coral: '#d98b70', marfil: '#f1e8d5', ivory: '#f1e8d5', marron: '#805d48', brown: '#805d48',
  gris: '#92928e', gray: '#92928e', grey: '#92928e', amarillo: '#e0b847', yellow: '#e0b847',
  naranja: '#d28349', orange: '#d28349', morado: '#80678f', purple: '#80678f',
  oliva: '#757853', olive: '#757853', lila: '#b7a0c6', lavanda: '#b7a0c6',
  dorado: '#b99a53', gold: '#b99a53', plateado: '#b7bcc0', silver: '#b7bcc0',
};
const normalizedOption = (value: string) => value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export function productOptionKind(name: string): 'color' | 'size' | 'choice' {
  const normalized = normalizedOption(name);
  if (/^(color|colores|colour|tono|tinte|acabado|finish)$/.test(normalized)) return 'color';
  if (/^(talla|tallas|tamano|tamanos|size|medida|medidas)$/.test(normalized)) return 'size';
  return 'choice';
}
/** Unknown color names keep their text label; never guess a product's actual finish. */
export function productOptionColor(group: string, value: string): string | undefined {
  if (productOptionKind(group) !== 'color') return undefined;
  return /^#[\da-f]{6}$/i.test(value) ? value : colorNames[normalizedOption(value)];
}
