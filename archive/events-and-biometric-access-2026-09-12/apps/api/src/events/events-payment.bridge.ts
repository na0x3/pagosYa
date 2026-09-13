import { BadRequestException } from "@nestjs/common";
import { AdmissionSource, BiometricEnrollmentStatus, EventPaymentMethod, EventPaymentStatus, Prisma, TicketReservationStatus } from "@prisma/client";
import { admissionCode } from "./event-security";

type PaymentSuccess = { id: string; merchantId: string; amount: number; currency: string; metadata: Prisma.JsonValue };

function reservationIdFrom(metadata: Prisma.JsonValue): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const event = (metadata as Prisma.JsonObject).eventReservation;
  return event && typeof event === "object" && !Array.isArray(event) && typeof event.reservationId === "string" ? event.reservationId : null;
}

/** Runs inside PaymentIntentsService's existing success transaction. */
export async function completeEventReservationPayment(tx: Prisma.TransactionClient, payment: PaymentSuccess): Promise<void> {
  const reservationId = reservationIdFrom(payment.metadata);
  if (!reservationId) return;
  const rows = await tx.$queryRaw<Array<{ id: string; merchantId: string; eventId: string; status: TicketReservationStatus; totalAmount: number; currency: string; expiresAt: Date; managementTokenHash: string }>>`
    SELECT id, "merchantId", "eventId", status, "totalAmount", currency, "expiresAt", "managementTokenHash"
    FROM "TicketReservation" WHERE id = ${reservationId} FOR UPDATE
  `;
  const reservation = rows[0];
  if (!reservation) throw new BadRequestException("Event reservation not found");
  if (reservation.merchantId !== payment.merchantId || reservation.totalAmount !== payment.amount || reservation.currency !== payment.currency) {
    throw new BadRequestException("Payment does not match event reservation");
  }
  const existing = await tx.admissionOrder.findUnique({ where: { reservationId } });
  if (reservation.status === TicketReservationStatus.COMPLETED && existing?.paymentIntentId === payment.id) return;
  if (reservation.status !== TicketReservationStatus.RESERVED || reservation.expiresAt <= new Date()) {
    throw new BadRequestException("Event reservation is not payable");
  }
  const items = await tx.ticketReservationItem.findMany({ where: { reservationId } });
  const order = await tx.admissionOrder.create({
    data: {
      merchantId: payment.merchantId, eventId: reservation.eventId, reservationId, paymentIntentId: payment.id,
      source: AdmissionSource.ONLINE, paymentMethod: EventPaymentMethod.ONLINE_GATEWAY,
      paymentStatus: EventPaymentStatus.PAID, totalAmount: payment.amount, currency: payment.currency,
      managementTokenHash: reservation.managementTokenHash,
    },
  });
  for (const item of items) {
    for (let index = 0; index < item.quantity; index += 1) {
      await tx.admission.create({
        data: {
          code: admissionCode(), orderId: order.id, eventId: reservation.eventId, ticketTypeId: item.ticketTypeId,
          source: AdmissionSource.ONLINE, biometricEnrollmentStatus: BiometricEnrollmentStatus.PENDING,
        },
      });
    }
    await tx.ticketType.update({ where: { id: item.ticketTypeId }, data: { reservedQuantity: { decrement: item.quantity }, soldQuantity: { increment: item.quantity } } });
  }
  await tx.ticketReservation.update({
    where: { id: reservationId },
    data: { status: TicketReservationStatus.COMPLETED, completedAt: new Date(), paymentIntentId: payment.id },
  });
  await tx.eventAuditLog.create({
    data: { merchantId: payment.merchantId, eventId: reservation.eventId, action: "ONLINE_PAYMENT_CONFIRMED", entityType: "AdmissionOrder", entityId: order.id, metadata: { paymentIntentId: payment.id, admissionCount: items.reduce((sum, item) => sum + item.quantity, 0) } },
  });
}
