-- New merchants now default to AGGREGATOR (pagosYa pools funds and
-- auto-sweeps to the merchant's bank account) instead of FACILITATOR
-- (bank/card network settles directly). Existing rows are untouched --
-- this only changes the default applied on insert when settlementMode
-- is omitted.
ALTER TABLE "Merchant" ALTER COLUMN "settlementMode" SET DEFAULT 'AGGREGATOR';
