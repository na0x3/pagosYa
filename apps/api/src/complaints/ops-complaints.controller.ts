import { Body, Controller, Get, Header, Param, Post, Query, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { OpsAuthGuard } from "../ops/guards/ops-auth.guard";
import { CurrentOpsUser } from "../ops/decorators/current-ops-user.decorator";
import { ComplaintOpsActor, ComplaintOpsService } from "./complaint-ops.service";
import { AnswerComplaintDto, AskMerchantDto, ComplaintNoteDto, ComplaintPauseDto, ComplaintRefundDto, ExportComplaintsQuery, ExtendComplaintDto, LinkComplaintDto, ListComplaintsQuery } from "./dto/ops-complaint.dto";

@ApiTags("ops")
@ApiBearerAuth()
@UseGuards(OpsAuthGuard)
@Controller("internal/complaints")
export class OpsComplaintsController {
  constructor(private readonly complaints: ComplaintOpsService) {}

  @Get() list(@Query() query: ListComplaintsQuery) { return this.complaints.list(query); }

  // Declared before ":id" so "export.csv" is never read as an id.
  @Get("export.csv")
  @Header("content-type", "text/csv; charset=utf-8")
  @Header("content-disposition", 'attachment; filename="reclamos.csv"')
  export(@Query() query: ExportComplaintsQuery) { return this.complaints.exportCsv(query.from, query.to); }

  @Get(":id") get(@Param("id") id: string) { return this.complaints.get(id); }
  @Post(":id/take") take(@Param("id") id: string, @CurrentOpsUser() actor: ComplaintOpsActor) { return this.complaints.take(id, actor); }
  @Post(":id/link") link(@Param("id") id: string, @Body() dto: LinkComplaintDto, @CurrentOpsUser() actor: ComplaintOpsActor) { return this.complaints.link(id, dto, actor); }
  @Post(":id/notes") note(@Param("id") id: string, @Body() dto: ComplaintNoteDto, @CurrentOpsUser() actor: ComplaintOpsActor) { return this.complaints.note(id, dto.body, actor); }
  @Post(":id/ask_merchant") ask(@Param("id") id: string, @Body() dto: AskMerchantDto, @CurrentOpsUser() actor: ComplaintOpsActor) { return this.complaints.askMerchant(id, dto.question, actor); }
  @Post(":id/extend") extend(@Param("id") id: string, @Body() dto: ExtendComplaintDto, @CurrentOpsUser() actor: ComplaintOpsActor) { return this.complaints.extend(id, dto.reason, actor); }
  @Post(":id/answer") answer(@Param("id") id: string, @Body() dto: AnswerComplaintDto, @CurrentOpsUser() actor: ComplaintOpsActor) { return this.complaints.answer(id, dto, actor); }

  @Post(":id/refund") refund(@Param("id") id: string, @Body() dto: ComplaintRefundDto, @CurrentOpsUser() actor: ComplaintOpsActor) { return this.complaints.refund(id, dto, actor); }
  @Post(":id/pause_payouts") pause(@Param("id") id: string, @Body() dto: ComplaintPauseDto, @CurrentOpsUser() actor: ComplaintOpsActor) { return this.complaints.pausePayouts(id, dto.reason, actor); }

  @Get(":id/attachments/:attachmentId")
  async attachment(@Param("id") id: string, @Param("attachmentId") attachmentId: string) {
    const file = await this.complaints.attachment(id, attachmentId);
    return new StreamableFile(file.bytes, { type: file.contentType, disposition: `attachment; filename="${file.fileName}"` });
  }
}
