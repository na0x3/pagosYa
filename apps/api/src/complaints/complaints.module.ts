import { Module } from "@nestjs/common";
import { DashboardModule } from "../dashboard/dashboard.module";
import { PrivateFilesService } from "../commerce-platform/private-files.service";
import { ComplaintMailer } from "./complaint-mailer";
import { ComplaintIntakeService } from "./complaint-intake.service";
import { PublicComplaintsController } from "./public-complaints.controller";

@Module({
  imports: [DashboardModule],
  controllers: [PublicComplaintsController],
  providers: [PrivateFilesService, ComplaintMailer, ComplaintIntakeService],
})
export class ComplaintsModule {}
