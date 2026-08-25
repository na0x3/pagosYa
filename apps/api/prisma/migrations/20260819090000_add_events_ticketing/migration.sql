CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "EventSeatStatus" AS ENUM ('AVAILABLE', 'HELD', 'SOLD');
CREATE TYPE "EventOrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED');
CREATE TYPE "EventTicketStatus" AS ENUM ('VALID', 'USED', 'VOID');

CREATE TABLE "Event" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "publicityImageUrl" TEXT NOT NULL,
  "venueName" TEXT NOT NULL,
  "venueAddress" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BOB',
  "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventSeat" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "section" TEXT NOT NULL DEFAULT 'General',
  "rowLabel" TEXT NOT NULL,
  "seatNumber" INTEGER NOT NULL,
  "x" INTEGER NOT NULL,
  "y" INTEGER NOT NULL,
  "price" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BOB',
  "status" "EventSeatStatus" NOT NULL DEFAULT 'AVAILABLE',
  "heldByPaymentIntentId" TEXT,
  "holdExpiresAt" TIMESTAMP(3),
  "soldAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventSeat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventOrder" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "paymentIntentId" TEXT NOT NULL,
  "buyerName" TEXT NOT NULL,
  "buyerEmail" TEXT NOT NULL,
  "buyerPhone" TEXT,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BOB',
  "status" "EventOrderStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventTicket" (
  "id" TEXT NOT NULL,
  "eventOrderId" TEXT NOT NULL,
  "eventSeatId" TEXT NOT NULL,
  "qrToken" TEXT NOT NULL,
  "status" "EventTicketStatus" NOT NULL DEFAULT 'VALID',
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventTicket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");
CREATE INDEX "Event_merchantId_createdAt_idx" ON "Event"("merchantId", "createdAt");
CREATE INDEX "Event_storeId_createdAt_idx" ON "Event"("storeId", "createdAt");
CREATE INDEX "Event_status_startsAt_idx" ON "Event"("status", "startsAt");
CREATE UNIQUE INDEX "EventSeat_eventId_label_key" ON "EventSeat"("eventId", "label");
CREATE INDEX "EventSeat_eventId_status_idx" ON "EventSeat"("eventId", "status");
CREATE INDEX "EventSeat_heldByPaymentIntentId_idx" ON "EventSeat"("heldByPaymentIntentId");
CREATE UNIQUE INDEX "EventOrder_paymentIntentId_key" ON "EventOrder"("paymentIntentId");
CREATE INDEX "EventOrder_eventId_createdAt_idx" ON "EventOrder"("eventId", "createdAt");
CREATE INDEX "EventOrder_buyerEmail_createdAt_idx" ON "EventOrder"("buyerEmail", "createdAt");
CREATE UNIQUE INDEX "EventTicket_eventSeatId_key" ON "EventTicket"("eventSeatId");
CREATE UNIQUE INDEX "EventTicket_qrToken_key" ON "EventTicket"("qrToken");
CREATE INDEX "EventTicket_eventOrderId_idx" ON "EventTicket"("eventOrderId");
CREATE INDEX "EventTicket_status_usedAt_idx" ON "EventTicket"("status", "usedAt");

ALTER TABLE "Event" ADD CONSTRAINT "Event_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventSeat" ADD CONSTRAINT "EventSeat_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventOrder" ADD CONSTRAINT "EventOrder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventOrder" ADD CONSTRAINT "EventOrder_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventTicket" ADD CONSTRAINT "EventTicket_eventOrderId_fkey" FOREIGN KEY ("eventOrderId") REFERENCES "EventOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventTicket" ADD CONSTRAINT "EventTicket_eventSeatId_fkey" FOREIGN KEY ("eventSeatId") REFERENCES "EventSeat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
