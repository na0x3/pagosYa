import { Body, Controller, Get, Param, Post, Req, StreamableFile, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MerchantSessionGuard } from "../dashboard/guards/merchant-session.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { MAX_COMPLAINT_FILES, MAX_COMPLAINT_FILE_BYTES, UploadedComplaintFile } from "./complaint-files";
import { ComplaintMerchantService } from "./complaint-merchant.service";
import { MerchantReplyDto } from "./dto/merchant-reply.dto";

@ApiTags("complaints")
@ApiBearerAuth()
@UseGuards(MerchantSessionGuard)
@Controller("v1/dashboard/complaints")
export class DashboardComplaintsController {
  constructor(private readonly complaints: ComplaintMerchantService) {}

  @Get() list(@CurrentMerchant() merchant: { id: string }) { return this.complaints.list(merchant.id); }
  @Get(":id") get(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string) { return this.complaints.get(merchant.id, id); }

  @Post(":id/reply")
  @UseInterceptors(FilesInterceptor("files", MAX_COMPLAINT_FILES, { limits: { fileSize: MAX_COMPLAINT_FILE_BYTES } }))
  reply(@CurrentMerchant() merchant: { id: string }, @Req() request: { merchantUser: { id: string } }, @Param("id") id: string, @Body() dto: MerchantReplyDto, @UploadedFiles() files: UploadedComplaintFile[]) {
    return this.complaints.reply(merchant.id, request.merchantUser.id, id, dto.body, files);
  }

  @Get(":id/attachments/:attachmentId")
  async attachment(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string, @Param("attachmentId") attachmentId: string) {
    const file = await this.complaints.attachment(merchant.id, id, attachmentId);
    return new StreamableFile(file.bytes, { type: file.contentType, disposition: `attachment; filename="${file.fileName}"` });
  }
}
