import { Controller, Get, Header, Param, Query, Req, StreamableFile } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { requestContext, type RequestWithContext } from "../legal/request-context";
import { BusinessDocumentsService } from "./business-documents.service";

/**
 * The customer's side of a signed document link (rendered by the checkout app
 * at /d/:token). Only the frozen version of the linked document is returned.
 */
@ApiTags("business_documents")
@Controller("v1/documents/public")
export class BusinessDocumentsPublicController {
  constructor(private readonly documents: BusinessDocumentsService) {}

  @Get(":token")
  @Header("Cache-Control", "no-store")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  view(@Param("token") token: string, @Req() req: RequestWithContext, @Query("preview") preview?: string) {
    // `preview` is the merchant's signed preview token: the page opens without recording a view.
    return this.documents.publicView(token, requestContext(req), typeof preview === "string" ? preview.slice(0, 300) : undefined);
  }

  @Get(":token/pdf")
  @Header("Cache-Control", "no-store")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async pdf(@Param("token") token: string) {
    const { buffer, filename } = await this.documents.publicPdf(token);
    return new StreamableFile(buffer, { type: "application/pdf", disposition: `inline; filename="${filename}"`, length: buffer.length });
  }
}
