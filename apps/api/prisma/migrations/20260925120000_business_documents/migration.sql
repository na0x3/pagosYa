-- CreateEnum
CREATE TYPE "BusinessDocumentKind" AS ENUM ('INVOICE', 'PROPOSAL', 'CONTRACT');

-- CreateEnum
CREATE TYPE "BusinessDocumentStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'CHANGES_REQUESTED', 'SIGNED', 'PAID', 'OVERDUE', 'DECLINED', 'EXPIRED', 'VOIDED');

-- CreateEnum
CREATE TYPE "BusinessDocumentSignerRole" AS ENUM ('MERCHANT', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "BusinessDocumentSignatureMethod" AS ENUM ('TYPED', 'DRAWN');

-- CreateTable
CREATE TABLE "BusinessDocument" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "kind" "BusinessDocumentKind" NOT NULL,
    "number" INTEGER,
    "status" "BusinessDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BOB',
    "businessCustomerId" TEXT,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "customerDocument" TEXT,
    "subtotalAmount" INTEGER NOT NULL DEFAULT 0,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "content" JSONB NOT NULL DEFAULT '[]',
    "dueAt" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessDocumentItem" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitAmount" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentLinkId" TEXT,

    CONSTRAINT "BusinessDocumentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessDocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "BusinessDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessDocumentEvent" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "data" JSONB,
    "dedupeKey" TEXT,

    CONSTRAINT "BusinessDocumentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessDocumentSignature" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "role" "BusinessDocumentSignerRole" NOT NULL,
    "name" TEXT NOT NULL,
    "method" "BusinessDocumentSignatureMethod" NOT NULL,
    "imageUrl" TEXT,
    "email" TEXT NOT NULL,
    "codeVerifiedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "version" INTEGER NOT NULL,
    "versionSha256" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessDocumentSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessDocument_storeId_kind_status_createdAt_idx" ON "BusinessDocument"("storeId", "kind", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessDocument_merchantId_createdAt_idx" ON "BusinessDocument"("merchantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessDocument_storeId_kind_number_key" ON "BusinessDocument"("storeId", "kind", "number");

-- CreateIndex
CREATE INDEX "BusinessDocumentItem_documentId_position_idx" ON "BusinessDocumentItem"("documentId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessDocumentVersion_documentId_version_key" ON "BusinessDocumentVersion"("documentId", "version");

-- CreateIndex
CREATE INDEX "BusinessDocumentEvent_documentId_at_idx" ON "BusinessDocumentEvent"("documentId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessDocumentEvent_documentId_dedupeKey_key" ON "BusinessDocumentEvent"("documentId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessDocumentSignature_documentId_version_role_key" ON "BusinessDocumentSignature"("documentId", "version", "role");

-- AddForeignKey
ALTER TABLE "BusinessDocumentItem" ADD CONSTRAINT "BusinessDocumentItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "BusinessDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDocumentVersion" ADD CONSTRAINT "BusinessDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "BusinessDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDocumentEvent" ADD CONSTRAINT "BusinessDocumentEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "BusinessDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDocumentSignature" ADD CONSTRAINT "BusinessDocumentSignature_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "BusinessDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
