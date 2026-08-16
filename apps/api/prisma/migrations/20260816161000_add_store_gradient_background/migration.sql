ALTER TABLE "Store"
ADD COLUMN "backgroundMode" TEXT NOT NULL DEFAULT 'solid',
ADD COLUMN "backgroundGradientStart" TEXT NOT NULL DEFAULT '#f8fafc',
ADD COLUMN "backgroundGradientEnd" TEXT NOT NULL DEFAULT '#e0e7ff',
ADD COLUMN "backgroundGradientAngle" INTEGER NOT NULL DEFAULT 135;
