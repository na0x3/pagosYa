import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { SecretApiKeyGuard } from "../auth/guards/secret-api-key.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { PayoutsService } from "./payouts.service";

@ApiTags("payouts")
@Controller("v1/merchants")
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get("balance")
  @ApiBearerAuth()
  @UseGuards(SecretApiKeyGuard)
  async getBalance(@CurrentMerchant() merchant: { id: string }) {
    const payableBalance = await this.payouts.getPayableBalance(merchant.id);
    return { payableBalance, currency: "BOB" };
  }

  @Get("payouts")
  @ApiBearerAuth()
  @UseGuards(SecretApiKeyGuard)
  list(@CurrentMerchant() merchant: { id: string }) {
    return this.payouts.listForMerchant(merchant.id);
  }
}
