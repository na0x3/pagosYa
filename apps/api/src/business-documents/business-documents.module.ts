import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { BusinessDocumentsController } from "./business-documents.controller";
import { BusinessDocumentsPublicController } from "./business-documents-public.controller";
import { BusinessDocumentsService } from "./business-documents.service";
import { CobrosService } from "./cobros.service";
import { PaymentIntentsModule } from "../payment-intents/payment-intents.module";

/** D0 and D1 (cobros) of docs/superpowers/specs/2026-09-25-business-documents-and-guided-growth-design.md. */
@Module({
  imports: [AuthModule, DashboardModule, PaymentIntentsModule],
  controllers: [BusinessDocumentsController, BusinessDocumentsPublicController],
  providers: [BusinessDocumentsService, CobrosService],
  exports: [BusinessDocumentsService],
})
export class BusinessDocumentsModule {}
