import { Module } from "@nestjs/common";
import { OpsModule } from "../ops/ops.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { LegalDocumentsService } from "./legal-documents.service";
import { TermsAcceptanceService } from "./terms-acceptance.service";
import { LegalController } from "./legal.controller";
import { OpsLegalDocumentsController } from "./ops-legal-documents.controller";
import { DashboardTermsController } from "./dashboard-terms.controller";

@Module({
  imports: [OpsModule, DashboardModule],
  controllers: [LegalController, OpsLegalDocumentsController, DashboardTermsController],
  providers: [LegalDocumentsService, TermsAcceptanceService],
  exports: [LegalDocumentsService, TermsAcceptanceService],
})
export class LegalModule {}
