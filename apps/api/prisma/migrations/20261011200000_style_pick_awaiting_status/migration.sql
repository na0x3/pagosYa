-- "Elige tu estilo" (spec 2026-10-11): a proposal run ends AWAITING_STYLE until the merchant picks a card.
ALTER TABLE "StoreSourceGeneration" DROP CONSTRAINT "StoreSourceGeneration_status_check";
ALTER TABLE "StoreSourceGeneration" ADD CONSTRAINT "StoreSourceGeneration_status_check" CHECK ("status" IN ('RUNNING', 'COMPLETED', 'FAILED', 'INTERRUPTED', 'CANDIDATE', 'PARTIAL', 'BLOCKED', 'AWAITING_STYLE'));
