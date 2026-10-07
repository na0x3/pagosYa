import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { EmailCopyField, EmailType } from './email-kit-contract';
import { cleanCopyValue } from './email-kit-validate';

export type KitStatus = 'CANDIDATE' | 'ACTIVE' | 'PREVIOUS';
export type KitRow = { id: string; status: KitStatus; mode: 'twin' | 'bold'; layout: string; blocks: string; copy: unknown;
  designedFromRevision: number | null; credits: number; model: string | null; repairs: unknown; createdAt: Date };
export type NewKit = Omit<KitRow, 'id' | 'status' | 'createdAt'>;
type Db = Pick<PrismaService, 'storeEmailKit' | 'storeEmailCopyOverride'>;

const find = (db: Db, storeId: string, status: KitStatus) =>
  db.storeEmailKit.findUnique({ where: { storeId_status: { storeId, status } } }) as Promise<KitRow | null>;
const create = (db: Db, storeId: string, status: KitStatus, kit: NewKit) =>
  db.storeEmailKit.create({ data: { storeId, status, ...kit, copy: kit.copy as Prisma.InputJsonValue, repairs: kit.repairs as Prisma.InputJsonValue } }) as Promise<KitRow>;

/** A store's email looks: at most one candidate, one active and one previous. */
@Injectable()
export class EmailKitStore {
  constructor(private readonly prisma: PrismaService) {}

  active(storeId: string) { return find(this.prisma, storeId, 'ACTIVE'); }
  candidate(storeId: string) { return find(this.prisma, storeId, 'CANDIDATE'); }
  async hasPrevious(storeId: string) { return (await find(this.prisma, storeId, 'PREVIOUS')) !== null; }

  saveCandidate(storeId: string, kit: NewKit): Promise<KitRow> {
    return this.prisma.$transaction(async tx => {
      await tx.storeEmailKit.deleteMany({ where: { storeId, status: 'CANDIDATE' } });
      return create(tx, storeId, 'CANDIDATE', kit);
    });
  }

  /** A store's first look goes live at once; any later design waits for the merchant. */
  async saveActive(storeId: string, kit: NewKit): Promise<KitRow> {
    if (await this.active(storeId)) return this.saveCandidate(storeId, kit);
    return create(this.prisma, storeId, 'ACTIVE', kit);
  }

  async accept(storeId: string): Promise<void> {
    await this.prisma.$transaction(async tx => {
      const candidate = await find(tx, storeId, 'CANDIDATE');
      if (!candidate) throw new BadRequestException('No hay un diseño nuevo para usar.');
      const active = await find(tx, storeId, 'ACTIVE');
      await tx.storeEmailKit.deleteMany({ where: { storeId, status: 'PREVIOUS' } });
      if (active) await tx.storeEmailKit.update({ where: { id: active.id }, data: { status: 'PREVIOUS' } });
      await tx.storeEmailKit.update({ where: { id: candidate.id }, data: { status: 'ACTIVE' } });
    });
  }

  async discard(storeId: string): Promise<void> {
    await this.prisma.storeEmailKit.deleteMany({ where: { storeId, status: 'CANDIDATE' } });
  }

  async revert(storeId: string): Promise<void> {
    await this.prisma.$transaction(async tx => {
      // A pending candidate is dropped first: the swap below passes the active row through CANDIDATE,
      // so the (storeId, status) unique index never sees two rows with one status.
      await tx.storeEmailKit.deleteMany({ where: { storeId, status: 'CANDIDATE' } });
      const [active, previous] = await Promise.all([find(tx, storeId, 'ACTIVE'), find(tx, storeId, 'PREVIOUS')]);
      if (!previous) throw new BadRequestException('No hay un diseño anterior.');
      if (active) await tx.storeEmailKit.update({ where: { id: active.id }, data: { status: 'CANDIDATE' } });
      await tx.storeEmailKit.update({ where: { id: previous.id }, data: { status: 'ACTIVE' } });
      if (active) await tx.storeEmailKit.update({ where: { id: active.id }, data: { status: 'PREVIOUS' } });
    });
  }

  async overrides(storeId: string, type: EmailType): Promise<Partial<Record<EmailCopyField, string>>> {
    const rows = await this.prisma.storeEmailCopyOverride.findMany({ where: { storeId, emailType: type } });
    return Object.fromEntries(rows.map(row => [row.field, row.value]));
  }

  async setOverride(storeId: string, type: EmailType, field: EmailCopyField, value: string): Promise<{ value: string; repairs: string[] }> {
    const cleaned = cleanCopyValue(field, value);
    if (!cleaned.value) throw new BadRequestException('Ese texto solo tenía datos que pone la plataforma (montos, fechas o números de orden). Escribe un texto.');
    await this.prisma.storeEmailCopyOverride.upsert({
      where: { storeId_emailType_field: { storeId, emailType: type, field } },
      create: { storeId, emailType: type, field, value: cleaned.value },
      update: { value: cleaned.value },
    });
    return { value: cleaned.value, repairs: cleaned.repairs };
  }

  async clearOverride(storeId: string, type: EmailType, field: EmailCopyField): Promise<void> {
    await this.prisma.storeEmailCopyOverride.deleteMany({ where: { storeId, emailType: type, field } });
  }
}
