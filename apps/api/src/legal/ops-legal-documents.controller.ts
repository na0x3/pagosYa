import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { OpsAuthGuard } from "../ops/guards/ops-auth.guard";
import { CurrentOpsUser } from "../ops/decorators/current-ops-user.decorator";
import { LegalDocumentsService, PublishingOpsUser } from "./legal-documents.service";
import { PublishLegalDocumentDto } from "./dto/publish-legal-document.dto";

/** pagosYa ops only. There is intentionally no update or delete route: a wording change is a new version. */
@ApiTags("ops")
@ApiBearerAuth()
@UseGuards(OpsAuthGuard)
@Controller("internal/legal_documents")
export class OpsLegalDocumentsController {
  constructor(private readonly legal: LegalDocumentsService) {}

  @Get()
  list() {
    return this.legal.list();
  }

  @Post()
  publish(@CurrentOpsUser() opsUser: PublishingOpsUser, @Body() dto: PublishLegalDocumentDto) {
    return this.legal.publish(dto, opsUser);
  }
}
