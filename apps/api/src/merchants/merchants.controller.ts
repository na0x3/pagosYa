import {
  BadRequestException,
  ConflictException,
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { KycDocumentSlot, LegalDocumentKind, TermsAcceptanceSource } from "@prisma/client";
import type { Response } from "express";
import { LegalDocumentsService } from "../legal/legal-documents.service";
import { TermsAcceptanceService } from "../legal/terms-acceptance.service";
import { RequestWithContext, requestContext } from "../legal/request-context";
import { Throttle } from "@nestjs/throttler";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { MerchantsService } from "./merchants.service";
import { KycService } from "./kyc.service";
import { IdentityDocumentsService } from "./identity-documents.service";
import { CreateMerchantDto } from "./dto/create-merchant.dto";
import { RegisterMerchantDto } from "./dto/register-merchant.dto";
import { MerchantUserService } from "../dashboard/merchant-user.service";
import { MerchantSessionService } from "../dashboard/merchant-session.service";
import { SubmitKycDto } from "./dto/submit-kyc.dto";
import { ReviewKycDto } from "./dto/review-kyc.dto";
import { UploadKycDocumentDto } from "./dto/upload-kyc-document.dto";
import { SecretApiKeyGuard } from "../auth/guards/secret-api-key.guard";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { OpsAuthGuard } from "../ops/guards/ops-auth.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { CurrentOpsUser } from "../ops/decorators/current-ops-user.decorator";
import type { OpsActor } from "./ops-actor";

@ApiTags("merchants")
@Controller("v1/merchants")
export class MerchantsController {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly kyc: KycService,
    private readonly identityDocuments: IdentityDocumentsService,
    private readonly legal: LegalDocumentsService,
    private readonly terms: TermsAcceptanceService,
    private readonly users: MerchantUserService,
    private readonly sessions: MerchantSessionService,
  ) {}

  /** Public self-serve signup — tighter limit than the global default since it's the free entry point to everything else (instant TEST keys, dashboard signup). */
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async create(@Body() dto: CreateMerchantDto, @Req() req: RequestWithContext) {
    // Validated before creating anything, so a stale version never leaves a half-signed-up merchant behind.
    const document = dto.termsVersion
      ? await this.legal.resolveAcceptable(LegalDocumentKind.MERCHANT_TERMS, dto.termsVersion)
      : null;
    const result = await this.merchants.create(dto);
    if (document) {
      await this.terms.recordMerchantAcceptance({
        merchantId: result.merchant.id,
        document,
        source: TermsAcceptanceSource.WEB_SIGNUP,
        context: requestContext(req),
      });
    }
    return result;
  }

  /** Owner 2026-11-07: sign up on the dashboard and go straight in — the business, its owner with their password, the first
   *  session. The confirmation email still goes out; the next login needs it confirmed. */
  @Post("register")
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  async register(@Body() dto: RegisterMerchantDto, @Req() req: RequestWithContext) {
    const email = dto.email.trim().toLowerCase();
    if (await this.users.emailTaken(email)) throw new ConflictException("Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.");
    const document = dto.termsVersion ? await this.legal.resolveAcceptable(LegalDocumentKind.MERCHANT_TERMS, dto.termsVersion) : null;
    const { password, ...merchant } = dto;
    const result = await this.merchants.create({ ...merchant, email });
    if (document) await this.terms.recordMerchantAcceptance({ merchantId: result.merchant.id, document, source: TermsAcceptanceSource.WEB_SIGNUP, context: requestContext(req) });
    const user = await this.users.createForNewAccount(result.merchant.id, email, password);
    return { ...await this.sessions.startNewAccount(user), welcome: true };
  }

  @Post("kyc")
  @ApiBearerAuth()
  @UseGuards(MerchantAuthGuard)
  submitKyc(@CurrentMerchant() merchant: { id: string }, @Body() dto: SubmitKycDto) {
    return this.kyc.submit(merchant.id, dto);
  }

  @Get("kyc")
  @ApiBearerAuth()
  @UseGuards(MerchantAuthGuard)
  getKyc(@CurrentMerchant() merchant: { id: string }) {
    return this.kyc.latest(merchant.id);
  }

  /**
   * Deliberately SecretApiKeyGuard-only, not MerchantAuthGuard: this mints a
   * new, non-expiring sk_live_... credential — a strictly bigger and longer-
   * lived capability than anything else a dashboard session grants, and one
   * that would outlive the session itself (survives logout/expiry). A
   * compromised session token must not be able to escalate into a permanent
   * secret key.
   */
  @Post("live_keys")
  @ApiBearerAuth()
  @UseGuards(SecretApiKeyGuard)
  issueLiveKeys(@CurrentMerchant() merchant: { id: string }) {
    return this.merchants.issueLiveKeys(merchant.id);
  }

  /** pagosYa ops/compliance queue — not merchant- or public-facing. */
  @Get("kyc/pending")
  @ApiBearerAuth()
  @UseGuards(OpsAuthGuard)
  listPendingKyc() {
    return this.kyc.listPending();
  }

  /** Merchant uploads a CI photo, selfie or NIT certificate into private storage — never the public /v1/uploads path. */
  @Post("kyc/documents")
  @ApiBearerAuth()
  @ApiConsumes("multipart/form-data")
  @UseGuards(MerchantAuthGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 8_000_000 } }))
  uploadKycDocument(@CurrentMerchant() merchant: { id: string }, @UploadedFile() file: Express.Multer.File, @Body() dto: UploadKycDocumentDto) {
    if (!file) throw new BadRequestException("Selecciona un archivo");
    return this.identityDocuments.upload(merchant.id, dto.slot, file);
  }

  /** pagosYa ops/compliance viewing a private identity document — every view is audit-logged. */
  @Get("kyc/:submissionId/documents/:slot")
  @ApiBearerAuth()
  @UseGuards(OpsAuthGuard)
  async viewKycDocument(
    @CurrentOpsUser() opsUser: OpsActor,
    @Param("submissionId") submissionId: string,
    @Param("slot", new ParseEnumPipe(KycDocumentSlot)) slot: KycDocumentSlot,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { bytes, mimeType } = await this.identityDocuments.readForOps(submissionId, slot, opsUser);
    res.set({ "Content-Type": mimeType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    return new StreamableFile(bytes);
  }

  /** pagosYa ops/compliance review action — not merchant- or public-facing. */
  @Post("kyc/:submissionId/review")
  @ApiBearerAuth()
  @UseGuards(OpsAuthGuard)
  reviewKyc(
    @CurrentOpsUser() opsUser: OpsActor,
    @Param("submissionId") submissionId: string,
    @Body() dto: ReviewKycDto,
  ) {
    return this.kyc.review(submissionId, dto, opsUser);
  }
}
