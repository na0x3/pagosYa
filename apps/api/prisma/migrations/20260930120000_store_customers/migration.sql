-- CreateTable
CREATE TABLE "StoreCustomer" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "hashedPassword" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "addresses" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreCustomerSession" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "hashedToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreCustomerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreCustomerToken" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "hashedToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreCustomerToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreCustomer_storeId_email_key" ON "StoreCustomer"("storeId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "StoreCustomerSession_hashedToken_key" ON "StoreCustomerSession"("hashedToken");

-- CreateIndex
CREATE INDEX "StoreCustomerSession_customerId_expiresAt_idx" ON "StoreCustomerSession"("customerId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreCustomerToken_hashedToken_key" ON "StoreCustomerToken"("hashedToken");

-- CreateIndex
CREATE INDEX "StoreCustomerToken_customerId_purpose_idx" ON "StoreCustomerToken"("customerId", "purpose");

-- AddForeignKey
ALTER TABLE "StoreCustomer" ADD CONSTRAINT "StoreCustomer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreCustomerSession" ADD CONSTRAINT "StoreCustomerSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "StoreCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreCustomerToken" ADD CONSTRAINT "StoreCustomerToken_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "StoreCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

