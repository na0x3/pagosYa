import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { BusinessDocumentsService } from "./business-documents.service";
import {
  CreateBusinessDocumentDto,
  ListBusinessDocumentsQueryDto,
  SendBusinessDocumentDto,
  UpdateBusinessDocumentDto,
  VoidBusinessDocumentDto,
} from "./dto/business-document.dto";

/** Cobros, proposals and contracts of one store. Ownership is checked in the service. */
@ApiTags("business_documents")
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard)
@Controller("v1/stores/:storeId/documents")
export class BusinessDocumentsController {
  constructor(private readonly documents: BusinessDocumentsService) {}

  @Get()
  list(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Query() query: ListBusinessDocumentsQueryDto) {
    return this.documents.list(merchant.id, storeId, query);
  }

  @Post()
  create(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Body() dto: CreateBusinessDocumentDto) {
    return this.documents.create(merchant.id, storeId, dto);
  }

  @Get(":id")
  get(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Param("id") id: string) {
    return this.documents.get(merchant.id, storeId, id);
  }

  @Patch(":id")
  update(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Param("id") id: string,
    @Body() dto: UpdateBusinessDocumentDto,
  ) {
    return this.documents.update(merchant.id, storeId, id, dto);
  }

  @Delete(":id")
  remove(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Param("id") id: string) {
    return this.documents.remove(merchant.id, storeId, id);
  }

  @Post(":id/send")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  send(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Param("id") id: string,
    @Body() dto: SendBusinessDocumentDto,
  ) {
    return this.documents.send(merchant.id, storeId, id, dto);
  }

  @Post(":id/void")
  void(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Param("id") id: string,
    @Body() dto: VoidBusinessDocumentDto,
  ) {
    return this.documents.void(merchant.id, storeId, id, dto);
  }
}
