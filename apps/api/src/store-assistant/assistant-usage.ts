import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { laPazMonthStart } from './assistant-text';

export const PREVIEW_ALLOWANCE = 50;
export const HOURLY_LIMIT = 60;

@Injectable()
export class AssistantUsage {
  private spend: { at: number; ok: boolean } | null = null;
  private readonly logger = new Logger(AssistantUsage.name);
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  monthlyUsed(storeId: string, now: Date) {
    return this.prisma.assistantConversation.count({ where: { storeId, preview: false, startedAt: { gte: laPazMonthStart(now) } } });
  }

  previewUsed(storeId: string, now: Date) {
    return this.prisma.assistantConversation.count({ where: { storeId, preview: true, startedAt: { gte: laPazMonthStart(now) } } });
  }

  /** May this store open one more real conversation now? */
  async startGate(storeId: string, monthlyCap: number, now: Date): Promise<'ok' | 'cap' | 'hourly'> {
    if (await this.monthlyUsed(storeId, now) >= monthlyCap) return 'cap';
    const lastHour = await this.prisma.assistantConversation.count({ where: { storeId, preview: false, startedAt: { gte: new Date(now.getTime() - 3_600_000) } } });
    return lastHour >= HOURLY_LIMIT ? 'hourly' : 'ok';
  }

  /**
   * Platform-wide spend this La Paz month for stage "assistant", cached for a minute.
   * Fails closed: if the spend cannot be read, the assistant refuses for that minute instead of throwing.
   */
  async spendOk(now: Date): Promise<boolean> {
    if (this.spend && now.getTime() - this.spend.at < 60_000) return this.spend.ok;
    let ok = false;
    try {
      const [row] = await this.prisma.$queryRaw<Array<{ micro: unknown }>>`
        SELECT coalesce(sum(("usage"->>'providerMicroUsd')::numeric), 0) AS micro FROM "StoreAiUsage"
        WHERE "stage" = 'assistant' AND "createdAt" >= ${laPazMonthStart(now)}`;
      const usd = Number(String(row?.micro ?? 0)) / 1_000_000;
      ok = usd < (this.config.get<number>('app.assistant.monthlySpendCeilingUsd') ?? 50);
    } catch (error) {
      this.logger.warn(`Assistant spend check failed; refusing new conversations for a minute: ${error instanceof Error ? error.message : String(error)}`);
    }
    this.spend = { at: now.getTime(), ok };
    return ok;
  }

  ipHash(ip: string) {
    return createHash('sha256').update(`${this.config.get<string>('app.assistant.ipSalt') ?? ''}:${ip}`).digest('hex');
  }
}
