import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { OpsRole, SupportCaseStatus } from "@prisma/client";
import { MerchantUserService } from "../dashboard/merchant-user.service";
import { PrismaService } from "../prisma/prisma.service";
import { AddSupportNoteDto } from "./dto/add-support-note.dto";
import { CreateSupportCaseDto } from "./dto/create-support-case.dto";
import { CreateMerchantSupportCaseDto } from "./dto/create-merchant-support-case.dto";
import { AuditLogService } from "./audit-log.service";

export interface SupportActor {
  id: string;
  name: string;
  email: string;
  role: OpsRole;
}

function actorLabel(actor: SupportActor): string {
  return `${actor.name} <${actor.email}>`;
}

function maskTail(value: string | null | undefined, visible = 4): string | null {
  if (!value) return null;
  const tail = value.slice(-visible);
  return `${"•".repeat(Math.max(4, Math.min(8, value.length - tail.length)))}${tail}`;
}

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly merchantUsers: MerchantUserService,
  ) {}

  async searchMerchants(rawQuery: string, actor: SupportActor) {
    const query = String(rawQuery ?? "").trim();
    if (query.length < 2) throw new BadRequestException("Enter at least 2 characters to search");

    return this.prisma.$transaction(async (tx) => {
      const merchants = await tx.merchant.findMany({
        where: {
          OR: [
            { id: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
            { users: { some: { email: { contains: query, mode: "insensitive" } } } },
            { stores: { some: { slug: { contains: query, mode: "insensitive" } } } },
            { stores: { some: { name: { contains: query, mode: "insensitive" } } } },
            { paymentIntents: { some: { id: { contains: query, mode: "insensitive" } } } },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          settlementMode: true,
          createdAt: true,
          users: { select: { email: true, emailVerifiedAt: true }, take: 3 },
          stores: { select: { slug: true, name: true, status: true }, take: 3, orderBy: { updatedAt: "desc" } },
          _count: { select: { paymentIntents: true, supportCases: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
      });

      await this.auditLog.record(tx, {
        actorType: "OPS_USER",
        actorId: actor.id,
        actorLabel: actorLabel(actor),
        action: "support.merchant_search",
        targetType: "MerchantSearch",
        targetId: "lookup",
        metadata: { query: maskTail(query, 3), resultCount: merchants.length },
      });
      return merchants;
    });
  }

  listCases() {
    return this.prisma.supportCase.findMany({
      select: {
        id: true,
        category: true,
        priority: true,
        status: true,
        summary: true,
        createdAt: true,
        updatedAt: true,
        merchant: { select: { id: true, name: true, email: true } },
        assignedToOpsUser: { select: { id: true, name: true, email: true } },
        _count: { select: { notes: true } },
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 100,
    });
  }

  listMerchantCases(merchantId: string) {
    return this.prisma.supportCase.findMany({
      where: { merchantId },
      select: {
        id: true,
        category: true,
        status: true,
        summary: true,
        resolution: true,
        createdAt: true,
        updatedAt: true,
        closedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });
  }

  async createMerchantCase(
    merchantId: string,
    merchantUser: { id: string; email: string },
    dto: CreateMerchantSupportCaseDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.merchantUser.findFirst({
        where: { id: merchantUser.id, merchantId },
        select: { id: true, email: true },
      });
      if (!user) throw new NotFoundException("Merchant dashboard user not found");

      const supportCase = await tx.supportCase.create({
        data: {
          merchantId,
          createdByMerchantUserId: user.id,
          category: dto.category,
          priority: "NORMAL",
          status: SupportCaseStatus.SENT,
          summary: dto.summary.trim(),
        },
        select: {
          id: true,
          category: true,
          status: true,
          summary: true,
          resolution: true,
          createdAt: true,
          updatedAt: true,
          closedAt: true,
        },
      });
      await this.auditLog.record(tx, {
        actorType: "MERCHANT_USER",
        actorId: user.id,
        actorLabel: user.email,
        action: "support.case_submitted",
        targetType: "SupportCase",
        targetId: supportCase.id,
        metadata: { merchantId, category: dto.category },
      });
      return supportCase;
    });
  }

  async createCase(dto: CreateSupportCaseDto, actor: SupportActor) {
    return this.prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.findUnique({ where: { id: dto.merchantId }, select: { id: true } });
      if (!merchant) throw new NotFoundException("Merchant not found");

      const supportCase = await tx.supportCase.create({
        data: {
          merchantId: dto.merchantId,
          createdByOpsUserId: actor.id,
          assignedToOpsUserId: actor.id,
          category: dto.category,
          priority: dto.priority,
          status: SupportCaseStatus.REVIEWED,
          summary: dto.summary.trim(),
        },
        include: { merchant: { select: { id: true, name: true, email: true } } },
      });
      await this.auditLog.record(tx, {
        actorType: "OPS_USER",
        actorId: actor.id,
        actorLabel: actorLabel(actor),
        action: "support.case_created",
        targetType: "SupportCase",
        targetId: supportCase.id,
        metadata: { merchantId: dto.merchantId, category: dto.category, priority: dto.priority },
      });
      return supportCase;
    });
  }

  async getDossier(merchantId: string, caseId: string, actor: SupportActor) {
    if (!caseId) throw new BadRequestException("A support case is required to view an account");

    return this.prisma.$transaction(async (tx) => {
      let supportCase = await tx.supportCase.findUnique({
        where: { id: caseId },
        include: {
          notes: {
            include: { opsUser: { select: { id: true, name: true, email: true } } },
            orderBy: { createdAt: "desc" },
          },
          createdByOpsUser: { select: { id: true, name: true, email: true } },
          assignedToOpsUser: { select: { id: true, name: true, email: true } },
        },
      });
      if (!supportCase || supportCase.merchantId !== merchantId) {
        throw new NotFoundException("Support case not found for this merchant");
      }

      if (supportCase.status === SupportCaseStatus.PENDING || supportCase.status === SupportCaseStatus.SENT) {
        supportCase = await tx.supportCase.update({
          where: { id: supportCase.id },
          data: { status: SupportCaseStatus.REVIEWED, assignedToOpsUserId: supportCase.assignedToOpsUserId ?? actor.id },
          include: {
            notes: {
              include: { opsUser: { select: { id: true, name: true, email: true } } },
              orderBy: { createdAt: "desc" },
            },
            createdByOpsUser: { select: { id: true, name: true, email: true } },
            assignedToOpsUser: { select: { id: true, name: true, email: true } },
          },
        });
        await this.auditLog.record(tx, {
          actorType: "OPS_USER",
          actorId: actor.id,
          actorLabel: actorLabel(actor),
          action: "support.case_reviewed",
          targetType: "SupportCase",
          targetId: supportCase.id,
          metadata: { merchantId },
        });
      }

      const merchant = await tx.merchant.findUnique({
        where: { id: merchantId },
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          settlementMode: true,
          createdAt: true,
          updatedAt: true,
          users: {
            select: {
              id: true,
              email: true,
              emailVerifiedAt: true,
              createdAt: true,
              sessions: { select: { expiresAt: true, revokedAt: true } },
            },
            orderBy: { createdAt: "asc" },
          },
          stores: { select: { id: true, name: true, slug: true, status: true, updatedAt: true }, orderBy: { updatedAt: "desc" } },
          paymentIntents: {
            select: { id: true, amount: true, currency: true, status: true, paymentMethodType: true, livemode: true, description: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 10,
          },
          payouts: {
            select: { id: true, amount: true, currency: true, status: true, bankAccount: true, attempts: true, failureReason: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 10,
          },
          invoices: {
            select: { id: true, paymentIntentId: true, amount: true, currency: true, status: true, attempts: true, failureReason: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 10,
          },
          kycSubmissions: {
            select: { id: true, legalName: true, taxId: true, legalRepName: true, legalRepDocumentId: true, payoutBankAccount: true, status: true, reviewNote: true, reviewedAt: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });
      if (!merchant) throw new NotFoundException("Merchant not found");

      await this.auditLog.record(tx, {
        actorType: "OPS_USER",
        actorId: actor.id,
        actorLabel: actorLabel(actor),
        action: "support.account_viewed",
        targetType: "Merchant",
        targetId: merchantId,
        metadata: { caseId },
      });

      const now = Date.now();
      return {
        supportCase,
        merchant: {
          ...merchant,
          users: merchant.users.map(({ sessions, ...user }) => ({
            ...user,
            activeSessions: sessions.filter((session) => !session.revokedAt && session.expiresAt.getTime() > now).length,
          })),
          payouts: merchant.payouts.map(({ bankAccount, ...payout }) => ({ ...payout, bankAccount: maskTail(bankAccount) })),
          kycSubmissions: merchant.kycSubmissions.map((kyc) => ({
            ...kyc,
            taxId: maskTail(kyc.taxId),
            legalRepDocumentId: maskTail(kyc.legalRepDocumentId),
            payoutBankAccount: maskTail(kyc.payoutBankAccount),
          })),
        },
      };
    });
  }

  async addNote(caseId: string, dto: AddSupportNoteDto, actor: SupportActor) {
    return this.prisma.$transaction(async (tx) => {
      const supportCase = await tx.supportCase.findUnique({ where: { id: caseId } });
      if (!supportCase) throw new NotFoundException("Support case not found");
      if (supportCase.status === SupportCaseStatus.RESOLVED) throw new BadRequestException("Resolved cases cannot receive notes");

      const note = await tx.supportCaseNote.create({
        data: { caseId, opsUserId: actor.id, body: dto.body.trim() },
        include: { opsUser: { select: { id: true, name: true, email: true } } },
      });
      await this.auditLog.record(tx, {
        actorType: "OPS_USER",
        actorId: actor.id,
        actorLabel: actorLabel(actor),
        action: "support.note_added",
        targetType: "SupportCase",
        targetId: caseId,
        metadata: { merchantId: supportCase.merchantId },
      });
      return note;
    });
  }

  async requestPasswordReset(caseId: string, merchantUserId: string, reason: string, actor: SupportActor) {
    const context = await this.requireOpenCaseAndUser(caseId, merchantUserId);
    await this.merchantUsers.requestPasswordReset(context.user.email);
    await this.prisma.$transaction((tx) =>
      this.auditLog.record(tx, {
        actorType: "OPS_USER",
        actorId: actor.id,
        actorLabel: actorLabel(actor),
        action: "support.password_reset_sent",
        targetType: "MerchantUser",
        targetId: merchantUserId,
        metadata: { caseId, merchantId: context.supportCase.merchantId, reason: reason.trim() },
      }),
    );
    return { sent: true };
  }

  async revokeSessions(caseId: string, merchantUserId: string, reason: string, actor: SupportActor) {
    return this.prisma.$transaction(async (tx) => {
      const supportCase = await tx.supportCase.findUnique({ where: { id: caseId } });
      if (!supportCase) throw new NotFoundException("Support case not found");
      if (supportCase.status === SupportCaseStatus.RESOLVED) throw new BadRequestException("Support case is already resolved");
      const user = await tx.merchantUser.findFirst({ where: { id: merchantUserId, merchantId: supportCase.merchantId } });
      if (!user) throw new NotFoundException("Merchant dashboard user not found for this case");

      const revoked = await tx.merchantSession.updateMany({
        where: { merchantUserId, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { revokedAt: new Date() },
      });
      await this.auditLog.record(tx, {
        actorType: "OPS_USER",
        actorId: actor.id,
        actorLabel: actorLabel(actor),
        action: "support.sessions_revoked",
        targetType: "MerchantUser",
        targetId: merchantUserId,
        metadata: { caseId, merchantId: supportCase.merchantId, reason: reason.trim(), revokedCount: revoked.count },
      });
      return { revokedCount: revoked.count };
    });
  }

  async resolveCase(caseId: string, resolution: string, actor: SupportActor) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.supportCase.findUnique({ where: { id: caseId } });
      if (!existing) throw new NotFoundException("Support case not found");
      if (existing.status === SupportCaseStatus.RESOLVED) throw new BadRequestException("Support case is already resolved");

      const supportCase = await tx.supportCase.update({
        where: { id: caseId },
        data: { status: SupportCaseStatus.RESOLVED, resolution: resolution.trim(), closedAt: new Date() },
      });
      await this.auditLog.record(tx, {
        actorType: "OPS_USER",
        actorId: actor.id,
        actorLabel: actorLabel(actor),
        action: "support.case_resolved",
        targetType: "SupportCase",
        targetId: caseId,
        metadata: { merchantId: existing.merchantId, resolution: resolution.trim() },
      });
      return supportCase;
    });
  }

  private async requireOpenCaseAndUser(caseId: string, merchantUserId: string) {
    const supportCase = await this.prisma.supportCase.findUnique({ where: { id: caseId } });
    if (!supportCase) throw new NotFoundException("Support case not found");
    if (supportCase.status === SupportCaseStatus.RESOLVED) throw new BadRequestException("Support case is already resolved");
    const user = await this.prisma.merchantUser.findFirst({ where: { id: merchantUserId, merchantId: supportCase.merchantId } });
    if (!user) throw new NotFoundException("Merchant dashboard user not found for this case");
    return { supportCase, user };
  }
}
