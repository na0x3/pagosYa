import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { TermsAcceptanceSource } from "@prisma/client";
import { MerchantSessionGuard } from "../dashboard/guards/merchant-session.guard";
import { TermsAcceptanceService } from "./terms-acceptance.service";
import { AcceptTermsDto } from "./dto/accept-terms.dto";
import { RequestWithContext, requestContext } from "./request-context";

type SessionRequest = RequestWithContext & {
  merchant: { id: string };
  merchantUser: { id: string };
};

/** Session-only: accepting terms is a person's act, so a secret API key can't click "accept" for them. */
@ApiTags("dashboard")
@ApiBearerAuth()
@UseGuards(MerchantSessionGuard)
@Controller("v1/dashboard/terms")
export class DashboardTermsController {
  constructor(private readonly terms: TermsAcceptanceService) {}

  @Get()
  status(@Req() req: SessionRequest) {
    return this.terms.merchantStatus(req.merchant.id);
  }

  @Post("accept")
  accept(@Req() req: SessionRequest, @Body() dto: AcceptTermsDto) {
    return this.terms.acceptMerchantTerms({
      merchantId: req.merchant.id,
      merchantUserId: req.merchantUser.id,
      version: dto.version,
      source: TermsAcceptanceSource.DASHBOARD,
      context: requestContext(req),
    });
  }
}
