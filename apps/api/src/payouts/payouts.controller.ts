import { Controller, Get, Res, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { PayoutsService } from "./payouts.service";

@ApiTags("payouts")
@Controller("v1/merchants")
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get("balance")
  @ApiBearerAuth()
  @UseGuards(MerchantAuthGuard)
  async getBalance(@CurrentMerchant() merchant: { id: string }) {
    const payableBalance = await this.payouts.getPayableBalance(merchant.id);
    return { payableBalance, currency: "BOB" };
  }

  @Get("payouts.pdf")
  @ApiBearerAuth()
  @UseGuards(MerchantAuthGuard)
  async listPdf(@CurrentMerchant() merchant: { id: string }, @Res({ passthrough: true }) response: Response) {
    const pdf = await this.payouts.exportPayoutsPdf(merchant.id);
    const filename = `desembolsos-${new Date().toISOString().slice(0, 10)}.pdf`;
    response.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
    return new StreamableFile(pdf);
  }

  @Get("payouts")
  @ApiBearerAuth()
  @UseGuards(MerchantAuthGuard)
  list(@CurrentMerchant() merchant: { id: string }) {
    return this.payouts.listForMerchant(merchant.id);
  }
}
