ALTER TABLE "MerchantInvoicingProfile"
ADD COLUMN "documentSectorCode" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "PaymentLink"
ADD COLUMN "codigoProducto" TEXT,
ADD COLUMN "actividadEconomica" TEXT,
ADD COLUMN "codigoProductoSin" TEXT,
ADD COLUMN "unidadMedida" INTEGER;

CREATE TABLE "SiatCatalogCache" (
    "id" TEXT NOT NULL,
    "invoicingProfileId" TEXT NOT NULL,
    "catalog" TEXT NOT NULL,
    "entries" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SiatCatalogCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SiatCatalogCache_invoicingProfileId_catalog_key"
ON "SiatCatalogCache"("invoicingProfileId", "catalog");

CREATE INDEX "SiatCatalogCache_syncedAt_idx" ON "SiatCatalogCache"("syncedAt");

CREATE UNIQUE INDEX "PaymentLink_storeId_codigoProducto_key"
ON "PaymentLink"("storeId", "codigoProducto");

ALTER TABLE "SiatCatalogCache"
ADD CONSTRAINT "SiatCatalogCache_invoicingProfileId_fkey"
FOREIGN KEY ("invoicingProfileId") REFERENCES "MerchantInvoicingProfile"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
