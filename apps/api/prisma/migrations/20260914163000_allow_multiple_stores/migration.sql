-- The existing Store_merchantId_createdAt_idx still supports account-scoped lists.
-- Keep every store and its foreign keys; remove only the one-store restriction.
-- Run outside a transaction so existing store reads/writes can continue.
DROP INDEX CONCURRENTLY IF EXISTS "Store_merchantId_key";
