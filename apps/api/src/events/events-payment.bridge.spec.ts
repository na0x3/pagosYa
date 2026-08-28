import { BadRequestException } from "@nestjs/common";
import { TicketReservationStatus } from "@prisma/client";
import { completeEventReservationPayment } from "./events-payment.bridge";

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    $queryRaw: jest.fn().mockResolvedValue([{
      id: "reservation-1", merchantId: "merchant-1", eventId: "event-1",
      status: TicketReservationStatus.RESERVED, totalAmount: 24000, currency: "BOB",
      expiresAt: new Date(Date.now() + 60_000), managementTokenHash: "digest",
    }]),
    admissionOrder: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: "order-1" }) },
    ticketReservationItem: { findMany: jest.fn().mockResolvedValue([{ ticketTypeId: "general", quantity: 3, unitAmount: 8000 }]) },
    admission: { create: jest.fn().mockResolvedValue({}) },
    ticketType: { update: jest.fn().mockResolvedValue({}) },
    ticketReservation: { update: jest.fn().mockResolvedValue({}) },
    eventAuditLog: { create: jest.fn().mockResolvedValue({}) },
    ...overrides,
  };
}

const payment = {
  id: "payment-1", merchantId: "merchant-1", amount: 24000, currency: "BOB",
  metadata: { eventReservation: { reservationId: "reservation-1" } },
};

describe("event payment success bridge", () => {
  it("materializes one independent admission per purchased unit", async () => {
    const tx = transaction();
    await completeEventReservationPayment(tx as never, payment);
    expect(tx.admission.create).toHaveBeenCalledTimes(3);
    expect(tx.ticketReservation.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: TicketReservationStatus.COMPLETED }) }));
  });

  it("is idempotent when PagosYa retries the same successful payment", async () => {
    const tx = transaction({
      $queryRaw: jest.fn().mockResolvedValue([{ ...((await transaction().$queryRaw()) as object[])[0], status: TicketReservationStatus.COMPLETED }]),
      admissionOrder: { findUnique: jest.fn().mockResolvedValue({ paymentIntentId: "payment-1" }), create: jest.fn() },
    });
    await completeEventReservationPayment(tx as never, payment);
    expect((tx.admissionOrder as { create: jest.Mock }).create).not.toHaveBeenCalled();
  });

  it("rejects a payment whose amount does not match the reservation", async () => {
    const tx = transaction();
    await expect(completeEventReservationPayment(tx as never, { ...payment, amount: 23999 })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.admission.create).not.toHaveBeenCalled();
  });
});
