import { Module } from "@nestjs/common";
import { OpsUserService } from "./ops-user.service";
import { AuditLogService } from "./audit-log.service";
import { DeliveryFailuresService } from "./delivery-failures.service";
import { OpsAuthGuard } from "./guards/ops-auth.guard";
import { OpsUsersController } from "./ops-users.controller";
import { AuditLogController } from "./audit-log.controller";
import { DeliveryFailuresController } from "./delivery-failures.controller";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [OpsUsersController, AuditLogController, DeliveryFailuresController],
  providers: [OpsUserService, AuditLogService, DeliveryFailuresService, OpsAuthGuard],
  exports: [OpsUserService, AuditLogService, DeliveryFailuresService, OpsAuthGuard],
})
export class OpsModule {}
