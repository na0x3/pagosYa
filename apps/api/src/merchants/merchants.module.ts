import { Module } from "@nestjs/common";
import { MerchantsService } from "./merchants.service";
import { KycService } from "./kyc.service";
import { SanctionsModule } from "../sanctions/sanctions.module";
import { IdentityDocumentsService } from "./identity-documents.service";
import { MerchantsController } from "./merchants.controller";
import { AuthModule } from "../auth/auth.module";
import { OpsModule } from "../ops/ops.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { ApiKeysController } from "../auth/api-keys.controller";
import { LegalModule } from "../legal/legal.module";
import { PrivateFilesService } from "../commerce-platform/private-files.service";
import { PayoutAccountsModule } from "../payout-accounts/payout-accounts.module";

@Module({
  imports: [AuthModule, OpsModule, DashboardModule, LegalModule, PayoutAccountsModule, SanctionsModule],
  controllers: [MerchantsController, ApiKeysController],
  providers: [MerchantsService, KycService, PrivateFilesService, IdentityDocumentsService],
  exports: [MerchantsService, KycService],
})
export class MerchantsModule {}
