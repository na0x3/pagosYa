import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { CobrosService } from "./cobros.service";
import { CobroRemindersDto, DocumentCustomersQueryDto, MarkCobroPaidDto, RemindCobroDto, ShareCobroDto } from "./dto/business-document.dto";

/** D1: the merchant's cobro actions beyond D0's draft/send/void. Ownership is checked in the service. */
@ApiTags("business_documents")
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard)
@Controller("v1/stores/:storeId")
export class CobrosController {
  constructor(private readonly cobros: CobrosService) {}

  /** The customer picker of the create flow (CRM, earlier cobros, paying buyers). */
  @Get("document-customers")
  customers(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Query() query: DocumentCustomersQueryDto) {
    return this.cobros.customerSuggestions(merchant.id, storeId, query.q);
  }

  @Post("documents/:id/remind")
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  remind(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Param("id") id: string, @Body() dto: RemindCobroDto) {
    return this.cobros.remind(merchant.id, storeId, id, dto);
  }

  @Post("documents/:id/shared")
  @HttpCode(200)
  shared(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Param("id") id: string, @Body() dto: ShareCobroDto) {
    return this.cobros.shared(merchant.id, storeId, id, dto);
  }

  /** "Marcar como pagado": paid in cash, by transfer or otherwise outside pagosYa. */
  @Post("documents/:id/mark-paid")
  @HttpCode(200)
  markPaid(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Param("id") id: string, @Body() dto: MarkCobroPaidDto) {
    return this.cobros.markPaid(merchant.id, storeId, id, dto);
  }

  /** The automatic reminders switch, after creation. */
  @Post("documents/:id/reminders")
  @HttpCode(200)
  reminders(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Param("id") id: string, @Body() dto: CobroRemindersDto) {
    return this.cobros.setAutoReminders(merchant.id, storeId, id, dto);
  }
}
