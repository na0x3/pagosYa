/** Reads product variants and extras from stored JSON and applies active discounts. */
import { Prisma } from "@prisma/client";
import type { ProductVariant } from "../payment-links/product-variants";

export type ProductExtra = {
  id: string;
  name: string;
  amount: number;
  required: boolean;
  groupName?: string;
  freeAllowance?: number;
  pickCount?: number;
  productId?: string;
  inventoryKey?: string;
  inventoryName?: string;
  stock?: number;
};

export function readStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export function readProductVariants(value: Prisma.JsonValue): ProductVariant[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is ProductVariant =>
      !!entry &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      typeof (entry as Record<string, unknown>).id === "string" &&
      typeof (entry as Record<string, unknown>).name === "string" &&
      Number.isInteger((entry as Record<string, unknown>).amount) &&
      ((entry as Record<string, unknown>).amount as number) >= 0 &&
      (!("stock" in entry) ||
        (entry as Record<string, unknown>).stock === null ||
        (Number.isInteger((entry as Record<string, unknown>).stock) &&
          ((entry as Record<string, unknown>).stock as number) >= 0)),
  );
}

export function readProductExtras(value: Prisma.JsonValue): ProductExtra[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is ProductExtra =>
      !!entry &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      typeof (entry as Record<string, unknown>).id === "string" &&
      typeof (entry as Record<string, unknown>).name === "string" &&
      Number.isInteger((entry as Record<string, unknown>).amount) &&
      ((entry as Record<string, unknown>).amount as number) >= 0 &&
      typeof (entry as Record<string, unknown>).required === "boolean" &&
      (!("groupName" in entry) || typeof (entry as Record<string, unknown>).groupName === "string") &&
      (!("freeAllowance" in entry) || (Number.isInteger((entry as Record<string, unknown>).freeAllowance) && ((entry as Record<string, unknown>).freeAllowance as number) >= 0)) &&
      (!("productId" in entry) || typeof (entry as Record<string, unknown>).productId === "string") &&
      (!("pickCount" in entry) || (Number.isInteger((entry as Record<string, unknown>).pickCount) && ((entry as Record<string, unknown>).pickCount as number) >= 1)) &&
      (!("inventoryKey" in entry) || typeof (entry as Record<string, unknown>).inventoryKey === "string") &&
      (!("inventoryName" in entry) || typeof (entry as Record<string, unknown>).inventoryName === "string") &&
      (!("stock" in entry) || (Number.isInteger((entry as Record<string, unknown>).stock) && ((entry as Record<string, unknown>).stock as number) >= 0)),
  );
}

export function selectedExtrasAmount(extras: ProductExtra[]): number {
  const usedByGroup = new Map<string, number>();
  return extras.reduce((sum, extra) => {
    if (!extra.groupName) return sum + extra.amount;
    const key = extra.groupName.normalize("NFKC").toLocaleLowerCase("es");
    const used = usedByGroup.get(key) ?? 0;
    usedByGroup.set(key, used + 1);
    return sum + (used < (extra.freeAllowance ?? 0) ? 0 : extra.amount);
  }, 0);
}

export type DiscountableProduct = {
  discountPercent: number | null;
  discountStartsAt: Date | null;
  discountEndsAt: Date | null;
};

export function activeDiscountPercent(product: DiscountableProduct, now = new Date()): number | null {
  if (
    !Number.isInteger(product.discountPercent) ||
    product.discountPercent === null ||
    product.discountPercent < 1 ||
    product.discountPercent > 99 ||
    !product.discountStartsAt ||
    !product.discountEndsAt ||
    now < product.discountStartsAt ||
    now >= product.discountEndsAt
  ) return null;
  return product.discountPercent;
}

export function discountedProductAmount(product: DiscountableProduct, amount: number, now = new Date()): number {
  const percent = activeDiscountPercent(product, now);
  return percent === null ? amount : Math.max(0, Math.round(amount * (100 - percent) / 100));
}
