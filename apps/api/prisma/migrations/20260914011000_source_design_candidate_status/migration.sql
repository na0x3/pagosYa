ALTER TABLE "StoreSourceGeneration" DROP CONSTRAINT "StoreSourceGeneration_status_check";
ALTER TABLE "StoreSourceGeneration" ADD CONSTRAINT "StoreSourceGeneration_status_check" CHECK ("status" IN ('RUNNING', 'COMPLETED', 'FAILED', 'INTERRUPTED', 'CANDIDATE'));
