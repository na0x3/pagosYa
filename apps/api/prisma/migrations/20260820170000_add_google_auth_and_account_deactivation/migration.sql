ALTER TABLE "MerchantUser"
ADD COLUMN "googleSubject" TEXT,
ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "ConsumerUser"
ADD COLUMN "googleSubject" TEXT,
ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "MerchantUser_googleSubject_key" ON "MerchantUser"("googleSubject");
CREATE UNIQUE INDEX "ConsumerUser_googleSubject_key" ON "ConsumerUser"("googleSubject");
