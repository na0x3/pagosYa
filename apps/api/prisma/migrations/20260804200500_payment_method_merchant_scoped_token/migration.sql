-- Payment methods are now unique per (merchant, token) instead of globally
-- unique by token, so multiple merchants can reuse the same mock test token
-- without colliding on a single PaymentMethod row.
DROP INDEX "PaymentMethod_token_key";

CREATE UNIQUE INDEX "PaymentMethod_merchantId_token_key" ON "PaymentMethod"("merchantId", "token");
