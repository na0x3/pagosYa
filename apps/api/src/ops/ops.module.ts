import { Module } from "@nestjs/common";
import { OpsUserService } from "./ops-user.service";
import { AuditLogService } from "./audit-log.service";
import { OpsAuthGuard } from "./guards/ops-auth.guard";
import { OpsUsersController } from "./ops-users.controller";
import { AuditLogController } from "./audit-log.controller";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [OpsUsersController, AuditLogController],
  providers: [OpsUserService, AuditLogService, OpsAuthGuard],
  exports: [OpsUserService, AuditLogService, OpsAuthGuard],
})
export class OpsModule {}
