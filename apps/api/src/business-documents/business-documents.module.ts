import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { BusinessDocumentsController } from "./business-documents.controller";
import { BusinessDocumentsPublicController } from "./business-documents-public.controller";
import { BusinessDocumentsService } from "./business-documents.service";

/** D0 of docs/superpowers/specs/2026-09-25-business-documents-and-guided-growth-design.md. */
@Module({
  imports: [AuthModule, DashboardModule],
  controllers: [BusinessDocumentsController, BusinessDocumentsPublicController],
  providers: [BusinessDocumentsService],
  exports: [BusinessDocumentsService],
})
export class BusinessDocumentsModule {}
