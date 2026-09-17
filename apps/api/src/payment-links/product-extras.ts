import { BadRequestException } from '@nestjs/common';

export type SelectableExtra = { id: string; name: string; required: boolean; groupName?: string; pickCount?: number };
export const extraGroupKey = (name: string) => name.normalize('NFKC').toLocaleLowerCase('es');

/** Turns a cart line's extra ids into one extra per selection, in the product's own order.
 * An id may repeat only inside a "choose N" group (a box of 6 with 2 Matcha), and that group
 * must be filled exactly, so price, stock and the order text all count every pick. */
export function resolveSelectedExtras<T extends SelectableExtra>(productName: string, available: T[], extraIds: string[] = []): T[] {
  const counts = new Map<string, number>();
  for (const id of extraIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  if ([...counts.keys()].some(id => !available.some(extra => extra.id === id))) {
    throw new BadRequestException(`Un extra de "${productName}" ya no está disponible`);
  }
  const repeated = available.find(extra => !extra.pickCount && (counts.get(extra.id) ?? 0) > 1);
  if (repeated) throw new BadRequestException(`"${repeated.name}" solo puede elegirse una vez en "${productName}"`);
  const missingRequired = available.filter(extra => extra.required && !counts.has(extra.id));
  if (missingRequired.length) {
    throw new BadRequestException(`Elige ${missingRequired.map(extra => `"${extra.name}"`).join(', ')} para "${productName}"`);
  }
  const groups = new Map<string, { name: string; pickCount: number; picked: number }>();
  for (const extra of available) {
    if (!extra.groupName || !extra.pickCount) continue;
    const group = groups.get(extraGroupKey(extra.groupName)) ?? { name: extra.groupName, pickCount: extra.pickCount, picked: 0 };
    group.picked += counts.get(extra.id) ?? 0;
    groups.set(extraGroupKey(extra.groupName), group);
  }
  for (const group of groups.values()) {
    if (group.picked !== group.pickCount) {
      throw new BadRequestException(`Elige ${group.pickCount} en "${group.name}" para "${productName}" (elegiste ${group.picked})`);
    }
  }
  return available.flatMap(extra => Array<T>(counts.get(extra.id) ?? 0).fill(extra));
}

/** "Matcha ×2 + Pistacho ×2"; a single pick keeps its plain name. */
export function selectedExtrasLabel(extras: Array<{ id: string; name: string }>, separator = ' + '): string {
  const picks = new Map<string, { name: string; count: number }>();
  for (const extra of extras) {
    const pick = picks.get(extra.id);
    if (pick) pick.count++;
    else picks.set(extra.id, { name: extra.name, count: 1 });
  }
  return [...picks.values()].map(pick => pick.count > 1 ? `${pick.name} ×${pick.count}` : pick.name).join(separator);
}

/** How many units of each linked product the box picks in these cart items take (picks × line quantity). */
export function pickedProductQuantities<I extends { extraIds?: string[]; quantity: number }>(items: I[], extrasFor: (item: I) => Array<{ id: string; productId?: string }>): Map<string, number> {
  const picked = new Map<string, number>();
  for (const item of items) {
    const extras = extrasFor(item);
    for (const id of item.extraIds ?? []) {
      const productId = extras.find((extra) => extra.id === id)?.productId;
      if (productId) picked.set(productId, (picked.get(productId) ?? 0) + item.quantity);
    }
  }
  return picked;
}
