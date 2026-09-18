CREATE TABLE "StoreSourceProject" (
  "storeId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreSourceProject_pkey" PRIMARY KEY ("storeId"),
  CONSTRAINT "StoreSourceProject_revision_check" CHECK ("revision" >= 0),
  CONSTRAINT "StoreSourceProject_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "StoreSourceVersion" (
  "storeId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "digest" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "restoredFrom" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreSourceVersion_pkey" PRIMARY KEY ("storeId", "revision"),
  CONSTRAINT "StoreSourceVersion_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "StoreSourceVersion_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "StoreSourceProject"("storeId") ON DELETE CASCADE ON UPDATE CASCADE
);
