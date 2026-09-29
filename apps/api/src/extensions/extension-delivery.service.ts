import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { StoreEventRecord } from './extension';
import { EXTENSION_REGISTRY, EXTENSIONS, type ExtensionRegistry } from './registry';
import { SecretBox, SecretBoxError } from './secret-box';
import { readSettings } from './settings';

export const RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const LEASE_MS = 2 * 60_000;
const KEEP_MS = 30 * 24 * 60 * 60_000;
const BATCH = 20;

/** Runs extensions' onEvent for queued deliveries (spec 2026-09-27 §6), leased like store-import. */
@Injectable()
export class ExtensionDeliveryService {
  private readonly registry: ExtensionRegistry;
  constructor(private readonly prisma: PrismaService, private readonly box: SecretBox, @Optional() @Inject(EXTENSION_REGISTRY) registry?: ExtensionRegistry) { this.registry = registry ?? EXTENSIONS; }

  async runOnce(now = new Date()) {
    const due = await this.prisma.extensionDelivery.findMany({
      where: { OR: [{ status: 'PENDING', nextAttemptAt: { lte: now } }, { status: 'RUNNING', leaseUntil: { lt: now } }] },
      orderBy: { nextAttemptAt: 'asc' }, take: BATCH,
    });
    let processed = 0;
    for (const candidate of due) {
      const leaseToken = randomUUID();
      const claimed = await this.prisma.extensionDelivery.updateMany({
        where: { id: candidate.id, status: candidate.status, leaseToken: candidate.leaseToken },
        data: { status: 'RUNNING', leaseToken, leaseUntil: new Date(now.getTime() + LEASE_MS), attempts: { increment: 1 } },
      });
      if (!claimed.count) continue;
      processed++;
      await this.deliver(candidate.id, leaseToken, candidate.attempts + 1, now);
    }
    return processed;
  }

  private async deliver(id: string, leaseToken: string, attempt: number, now: Date) {
    const delivery = await this.prisma.extensionDelivery.findUniqueOrThrow({ where: { id }, include: { event: true } });
    const finish = (data: Record<string, unknown>) => this.prisma.extensionDelivery.updateMany({ where: { id, leaseToken }, data: { leaseToken: null, leaseUntil: null, ...data } });
    const manifest = this.registry.find(item => item.id === delivery.extensionId);
    const installation = await this.prisma.storeExtension.findUnique({ where: { storeId_extensionId: { storeId: delivery.storeId, extensionId: delivery.extensionId } } });
    if (!manifest?.onEvent || !installation?.enabled) { await finish({ status: 'DONE', doneAt: now }); return; }
    try {
      const event: StoreEventRecord = { id: delivery.event.id, storeId: delivery.storeId, type: delivery.event.type as StoreEventRecord['type'], payload: delivery.event.payload as Record<string, unknown>, createdAt: delivery.event.createdAt };
      await manifest.onEvent(event, { storeId: delivery.storeId, settings: readSettings(manifest, installation.settings), secrets: installation.secrets ? this.box.open(installation.secrets) : {} });
      await finish({ status: 'DONE', doneAt: now, lastError: null });
    } catch (error) {
      const message = error instanceof SecretBoxError ? 'Vuelve a pegar tu clave: no pudimos leer la que guardaste.' : ((error as Error)?.message || 'Error desconocido').slice(0, 300);
      const giveUp = attempt >= MAX_ATTEMPTS;
      await finish(giveUp ? { status: 'FAILED', lastError: message } : { status: 'PENDING', lastError: message, nextAttemptAt: new Date(now.getTime() + RETRY_DELAYS_MS[attempt - 1]) });
      if (giveUp) await this.prisma.storeExtension.updateMany({ where: { storeId: delivery.storeId, extensionId: delivery.extensionId }, data: { lastError: message, lastErrorAt: now } });
    }
  }

  /** Events whose deliveries are all finished are history after 30 days. */
  async cleanup(now = new Date()) {
    const { count } = await this.prisma.storeEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - KEEP_MS) }, deliveries: { every: { status: { in: ['DONE', 'FAILED'] } } } } });
    return count;
  }
}
