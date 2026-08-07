import { ForbiddenException, Injectable } from "@nestjs/common";
import { ApiKeyMode, ApiKeyType, MerchantStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ApiKeyService } from "../auth/api-key.service";
import { CreateMerchantDto } from "./dto/create-merchant.dto";

@Injectable()
export class MerchantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiKeys: ApiKeyService,
  ) {}

  /**
   * Self-serve sandbox onboarding: instant TEST-mode keys, no manual review —
   * the "5-minute integration" story starts here. Merchant status starts at
   * its schema default (PENDING); LIVE keys are gated on it separately (see
   * issueLiveKeys) once KYC review (KycService) flips it to ACTIVE.
   */
  async create(dto: CreateMerchantDto) {
    const merchant = await this.prisma.merchant.create({
      data: {
        name: dto.name,
        email: dto.email,
        settlementMode: dto.settlementMode,
      },
    });

    const secretKey = await this.apiKeys.issue(merchant.id, ApiKeyType.SECRET, ApiKeyMode.TEST);
    const publishableKey = await this.apiKeys.issue(merchant.id, ApiKeyType.PUBLISHABLE, ApiKeyMode.TEST);

    return {
      merchant,
      testKeys: {
        secretKey: secretKey.fullKey,
        publishableKey: publishableKey.fullKey,
      },
    };
  }

  /** Gate: only merchants KYC-approved (status ACTIVE) can get LIVE keys. */
  async issueLiveKeys(merchantId: string) {
    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: merchantId } });
    if (merchant.status !== MerchantStatus.ACTIVE) {
      throw new ForbiddenException(
        "Live keys are issued once KYC review is approved. Submit KYC via POST /v1/merchants/kyc.",
      );
    }

    const secretKey = await this.apiKeys.issue(merchant.id, ApiKeyType.SECRET, ApiKeyMode.LIVE);
    const publishableKey = await this.apiKeys.issue(merchant.id, ApiKeyType.PUBLISHABLE, ApiKeyMode.LIVE);

    return {
      liveKeys: {
        secretKey: secretKey.fullKey,
        publishableKey: publishableKey.fullKey,
      },
    };
  }
}
