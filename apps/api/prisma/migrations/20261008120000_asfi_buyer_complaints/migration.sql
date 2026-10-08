-- ASFI sub-project 4: buyer complaints.
CREATE TYPE "ComplaintStatus" AS ENUM ('RECEIVED', 'IN_REVIEW', 'WAITING_MERCHANT', 'ANSWERED');
CREATE TYPE "ComplaintCategory" AS ENUM ('NOT_DELIVERED', 'NOT_AS_DESCRIBED', 'UNRECOGNIZED_CHARGE', 'DUPLICATE_CHARGE', 'REFUND_NOT_RECEIVED', 'OTHER');
CREATE TYPE "ComplaintRequest" AS ENUM ('REFUND', 'DELIVERY', 'OTHER');
CREATE TYPE "ComplaintOutcome" AS ENUM ('UPHELD', 'PARTIALLY_UPHELD', 'NOT_UPHELD');
CREATE TYPE "ComplaintActor" AS ENUM ('BUYER', 'OPS', 'MERCHANT', 'SYSTEM');
CREATE TYPE "ComplaintEventType" AS ENUM ('RECEIVED', 'EMAIL_CONFIRMED', 'BUYER_MESSAGE', 'TAKEN', 'LINKED', 'NOTE', 'MERCHANT_ASKED', 'MERCHANT_REPLIED', 'EXTENDED', 'ANSWERED', 'REFUNDED', 'PAYOUTS_PAUSED', 'EMAIL_SENT', 'EMAIL_FAILED');

CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'RECEIVED',
    "category" "ComplaintCategory" NOT NULL,
    "request" "ComplaintRequest" NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "buyerPhone" TEXT,
    "referenceGiven" TEXT,
    "storeNameGiven" TEXT,
    "paymentIntentId" TEXT,
    "merchantId" TEXT,
    "description" TEXT NOT NULL,
    "outcome" "ComplaintOutcome",
    "answer" TEXT,
    "assignedOpsUserId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "extendedAt" TIMESTAMP(3),
    "extensionReason" TEXT,
    "merchantDueAt" TIMESTAMP(3),
    "emailConfirmedAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComplaintEvent" (
    "id" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,
    "type" "ComplaintEventType" NOT NULL,
    "actor" "ComplaintActor" NOT NULL,
    "actorId" TEXT,
    "body" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComplaintEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComplaintAttachment" (
    "id" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,
    "eventId" TEXT,
    "uploadedBy" "ComplaintActor" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComplaintAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComplaintCounter" (
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL,
    CONSTRAINT "ComplaintCounter_pkey" PRIMARY KEY ("year")
);

CREATE UNIQUE INDEX "Complaint_number_key" ON "Complaint"("number");
CREATE INDEX "Complaint_status_dueAt_idx" ON "Complaint"("status", "dueAt");
CREATE INDEX "Complaint_merchantId_receivedAt_idx" ON "Complaint"("merchantId", "receivedAt");
CREATE INDEX "Complaint_buyerEmail_idx" ON "Complaint"("buyerEmail");
CREATE INDEX "ComplaintEvent_complaintId_createdAt_idx" ON "ComplaintEvent"("complaintId", "createdAt");
CREATE INDEX "ComplaintEvent_type_createdAt_idx" ON "ComplaintEvent"("type", "createdAt");
CREATE INDEX "ComplaintAttachment_complaintId_idx" ON "ComplaintAttachment"("complaintId");

ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_assignedOpsUserId_fkey" FOREIGN KEY ("assignedOpsUserId") REFERENCES "OpsUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ComplaintEvent" ADD CONSTRAINT "ComplaintEvent_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComplaintAttachment" ADD CONSTRAINT "ComplaintAttachment_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComplaintAttachment" ADD CONSTRAINT "ComplaintAttachment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ComplaintEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
