import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { requestContext, type RequestWithContext } from "../legal/request-context";
import { ContractsService } from "./contracts.service";
import { sessionRef } from "./contract-signing";
import { DraftContractDto, RegenerateContractClauseDto, SignContractDto } from "./dto/business-document.dto";

type SignedInRequest = RequestWithContext & { merchantUser?: { id: string; email: string } };

/** D3: the merchant's contract actions beyond D0's edit/send/void. Ownership is checked in the service. */
@ApiTags("business_documents")
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard)
@Controller("v1/stores/:storeId")
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  /** "Crear borrador con IA" (or the template with `ai: false`): a DRAFT contract with the parties prefilled. */
  @Post("contracts/draft")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  draft(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Body() dto: DraftContractDto) {
    return this.contracts.draft(merchant.id, storeId, dto);
  }

  /** The Contratos header: counts per tab and how many wait for the merchant's signature. */
  @Get("contracts/summary")
  summary(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string) {
    return this.contracts.summary(merchant.id, storeId);
  }

  /** "Regenerar con IA" on one clause; returned, not saved. */
  @Post("contracts/:id/regenerate-clause")
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  regenerate(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Param("id") id: string, @Body() dto: RegenerateContractClauseDto) {
    return this.contracts.regenerateClause(merchant.id, storeId, id, dto);
  }

  /** "Firmar": the signed-in user's name on the current version (who, which session, IP and device recorded). */
  @Post("contracts/:id/sign")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  sign(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Param("id") id: string, @Body() dto: SignContractDto, @Req() req: SignedInRequest) {
    const header = req.headers["authorization"];
    const token = (Array.isArray(header) ? header[0] : header)?.replace(/^Bearer\s+/i, "") ?? null;
    const actor = { userId: req.merchantUser?.id ?? null, email: req.merchantUser?.email ?? null, sessionRef: sessionRef(token) };
    return this.contracts.merchantSign(merchant.id, storeId, id, dto, actor, requestContext(req));
  }
}
