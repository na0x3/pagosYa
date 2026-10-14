-- Store assistant (spec 2026-10-13-store-assistant-design)
ALTER TABLE "PromoCode" ADD COLUMN "showInAssistant" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "StoreAssistant" (
  "storeId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "name" TEXT,
  "avatarUrl" TEXT,
  "greeting" TEXT,
  "formality" TEXT NOT NULL DEFAULT 'tu',
  "notes" TEXT NOT NULL DEFAULT '',
  "monthlyCap" INTEGER NOT NULL DEFAULT 300,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreAssistant_pkey" PRIMARY KEY ("storeId"),
  CONSTRAINT "StoreAssistant_formality_check" CHECK ("formality" IN ('tu', 'usted')),
  CONSTRAINT "StoreAssistant_monthlyCap_check" CHECK ("monthlyCap" >= 0)
);
ALTER TABLE "StoreAssistant" ADD CONSTRAINT "StoreAssistant_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AssistantConversation" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "preview" BOOLEAN NOT NULL DEFAULT false,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "buyerMessages" INTEGER NOT NULL DEFAULT 0,
  "addedToCart" BOOLEAN NOT NULL DEFAULT false,
  "handedOff" BOOLEAN NOT NULL DEFAULT false,
  "pagePath" TEXT,
  "ipHash" TEXT NOT NULL,
  CONSTRAINT "AssistantConversation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssistantConversation_storeId_startedAt_idx" ON "AssistantConversation"("storeId", "startedAt");
CREATE INDEX "AssistantConversation_lastMessageAt_idx" ON "AssistantConversation"("lastMessageAt");
ALTER TABLE "AssistantConversation" ADD CONSTRAINT "AssistantConversation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AssistantMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "blocks" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssistantMessage_role_check" CHECK ("role" IN ('buyer', 'assistant'))
);
CREATE INDEX "AssistantMessage_conversationId_createdAt_idx" ON "AssistantMessage"("conversationId", "createdAt");
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AssistantUnanswered" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'open',
  "lastAskedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssistantUnanswered_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssistantUnanswered_status_check" CHECK ("status" IN ('open', 'taught', 'ignored'))
);
CREATE UNIQUE INDEX "AssistantUnanswered_storeId_question_key" ON "AssistantUnanswered"("storeId", "question");
CREATE INDEX "AssistantUnanswered_storeId_status_idx" ON "AssistantUnanswered"("storeId", "status");
ALTER TABLE "AssistantUnanswered" ADD CONSTRAINT "AssistantUnanswered_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
