-- Durable, store-scoped agent conversations. Provider response state is not
-- the source of truth; every turn points at an optional reversible proposal.
CREATE TYPE "StoreAgentMessageRole" AS ENUM ('USER', 'ASSISTANT');

CREATE TABLE "StoreAgentThread" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreAgentThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoreAgentMessage" (
  "id" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "role" "StoreAgentMessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "proposalId" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreAgentMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoreAgentThread_storeId_key" ON "StoreAgentThread"("storeId");
CREATE INDEX "StoreAgentMessage_threadId_createdAt_idx" ON "StoreAgentMessage"("threadId", "createdAt");
CREATE INDEX "StoreAgentMessage_proposalId_idx" ON "StoreAgentMessage"("proposalId");

ALTER TABLE "StoreAgentThread"
  ADD CONSTRAINT "StoreAgentThread_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoreAgentMessage"
  ADD CONSTRAINT "StoreAgentMessage_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "StoreAgentThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoreAgentMessage"
  ADD CONSTRAINT "StoreAgentMessage_proposalId_fkey"
  FOREIGN KEY ("proposalId") REFERENCES "StoreVisualProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
