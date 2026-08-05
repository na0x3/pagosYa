import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { KycStatus, MerchantStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SubmitKycDto } from "./dto/submit-kyc.dto";
import { ReviewKycDto } from "./dto/review-kyc.dto";

/**
 * pagosYa-side half of merchant onboarding: collect KYC once, review it
 * (today: a human via InternalOpsGuard; later: could also call a partner
 * bank/Tigo Money boarding API here), and gate LIVE keys on the result.
 * TEST keys are unaffected — sandbox access never requires KYC.
 */
@Injectable()
export class KycService {
  constructor(private readonly prisma: PrismaService) {}

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

  async review(submissionId: string, dto: ReviewKycDto) {
    const submission = await this.prisma.merchantKycSubmission.findUnique({ where: { id: submissionId } });
    if (!submission) throw new NotFoundException("KYC submission not found");
    if (submission.status !== KycStatus.PENDING_REVIEW) {
      throw new BadRequestException("Submission has already been reviewed");
    }

    return this.prisma.$transaction(async (tx) => {
      const reviewed = await tx.merchantKycSubmission.update({
        where: { id: submissionId },
        data: { status: dto.decision, reviewNote: dto.note, reviewedAt: new Date() },
      });

      if (dto.decision === KycStatus.APPROVED) {
        await tx.merchant.update({
          where: { id: submission.merchantId },
          data: { status: MerchantStatus.ACTIVE },
        });
      }

      return reviewed;
    });
  }
}
