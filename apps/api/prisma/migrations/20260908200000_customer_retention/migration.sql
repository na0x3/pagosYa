-- AlterTable
ALTER TABLE "StoreNewsletterSubscriber" ADD COLUMN     "unsubscribeToken" TEXT;
UPDATE "StoreNewsletterSubscriber" SET "unsubscribeToken" = gen_random_uuid()::text WHERE "unsubscribeToken" IS NULL;
ALTER TABLE "StoreNewsletterSubscriber" ALTER COLUMN "unsubscribeToken" SET NOT NULL;

-- CreateTable
CREATE TABLE "StoreRetention" (
    "storeId" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreRetention_pkey" PRIMARY KEY ("storeId")
);

-- CreateTable
CREATE TABLE "ComebackCard" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComebackCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComebackReward" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "days" TEXT[],
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComebackReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreSavedCart" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "paymentIntentId" TEXT,
    "consentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreSavedCart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreEmailCampaign" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "queuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreEmailCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreEmailDelivery" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "campaignId" TEXT,
    "email" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceId" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreEmailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComebackCard_token_key" ON "ComebackCard"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ComebackCard_storeId_email_key" ON "ComebackCard"("storeId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "ComebackReward_code_key" ON "ComebackReward"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StoreSavedCart_token_key" ON "StoreSavedCart"("token");

-- CreateIndex
CREATE INDEX "StoreSavedCart_closedAt_sentAt_dueAt_idx" ON "StoreSavedCart"("closedAt", "sentAt", "dueAt");

-- CreateIndex
CREATE INDEX "StoreSavedCart_storeId_email_idx" ON "StoreSavedCart"("storeId", "email");

-- CreateIndex
CREATE INDEX "StoreEmailCampaign_storeId_createdAt_idx" ON "StoreEmailCampaign"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreEmailDelivery_dedupeKey_key" ON "StoreEmailDelivery"("dedupeKey");

-- CreateIndex
CREATE INDEX "StoreEmailDelivery_status_dueAt_idx" ON "StoreEmailDelivery"("status", "dueAt");

-- CreateIndex
CREATE INDEX "StoreEmailDelivery_storeId_createdAt_idx" ON "StoreEmailDelivery"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreNewsletterSubscriber_unsubscribeToken_key" ON "StoreNewsletterSubscriber"("unsubscribeToken");

-- AddForeignKey
ALTER TABLE "StoreRetention" ADD CONSTRAINT "StoreRetention_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComebackCard" ADD CONSTRAINT "ComebackCard_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComebackReward" ADD CONSTRAINT "ComebackReward_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "ComebackCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreSavedCart" ADD CONSTRAINT "StoreSavedCart_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreEmailCampaign" ADD CONSTRAINT "StoreEmailCampaign_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreEmailDelivery" ADD CONSTRAINT "StoreEmailDelivery_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreEmailDelivery" ADD CONSTRAINT "StoreEmailDelivery_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "StoreEmailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
