-- AlterTable
ALTER TABLE "StoreOrder" ADD COLUMN     "parcel" JSONB;

-- AlterTable
ALTER TABLE "PaymentLink" ADD COLUMN     "fragile" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "heightCm" INTEGER,
ADD COLUMN     "lengthCm" INTEGER,
ADD COLUMN     "noStack" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "widthCm" INTEGER;

-- AlterTable
ALTER TABLE "DeliveryZone" ADD COLUMN     "sizeClasses" TEXT[] DEFAULT ARRAY[]::TEXT[];

