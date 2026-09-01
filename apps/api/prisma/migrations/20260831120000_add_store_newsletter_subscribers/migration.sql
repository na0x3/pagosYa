CREATE TABLE "StoreNewsletterSubscriber" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreNewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoreNewsletterSubscriber_storeId_email_key" ON "StoreNewsletterSubscriber"("storeId", "email");
CREATE INDEX "StoreNewsletterSubscriber_storeId_createdAt_idx" ON "StoreNewsletterSubscriber"("storeId", "createdAt");

ALTER TABLE "StoreNewsletterSubscriber"
ADD CONSTRAINT "StoreNewsletterSubscriber_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
