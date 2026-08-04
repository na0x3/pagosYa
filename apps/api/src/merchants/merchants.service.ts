import { Injectable } from "@nestjs/common";
import { ApiKeyMode, ApiKeyType } from "@prisma/client";
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
   * the "5-minute integration" story starts here. LIVE keys are issued
   * separately once ASFI/bank-partner onboarding is complete (future phase).
   */
  async create(dto: CreateMerchantDto) {
    const merchant = await this.prisma.merchant.create({
      data: {
        name: dto.name,
        email: dto.email,
        settlementMode: dto.settlementMode,
        status: "ACTIVE",
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
}
