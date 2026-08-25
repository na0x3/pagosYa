CREATE TYPE "OpsRole" AS ENUM ('SUPPORT_AGENT', 'SUPPORT_ADMIN');
CREATE TYPE "SupportCaseCategory" AS ENUM ('ACCOUNT_ACCESS', 'PAYMENTS', 'KYC', 'PAYOUTS', 'STORES', 'OTHER');
CREATE TYPE "SupportCasePriority" AS ENUM ('NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "SupportCaseStatus" AS ENUM ('OPEN', 'RESOLVED');

ALTER TABLE "OpsUser"
ADD COLUMN "role" "OpsRole" NOT NULL DEFAULT 'SUPPORT_AGENT';

CREATE TABLE "SupportCase" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "createdByOpsUserId" TEXT NOT NULL,
  "assignedToOpsUserId" TEXT,
  "category" "SupportCaseCategory" NOT NULL,
  "priority" "SupportCasePriority" NOT NULL DEFAULT 'NORMAL',
  "status" "SupportCaseStatus" NOT NULL DEFAULT 'OPEN',
  "summary" TEXT NOT NULL,
  "resolution" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "SupportCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportCaseNote" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "opsUserId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportCaseNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportCase_merchantId_createdAt_idx" ON "SupportCase"("merchantId", "createdAt");
CREATE INDEX "SupportCase_status_updatedAt_idx" ON "SupportCase"("status", "updatedAt");
CREATE INDEX "SupportCase_assignedToOpsUserId_status_idx" ON "SupportCase"("assignedToOpsUserId", "status");
CREATE INDEX "SupportCaseNote_caseId_createdAt_idx" ON "SupportCaseNote"("caseId", "createdAt");

ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_createdByOpsUserId_fkey" FOREIGN KEY ("createdByOpsUserId") REFERENCES "OpsUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_assignedToOpsUserId_fkey" FOREIGN KEY ("assignedToOpsUserId") REFERENCES "OpsUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportCaseNote" ADD CONSTRAINT "SupportCaseNote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SupportCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportCaseNote" ADD CONSTRAINT "SupportCaseNote_opsUserId_fkey" FOREIGN KEY ("opsUserId") REFERENCES "OpsUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
