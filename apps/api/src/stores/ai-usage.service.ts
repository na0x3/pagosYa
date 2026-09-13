import { safeConversationDiagnostic, type ConversationDiagnostic } from './source-conversation-failure';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SOURCE_MODELS, sourceUsage, type SourceModel } from './source-generation-policy';

@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);
  constructor(private readonly prisma: PrismaService) {}
  async record(storeId: string, stage: string, model: string, body: any, durationMs: number, status: string, diagnostic?: ConversationDiagnostic) {
    const usage = model in SOURCE_MODELS ? sourceUsage(model as SourceModel, body?.usage) : null;
    const providerUsage = numericUsage(body?.usage);
    const totals = usage ? { ...usage, providerUsage } : providerUsage ? { providerMicroUsd: null, providerUsage } : null;
    const savedUsage = diagnostic ? { ...(totals || { providerMicroUsd: null }), diagnostic: safeConversationDiagnostic(diagnostic) } : totals;
    // Provider totals, not prompts, customer data, or API credentials.
    try { await this.prisma.storeAiUsage.create({ data: { storeId, stage, model, status, durationMs,
      responseId: typeof body?.id === 'string' ? body.id : null,
      usage: savedUsage ? savedUsage as unknown as Prisma.InputJsonValue : Prisma.JsonNull,
    } }); } catch { this.logger.error('Could not persist AI usage telemetry'); }
  }
}

function numericUsage(value: unknown, depth = 0): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 3) return null;
  const entries = Object.entries(value).slice(0, 32).flatMap(([key, v]): Array<[string, unknown]> => {
    if (!/^[a-z_]{1,60}$/.test(key)) return [];
    if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return [[key, v]];
    const nested = numericUsage(v, depth + 1); return nested ? [[key, nested]] : [];
  });
  return entries.length ? Object.fromEntries(entries) : null;
}
