-- Extensions framework (spec 2026-09-27). Hand-written; applied by the owner.
CREATE TABLE "StoreExtension" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "extensionId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "secrets" TEXT,
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreExtension_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StoreExtension_storeId_extensionId_key" ON "StoreExtension"("storeId", "extensionId");
ALTER TABLE "StoreExtension" ADD CONSTRAINT "StoreExtension_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StoreEvent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StoreEvent_storeId_createdAt_idx" ON "StoreEvent"("storeId", "createdAt");

CREATE TABLE "ExtensionDelivery" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "extensionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "doneAt" TIMESTAMP(3),
    CONSTRAINT "ExtensionDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExtensionDelivery_eventId_extensionId_key" ON "ExtensionDelivery"("eventId", "extensionId");
CREATE INDEX "ExtensionDelivery_status_nextAttemptAt_idx" ON "ExtensionDelivery"("status", "nextAttemptAt");
ALTER TABLE "ExtensionDelivery" ADD CONSTRAINT "ExtensionDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "StoreEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The four measurement IDs stores already have become installed extensions. The Store columns stay
-- (unread) and are dropped in a later migration. Idempotent: re-running changes nothing.
-- copy-analytics:begin
INSERT INTO "StoreExtension" ("id", "storeId", "extensionId", "settings", "updatedAt")
SELECT 'ext_' || md5(s."id" || ':' || x.ext), s."id", x.ext, jsonb_build_object('id', btrim(x.value)), CURRENT_TIMESTAMP
FROM "Store" s
CROSS JOIN LATERAL (VALUES
    ('google-analytics', s."analyticsGa4Id"),
    ('google-tag-manager', s."analyticsGtmId"),
    ('meta-pixel', s."analyticsMetaPixelId"),
    ('tiktok-pixel', s."analyticsTiktokPixelId")
) AS x(ext, value)
WHERE x.value IS NOT NULL AND btrim(x.value) <> ''
ON CONFLICT ("storeId", "extensionId") DO NOTHING;
-- copy-analytics:end
