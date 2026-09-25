-- AlterTable
ALTER TABLE "StoreSourceVersion" ADD COLUMN     "designFingerprint" TEXT;

-- CreateIndex
CREATE INDEX "StoreSourceVersion_createdAt_designFingerprint_idx" ON "StoreSourceVersion"("createdAt", "designFingerprint");
