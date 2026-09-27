import type { Prisma } from '@prisma/client';
import type { StoreEventType } from './extension';
import { EXTENSIONS, type ExtensionRegistry } from './registry';

type Payload = Record<string, unknown>;

/**
 * Outbox for extensions (spec 2026-09-27 §6): called inside the transaction of the change, so the event
 * exists exactly when the change does. Only installations whose extension listens get a delivery, and a
 * function payload is built only then, so a payment pays no query while no extension listens.
 */
export async function emitStoreEvent(tx: Prisma.TransactionClient, storeId: string, type: StoreEventType, payload: Payload | (() => Promise<Payload>), registry: ExtensionRegistry = EXTENSIONS) {
  const listening = registry.filter(manifest => manifest.onEvent).map(manifest => manifest.id);
  if (!listening.length) return;
  const installed = await tx.storeExtension.findMany({ where: { storeId, enabled: true, extensionId: { in: listening } }, select: { extensionId: true } });
  if (!installed.length) return;
  const body = typeof payload === 'function' ? await payload() : payload;
  const event = await tx.storeEvent.create({ data: { storeId, type, payload: body as Prisma.InputJsonValue } });
  await tx.extensionDelivery.createMany({ data: installed.map(item => ({ eventId: event.id, storeId, extensionId: item.extensionId })) });
}

type CartLine = { name?: unknown; variantName?: unknown; quantity?: unknown; unitAmount?: unknown };

/** What an extension may know about an order: what the buyer gave at checkout, nothing else. */
export async function orderEventPayload(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.storeOrder.findUniqueOrThrow({ where: { id: orderId }, include: { paymentIntent: { select: { livemode: true, customerName: true, customerEmail: true, customerPhone: true } } } });
  const lines = (Array.isArray(order.items) ? order.items as CartLine[] : []).map(line => ({ name: String(line.name ?? ''), variantName: typeof line.variantName === 'string' ? line.variantName : null, quantity: Number(line.quantity) || 0, unitAmount: Number(line.unitAmount) || 0 }));
  return {
    orderId: order.id, status: order.status, amount: order.amount, currency: order.currency, livemode: order.paymentIntent.livemode, fulfillmentMethod: order.fulfillmentMethod, lines,
    buyer: { name: order.paymentIntent.customerName, email: order.paymentIntent.customerEmail, phone: order.paymentIntent.customerPhone },
    delivery: order.shippingStreet ? { department: order.shippingDepartment, city: order.shippingCity, street: order.shippingStreet, references: order.shippingReferences, recipientName: order.recipientName, recipientPhone: order.recipientPhone } : null,
  };
}
