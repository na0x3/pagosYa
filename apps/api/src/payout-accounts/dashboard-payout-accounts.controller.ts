import { Body, Controller, Get, Post, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MerchantSessionGuard } from "../dashboard/guards/merchant-session.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import type { UploadedComplaintFile } from "../complaints/complaint-files";
import { PayoutAccountsService } from "./payout-accounts.service";
import { CreatePayoutAccountDto } from "./dto/payout-account.dto";

/** Session only: an API key must never be able to redirect a merchant's payouts. */
@ApiTags("payout-accounts")
@ApiBearerAuth()
@UseGuards(MerchantSessionGuard)
@Controller("v1/dashboard/payout_accounts")
export class DashboardPayoutAccountsController {
  constructor(private readonly accounts: PayoutAccountsService) {}

  @Get() list(@CurrentMerchant() merchant: { id: string }) { return this.accounts.listForMerchant(merchant.id); }

  @Post()
  @UseInterceptors(FileInterceptor("proof", { limits: { fileSize: 5_000_000 } }))
  create(@CurrentMerchant() merchant: { id: string }, @Body() dto: CreatePayoutAccountDto, @UploadedFile() proof: UploadedComplaintFile, @Req() req: { merchantUser: { id: string } }) {
    return this.accounts.create(merchant.id, dto, proof, { userId: req.merchantUser.id });
  }
}
