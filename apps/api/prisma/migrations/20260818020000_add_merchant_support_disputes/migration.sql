ALTER TYPE "SupportCaseStatus" RENAME TO "SupportCaseStatus_old";

CREATE TYPE "SupportCaseStatus" AS ENUM ('PENDING', 'SENT', 'REVIEWED', 'RESOLVED');

ALTER TABLE "SupportCase"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "SupportCaseStatus"
    USING (
      CASE
        WHEN "status"::text = 'OPEN' THEN 'REVIEWED'
        ELSE "status"::text
      END
    )::"SupportCaseStatus",
  ALTER COLUMN "status" SET DEFAULT 'PENDING';

DROP TYPE "SupportCaseStatus_old";

ALTER TABLE "SupportCase"
  ALTER COLUMN "createdByOpsUserId" DROP NOT NULL,
  ADD COLUMN "createdByMerchantUserId" TEXT;

CREATE INDEX "SupportCase_createdByMerchantUserId_createdAt_idx"
  ON "SupportCase"("createdByMerchantUserId", "createdAt");

ALTER TABLE "SupportCase"
  ADD CONSTRAINT "SupportCase_createdByMerchantUserId_fkey"
  FOREIGN KEY ("createdByMerchantUserId") REFERENCES "MerchantUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
