# Multiple stores per merchant

Apply before releasing the API that permits another store. This forward migration removes only the unique merchant index; it preserves all stores, products, ownership foreign keys, and the merchant/creation-date lookup index. No data backfill is needed.

Rollback: the previous one-store rule cannot be restored automatically once accounts have multiple stores. Reintroduce the API restriction first if necessary, retain the existing stores, and resolve the intended ownership policy before adding a unique index in a new forward migration. Never delete or merge stores automatically to roll back.
