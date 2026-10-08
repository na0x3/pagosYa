import { Module } from "@nestjs/common";
import { DashboardModule } from "../dashboard/dashboard.module";
import { OpsModule } from "../ops/ops.module";
import { RefundsModule } from "../refunds/refunds.module";
import { SettlementModule } from "../settlement/settlement.module";
import { PrivateFilesService } from "../commerce-platform/private-files.service";
import { ComplaintMailer } from "./complaint-mailer";
import { ComplaintIntakeService } from "./complaint-intake.service";
import { ComplaintOpsService } from "./complaint-ops.service";
import { PublicComplaintsController } from "./public-complaints.controller";
import { OpsComplaintsController } from "./ops-complaints.controller";
import { ComplaintMerchantService } from "./complaint-merchant.service";
import { DashboardComplaintsController } from "./dashboard-complaints.controller";

@Module({
  imports: [DashboardModule, OpsModule, RefundsModule, SettlementModule],
  controllers: [PublicComplaintsController, OpsComplaintsController, DashboardComplaintsController],
  providers: [PrivateFilesService, ComplaintMailer, ComplaintIntakeService, ComplaintOpsService, ComplaintMerchantService],
})
export class ComplaintsModule {}
