ALTER TABLE "StoreAgentMessage" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'website';
CREATE INDEX "StoreAgentMessage_threadId_channel_createdAt_idx" ON "StoreAgentMessage"("threadId", "channel", "createdAt");
