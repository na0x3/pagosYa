import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { KycStatus, MerchantStatus, PayoutAccountStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../ops/audit-log.service";
import { SubmitKycDto } from "./dto/submit-kyc.dto";
import { ReviewKycDto } from "./dto/review-kyc.dto";
import { TermsAcceptanceService } from "../legal/terms-acceptance.service";
import { IdentityDocumentsService } from "./identity-documents.service";
import type { OpsActor } from "./ops-actor";
import { PayoutAccountsService } from "../payout-accounts/payout-accounts.service";
import { accountSnapshot, ownerFitsLevel } from "../payout-accounts/payout-account-rules";
import { SanctionsService } from "../sanctions/sanctions.service";

/**
 * pagosYa-side half of merchant onboarding: collect KYC once, review it
 * (today: a named OpsUser via OpsAuthGuard; later: could also call a partner
 * bank/Tigo Money boarding API here), and gate LIVE keys on the result.
 * TEST keys are unaffected — sandbox access never requires KYC.
 */
@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly terms: TermsAcceptanceService,
    private readonly identityDocuments: IdentityDocumentsService,
    private readonly payoutAccounts: PayoutAccountsService,
    @Optional() private readonly sanctions?: SanctionsService,
  ) {}

  async submit(merchantId: string, dto: SubmitKycDto) {
    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: merchantId } });
    const targetLevel = dto.targetLevel ?? 2;
    if (targetLevel <= merchant.level) throw new BadRequestException("Ya tienes este nivel");
    if (await this.terms.needsMerchantAcceptance(merchantId)) {
      throw new BadRequestException("Debes aceptar los Términos y Condiciones vigentes antes de enviar tu verificación");
    }
    if (!dto.ciFrontDocId || !dto.ciBackDocId || !dto.selfieDocId) {
      throw new BadRequestException("Sube las dos caras de tu CI y una selfie con tu CI");
    }
    if (targetLevel >= 2 && (!dto.taxId || !dto.legalRepName || !dto.legalRepDocumentId)) {
      throw new BadRequestException("Para el nivel Negocio necesitamos NIT, razón social y representante legal");
    }
    if (targetLevel === 1 && !dto.legalRepDocumentId) throw new BadRequestException("Ingresa tu número de CI");
    if (targetLevel === 1 && !dto.nitCertificateDocId) throw new BadRequestException("Sube tu certificación de no inscripción en el NIT del SIN");
    await this.identityDocuments.assertOwned(merchantId, dto);

    const pending = await this.prisma.merchantKycSubmission.findFirst({
      where: { merchantId, status: KycStatus.PENDING_REVIEW },
    });
    if (pending) {
      throw new BadRequestException("A KYC submission is already pending review");
    }

    // Payouts only ever go to an account ops approved against proof; the free-text account is no longer accepted.
    const account = await this.prisma.payoutAccount.findFirst({
      where: { id: dto.payoutAccountId, merchantId, status: { in: [PayoutAccountStatus.PENDING_REVIEW, PayoutAccountStatus.APPROVED] } },
    });
    if (!account) throw new BadRequestException("Agrega tu cuenta bancaria con su comprobante");
    // An approved account was checked for one kind of owner; a business level needs one in the company's name.
    if (account.status === PayoutAccountStatus.APPROVED && !ownerFitsLevel(account.ownerType, targetLevel)) {
      throw new BadRequestException("Para el nivel Negocio necesitamos una cuenta a nombre de la empresa (o de su dueño si es unipersonal). Agrega una nueva con su comprobante.");
    }

    const submission = await this.prisma.merchantKycSubmission.create({
      data: {
        merchantId,
        targetLevel,
        legalName: dto.legalName,
        taxId: dto.taxId?.trim() || null,
        legalRepName: dto.legalRepName?.trim() || (targetLevel === 1 ? dto.legalName : null),
        legalRepDocumentId: dto.legalRepDocumentId?.trim() || null,
        payoutBankAccount: accountSnapshot(account),
        payoutUsdBankAccount: dto.payoutUsdBankAccount?.trim() || null,
        ciFrontDocId: dto.ciFrontDocId,
        ciBackDocId: dto.ciBackDocId,
        selfieDocId: dto.selfieDocId,
        nitCertificateDocId: targetLevel === 1 ? dto.nitCertificateDocId : null,
        isPep: dto.isPep === true,
        pepRole: dto.isPep === true ? dto.pepRole?.trim() || null : null,
      },
    });
    // Sanctions lists (UN, OFAC): checked now; a failure here never loses the submission, approval screens again.
    await this.sanctions?.screenSubmission(submission.id).catch((error) => this.logger.error(`Sanctions screening failed for ${submission.id}: ${(error as Error).message}`));
    if (account.status === PayoutAccountStatus.PENDING_REVIEW && !account.kycSubmissionId) {
      await this.prisma.payoutAccount.update({ where: { id: account.id }, data: { kycSubmissionId: submission.id } });
    }
    return submission;
  }

  async latest(merchantId: string) {
    const submission = await this.prisma.merchantKycSubmission.findFirst({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
    });
    return submission ?? { status: "NOT_SUBMITTED" as const };
  }

  /** Ops queue: submissions awaiting a human decision, oldest first. */
  async listPending() {
    return this.prisma.merchantKycSubmission.findMany({
      where: { status: KycStatus.PENDING_REVIEW },
      include: {
        merchant: { select: { id: true, name: true, email: true, settlementMode: true, level: true } },
        // The account sent with this identity: ops see whether it is approved and can open its proof.
        payoutAccounts: { select: { id: true, status: true, isChange: true, bankCode: true, accountNumber: true, holderName: true, ownerType: true }, orderBy: { createdAt: "desc" }, take: 1 },
        // The latest sanctions screening: ops decide a possible match before they can approve.
        screenings: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async review(submissionId: string, dto: ReviewKycDto, actor: OpsActor) {
    const submission = await this.prisma.merchantKycSubmission.findUnique({ where: { id: submissionId } });
    if (!submission) throw new NotFoundException("KYC submission not found");
    if (submission.status !== KycStatus.PENDING_REVIEW) {
      throw new BadRequestException("Submission has already been reviewed");
    }

    const actorLabel = `${actor.name} <${actor.email}>`;
    if (dto.decision === KycStatus.APPROVED) {
      const blocker = await this.sanctions?.approvalBlocker(submissionId);
      if (blocker) throw new BadRequestException(blocker);
      // A politically exposed person gets enhanced due diligence: the approval says what was checked.
      if (submission.isPep && (dto.note?.trim().length ?? 0) < 15) {
        throw new BadRequestException("Persona expuesta políticamente: escribe en la nota qué revisaste (origen de fondos, cargo) antes de aprobar");
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const reviewed = await tx.merchantKycSubmission.update({
        where: { id: submissionId },
        data: {
          status: dto.decision,
          reviewNote: dto.note,
          reviewedAt: new Date(),
          reviewedByOpsUserId: actor.id,
          reviewedByLabel: actorLabel,
        },
      });

      // A stale submission (e.g. targetLevel 1, still pending after ops raised
      // the merchant to level 3 directly) must never LOWER the merchant's level.
      if (dto.decision === KycStatus.REJECTED) {
        await this.payoutAccounts.rejectLinkedToSubmission(tx, { submissionId, merchantId: submission.merchantId, note: dto.note ?? "Verificación rechazada", actor });
      }

      let resultingLevel: number | undefined;
      if (dto.decision === KycStatus.APPROVED) {
        const merchant = await tx.merchant.findUniqueOrThrow({ where: { id: submission.merchantId } });
        resultingLevel = Math.max(merchant.level, submission.targetLevel);
        await tx.merchant.update({
          where: { id: submission.merchantId },
          data: { status: MerchantStatus.ACTIVE, level: resultingLevel },
        });
      }

      await this.auditLog.record(tx, {
        actorType: "OPS_USER",
        actorId: actor.id,
        actorLabel,
        action: `kyc.${dto.decision.toLowerCase()}`,
        targetType: "MerchantKycSubmission",
        targetId: submissionId,
        metadata: {
          merchantId: submission.merchantId,
          targetLevel: submission.targetLevel,
          ...(resultingLevel !== undefined ? { level: resultingLevel } : {}),
          note: dto.note,
        },
      });

      return reviewed;
    });
  }
}
