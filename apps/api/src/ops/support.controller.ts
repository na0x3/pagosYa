import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentOpsUser } from "./decorators/current-ops-user.decorator";
import { AddSupportNoteDto } from "./dto/add-support-note.dto";
import { CreateSupportCaseDto } from "./dto/create-support-case.dto";
import { ResolveSupportCaseDto } from "./dto/resolve-support-case.dto";
import { SupportActionDto } from "./dto/support-action.dto";
import { OpsAuthGuard } from "./guards/ops-auth.guard";
import { SupportActor, SupportService } from "./support.service";

@ApiTags("ops-support")
@ApiBearerAuth()
@UseGuards(OpsAuthGuard)
@Controller("internal/support")
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get("merchants")
  searchMerchants(@Query("query") query: string, @CurrentOpsUser() actor: SupportActor) {
    return this.support.searchMerchants(query, actor);
  }

  @Get("merchants/:merchantId")
  dossier(@Param("merchantId") merchantId: string, @Query("caseId") caseId: string, @CurrentOpsUser() actor: SupportActor) {
    return this.support.getDossier(merchantId, caseId, actor);
  }

  @Get("cases")
  listCases() {
    return this.support.listCases();
  }

  @Post("cases")
  createCase(@Body() dto: CreateSupportCaseDto, @CurrentOpsUser() actor: SupportActor) {
    return this.support.createCase(dto, actor);
  }

  @Post("cases/:caseId/notes")
  addNote(@Param("caseId") caseId: string, @Body() dto: AddSupportNoteDto, @CurrentOpsUser() actor: SupportActor) {
    return this.support.addNote(caseId, dto, actor);
  }

  @Post("cases/:caseId/actions/password-reset")
  passwordReset(@Param("caseId") caseId: string, @Body() dto: SupportActionDto, @CurrentOpsUser() actor: SupportActor) {
    return this.support.requestPasswordReset(caseId, dto.merchantUserId, dto.reason, actor);
  }

  @Post("cases/:caseId/actions/revoke-sessions")
  revokeSessions(@Param("caseId") caseId: string, @Body() dto: SupportActionDto, @CurrentOpsUser() actor: SupportActor) {
    return this.support.revokeSessions(caseId, dto.merchantUserId, dto.reason, actor);
  }

  @Post("cases/:caseId/resolve")
  resolveCase(@Param("caseId") caseId: string, @Body() dto: ResolveSupportCaseDto, @CurrentOpsUser() actor: SupportActor) {
    return this.support.resolveCase(caseId, dto.resolution, actor);
  }
}
