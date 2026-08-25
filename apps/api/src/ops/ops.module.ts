import { Module } from "@nestjs/common";
import { OpsUserService } from "./ops-user.service";
import { AuditLogService } from "./audit-log.service";
import { DeliveryFailuresService } from "./delivery-failures.service";
import { OpsAuthGuard } from "./guards/ops-auth.guard";
import { OpsUsersController } from "./ops-users.controller";
import { AuditLogController } from "./audit-log.controller";
import { DeliveryFailuresController } from "./delivery-failures.controller";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { SupportController } from "./support.controller";
import { SupportService } from "./support.service";
import { MerchantSupportController } from "./merchant-support.controller";

@Module({
  imports: [AuthModule, DashboardModule],
  controllers: [OpsUsersController, AuditLogController, DeliveryFailuresController, SupportController, MerchantSupportController],
  providers: [OpsUserService, AuditLogService, DeliveryFailuresService, SupportService, OpsAuthGuard],
  exports: [OpsUserService, AuditLogService, DeliveryFailuresService, SupportService, OpsAuthGuard],
})
export class OpsModule {}
