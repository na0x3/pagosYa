import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderFulfillmentStatus, Prisma, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PrivateFilesService } from '../commerce-platform/private-files.service';
import { queueStoreEmail } from '../stores/email-workspace.config';
import { createOrderTrackingToken } from '../consumer/order-tracking-token';
import { CarrierRegistry } from './carriers/carrier-registry';
import type { BookInput, ShipmentParty } from './carriers/carrier';
import type { Parcel } from './parcel';
import { renderWaybillPdf } from './waybill-pdf';

// Ruling R1: DEVELOPMENT_ORDER_TRACKING_SECRET is not exported from
// ../consumer/order-tracking-token (it's a local const in payment-intents.service.ts:27).
// Redefine it locally rather than importing it.
const DEVELOPMENT_ORDER_TRACKING_SECRET = "development-only-order-tracking-secret-change-me";

export const BOOKING_BACKOFF_MS = [60_000, 300_000, 1_800_000];
const MAX_ATTEMPTS = BOOKING_BACKOFF_MS.length;
const CANCELABLE: ShipmentStatus[] = ['BOOKING', 'BOOKED', 'FAILED'];
const TRACKABLE: ShipmentStatus[] = ['BOOKED', 'PICKED_UP', 'IN_TRANSIT'];
/** Orders a shipment may still be booked for. Anything else (canceled, refunded, ...) cancels the shipment instead. */
const SHIPPABLE_ORDER: OrderFulfillmentStatus[] = ['PAID', 'PREPARING'];

/** Text for a log line that never throws: String() of anything, falling back for null-prototype objects. */
export const errorText = (error: unknown): string => {
  if (error instanceof Error) return error.stack ?? error.message;
  try { return String(error); } catch { return Object.prototype.toString.call(error); }
};

/** Never surface raw internal errors (SDK/Prisma dumps, emails) to merchants. Modelled on retention.service.ts's safeDeliveryError. */
const safeShipmentError = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'No se pudo reservar el envío.';
  return message.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[correo oculto]').slice(0, 300);
};

export type ShipmentView = {
  id: string; status: ShipmentStatus; carrier: { id: string; code: string; name: string; mode: string };
  trackingNumber: string | null; trackingUrl: string | null; hasLabel: boolean; lastError: string | null;
  bookingAttempts: number; quotedAmount: number; currency: string;
  events: Array<{ status: ShipmentStatus; description: string | null; location: string | null; occurredAt: Date }>;
};

type StoreLocation = { id: string; name?: string; address?: string | null; department?: string; city?: string; lat?: number; lng?: number };
type OrderRef = { id: string; storeId: string; storeName: string; paymentIntentId: string; amount: number; currency: string };

@Injectable()
export class ShipmentsService {
  private readonly logger = new Logger(ShipmentsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly carriers: CarrierRegistry,
    private readonly files: PrivateFilesService,
    private readonly config: ConfigService,
  ) {}

  static trackingUrl(template: string | null | undefined, trackingNumber: string | null | undefined): string | null {
    return template && trackingNumber ? template.replace('{tracking}', encodeURIComponent(trackingNumber)) : null;
  }

  private view(s: any): ShipmentView {
    return {
      id: s.id, status: s.status,
      carrier: { id: s.carrier.id, code: s.carrier.code, name: s.carrier.name, mode: s.carrier.mode },
      trackingNumber: s.trackingNumber ?? null,
      trackingUrl: ShipmentsService.trackingUrl(s.carrier.trackingUrlTemplate, s.trackingNumber),
      hasLabel: !!s.labelFileId, lastError: s.lastError ?? null, bookingAttempts: s.bookingAttempts,
      quotedAmount: s.quotedAmount, currency: s.currency,
      events: (s.events ?? []).map((e: any) => ({ status: e.status, description: e.description ?? null, location: e.location ?? null, occurredAt: e.occurredAt })),
    };
  }

  private async owned(merchantId: string, shipmentId: string): Promise<any> {
    const shipment = await this.prisma.shipment.findFirst({ where: { id: shipmentId, merchantId }, include: { carrier: true, events: { orderBy: { occurredAt: 'asc' } }, order: true } });
    if (!shipment) throw new NotFoundException('Envío no encontrado');
    return shipment;
  }

  /** Moves the order forward only from states where that move is legal; never backwards. */
  private async advanceOrder(tx: Prisma.TransactionClient, order: OrderRef, to: OrderFulfillmentStatus, from: OrderFulfillmentStatus[], details?: string) {
    const changed = await tx.storeOrder.updateMany({ where: { id: order.id, status: { in: from } }, data: { status: to } });
    if (!changed.count) return;
    const event = await tx.storeOrderStatusEvent.create({ data: { orderId: order.id, status: to } });
    if (to !== 'SHIPPED' && to !== 'DELIVERED') return;
    const payment = await tx.paymentIntent.findUnique({ where: { id: order.paymentIntentId } });
    if (payment?.livemode) await queueStoreEmail(tx, order.storeId, to, event.id, payment.customerEmail, { store: order.storeName, order: order.id, customer: payment.customerName || 'cliente', amount: `${(order.amount / 100).toFixed(2)} ${order.currency}`, ...(details ? { details } : {}) });
  }

  /**
   * The single "may this shipment be booked?" guard for book(), retry() and switchCarrier():
   * the order must still be PAID or PREPARING and its payment must not be fully refunded.
   */
  private async orderStillShippable(order: { status: OrderFulfillmentStatus; paymentIntentId: string }): Promise<boolean> {
    if (!SHIPPABLE_ORDER.includes(order.status)) return false;
    const payment = await this.prisma.paymentIntent.findUnique({ where: { id: order.paymentIntentId }, select: { amount: true } });
    const refunded = await this.prisma.transaction.aggregate({ where: { paymentIntentId: order.paymentIntentId, type: 'REFUND', status: 'SUCCEEDED' }, _sum: { amount: true } });
    const refundedAmount = refunded._sum.amount ?? 0;
    return !(payment && refundedAmount > 0 && refundedAmount >= payment.amount);
  }

  /** Cancels a not-yet-booked shipment whose order can no longer ship ('Envío cancelado con el pedido'). */
  private async cancelUnshippable(orderId: string): Promise<void> {
    await this.prisma.$transaction(tx => this.cancelForOrder(tx, orderId));
  }

  private buyerTrackingLink(orderId: string) {
    const origin = (this.config.get<string>('app.checkoutOrigin') ?? 'http://localhost:5174').replace(/\/$/, '');
    return `${origin}/track/${createOrderTrackingToken(orderId, this.config.get<string>('app.orderTrackingSecret') ?? DEVELOPMENT_ORDER_TRACKING_SECRET)}`;
  }

  async book(shipmentId: string): Promise<void> {
    const shipment: any = await this.prisma.shipment.findUnique({ where: { id: shipmentId }, include: { carrier: true, order: true } });
    if (!shipment || shipment.status !== 'BOOKING') return;
    if (!(await this.orderStillShippable(shipment.order))) { await this.cancelUnshippable(shipment.orderId); return; }
    const attempt = shipment.bookingAttempts + 1;
    try {
      const order = shipment.order;
      const store: any = await this.prisma.store.findUnique({ where: { id: shipment.storeId }, select: { name: true, contactPhone: true, locations: true, shippingPrepMinutes: true } });
      const locations = (Array.isArray(store?.locations) ? store.locations : []) as StoreLocation[];
      const branch = locations.find(l => l.id === order.fulfillmentLocationId) ?? locations[0];
      const origin: ShipmentParty = { name: store?.name ?? order.storeName, phone: store?.contactPhone ?? '', department: branch?.department ?? '', city: branch?.city ?? '', street: branch?.address ?? '', lat: branch?.lat ?? null, lng: branch?.lng ?? null };
      const destination: ShipmentParty = { name: order.recipientName ?? '', phone: order.recipientPhone ?? '', department: order.shippingDepartment ?? '', city: order.shippingCity ?? '', street: order.shippingStreet ?? '', references: order.shippingReferences ?? undefined, lat: order.shippingLat, lng: order.shippingLng };
      const adapter = this.carriers.get(shipment.carrier.code, shipment.carrier.mode);
      const items = (Array.isArray(order.items) ? order.items : []).map((i: any) => ({ name: String(i.name ?? 'Producto'), quantity: Number(i.quantity) || 1 }));
      const pickupAt = adapter.supportsScheduledPickup ? new Date(Date.now() + (store?.shippingPrepMinutes ?? 60) * 60_000) : null;
      const parcel = (order.parcel ?? null) as unknown as Parcel | null;
      const input: BookInput = { shipmentId: shipment.id, orderReference: order.id.slice(-8).toUpperCase(), origin, destination, weightGrams: parcel?.weightGrams ?? null, parcel, declaredAmount: order.amount - shipment.quotedAmount, currency: shipment.currency, pickupAt, items };
      const result = await adapter.book(input, null);
      const pdf = result.labelPdf ?? (result.needsWaybill ? await renderWaybillPdf({ ...input, carrierName: shipment.carrier.name, storeName: store?.name ?? order.storeName }) : null);
      const labelFileId = pdf ? await this.files.put(pdf, 'application/pdf') : null;
      await this.prisma.$transaction(async tx => {
        const updated = await tx.shipment.updateMany({ where: { id: shipment.id, status: 'BOOKING' }, data: { status: 'BOOKED', bookingAttempts: attempt, nextAttemptAt: null, lastError: null, labelFileId, trackingNumber: result.trackingNumber, carrierRef: result.carrierRef, actualCost: result.cost, pickupScheduledAt: pickupAt, bookedAt: new Date() } });
        if (!updated.count) return;
        await tx.shipmentEvent.create({ data: { shipmentId: shipment.id, status: 'BOOKED', description: `Reservado con ${shipment.carrier.name}` } });
        await this.advanceOrder(tx, order, 'PREPARING', ['PAID']);
      });
    } catch (error) {
      // Logging must never throw (a circular non-Error would break JSON.stringify and skip recording the attempt).
      this.logger.warn(`Booking ${shipment.id} attempt ${attempt} failed: ${errorText(error)}`);
      const message = safeShipmentError(error);
      const failed = attempt >= MAX_ATTEMPTS;
      await this.prisma.shipment.updateMany({ where: { id: shipment.id, status: 'BOOKING' }, data: { bookingAttempts: attempt, lastError: message, status: failed ? 'FAILED' : 'BOOKING', nextAttemptAt: failed ? null : new Date(Date.now() + BOOKING_BACKOFF_MS[attempt - 1]) } });
    }
  }

  async setTrackingNumber(merchantId: string, shipmentId: string, trackingNumber: string): Promise<ShipmentView> {
    const shipment = await this.owned(merchantId, shipmentId);
    const value = trackingNumber.trim();
    if (!/^[A-Za-z0-9 ._\/-]{3,60}$/.test(value)) throw new BadRequestException('Escribe un número de seguimiento válido.');
    if (!TRACKABLE.includes(shipment.status)) throw new BadRequestException('Este envío ya no acepta número de seguimiento.');
    await this.prisma.$transaction(async tx => {
      const changed = await tx.shipment.updateMany({ where: { id: shipment.id, status: { in: TRACKABLE } }, data: { trackingNumber: value, status: 'IN_TRANSIT' } });
      if (!changed.count) throw new BadRequestException('El envío cambió; vuelve a cargarlo.');
      await tx.shipmentEvent.create({ data: { shipmentId: shipment.id, status: 'IN_TRANSIT', description: `Entregado a ${shipment.carrier.name} · ${value}` } });
      const url = ShipmentsService.trackingUrl(shipment.carrier.trackingUrlTemplate, value);
      await this.advanceOrder(tx, shipment.order, 'SHIPPED', ['PAID', 'PREPARING'], `Courier: ${shipment.carrier.name}\nNº de seguimiento: ${value}${url ? `\nRastrea en el courier: ${url}` : ''}\nSigue tu pedido: ${this.buyerTrackingLink(shipment.order.id)}`);
    });
    return this.view(await this.owned(merchantId, shipmentId));
  }

  async markDelivered(merchantId: string, shipmentId: string): Promise<ShipmentView> {
    const shipment = await this.owned(merchantId, shipmentId);
    if (!TRACKABLE.includes(shipment.status)) throw new BadRequestException('Este envío no se puede marcar como entregado.');
    await this.prisma.$transaction(async tx => {
      const changed = await tx.shipment.updateMany({ where: { id: shipment.id, status: { in: TRACKABLE } }, data: { status: 'DELIVERED', deliveredAt: new Date() } });
      if (!changed.count) throw new BadRequestException('El envío cambió; vuelve a cargarlo.');
      await tx.shipmentEvent.create({ data: { shipmentId: shipment.id, status: 'DELIVERED', description: 'Entregado al destinatario' } });
      await this.advanceOrder(tx, shipment.order, 'DELIVERED', ['PAID', 'PREPARING', 'SHIPPED']);
    });
    return this.view(await this.owned(merchantId, shipmentId));
  }

  /** A FAILED shipment of a canceled or refunded order is canceled, never re-armed. */
  private async refuseUnshippable(shipment: { orderId: string; order: { status: OrderFulfillmentStatus; paymentIntentId: string } }): Promise<void> {
    if (await this.orderStillShippable(shipment.order)) return;
    await this.cancelUnshippable(shipment.orderId);
    throw new BadRequestException('El pedido fue cancelado o reembolsado; cancelamos el envío.');
  }

  async retry(merchantId: string, shipmentId: string): Promise<ShipmentView> {
    const shipment = await this.owned(merchantId, shipmentId);
    if (shipment.status !== 'FAILED') throw new BadRequestException('Solo se reintentan envíos fallidos.');
    await this.refuseUnshippable(shipment);
    const changed = await this.prisma.shipment.updateMany({ where: { id: shipment.id, status: 'FAILED' }, data: { status: 'BOOKING', bookingAttempts: 0, nextAttemptAt: new Date(), lastError: null } });
    if (!changed.count) throw new BadRequestException('El envío cambió; vuelve a cargarlo.');
    return this.view(await this.owned(merchantId, shipmentId));
  }

  async switchCarrier(merchantId: string, shipmentId: string, carrierId: string): Promise<ShipmentView> {
    const shipment = await this.owned(merchantId, shipmentId);
    if (shipment.status !== 'FAILED') throw new BadRequestException('Solo se cambia el courier de envíos fallidos.');
    await this.refuseUnshippable(shipment);
    const carrier = await this.prisma.shippingCarrier.findFirst({ where: { id: carrierId, isActive: true } });
    if (!carrier || carrier.mode !== 'MANUAL') throw new BadRequestException('Elige un courier manual activo.');
    const changed = await this.prisma.shipment.updateMany({ where: { id: shipment.id, status: 'FAILED' }, data: { carrierId: carrier.id, accountType: 'MERCHANT', status: 'BOOKING', bookingAttempts: 0, nextAttemptAt: new Date(), lastError: null } });
    if (!changed.count) throw new BadRequestException('El envío cambió; vuelve a cargarlo.');
    return this.view(await this.owned(merchantId, shipmentId));
  }

  /** Runs inside the order-cancel/refund transaction. Picked-up parcels are handled by returns, not here. */
  async cancelForOrder(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
    const shipment: any = await tx.shipment.findUnique({ where: { orderId }, include: { carrier: true } });
    if (!shipment || !CANCELABLE.includes(shipment.status)) return;
    if (shipment.status === 'BOOKED') {
      // Phase 2: a non-zero fee becomes a ShipmentCharge + cancellationFeeJournal.
      await this.carriers.get(shipment.carrier.code, shipment.carrier.mode).cancel({ carrierRef: shipment.carrierRef ?? null, trackingNumber: shipment.trackingNumber ?? null }, null);
    }
    const changed = await tx.shipment.updateMany({ where: { id: shipment.id, status: { in: CANCELABLE } }, data: { status: 'CANCELED', nextAttemptAt: null } });
    if (changed.count) await tx.shipmentEvent.create({ data: { shipmentId: shipment.id, status: 'CANCELED', description: 'Envío cancelado con el pedido' } });
  }

  async viewForMerchant(merchantId: string, orderId: string): Promise<ShipmentView | null> {
    const shipment = await this.prisma.shipment.findFirst({ where: { orderId, merchantId }, include: { carrier: true, events: { orderBy: { occurredAt: 'asc' } } } });
    return shipment ? this.view(shipment) : null;
  }

  async label(merchantId: string, shipmentId: string): Promise<Buffer> {
    const shipment = await this.owned(merchantId, shipmentId);
    if (!shipment.labelFileId) throw new NotFoundException('Este envío todavía no tiene guía.');
    return this.files.get(shipment.labelFileId);
  }
}
