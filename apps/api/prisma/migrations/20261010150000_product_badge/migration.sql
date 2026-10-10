-- Product photo badge (spec 2026-10-10 conversion product page). NULL keeps every existing product on "Automática".
ALTER TABLE "PaymentLink" ADD COLUMN "badge" TEXT;
