import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { KycStatus, MerchantStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../ops/audit-log.service";
import { SubmitKycDto } from "./dto/submit-kyc.dto";
import { ReviewKycDto } from "./dto/review-kyc.dto";

export interface OpsActor {
  id: string;
  name: string;
  email: string;
}

/**
 * pagosYa-side half of merchant onboarding: collect KYC once, review it
 * (today: a named OpsUser via OpsAuthGuard; later: could also call a partner
 * bank/Tigo Money boarding API here), and gate LIVE keys on the result.
 * TEST keys are unaffected — sandbox access never requires KYC.
 */
@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async submit(merchantId: string, dto: SubmitKycDto) {
    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: merchantId } });
    if (merchant.status === MerchantStatus.ACTIVE) {
      throw new BadRequestException("Merchant is already active");
    }

    const pending = await this.prisma.merchantKycSubmission.findFirst({
      where: { merchantId, status: KycStatus.PENDING_REVIEW },
    });
    if (pending) {
      throw new BadRequestException("A KYC submission is already pending review");
    }

    return this.prisma.merchantKycSubmission.create({ data: { merchantId, ...dto } });
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
      include: { merchant: { select: { id: true, name: true, email: true, settlementMode: true } } },
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

      if (dto.decision === KycStatus.APPROVED) {
        await tx.merchant.update({
          where: { id: submission.merchantId },
          data: { status: MerchantStatus.ACTIVE },
        });
      }

      await this.auditLog.record(tx, {
        actorType: "OPS_USER",
        actorId: actor.id,
        actorLabel,
        action: `kyc.${dto.decision.toLowerCase()}`,
        targetType: "MerchantKycSubmission",
        targetId: submissionId,
        metadata: { merchantId: submission.merchantId, note: dto.note },
      });

      return reviewed;
    });
  }
}
