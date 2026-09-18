ALTER TABLE "StoreNewsletterSubscriber"
  ADD COLUMN "name" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "interests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
