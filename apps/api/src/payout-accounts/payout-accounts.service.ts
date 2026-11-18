import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { OpsRole, PayoutAccountStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PrivateFilesService } from "../commerce-platform/private-files.service";
import { AuditLogService } from "../ops/audit-log.service";
import { EMAIL_PROVIDER } from "../dashboard/tokens";
import { EmailProvider } from "../dashboard/interfaces/email-provider.interface";
import { MerchantMfaService } from "../dashboard/merchant-mfa.service";
import { lockMerchantSettlement } from "../settlement/settlement-lock";
import { checkComplaintFiles, safeFileName, type UploadedComplaintFile } from "../complaints/complaint-files";
import { bankName, normaliseAccountNumber, payableFromFor, validateApproval } from "./payout-account-rules";
import { ApprovePayoutAccountDto, CreatePayoutAccountDto } from "./dto/payout-account.dto";

export type PayoutAccountActor = { id: string; name: string; email: string; role: OpsRole };
const label = (actor: PayoutAccountActor) => `${actor.name} <${actor.email}>`;
const CURRENCY = "BOB";
const laPazDateTime = (at: Date) => new Intl.DateTimeFormat("es-BO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/La_Paz" }).format(at);

type AccountRow = Prisma.PayoutAccountGetPayload<object>;

function merchantView(a: AccountRow) {
  return {
    id: a.id, bankCode: a.bankCode, bankName: bankName(a.bankCode), accountLast4: a.accountNumber.slice(-4), holderName: a.holderName,
    status: a.status, isChange: a.isChange, ownerType: a.ownerType ?? null, payableFrom: a.payableFrom, reviewNote: a.reviewNote, createdAt: a.createdAt,
  };
}
export type MerchantPayoutAccountView = ReturnType<typeof merchantView>;

@Injectable()
export class PayoutAccountsService {
  private readonly logger = new Logger(PayoutAccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly files: PrivateFilesService,
    private readonly auditLog: AuditLogService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    @Optional() private readonly mfa?: MerchantMfaService,
  ) {}

  async create(merchantId: string, dto: CreatePayoutAccountDto, file: UploadedComplaintFile | undefined, actor?: { userId: string }) {
    if (!file) throw new BadRequestException("Sube el certificado o la captura de tu banco.");
    // ISO M-09: redirecting payouts away from an approved account takes the person's second factor, before anything is stored.
    if (this.mfa && actor && (await this.prisma.payoutAccount.findFirst({ where: { merchantId, currency: CURRENCY, status: PayoutAccountStatus.APPROVED }, select: { id: true } }))) {
      await this.mfa.assertForPayoutChange(actor.userId, dto.mfaCode);
    }
    const [proof] = checkComplaintFiles([file]);
    const accountNumber = normaliseAccountNumber(dto.accountNumber);
    const holderName = dto.holderName.trim();
    const storageKey = await this.files.put(proof.buffer, proof.contentType);
    const created = await this.prisma.$transaction(async (tx) => {
      // The same lock the payout batch takes: a change and a batch never interleave, and two changes can't both pass.
      await lockMerchantSettlement(tx, merchantId);
      if (await tx.payoutAccount.findFirst({ where: { merchantId, currency: CURRENCY, status: PayoutAccountStatus.PENDING_REVIEW } })) {
        throw new ConflictException("Ya tienes una cuenta en revisión.");
      }
      const approved = await tx.payoutAccount.findFirst({ where: { merchantId, currency: CURRENCY, status: PayoutAccountStatus.APPROVED } });
      return tx.payoutAccount.create({
        data: {
          merchantId, currency: CURRENCY, bankCode: dto.bankCode, accountNumber, holderName,
          proofStorageKey: storageKey, proofFileName: safeFileName(proof.originalname), proofContentType: proof.contentType,
          isChange: Boolean(approved),
        },
      });
    });
    if (created.isChange) {
      await this.notify(merchantId, "Pidieron cambiar tu cuenta para desembolsos",
        `Pidieron cambiar la cuenta bancaria donde recibes tus desembolsos de pagosYa a una cuenta terminada en ${accountNumber.slice(-4)} (${bankName(dto.bankCode)}).\n\nSi no fuiste tú, escríbenos de inmediato. Mientras revisamos el cambio, tus desembolsos están en pausa; tus ventas siguen registradas.`);
    }
    return merchantView(created);
  }

  async listForMerchant(merchantId: string) {
    const rows = await this.prisma.payoutAccount.findMany({ where: { merchantId, currency: CURRENCY }, orderBy: { createdAt: "desc" }, take: 20 });
    return rows.map(merchantView);
  }

  async pendingQueue() {
    const rows = await this.prisma.payoutAccount.findMany({
      where: { status: PayoutAccountStatus.PENDING_REVIEW },
      orderBy: { createdAt: "asc" },
      include: { merchant: { select: { id: true, name: true, email: true, level: true } }, kycSubmission: { select: { legalName: true, legalRepName: true, targetLevel: true, status: true } } },
    });
    const out = [];
    for (const row of rows) {
      const submission = row.kycSubmission ?? (await this.prisma.merchantKycSubmission.findFirst({ where: { merchantId: row.merchantId, status: "APPROVED" }, orderBy: { createdAt: "desc" }, select: { legalName: true, legalRepName: true, targetLevel: true, status: true } }));
      const { proofStorageKey: _key, kycSubmission: _sub, ...rest } = row;
      out.push({
        ...rest,
        bankName: bankName(row.bankCode),
        expected: { level: Math.max(row.merchant.level, submission?.targetLevel ?? 0), legalName: submission?.legalName ?? null, legalRepName: submission?.legalRepName ?? null },
        kycPending: row.kycSubmission?.status === "PENDING_REVIEW",
      });
    }
    return out;
  }

  private async decide(id: string, actor: PayoutAccountActor, action: string, work: (tx: Prisma.TransactionClient, account: AccountRow) => Promise<{ data: Prisma.PayoutAccountUncheckedUpdateManyInput; metadata: Record<string, unknown> }>) {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.payoutAccount.findUnique({ where: { id } });
      if (!account) throw new NotFoundException("Cuenta no encontrada");
      await lockMerchantSettlement(tx, account.merchantId);
      const current = await tx.payoutAccount.findUnique({ where: { id } });
      if (!current || current.status !== PayoutAccountStatus.PENDING_REVIEW) throw new ConflictException("Esta cuenta ya fue revisada.");
      const { data, metadata } = await work(tx, current);
      // Conditional on still waiting: a decision that landed first (e.g. the identity was rejected) is never overwritten.
      const { count } = await tx.payoutAccount.updateMany({ where: { id, status: PayoutAccountStatus.PENDING_REVIEW }, data });
      if (count === 0) throw new ConflictException("Esta cuenta ya fue revisada.");
      await this.auditLog.record(tx, { actorType: "OPS_USER", actorId: actor.id, actorLabel: label(actor), action, targetType: "PayoutAccount", targetId: id, metadata: { merchantId: current.merchantId, isChange: current.isChange, ...metadata } });
      return { ...current, ...data } as AccountRow;
    });
  }

  async approve(id: string, dto: ApprovePayoutAccountDto, actor: PayoutAccountActor, now = new Date()) {
    const updated = await this.decide(id, actor, "payout_account.approved", async (tx, account) => {
      const merchant = await tx.merchant.findUniqueOrThrow({ where: { id: account.merchantId } });
      // The proof is compared with an identity: the one sent with this account, else the merchant's approved one.
      const submission = account.kycSubmissionId
        ? await tx.merchantKycSubmission.findFirst({ where: { id: account.kycSubmissionId } })
        : await tx.merchantKycSubmission.findFirst({ where: { merchantId: account.merchantId, status: "APPROVED" }, orderBy: { createdAt: "desc" } });
      if (!submission || submission.status === "REJECTED") throw new ConflictException("Esta cuenta no tiene una verificación de identidad para comparar.");
      const level = Math.max(merchant.level, submission.targetLevel ?? 0);
      validateApproval({ isChange: account.isChange, actorRole: actor.role, level, checks: dto.checks, ownerType: dto.ownerType, reason: dto.reason });
      const payableFrom = payableFromFor(account.isChange, now);
      await tx.payoutAccount.updateMany({
        where: { merchantId: account.merchantId, currency: account.currency, status: PayoutAccountStatus.APPROVED, id: { not: account.id } },
        data: { status: PayoutAccountStatus.REPLACED },
      });
      return {
        data: { status: PayoutAccountStatus.APPROVED, ownerType: dto.ownerType, checks: { nameMatches: dto.checks.nameMatches, numberMatches: dto.checks.numberMatches, bankMatches: dto.checks.bankMatches }, reviewNote: dto.reason?.trim() || null, reviewedAt: now, reviewedByOpsUserId: actor.id, reviewedByLabel: label(actor), payableFrom },
        metadata: { checks: dto.checks, ownerType: dto.ownerType, reason: dto.reason ?? null, payableFrom: payableFrom.toISOString() },
      };
    });
    await this.notify(updated.merchantId, "Aprobamos tu cuenta para desembolsos",
      `Verificamos la cuenta terminada en ${updated.accountNumber.slice(-4)}. Recibes desembolsos en ella desde el ${laPazDateTime(updated.payableFrom!)}.`);
    return updated;
  }

  async reject(id: string, reason: string, actor: PayoutAccountActor) {
    const updated = await this.decide(id, actor, "payout_account.rejected", async () => ({
      data: { status: PayoutAccountStatus.REJECTED, reviewNote: reason.trim(), reviewedAt: new Date(), reviewedByOpsUserId: actor.id, reviewedByLabel: label(actor) },
      metadata: { reason: reason.trim() },
    }));
    await this.notify(updated.merchantId, "No aprobamos tu cuenta para desembolsos",
      `No aprobamos la cuenta terminada en ${updated.accountNumber.slice(-4)}: ${reason.trim()}\n\n${updated.isChange ? "Seguimos pagando a tu cuenta anterior." : "Sube un nuevo comprobante desde tu panel para recibir desembolsos."}`);
    return updated;
  }

  /**
   * Called inside the identity review's transaction when ops reject the identity: the first account sent with it
   * loses the identity it was checked against, so it is rejected too — waiting or already approved. Audited per account.
   */
  async rejectLinkedToSubmission(tx: Prisma.TransactionClient, input: { submissionId: string; merchantId: string; note: string; actor: { id: string; name: string; email: string } }) {
    await lockMerchantSettlement(tx, input.merchantId);
    const where = { kycSubmissionId: input.submissionId, isChange: false, status: { in: [PayoutAccountStatus.PENDING_REVIEW, PayoutAccountStatus.APPROVED] } };
    const affected = await tx.payoutAccount.findMany({ where, select: { id: true } });
    if (!affected.length) return;
    const actorLabel = `${input.actor.name} <${input.actor.email}>`;
    await tx.payoutAccount.updateMany({ where, data: { status: PayoutAccountStatus.REJECTED, reviewNote: input.note, reviewedAt: new Date(), reviewedByOpsUserId: input.actor.id, reviewedByLabel: actorLabel } });
    for (const { id } of affected) {
      await this.auditLog.record(tx, { actorType: "OPS_USER", actorId: input.actor.id, actorLabel, action: "payout_account.rejected", targetType: "PayoutAccount", targetId: id, metadata: { merchantId: input.merchantId, reason: input.note, becauseIdentityRejected: true } });
    }
  }

  async proof(id: string, actor: PayoutAccountActor) {
    const account = await this.prisma.payoutAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException("Cuenta no encontrada");
    const bytes = await this.files.get(account.proofStorageKey);
    await this.prisma.$transaction((tx) => this.auditLog.record(tx, { actorType: "OPS_USER", actorId: actor.id, actorLabel: label(actor), action: "payout_account.proof_viewed", targetType: "PayoutAccount", targetId: id, metadata: { merchantId: account.merchantId } }));
    return { bytes, fileName: account.proofFileName, contentType: account.proofContentType };
  }

  /** Best effort: the change stands even if an email fails; the failure is logged. */
  private async notify(merchantId: string, subject: string, body: string) {
    const users = await this.prisma.merchantUser.findMany({ where: { merchantId, deletedAt: null, emailVerifiedAt: { not: null } }, select: { email: true } });
    for (const { email } of users) {
      await this.email.send({ to: email, subject, body }).catch((error) => this.logger.warn(`Payout account email to ${email} failed: ${(error as Error).message}`));
    }
  }
}
