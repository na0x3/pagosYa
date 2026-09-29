-- Written by hand. The database owner applies this migration.
ALTER TABLE "PaymentLink" ADD COLUMN "contentBlocks" JSONB NOT NULL DEFAULT '[]';
