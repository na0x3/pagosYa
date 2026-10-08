import { Controller, Get, Res, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { PayoutsService } from "./payouts.service";
import { SettlementQueryService } from "../settlement/settlement-query.service";
import { nextPayoutBatch } from "../settlement/settlement-dates";

@ApiTags("payouts")
@Controller("v1/merchants")
export class PayoutsController {
  constructor(
    private readonly payouts: PayoutsService,
    private readonly settlement: SettlementQueryService,
  ) {}

  @Get("balance")
  @ApiBearerAuth()
  @UseGuards(MerchantAuthGuard)
  async getBalance(@CurrentMerchant() merchant: { id: string }) {
    const [balances, payoutsHeld] = await Promise.all([this.settlement.balances(merchant.id), this.settlement.payoutsHeld(merchant.id)]);
    const nextBatch = nextPayoutBatch(new Date()).toISOString();
    // The same rule the daily batch applies, so nextPayoutAt never promises a payout it will skip.
    const blockers = await Promise.all(balances.map((b) => this.payouts.payoutBlocker(merchant.id, b.currency)));
    const rows = balances.map((b, i) => ({
      currency: b.currency,
      payableBalance: b.available, // existing dashboard clients read this
      available: b.available,
      pending: b.pending,
      reserve: b.reserve,
      nextPayoutAt: b.available > 0 && blockers[i] === null ? nextBatch : null,
      payoutBlocker: blockers[i], // a code, never the ops hold reason
    }));
    const payableBalance = rows.find((r) => r.currency === "BOB")?.payableBalance ?? 0;
    return { payableBalance, currency: "BOB", payoutsHeld, balances: rows };
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
