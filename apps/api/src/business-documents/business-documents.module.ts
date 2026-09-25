import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { BusinessDocumentsController } from "./business-documents.controller";
import { BusinessDocumentsPublicController } from "./business-documents-public.controller";
import { BusinessDocumentsService } from "./business-documents.service";
import { CobrosController } from "./cobros.controller";
import { CobrosService } from "./cobros.service";
import { CobrosWorker } from "./cobros.worker";
import { UploadsModule } from "../uploads/uploads.module";
import { PaymentIntentsModule } from "../payment-intents/payment-intents.module";
import { AiModule } from "../ai/ai.module";
import { ProposalsController } from "./proposals.controller";
import { ProposalsService } from "./proposals.service";
import { ProposalsWorker } from "./proposals.worker";
import { ContractsController } from "./contracts.controller";
import { ContractsService } from "./contracts.service";
import { ContractsWorker } from "./contracts.worker";

/** D0, D1 (cobros), D2 (proposals) and D3 (contracts) of docs/superpowers/specs/2026-09-25-business-documents-and-guided-growth-design.md. */
@Module({
  imports: [AuthModule, DashboardModule, PaymentIntentsModule, UploadsModule, AiModule],
  controllers: [BusinessDocumentsController, BusinessDocumentsPublicController, CobrosController, ProposalsController, ContractsController],
  providers: [BusinessDocumentsService, CobrosService, CobrosWorker, ProposalsService, ProposalsWorker, ContractsService, ContractsWorker],
  exports: [BusinessDocumentsService],
})
export class BusinessDocumentsModule {}
