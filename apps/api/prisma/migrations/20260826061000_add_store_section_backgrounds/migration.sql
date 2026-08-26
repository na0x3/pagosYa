ALTER TABLE "Store"
ADD COLUMN "sectionBackgrounds" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "contactTitle" TEXT,
ADD COLUMN "contactSubtitle" TEXT,
ADD COLUMN "locationTitle" TEXT,
ADD COLUMN "locationSubtitle" TEXT,
ADD COLUMN "linksTitle" TEXT;
