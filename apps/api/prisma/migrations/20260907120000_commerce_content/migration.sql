ALTER TABLE "Store" ADD COLUMN "bundlesEnabled" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "StoreReview" (
"id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
"orderId" TEXT NOT NULL, "productId" TEXT NOT NULL, "displayName" TEXT NOT NULL, "rating" INTEGER NOT NULL CHECK ("rating" BETWEEN 1 AND 5),
"body" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT "StoreReview_orderId_productId_key" UNIQUE ("orderId", "productId"));
CREATE INDEX "StoreReview_storeId_status_createdAt_idx" ON "StoreReview"("storeId", "status", "createdAt");
CREATE TABLE "StoreArticle" (
"id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
"slug" TEXT NOT NULL, "locale" TEXT NOT NULL DEFAULT 'es', "title" TEXT NOT NULL, "excerpt" TEXT NOT NULL, "body" TEXT NOT NULL, "author" TEXT NOT NULL,
"publishedAt" TIMESTAMP(3), "revision" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
CONSTRAINT "StoreArticle_storeId_locale_slug_key" UNIQUE ("storeId", "locale", "slug"));
CREATE INDEX "StoreArticle_storeId_publishedAt_idx" ON "StoreArticle"("storeId", "publishedAt");
CREATE TABLE "StoreBundle" (
"id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
"name" TEXT NOT NULL, "kind" TEXT NOT NULL, "items" JSONB NOT NULL, "minimumQuantity" INTEGER NOT NULL DEFAULT 2,
"discountPercent" INTEGER NOT NULL CHECK ("discountPercent" BETWEEN 1 AND 99), "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "StoreBundle_storeId_active_idx" ON "StoreBundle"("storeId", "active");
