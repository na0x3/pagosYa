-- ISO A-01 (ops staff) and M-09 (merchants): authenticator-app second factor; staff sessions instead of a bare token.
ALTER TABLE "OpsUser" ADD COLUMN "totpSecret" TEXT;
ALTER TABLE "OpsUser" ADD COLUMN "totpEnabledAt" TIMESTAMP(3);
ALTER TABLE "OpsUser" ADD COLUMN "totpLastStep" INTEGER;

ALTER TABLE "MerchantUser" ADD COLUMN "totpSecret" TEXT;
ALTER TABLE "MerchantUser" ADD COLUMN "totpEnabledAt" TIMESTAMP(3);
ALTER TABLE "MerchantUser" ADD COLUMN "totpLastStep" INTEGER;

CREATE TABLE "OpsSession" (
    "id" TEXT NOT NULL,
    "opsUserId" TEXT NOT NULL,
    "hashedToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OpsSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OpsSession_hashedToken_key" ON "OpsSession"("hashedToken");
CREATE INDEX "OpsSession_opsUserId_idx" ON "OpsSession"("opsUserId");
ALTER TABLE "OpsSession" ADD CONSTRAINT "OpsSession_opsUserId_fkey" FOREIGN KEY ("opsUserId") REFERENCES "OpsUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
