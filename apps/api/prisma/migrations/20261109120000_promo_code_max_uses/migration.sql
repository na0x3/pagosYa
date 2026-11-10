-- Spec 2026-11-09 popup games addendum: single-use prize codes.
ALTER TABLE "PromoCode" ADD COLUMN "maxUses" INTEGER;
