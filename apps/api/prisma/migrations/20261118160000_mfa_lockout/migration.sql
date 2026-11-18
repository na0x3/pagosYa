-- Security review 2026-11-18: wrong authenticator codes are counted per person, not only per IP; five lock entry for 15 min.
ALTER TABLE "OpsUser" ADD COLUMN "totpFailedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OpsUser" ADD COLUMN "totpLockedUntil" TIMESTAMP(3);
ALTER TABLE "MerchantUser" ADD COLUMN "totpFailedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MerchantUser" ADD COLUMN "totpLockedUntil" TIMESTAMP(3);
