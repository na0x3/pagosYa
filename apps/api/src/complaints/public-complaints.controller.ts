import { Body, Controller, Get, Headers, NotFoundException, Param, Post, StreamableFile, UploadedFiles, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { MAX_COMPLAINT_FILES, MAX_COMPLAINT_FILE_BYTES, UploadedComplaintFile } from "./complaint-files";
import { ComplaintIntakeService } from "./complaint-intake.service";
import { CreateComplaintDto } from "./dto/create-complaint.dto";
import { BuyerMessageDto } from "./dto/buyer-message.dto";

const HOUR = 3_600_000;
const UPLOADS = FilesInterceptor("files", MAX_COMPLAINT_FILES, { limits: { fileSize: MAX_COMPLAINT_FILE_BYTES } });

function bearer(header: string | undefined): string {
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) throw new NotFoundException("Reclamo no encontrado");
  return token;
}

@ApiTags("complaints")
@Controller("v1/complaints")
export class PublicComplaintsController {
  constructor(private readonly intake: ComplaintIntakeService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: HOUR } })
  @UseInterceptors(UPLOADS)
  create(@Body() dto: CreateComplaintDto, @UploadedFiles() files: UploadedComplaintFile[]) {
    return this.intake.create(dto, files);
  }

  @Get("track")
  @Throttle({ default: { limit: 30, ttl: HOUR } })
  track(@Headers("authorization") authorization: string | undefined) {
    return this.intake.track(bearer(authorization));
  }

  @Post("track/messages")
  @Throttle({ default: { limit: 30, ttl: HOUR } })
  @UseInterceptors(UPLOADS)
  message(@Headers("authorization") authorization: string | undefined, @Body() dto: BuyerMessageDto, @UploadedFiles() files: UploadedComplaintFile[]) {
    return this.intake.addMessage(bearer(authorization), dto.body, files);
  }

  @Get("track/attachments/:id")
  @Throttle({ default: { limit: 30, ttl: HOUR } })
  async attachment(@Headers("authorization") authorization: string | undefined, @Param("id") id: string) {
    const file = await this.intake.attachment(bearer(authorization), id);
    return new StreamableFile(file.bytes, { type: file.contentType, disposition: `attachment; filename="${file.fileName}"` });
  }
}
