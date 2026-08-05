import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { OpsAuthGuard } from "./guards/ops-auth.guard";
import { AuditLogService } from "./audit-log.service";

@ApiTags("ops")
@Controller("internal/audit_log")
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(OpsAuthGuard)
  list() {
    return this.auditLog.list();
  }
}
