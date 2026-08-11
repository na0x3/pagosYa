ALTER TABLE "Store"
ADD COLUMN "announcementMode" TEXT NOT NULL DEFAULT 'static',
ADD COLUMN "announcementSpeed" INTEGER NOT NULL DEFAULT 18,
ADD COLUMN "promotionEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "promotionTitle" TEXT,
ADD COLUMN "promotionBody" TEXT,
ADD COLUMN "promotionCtaLabel" TEXT,
ADD COLUMN "promotionCtaUrl" TEXT,
ADD COLUMN "buttonVariant" TEXT NOT NULL DEFAULT 'solid',
ADD COLUMN "buttonMotion" TEXT NOT NULL DEFAULT 'lift',
ADD COLUMN "cartButtonLabel" TEXT NOT NULL DEFAULT 'Ir a pagar';
