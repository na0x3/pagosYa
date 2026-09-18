-- Enforce the account limit across sessions and concurrent requests.
-- Existing duplicates must be resolved explicitly before this migration runs.
CREATE UNIQUE INDEX "Store_merchantId_key" ON "Store"("merchantId");
