CREATE TYPE "CustomDomainStatus" AS ENUM ('PENDING', 'ACTIVE');

CREATE TABLE "CustomDomain" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "hostname" TEXT NOT NULL,
  "status" "CustomDomainStatus" NOT NULL DEFAULT 'PENDING',
  "verificationToken" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "lastCheckedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomDomain_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomDomain_hostname_key" ON "CustomDomain"("hostname");
CREATE UNIQUE INDEX "CustomDomain_verificationToken_key" ON "CustomDomain"("verificationToken");
CREATE INDEX "CustomDomain_storeId_createdAt_idx" ON "CustomDomain"("storeId", "createdAt");

ALTER TABLE "CustomDomain"
ADD CONSTRAINT "CustomDomain_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
