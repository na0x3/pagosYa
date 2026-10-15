-- Spec 2026-10-14 store controls, part 1: YAPI's background review (spec 2026-10-12 faster generation) keeps a row of its own:
-- REVIEWING while it runs, then COMPLETED, FAILED, DISCARDED or CANCELLED. The check never allowed the three new statuses, so
-- every review row insert failed (sep5_review_not_started) and no «Revisión de YAPI» was ever saved.
ALTER TABLE "StoreSourceGeneration" DROP CONSTRAINT "StoreSourceGeneration_status_check";
ALTER TABLE "StoreSourceGeneration" ADD CONSTRAINT "StoreSourceGeneration_status_check" CHECK ("status" IN ('RUNNING', 'COMPLETED', 'FAILED', 'INTERRUPTED', 'CANDIDATE', 'PARTIAL', 'BLOCKED', 'AWAITING_STYLE', 'REVIEWING', 'CANCELLED', 'DISCARDED'));
