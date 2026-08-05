-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'EMITTED', 'FAILED');

-- AlterTable
ALTER TABLE "PaymentIntent" ADD COLUMN     "customerDocument" TEXT,
ADD COLUMN     "customerName" TEXT;

-- CreateTable
CREATE TABLE "MerchantInvoicingProfile" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "sucursal" INTEGER NOT NULL DEFAULT 0,
    "puntoVenta" INTEGER NOT NULL DEFAULT 0,
    "cuis" TEXT,
    "cuisIssuedAt" TIMESTAMP(3),
    "cufd" TEXT,
    "cufdExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantInvoicingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "paymentIntentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BOB',
    "customerName" TEXT NOT NULL DEFAULT 'SIN NOMBRE',
    "customerDocument" TEXT NOT NULL DEFAULT '0',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "cuf" TEXT,
    "cufd" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "emittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantInvoicingProfile_merchantId_key" ON "MerchantInvoicingProfile"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_paymentIntentId_key" ON "Invoice"("paymentIntentId");

-- CreateIndex
CREATE INDEX "Invoice_status_nextRetryAt_idx" ON "Invoice"("status", "nextRetryAt");

-- AddForeignKey
ALTER TABLE "MerchantInvoicingProfile" ADD CONSTRAINT "MerchantInvoicingProfile_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
