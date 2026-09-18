import { BadRequestException, NotFoundException } from "@nestjs/common";
import { PaymentLinkStatus, Prisma, ProductSubscriptionCadence } from "@prisma/client";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { ProductSubscriptionOptionDto, RemoveProductSubscriptionsDto, UpdateProductSubscriptionsDto } from "./dto/update-product-subscriptions.dto";

export type ProductSubscriptionOperation =
  | { action: "upsert"; cadence: ProductSubscriptionCadence; discountPercent: number }
  | { action: "delete"; cadence: ProductSubscriptionCadence };

export function validateProductSubscriptions(value: UpdateProductSubscriptionsDto): ProductSubscriptionOptionDto[] {
  if (!value || validateSync(plainToInstance(UpdateProductSubscriptionsDto, value), { whitelist: true, forbidNonWhitelisted: true }).length) {
    throw new BadRequestException("Indica de una a tres cadencias distintas y descuentos enteros entre 0 y 99.");
  }
  return value.options;
}

export function validateRemovedSubscriptions(value: RemoveProductSubscriptionsDto): ProductSubscriptionCadence[] {
  if (!value || validateSync(plainToInstance(RemoveProductSubscriptionsDto, value), { whitelist: true, forbidNonWhitelisted: true }).length) {
    throw new BadRequestException("Indica de una a tres cadencias distintas para eliminar.");
  }
  return value.cadences;
}

/** Call inside a transaction after authenticating the store owner. Lock the
 * product before applying deltas so concurrent edits retain untouched options. */
export async function applyProductSubscriptionOperations(
  tx: Prisma.TransactionClient, storeId: string, paymentLinkId: string, operations: ProductSubscriptionOperation[],
) {
  if (!operations.length || operations.length > 3 || new Set(operations.map(option => option.cadence)).size !== operations.length
    || operations.some(option => !["upsert", "delete"].includes(option.action))) {
    throw new BadRequestException("Cambia cada cadencia una sola vez por mensaje.");
  }
  const upserts = operations.filter(option => option.action === "upsert");
  const deletes = operations.filter(option => option.action === "delete");
  if (upserts.length) validateProductSubscriptions({ options: upserts.map(({ cadence, discountPercent }) => ({ cadence, discountPercent })) });
  if (deletes.length) validateRemovedSubscriptions({ cadences: deletes.map(option => option.cadence) });
  const product = await tx.paymentLink.updateMany({
    where: { id: paymentLinkId, storeId, ...(upserts.length ? { status: PaymentLinkStatus.ACTIVE } : {}) },
    data: { updatedAt: new Date() },
  });
  if (product.count !== 1) throw new NotFoundException("Payment link not found or archived");
  for (const option of operations) {
    if (option.action === "delete") {
      await tx.productSubscriptionOption.deleteMany({ where: { paymentLinkId, cadence: option.cadence } });
    } else {
      await tx.productSubscriptionOption.upsert({
        where: { paymentLinkId_cadence: { paymentLinkId, cadence: option.cadence } },
        create: { paymentLinkId, cadence: option.cadence, discountPercent: option.discountPercent },
        update: { discountPercent: option.discountPercent },
      });
    }
  }
  return tx.productSubscriptionOption.findMany({ where: { paymentLinkId }, orderBy: { cadence: "asc" } });
}
