import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, Req, StreamableFile } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { requestContext, type RequestWithContext } from "../legal/request-context";
import { BusinessDocumentsService } from "./business-documents.service";
import { CobrosService } from "./cobros.service";
import { ProposalsService } from "./proposals.service";
import { ContractsService } from "./contracts.service";
import { AcceptProposalDto, ContractCodeRequestDto, ContractCodeVerifyDto, PublicSignContractDto, RequestProposalChangesDto } from "./dto/business-document.dto";

/**
 * The customer's side of a signed document link (rendered by the checkout app
 * at /d/:token). Only the frozen version of the linked document is returned.
 */
@ApiTags("business_documents")
@Controller("v1/documents/public")
export class BusinessDocumentsPublicController {
  constructor(
    private readonly documents: BusinessDocumentsService,
    private readonly cobros: CobrosService,
    private readonly proposals: ProposalsService,
    private readonly contracts: ContractsService,
  ) {}

  @Get(":token")
  @Header("Cache-Control", "no-store")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  view(@Param("token") token: string, @Req() req: RequestWithContext, @Query("preview") preview?: string) {
    // `preview` is the merchant's signed preview token: the page opens without recording a view.
    return this.documents.publicView(token, requestContext(req), typeof preview === "string" ? preview.slice(0, 300) : undefined);
  }

  /** Pagar: the checkout session for the cobro's frozen total (created once per version, then reused). */
  @Post(":token/pay")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  pay(@Param("token") token: string) {
    return this.cobros.pay(token);
  }

  /** Proposals: "Aceptar propuesta" (name, email and the version read; IP and user agent kept as evidence). */
  @Post(":token/accept")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  accept(@Param("token") token: string, @Body() dto: AcceptProposalDto, @Req() req: RequestWithContext) {
    return this.proposals.accept(token, dto, requestContext(req));
  }

  /** Proposals: "Pedir cambios" (timeline, the merchant's Inbox and an email inside the store's cap). */
  @Post(":token/changes")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  changes(@Param("token") token: string, @Body() dto: RequestProposalChangesDto, @Req() req: RequestWithContext) {
    return this.proposals.requestChanges(token, dto, requestContext(req));
  }

  /** Contracts: "Enviar código" — 6 digits to the contract's customer email (1/min, 5/day, the store's cap). */
  @Post(":token/sign/code")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  signCode(@Param("token") token: string, @Body() dto: ContractCodeRequestDto, @Req() req: RequestWithContext) {
    return this.contracts.requestCode(token, dto, requestContext(req));
  }

  /** Contracts: the code (5 tries per code, 10 minutes). */
  @Post(":token/sign/verify")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyCode(@Param("token") token: string, @Body() dto: ContractCodeVerifyDto, @Req() req: RequestWithContext) {
    return this.contracts.verifyCode(token, dto, requestContext(req));
  }

  /** Contracts: "Firmar contrato" — name (and drawing) on the version read, after a verified code. */
  @Post(":token/sign")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  sign(@Param("token") token: string, @Body() dto: PublicSignContractDto, @Req() req: RequestWithContext) {
    return this.contracts.sign(token, dto, requestContext(req));
  }

  @Get(":token/pdf")
  @Header("Cache-Control", "no-store")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async pdf(@Param("token") token: string, @Query("download") download?: string) {
    const { buffer, filename } = await this.documents.publicPdf(token);
    return new StreamableFile(buffer, { type: "application/pdf", disposition: `${download ? "attachment" : "inline"}; filename="${filename}"`, length: buffer.length });
  }
}
